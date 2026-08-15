# turbocharge — DESIGN

Status: **buildable**. Written 2026-08-09. Every mechanism claim in this
document was executed on this machine (Node v22.23.2, V8 12.4.254.21-node.56,
linux x64) this session; probe scripts and a working 288-line end-to-end slice
live in the session scratchpad (`n1_exist.js`, `n2_perturb.js`, `slice/`).
Anything not run here is marked **unverified**.

Relationship to `SPEC.md`: this design keeps the spec's contract — opt-in
annotation, evidence-or-silence, the graveyard as a first-class artifact,
benchmark methodology §4 — and **replaces the spec's §1 "analysis region"
mechanism**. The spec called for a CFG and local data-flow over the annotated
function. That fails the one-person/two-week constraint and is cut: no CFG, no
data-flow, no escape analysis, no IR. In its place: run the annotated function
with the developer's own test data and ask V8 what representation the objects
actually got. Observation, not inference.

One paragraph of product: a developer writes `/** @turbocharge */` above a
function they need fast. `turbocharge` (bare command, local, offline, no
account) runs the project's existing tests with that function wrapped, records
what V8 did to the values flowing through it — dictionary mode, elements
kinds, how many distinct maps — and prints findings attributed to the
function's source line, each citing a measured effect size or plainly saying
the cost is unmeasured. Everywhere else it says nothing.

---

## 1. Foundation: the natives, verified

All probes under `--allow-natives-syntax` on Node v22.23.2 (release build).
Each native was compiled in isolation via `new Function`, which is what makes
per-native feature detection possible (see below).

| native | exists | returns | known-answer results on this build |
|---|---|---|---|
| `%HasFastProperties(o)` | yes | boolean | `{a:1}`→true; `{a,b}` after `delete a`→false; after `delete b` (last)→false; `Object.create(null)`→false; 200-prop object→false |
| `%HasDictionaryElements(o)` | yes | boolean | `a=[];a[100000]=1`→true; dense arrays→false |
| `%HasHoleyElements(o)` | yes | boolean | `[1,,3]`→true; `new Array(10)`→true; `[1,2,3]`→false |
| `%HasDoubleElements(o)` | yes | boolean | `[1.5,2.5]`→true; `[1,2,3].push(1.5)`→true |
| `%HasSmiElements(o)` | yes | boolean | `[1,2,3]`→true; also true for HOLEY_SMI `[1,,3]` |
| `%HasObjectElements(o)` | yes | boolean | `[{},{}]`→true; `[1,'x']`→true |
| `%HaveSameMap(a,b)` | yes | boolean | `{a:1}`vs`{a:1}`→true; vs`{b:1}`→false; key order `{a,b}`vs`{b,a}`→false; `{a:1}`vs`{a:1.5}`→false; literal vs `JSON.parse`→**true**; literal vs `Object.assign({},…)`→**false** |
| `%DebugPrint(o)` | yes | the object; prints to stdout | release build prints map address, elements kind, property list — usable, **not depended on** (text format is the churn surface that killed the log-parsing tools) |
| `%GetOptimizationStatus` | yes | — | exists; **unused by design** (measured and killed, `useless.md` §2/§5) |
| `%HasPackedElements(o)` | yes | boolean | means kind == PACKED_ELEMENTS specifically — `[1,2,3]`→**false**, `[{},{}]`→true. Footgun; not used |
| `%HasFixedFloat64Elements(o)` | yes | boolean | `Float64Array`→true. Not used in v1 |

Facts that shape the whole design, all verified this session:

1. **An unknown native is a catchable `SyntaxError` at compile of the
   probe function, not process death** — `new Function('return
   %Renamed(o)')` throws; nothing else is harmed. Per-native feature
   detection is therefore cheap and exact.
2. **A Smi argument segfaults the process.** `%HasFastProperties(42)` →
   exit 139 (SIGSEGV); `%HaveSameMap({},1)` → exit 133 (SIGTRAP). Release
   builds do not type-check native arguments. Every native call in the
   observer is guarded by `typeof v === 'object' && v !== null`; heap
   primitives (strings, null) return harmless nonsense (`true`) and are
   excluded by the same guard.
3. **Elements-kind natives answer for any heap object** — a plain `{}`
   reports `HoleyElements:true` (its empty elements store). Elements checks
   are gated on `Array.isArray`.
4. **`--allow-natives-syntax` is rejected by `NODE_OPTIONS`** (verified:
   `node: --allow-natives-syntax is not allowed in NODE_OPTIONS`). This
   would force argv surgery on the user's test command — except:
5. **`v8.setFlagsFromString('--allow-natives-syntax')` at runtime works.**
   The flag is consulted at compile time, so functions compiled *after* the
   preload sets it — all our probes are `new Function` — get natives syntax.
   User code is never parsed under the flag. Verified in-process, via
   `NODE_OPTIONS=--require` preload, and inside `node --test` child
   processes (children inherit `NODE_OPTIONS`, each runs the preload
   itself).
6. **Observation does not perturb the observed.** 100k probe calls on one
   object leave `%HaveSameMap(twin)` true; holey-smi arrays stay holey-smi
   under repeated probing; a deliberately megamorphic observer helper does
   not touch target maps; probing an object whose map was deprecated by
   field generalization does not disturb it; `Object.keys`/`for-in` for
   report text leave maps identical. The observer also never runs in a
   timing context — the tool times nothing — so even second-order
   perturbation has nothing to corrupt.
7. Stability class: these predicates live in V8's `runtime-test.cc`, a
   test-support file with **no stability contract** (the same class of
   surface `useless.md` §6 indicts). The design difference: they are used
   as *optional* inputs behind a probe gate (§5), not as a load-bearing
   contract. They have existed with these names for 10+ years
   (**unverified beyond this build** — the probe gate, not history, is the
   defense). Behavior on Node 20/24 is **unverified** until the CI matrix
   runs.

If the natives were absent, the design would die here. They are present,
they return exactly the representation facts the product needs, and their
failure mode is detectable in microseconds. The foundation holds.

## 2. The mechanism

```
turbocharge (bare command)
  1 probe    node --allow-natives-syntax src/probe.cjs   (sacrificial child)
  2 scan     source files → .turbocharge/manifest.json   (file, name, line, params, exports)
  3 run      user's test command, unchanged, with
             NODE_OPTIONS="--require …/preload.cjs"  TC_MANIFEST=…  TC_OUT=…
  4 report   aggregate .turbocharge/obs-*.json → findings, cited, sorted
```

**Step 1 — probe first, gate everything.** A throwaway child process
compiles every native via `new Function` and runs the full known-answer
fixture set (§5). Only if it exits 0 does step 3 run instrumented. A V8
that renamed a native, changed a predicate's meaning, or crashes on a
fixture kills a sacrificial process, not the user's test run. On failure
the tool prints one line — `V8 introspection unavailable on node vX (reason);
no findings` — and exits 0. It never falls back to static shape guessing;
that was reviewed twice as unsound and stays dead.

**Step 2 — scan.** The scanner parses source with the TypeScript compiler
API (`ts.createSourceFile` + `getJSDocTags` — parses `.ts` and `.js`, no
type checker, no tsconfig; the `typescript` package is the one dependency,
enormous but with a decade-stable parser API). It emits a manifest entry
per annotated function: absolute file, name, line, parameter names,
export status. Annotated functions that are not exported are reported as
`cannot instrument (not exported)` — loudly, not silently skipped.

**Step 3 — get the developer's test data into the function.** The tool
runs the project's own test command (`scripts.turbocharge` if present,
else `scripts.test`) with three environment variables. No argv surgery —
possible only because of finding §1.5. The preload, in every node process
of the test run:

- enables natives at runtime, re-runs the known-answer probes in-process
  (a second gate behind the child probe), and goes inert on any failure;
- **CJS**: patches `Module.prototype._compile` to append one epilogue line
  to manifest files: `globalThis.__tc.wrapCjs(module, entries)` — the
  wrapper replaces annotated exports with an observing wrapper;
- **ESM**: calls `module.register('./hooks.mjs', …, { data: manifest })`
  (documented Node API, 20.6+). The hook serves a **facade module** for
  each manifest file: `import * as __orig from "url?tc-orig"; export *
  from "url?tc-orig"; export const fn = globalThis.__tc.wrapEsm(__orig.fn,
  entry);` — local exports legally shadow the star re-export, so no export
  enumeration is needed; the `?tc-orig` URL is passed through a `resolve`
  hook untouched and loaded by the default loader (URL pathname ignores
  the query). ESM export bindings are immutable, which is why the facade
  exists at all.

Three pitfalls were hit and fixed while proving this (they are why the
slice was built before this document): Node calls the hook module's
`initialize` **twice** per process (hooks must be idempotent); the default
resolver **strips the query** from an absolute specifier (hence the
`resolve` passthrough); and `nextLoad(differentUrl)` **restarts the whole
hook chain** rather than falling through to the default loader (hence
loading the marker URL unchanged). All three are the kind of undocumented
behavior this document exists to pin down.

**Observation without perturbation.** The annotated function's body is
never modified. The wrapper observes at the boundary only: each argument
on entry, the return value (through `.then` for promises) on exit. For an
object: `%HasFastProperties`, plus distinct-map counting — retain up to 8
exemplar objects per site and compare new values with `%HaveSameMap`
(no map pointers ever leave V8; exemplars are the only identity we need).
For an array: elements kind, plus the same two checks over the first 64
elements. Sampling: first 64 calls per site, then every 128th —
deterministic, no randomness, so two runs over the same test data produce
identical findings. Caps: 8 exemplars, 64 elements, depth 1. On process
exit each process writes `obs-<pid>.json` (sync write in the `'exit'`
handler); the parent aggregates.

**Attribution.** A site key is `file:line:function:slot` (slot = `argN` or
`ret`), taken from the manifest, so every finding lands on the annotated
function's declaration line and names the parameter. That is honest
attribution — the tool observed the value *there*. It does not claim to
know which upstream line built the object; the finding text names the
usual causes instead.

**What it does not reach, stated plainly:** jest and vitest run user code
through their own module systems, bypassing both `_compile` and the ESM
hooks — v1 documents them as unsupported (the preload runs, observes
nothing, and the report says "annotated but never observed"). A function
called only through jest is invisible, never misreported. Test runners
that use Node's loader — `node --test`, mocha, tap, plain scripts — work
today, verified for `node --test`. TypeScript execution works where the
project already runs TS under Node loaders (tsx/ts-node chain with our
hooks; **unverified**, standard loader composition).

**Overhead.** Fixed per-process cost (flag set, probes, hook thread) of a
few hundred ms per node process on this noisy VM (801→2319 ms for a
3-process `node --test` run; a concurrent benchmark sweep was running, so
directional only). Observation work is bounded by the sampling caps.
Irrelevant to correctness — nothing is timed under instrumentation.

## 3. What it reports

Real output from the working slice (demo function fed by three row
constructors; tests pass unmodified, findings below produced by the run):

```
turbocharge — 2 annotated function(s), observations from 1 node build(s)

  demo/lib.cjs:4  totalScore() argument 0: array elements have 3 distinct object
                  shapes (66 elements sampled across 2 arrays)
        measured: 5-shape reads 5.17x slower than 1-shape at 512 elements,
        95% CI 4.84-5.47 [bench-arrays R2 partial, this machine]
        — give every element one construction path

  demo/lib.cjs:4  totalScore() argument 0: 21/66 sampled elements are in
                  dictionary mode
        measured: 12.6-17.1x per property load, and 13.3-15.6x for a single
        object [bench/delete.jl] — usually caused by 'delete'

  esm/lib.mjs:2   sumPoints() argument 0: array elements have 2 distinct object
                  shapes (64 elements sampled across 1 arrays)
        measured: 5.17x … [bench-arrays R2 partial, this machine]
```

The finding classes, each mapping to one self-contained rule (§4):

| finding | V8 fact observed | measured cost cited | status |
|---|---|---|---|
| mixed-shape array | >1 distinct element maps via `%HaveSameMap` exemplars | 5-shape reads **5.17x** vs 1-shape, 95% CI 4.84-5.47, 512 elements, reads only (`bench-arrays.md` round 2, **partial — sweep still running**); same objects merely scattered in memory: 1.06x, CI 0.98-1.15 — the cost is shape, not locality, which is exactly the detectable part | ship |
| dictionary-mode population | `%HasFastProperties` false across many observed objects | **12.6-17.1x** per property load (`bench/delete.jl`, three replications per cell); the counter-case this rule used to state — a *singleton* dictionary object measured ~free, up to 10% faster (options.md R3) — is **refuted** at 13.3-15.6x, so a population count is not what the runtime half needs to observe here | ship |
| shape divergence across calls | >1 distinct maps for one parameter across calls | **~2.3-2.4x** at 5+ shapes vs mono (options.md R1); no clean cliff at any K — labelled modest | ship, informational |
| sparse / dictionary elements | `%HasDictionaryElements` true on an array | **unmeasured — no number is claimed**; the harness pair is written during build; if its band spans 1.0 it ships as a graveyard entry and the finding reports kind only | measure first |
| holey / boxed elements | `%HasHoleyElements`, `%HasObjectElements` | holey ~no effect, 0.93-1.06x on reads; boxed **1.39-1.66x** on reads and 1.58-1.69x to build at RAM size (`bench/arrays.jl`, three replications per cell) | holey **silent**; boxed is the one finding the runtime half can make that the static rule could not, because it observes the kind instead of inferring it from the declared type — which is why `boxed-elements` was withdrawn statically (TC-14) |
| accumulating spread | scan-time syntax match inside the annotated function only (`[...acc, x]` in a loop) — no CFG, the obvious form only | **146-366x** at n=10k (options.md R4) | ship (scan-time; cuttable without touching the mechanism) |
| annotated, never observed | wrapper never invoked by the test command | — | reported as absence of data, never as absence of problems |

Every finding names the source location, the count observed over the count
sampled, the measured number with its interval and conditions, and where
the number came from. A finding whose rule has no number says so in those
words. No finding is emitted from inference; only from a native that
answered.

## 4. Self-contained rules, module layout, size

Constraint honored here: **the code will be written and maintained by AI
agents, so every unit must be independently falsifiable, and drift in one
unit must not corrupt another.**

A rule is one directory, no shared framework, no base class; duplication
between rules is accepted deliberately:

```
rules/mixed-shape-array/
  detect.cjs        pure function: (siteRecord) -> finding | null
  bench-violating.cjs   \  fresh-process pair per SPEC.md §4: same checksum,
  bench-compliant.cjs   /  seeded input, printed sink
  evidence.json     { ratio, ci95, node, date, machine, conditions,
                      status: live | partial | stale | graveyard }
```

The reporter's only coupling to a rule: `require(rules/*/detect.cjs)` and
`evidence.json`. `detect.cjs` receives a plain JSON site record (the
observation format is the contract, versioned with a single integer) and
returns text + citation or null. An agent can rewrite one rule entirely —
detector, benchmarks, evidence — and no other rule can be affected,
because nothing is shared but the record schema.

**The harness is the anti-drift mechanism.** `harness/verify.cjs` re-runs
each rule's benchmark pair and checks the measured ratio against the
rule's own recorded `ci95`. Outside the interval → the rule's status is
rewritten to `stale`, and stale rules **do not fire**; the report prints
`rule X disabled: recorded 5.17x [4.84-5.47], reproduced 1.3x on node 24`
instead. This one check catches all three failure modes without
distinguishing them: V8 changed, the machine changed, or an agent broke
the detector or the pair. It runs in the tool's release CI on the Node
matrix (20/22/24), and locally when `TURBOCHARGE_BENCH=1` (an env var, not
a subcommand — the command stays bare). When the running Node major
differs from a rule's recorded `node`, its findings carry "evidence
recorded on node 22, unverified on node 24 — TURBOCHARGE_BENCH=1
re-earns it locally". Evidence is never silently assumed to transfer.

Determinism and inspectability: observation files are plain JSON left in
`.turbocharge/` after the run (truncated at the start of the next);
sampling is deterministic; findings are sorted by file:line:slot; the
report is a pure function of manifest + observations + evidence files. Any
claim in the report can be checked from those three artifacts, and the
whole run reproduced with one command.

Layout and honest line estimates:

| file | lines | kind |
|---|---|---|
| `bin/turbocharge.cjs` — orchestrate 4 steps, spawn, env | ~120 | mechanism |
| `src/probe.cjs` — natives + known answers, exit protocol | ~90 | mechanism |
| `src/scan.cjs` — TS-API scanner → manifest | ~160 | mechanism |
| `src/preload.cjs` — flag, in-process probe, observer, CJS patch, dump | ~190 | mechanism |
| `src/hooks.mjs` — ESM facade (resolve + load + initialize) | ~50 | mechanism |
| `src/report.cjs` — aggregate, run detectors, render | ~130 | mechanism |
| `harness/bench.cjs` — fresh-process pair runner, bootstrap CI | ~200 | mechanism |
| `harness/verify.cjs` — reproduce-or-mark-stale | ~80 | mechanism |
| 5 rule dirs × (detect ~40 + two benches ~80 + evidence) | ~750 | content |

**Mechanism ≈ 1,020 lines, fixed — this is the part that must stay tiny
and is the only part that touches V8 or Node internals. Rule content ≈
750 lines, grows linearly, low risk — a broken rule disables itself via
its own evidence check.** The 288-line slice already implements working
skeletons of five of the eight mechanism files.

## 5. Maintenance surface

Everything internal the tool touches, and what happens when it moves:

| surface | class | when it breaks | detected by | then |
|---|---|---|---|---|
| 7 query natives (§1 table, rows 1-7) | V8 test-support, **no contract** | rename/removal → `SyntaxError`; semantic change → wrong boolean; new crash class → child dies | per-native `new Function` probe + known-answer fixtures + sacrificial probe child (exit code) | that check (or the tool) goes silent, one-line notice, exit 0 |
| Smi-argument crash behavior | V8 internal | already crashes today | type guards make it unreachable; fixture child would absorb a new crash class on valid-looking input | contained to probe child |
| `v8.setFlagsFromString` runtime enable | Node API, documented "use with care" | flag stops applying post-startup | the in-process known-answer probe fails to compile natives | silence |
| `Module.prototype._compile` patch | Node CJS internal, unchanged for a decade | signature/behavior change | e2e fixture in tool CI (the slice's demo project) | CJS wrapping off, notice |
| `module.register` + resolve/load hooks | documented Node API (20.6+) | API revision (has churned before between 18→20) | `try/catch` at register + e2e fixture | ESM wrapping off, "CJS-only observation" notice |
| `NODE_OPTIONS` accepting `--require` | documented | policy change (it already rejects the natives flag) | test run reports zero observations | "never observed" reporting, no false findings |
| observation record schema | internal contract | agent drift | single version integer checked by report | refuse to aggregate mismatched versions |

The rule that governs all rows: **degrade to silence, never guess.** No
static fallback pretends to the natives' authority; the probe gate runs
before anything else in every process; and per-rule evidence reproduction
(§4) catches what the probes cannot — a native that still answers but
whose answer stopped costing what the evidence recorded. Deopt Explorer
died maintaining a *parser* for churning trace formats against a moving
V8; this design's V8 surface is seven boolean predicates behind a
microsecond self-test, chosen precisely because they are the smallest set
that answers the product's questions.

## 6. What it deliberately does not do

- **No static shape inference** — a TS type is not a V8 shape; two reviews
  independently called it unsound in both directions (`useless.md` §4).
- **No CFG, data-flow, or escape analysis** — fails the one-person
  constraint; this design exists because that was cut.
- **No `%GetOptimizationStatus`, tier assertions, or deopt gating** —
  measured green while running 5x slow; killed with evidence
  (`useless.md` §2, §5).
- **No `--trace-ic`/`--trace-deopt`/`--trace-maps` parsing** — the log
  format treadmill that killed deoptigate, v8-deopt-viewer, and stalled
  Deopt Explorer.
- **No `%DebugPrint` parsing** — same treadmill, one format away.
- **No timing of the user's program** — the evidence lives in the rule
  benchmarks; in-process A/B was shown to be order-contaminated noise.
- **No CI gate, no exit-code policy** — reports are for humans; the gate
  design is the corpse in `useless.md`.
- **No autofix** — rewriting user code multiplies the correctness surface;
  findings name the fix instead.
- **No jest/vitest integration in v1** — their module systems bypass
  Node's loader; absence is reported as absence of data.
- **No Bun/JSC/browser engines** — every number is V8-on-this-machine and
  labelled as such.
- **No body-internal observation in v1** — boundary-only keeps the user's
  code byte-identical; a literal-site probe pass is a possible v2 and is
  not designed here.
- **No production replay, no profile ingestion** — the annotation declares
  intent; the test command supplies data. Both are the developer's claims,
  not the tool's.

## 7. The first thing to build — built

The end-to-end slice was implemented and run during this design (scratchpad
`slice/`, 288 lines: `scan.cjs` 36, `preload.cjs` 147, `hooks.mjs` 38,
`report.cjs` 67):

- annotated CJS and ESM demo functions, fed by their ordinary `node --test`
  suites: 3/3 tests pass under instrumentation;
- produced the three findings quoted verbatim in §3, attributed to
  `demo/lib.cjs:4` and `esm/lib.mjs:2`;
- proved degrade-to-silence by renaming a native in a copy of the preload:
  one notice line, tests still pass, zero observation files, exit 0;
- surfaced and fixed three real pitfalls (double `initialize`, query-
  stripping resolve, chain-restarting `nextLoad`) that no amount of
  design-on-paper would have found.

Remaining build, two weeks, one person: days 1-3 harden scanner (TS API
replaces the slice's regex) and CLI; days 4-6 the bench harness and
`verify.cjs`; days 7-10 the five rule directories with their pairs and
evidence (sparse-elements measured here for the first time); days 11-12
dogfood on two real repos (a parser and a serializer); days 13-14 the
graveyard page and README. First cuts if the budget slips, in order: the
accumulating-spread scan rule, the sparse-elements rule, tsx/ts-node
composition testing.

## 8. The strongest remaining objection

**The tool observes representation, not cost, and it observes it under
test data, not production data. Both halves bite.** A finding of "3
distinct shapes in this array" costs nothing unless the consuming loop is
hot and its ICs actually go polymorphic; the 5.17x citation is a
benchmark's number, not this program's — so turbocharge inherits, one
level up, the exact criticism that killed the CI gate: *it still never
measures the user's code*. Worse, the data it inspects is whatever the
test suite happens to build. `useless.md` §4 established that the shapes
that matter are born outside the program — DB drivers, HTTP bodies — and
a test that builds rows with a tidy literal while production feeds them
from `pg` will produce a clean report over precisely the wrong objects.
The tool can neither detect nor state that its input was
unrepresentative. And the audience able to act on "dictionary-mode
objects at parseRow:12" overlaps heavily with the audience that could
have found it with `%DebugPrint` in ten minutes — the sophistication
paradox, unrebutted.

Does it kill the design? No, on three grounds — stated without softening
the objection. First, the claim shipped is honestly scoped: *in the
function you flagged, with the data your tests feed it, V8 chose this
representation; here is what that pattern measured, under stated
conditions* — every clause of that is true and checkable, which no prior
tool in this space could say. Second, the test-data hole is the
developer's own declared workload, the same workload they already trust
for correctness; the report names the sample so the gap is visible, and
"annotated but never observed" makes missing coverage loud. Third, the
failure mode is cheap: if the objection proves fatal in practice — reports
that are true but never worth acting on — the residue is a verified
seven-native observation recipe, a benchmark harness, and a graveyard,
all publishable, per the same logic that made the corpus worth more than
the plugin in `SPEC.md` §7. The objection survives at half strength: it
is the reason this stays a small honest tool and not a product with a
roadmap.
