# turbocharge — SPEC

Status: **the static checker runs** (§11). Written 2026-08-09 from two
adversarial reviews and one round of real probes. The previous design (a CI
gate on V8 optimization state) is dead; `useless.md` is its autopsy and stays
in the repo as evidence.

Sources this spec is built from, all in this directory: `useless.md`
(teardown, probes on Node 22.23.2 / V8 12.4), `options.md` (product design,
segments, preserved alternatives, probe appendix), `tmp/codex-round1.md`,
`tmp/codex-round2.md`, `tmp/codex-round3.md`.

## 1. What turbocharge is

**You annotate a function you need fast. Inside it, a strict set of
measured performance rules turns on. Everywhere else, the tool says nothing.**

```ts
/** @turbocharge */
export function parseRow(buf: Uint8Array, at: number): Row { … }
```

The closest existing thing is Numba's `@njit`. You mark a Python function,
Numba compiles it without the object-mode interpreter, and if it cannot, it
**fails with the line and the reason** instead of quietly falling back. The
predecessor `@jit` allowed silent fallback, and that is exactly why it was
deprecated: a decorator that always succeeds tells you nothing.

turbocharge takes the annotation-plus-call-tree shape into TypeScript. **The
problem is not the same one, and this correction matters for positioning
(owner, 2026-08-11):** Numba must compile because CPython does not JIT at all.
V8 already does that work, and does it well. So turbocharge is not a compiler
substitute — it does not need to be. Its whole job is to say where your code
takes away optimizations V8 would otherwise have applied. The verb changes from
compiles-or-raises to checks-or-reports for that reason, not because compiling
is out of reach.

What carries over intact: the annotation marks a region, the region is the
whole call tree, and failure is loud.

Four properties, none optional:

1. **Opt-in scope.** Rules apply inside annotated functions and nowhere else.
   Unannotated code produces no output, ever. This is what makes the
   strictness tolerable and adoption incremental — one function at a time.
2. **Intent, not detection.** The annotation says "I want this fast", which is
   a claim a developer can actually make. "This is hot" is not — it needs a
   profile, and demanding one is an adoption tax this design refuses to charge.
3. **Evidence.** Every rule ships a rerunnable compliant-versus-violating
   benchmark, published with its effect size and the conditions it holds under.
   A rule whose benchmark shows no win is published as a refuted claim rather
   than quietly softened.
4. **Closed world.** An annotated function may reach annotated functions and a
   published list of primitives V8 lowers to inline code. Anywhere else, the
   promise ends, and the tool names the call where it ended.

Property 4 is the one taken directly from `@njit`, and it earns its place
twice. It is what makes the analysis terminate: §1's "interprocedural reach is
unbounded in JavaScript" stops being unbounded once the region has a declared
edge. And it is the mechanism that spreads coverage — the fix for a
closed-world finding is to annotate the callee, which is precisely how `@njit`
pushes outward through a hot call graph.

It is also the rule most likely to be hated. On real code the first run is
mostly closed-world findings, because real functions call helpers. That is the
design working, not failing, but it means the first-run experience is a wall of
output, and §9 owes an answer for it.

### Analysis, not pattern matching

An ESLint rule matches syntax at a node. That is too weak for most of what
matters here, and it is the reason existing perf rules are either trivial or
wrong:

- *Is this array filled from one constructor or several?* Needs the array
  tracked from creation through every write site.
- *Does this object escape the loop?* Needs escape analysis.
- *Is this accumulation quadratic?* Needs the loop-carried dependence, not the
  presence of a spread.
- *Do these two literals of one type produce two shapes?* Needs construction
  order compared across sites, which no rule sees from a single node.

So the annotated region is an **analysis region**: build a CFG for it, run
local data-flow over the values it constructs and consumes, and use tsc's type
information as an input rather than as the answer. A type is not a shape (§10),
so types narrow the search; they never settle it.

**Opt-in scope is what makes this affordable.** Whole-program data-flow across
a codebase is why nobody ships this in a linter. Across one annotated function
and the constructors it reaches, it is ordinary work. The annotation is not
just a permission to be strict — it is what buys the analysis budget.

Honest cost: this is substantially more engineering than an ESLint rule set,
and it is where the project's real risk sits. Interprocedural reach beyond the
annotated function is unbounded in JavaScript, so the analysis must declare
where it stops and report `unknown` rather than guess.

### What the tool does and does not promise

It reports patterns measured to be slow, in code the developer marked as
needing speed. It does **not** measure the user's program, so it cannot claim
a speedup for it. The claim it makes is: *this pattern cost 28-67x in this
published benchmark, under these conditions, and you have it inside a function
you flagged as hot.*

That is weaker than "your code got faster" and it is the honest form. The
evidence carries the claim; the tool never asserts a number it did not measure.

### One mode of operation

`turbocharge` — one command, no subcommands, no account, no uploads, offline.
It exits non-zero when any annotated function has a finding, so it drops into
an existing CI step with no configuration.

**Not an ESLint plugin, and the closed-world rule is why.** ESLint's unit of
work is one file; resolving whether a callee is annotated is a cross-file
symbol question. Type-aware linting can reach across files, but then the plugin
is carrying a TypeScript Program anyway, and the plugin wrapper only adds a
config surface. It builds the Program directly and reuses the project's own
`typescript` install, so the parse and the types match the project's build.

## 2. What was killed, and why it matters

The previous design asserted V8 optimization state in CI via
`--allow-natives-syntax`. It died on four measured findings (`useless.md`):

- `%GetOptimizationStatus` reported `optimized=true` throughout a phase
  running 5x slower from megamorphism. The signal does not detect the bug it
  existed to catch.
- The monomorphic-versus-megamorphic ratio was an artifact of measurement
  order: 6.9x / 4.4x / 4.8x / 2.6x / 3.9x across identical runs, and 1.05x
  when the order was swapped. IC contamination is irreversible, so an
  in-process A/B has no independent denominator.
- Which tiers exist changes inside one Node LTS line — Maglev on in 22.0, off
  in 22.9.0 for codegen crashes, on again in 24.
- Three proposed lint rules (`arguments`, `delete`, `try/catch` preventing
  optimization) are dead Crankshaft folklore. All three reach TurboFan when
  tested.

Carried forward: the reviews found the teardown **too strong** in two places.
A pinned-build "this kernel still compiles to TurboFan" canary is defensible
for a library maintainer, just not a speed contract. And the transfer
measurement used short CLIs — where V8 declining to optimize is correct
behaviour — so it proves nothing about servers, parsers, or compilers.

## 3. Evidence: which rules survive their own benchmark

Two rounds, Node v22.23.2, single machine, **directional**. Round 1 was
under-powered; the round-2 sweep (88 cells, four working sets, reads-only and
construction-included, fresh process per observation, 20 measured pairs,
95% bootstrap intervals) **reversed two of round 1's burials**. Ratios are
violating/compliant; `REJ` means the interval spans 1.0.

**Array element representation** — reads only, then with construction:

| Comparison | L1 4KB | L2 256KB | L3 4MB | with construction | Verdict |
|---|---|---|---|---|---|
| holey / packed double | 0.94 REJ | 1.04 REJ | 1.09 REJ | 0.59–0.77 (holey *faster*) | **graveyard, confirmed** |
| boxed / packed double | 1.45 | 1.47 | 1.89 | 2.36–3.28 | **ship — revived** |
| `Float64Array` / packed double | 1.17 REJ | 1.05 | 1.04 REJ | **0.29–0.31** | **ship — revived, opposite rationale** |

Typed arrays buy nothing on reads. They win roughly 3x at *construction*.
Round 1 measured only the half where the win is absent and buried the rule.

**Arrays of objects** — the case a rule would actually target:

Superseded 2026-08-11 by `bench/shapes-calibrated.jsonl`, the same 24 cells
re-run after TC-5 fixed the calibration probe. Reads only, ratio against one
shape, 95% interval in brackets:

| Comparison | L1 | L2 | L3 | Verdict |
|---|---|---|---|---|
| 5 shapes / 1 shape | **10.59** (9.56–11.90) | **8.66** (7.61–9.84) | **3.61** (2.97–4.29) | **ship** |
| 4 shapes / 1 shape | 1.97 (1.81–2.13) | 1.52 (1.29–1.82) | 1.22 (1.09–1.38) | real, and an order of magnitude below the fifth — the rule must not fire here |
| 3 shapes / 1 shape | 1.66 (1.55–1.78) | 1.70 (1.55–1.88) | 1.40 (1.07–1.83) | same |
| 2 shapes / 1 shape | 1.34 (1.20–1.48) | 1.35 (1.19–1.54) | 1.15 REJ | same |

**What changed, and it matters.** The pre-TC-5 sweeps could not resolve
anything between 1.0x and 1.7x, so the rule stayed quiet below five shapes
because the cost there was *unmeasurable*. It is now measurable: roughly 1.2–2.0x,
every cell but one excluding 1.0. The threshold does not move, because the
fifth shape still costs an order of magnitude more than the fourth — but the
justification changes from "we cannot see it" to "we see it, and it is small".
A rule that fired at four would now be defensible on evidence and still wrong
on cost/benefit; that is a judgement, and it is recorded here as one.

The pre-fix numbers, kept for comparison: 5.05 / 7.65 / 2.75 for five shapes,
and 1.32 REJ / 1.05 REJ / 0.96 REJ for two.

| Comparison | L1 | L2 | L3 | Verdict |
|---|---|---|---|---|
| scattered / contiguous, same shape | 0.98 REJ | 1.09 REJ | 1.10 REJ | not a read cost |
| struct-of-arrays / `Float64Array` | 0.90 REJ | 0.98 REJ | 0.85 REJ | no rule |

The scatter row is the one that makes the rule buildable. On reads the cost is
**shape heterogeneity, which a tool can observe**, not memory locality, which
it cannot. (Scatter does cost 3.1–4.0x once construction counts — real, and
outside what any static or runtime observer can attribute.)

**From round 1, unchanged:**

| Rule | Measured | Verdict |
|---|---|---|
| Accumulating spread in a loop | 146–366x at n=10k | ship |
| `delete` on per-row objects | 28–67x (1.4 to 39–92 ns/row) | ship |
| `delete` on a singleton object | 0x — dictionary mode up to 10% *faster* | the second half of the same rule |
| Four-shape polymorphic budget | No clean cliff at 5; K=4 the least stable config measured | graveyard |
| Smi-to-double field widening | Undetectable — TS `number` erases the distinction | graveyard |

**The lesson that must not be lost:** measuring reads without construction
reversed two verdicts. Every rule benchmark runs both halves, or it is not
evidence. This is now rule 11 in §4.

**The graveyard is the launch artifact.** Published refutations — holey
arrays, the 4-shape budget, two-shape arrays, `delete` on singletons — are a
more credible claim than a long rule list nobody measured.

**Chained array passes** — `xs.map(f).filter(g)` against one fused loop that
builds the identical array, Node v22.23.2, 20 pairs per cell,
`bench/chained.jsonl`:

| Cell | Ratio | 95% CI | Verdict |
|---|---|---|---|
| reads only, n=1000 | 1.10 | 0.93–1.30 | **REJ** |
| reads only, n=100000 | 1.37 | 1.09–1.70 | inside the 1.0–1.7x band this harness cannot resolve |
| with construction, n=1000 | **7.64** | **7.20–8.09** | **ship** |
| with construction, n=100000 | 1.42 | 1.25–1.61 | inside the 1.0–1.7x band this harness cannot resolve |

**`chained-allocation` ships on the third cell.** The history is the point.
The first sweep put that cell at 19.73x (CI 12.42–33.73) and the rule was
*refused* on it, because `driver.js` sized each side's rep count from a single
cold `reps=1` run. A cold run of the chained pipeline reads 1,000–20,600 ns/op
against a warm ~21 ns/op, so the chained side got **11 reps** where the fused
side got 1,294, and its timed region came out at **2.4 ms against the 120 ms
target**. The slower a variant runs cold, the shorter its region, the less its
warmup is diluted, and the more its ratio inflates — hardest for exactly the
variants a rule wants to indict. **The harness manufactured the effect it was
asked to find.** That is the round-1 ordering artifact (§2) in a new place.

The fix is in `driver.js` and stated as §4 rule 3: the probe iterates to warm
cost, and a cell whose achieved region misses 120 ms by more than 2x throws
instead of publishing. Re-run under it, the effect is 7.64x with a tight
interval — real, and less than half what the broken harness claimed.

Read cells reject, as expected: both variants hand back the same array, so
there is nothing left to differ. And the effect disappears at n=100000, where
memory bandwidth dominates and one extra allocation stops mattering. The rule
therefore ships with its own size limit attached, which the tool prints with
every finding.

Open: the 64 MB cells for the object suite are still running, so the L3-to-RAM
trend for shape divergence is not yet closed.

**Choosing between two boxed values** — `b.lo = Box.min(b.lo, v)` against
`if (v.lt(b.lo)) b.lo = v`, both keeping the same running minimum over the same
values, Node v22.23.2, 20 pairs per cell, `bench/select.jsonl`:

| Cell | Ratio | 95% CI | Verdict |
|---|---|---|---|
| chosen value escapes, n=10000 | **2.65** | **2.48–2.81** | **ship** |
| chosen value escapes, n=100000 | **2.73** | **2.58–2.88** | **ship** |
| kept in a local, n=10000 | 2.28 | 2.06–2.54 | escape analysis does not remove it |
| kept in a local, n=100000 | 1.72 | 1.47–2.05 | same |
| plain numbers, n=10000 | 1.03 | 0.79–1.26 | **REJ** |
| plain numbers, n=100000 | 0.99 | 0.83–1.18 | **REJ** |

The selector returns a new value on every call, including every call where the
value already held wins. Anything ordered by time makes that nearly every call:
the first item of a bucket is its minimum and nothing later displaces it. The
predicate form compares and stores only on a real change.

**The two number cells are the control, and they are what keeps the rule
honest.** `Math.min` returns a primitive, TurboFan lowers it to a machine
instruction, and replacing it with a branch buys nothing this harness can
measure. So the rule fires on the *type of the result*, not on the shape of the
call: an object result is an allocation, a number result is not.

**The local cells answer the first objection anyone raises** — will V8 not just
delete the allocation? Not here. With the chosen value kept in a function local
the caller never sees, the same loop still costs 1.72–2.28x. The measurement
does not say why escape analysis leaves it — only that the cost survives, which
is enough: "the compiler will remove it" is not a reason to leave the code
alone.

## 4. Benchmark methodology

Non-negotiable, because the evidence *is* the product.

1. One fresh OS process per observation. A process loads exactly one variant.
2. Randomized AB/BA ordering across paired children, same seeded input to both.
3. Pilot runs, discarded, used only to fix rep count and workload size.
   **`bench/run.js` uses one calibration run, not ten pilot pairs** — it sizes
   the timed region to ~120 ms and nothing else depends on the pilot.
   **The pilot must iterate to warm cost, and the achieved region must be
   checked.** One `reps=1` probe reads cold cost, which for a kernel that is
   interpreted before it is optimized can be three orders of magnitude above
   its warm cost. That under-sizes the rep count, and it under-sizes it worst
   for the slowest variant — the exact side a rule wants to indict — so the
   bias is directional and always toward shipping the rule. It inflated one
   measured cell from roughly 6-11x to 19.73x. `bench/driver.js` therefore
   iterates the probe until two successive estimates agree within 20%, and then
   asserts the achieved region landed within 2x of the 120 ms target. **A cell
   outside that window throws.** It is not a noisy result, it is a different
   measurement, and publishing it would be publishing the harness rather than
   the effect. Recorded as `BUGS.md` TC-5; `bench/run.js` still carries the
   single-probe version, which is TC-4.
4. Twenty predeclared measured pairs — 40 processes per comparison. No
   opportunistic sampling when a result is close. This is a **sanctioned
   reduction** from fifty: 24 cells x 40 processes is already ~1,000 spawns and
   ~15 minutes of serial wall clock on this VM. Any cell whose interval is
   close to 1.0 must be re-run at fifty before a rule ships on it.
5. Report the ratio of mean process times with a paired bootstrap 95% interval.
   **Publish the raw per-pair observations alongside the aggregate**, so a
   reader can recompute the interval rather than trust it. Never headline a
   minimum or a best run.
6. A rule ships only when the lower 95% bound exceeds 1.00x; a broad warning
   needs a point estimate at or above 1.10x and a lower bound above 1.05x.
7. Defeat dead-code elimination: generate input from a runtime seed, fold
   results into a checksum, print the checksum after timing. No I/O in the
   timed region.
8. No tracing, profiling, forced GC, or `%GetOptimizationStatus` in evidence
   runs.
9. Pin and publish: Node binary hash and version, V8 version, flags, lockfile,
   benchmark commit, CPU model and microcode, core affinity, kernel, CPU
   governor and turbo policy, heap flags, seeds, warmup counts.
10. Report failures in the same format as wins:
    `REJECTED — 1.01x, 95% CI 0.98-1.04`.
11. **Run every comparison twice: reads only, and with construction
    included.** Measuring one half reversed two verdicts in round 2 (§3).
    A rule that wins only at construction is still a rule — but it must say so.
12. Sweep the working set (L1, L2, L3, RAM). A single size hides
    bandwidth-bound flattening, which is how round 1 buried boxed elements.

Results apply only to the engines and hardware tested. An "all TypeScript"
runtime claim from one Node build on x64 is unverified and must not be made.

## 5. The critiques, re-scored under this design

Both reviews attacked a different product — a codebase-wide linter, then a CI
gate. Under opt-in annotated analysis, most of their fire misses. Scored
honestly.

**Dead — the annotation answers them:**

- *"A linter cannot know whether code is hot, which input shapes reach it, or
  whether a rewrite speeds up the workload."* The developer declares intent and
  supplies the workload. The tool measures rather than guesses.
- *"Shape discipline sits fifth for ordinary application code, behind I/O,
  algorithm, allocation, and warmup."* True and irrelevant: you annotate the
  code where it sits first.
- *"400 errors nobody can fix incrementally, so the plugin gets disabled."*
  Unannotated code produces no output. Adoption is one function at a time.
- *"Biome, Unicorn, oxlint, and e18e already ship `noAccumulatingSpread` and
  `noDelete`."* They ship rules, codebase-wide, unmeasured, with no target. Here
  the rules are interchangeable content inside a scoped analysis. Overlap stops
  being fatal — and their rules can be imported as candidates.

**Alive, but aimed at a different product now:**

- *"CodSpeed's optimizer already does the measured-transform loop."* True, and
  no longer competing: this is not a measurement loop. CodSpeed measures your
  program and changes it; turbocharge measures *rules* once, publishes the
  evidence, and enforces them where you asked. Different contract, different
  install decision. The overlap that remains is that a team already running
  CodSpeed may see no reason to add lint rules — **unverified**.
- *"A coding agent already runs the optimize-and-re-measure loop when asked."*
  True in 2026, and it raises the value of what an agent cannot produce alone:
  a measured rule corpus with published conditions and refutations. That corpus
  is the durable asset here, usable by a human or an agent, and it outlives the
  plugin.

**Honest limitation, unattacked because no reviewer saw this design:**

- The tool never measures the user's code, so "turbocharge" overpromises unless
  the evidence is impeccable and the conditions are stated on every rule. The
  entire credibility rests on §3 and §4. A single unmeasured rule shipped on
  folklore destroys the only differentiator.

**Partly alive:**

- *"The segment that would pay is helped least."* Weaker now — the annotation
  cuts across segments, since anyone with one hot function and a target
  qualifies. But the tool is still free and local by design, so this is an
  open-source project, not a business.

## 5b. Users

- **Anyone with a specific function they need faster and a number in mind.**
  That is the honest segment, and it is not a market category.
- **Library maintainers whose contract is speed** — parsers, serializers,
  validators. Will adopt, will not pay.
- **CPU-bound Node service teams** — will pay, but need production-like
  replay, which this does not do.
- **Killed as targets:** framework maintainers (CodSpeed territory), compiler
  and bundler teams (hot paths moving to Rust and Go), Node core (needs C++ and
  libuv), ORM and I/O-heavy applications, generic frontend.

## 6. The gap

Verified 2026-08-09; sources in `options.md` and `tmp/codex-round3.md`.

**What exists.** CodSpeed already ships the measured-transform loop: baseline,
differential flamegraph, one targeted source change, correctness tests,
re-measure, revert non-wins, report improvements above 5%. Biome, Unicorn,
oxlint, and `@e18e/eslint-plugin` all ship performance rules —
`noAccumulatingSpread`, `noDelete`, `no-spread-in-reduce`,
`no-delete-property` — so the surviving rules are largely already detected
somewhere.

**What does not exist**, within the set checked:

- No linter publishes a rerunnable compliant-versus-violating runtime
  benchmark with each rule. Biome's and oxlint's benchmarks measure their own
  linter throughput, not the runtime performance of compliant programs.
- No linter gates its findings on profile relevance.
- Nothing local, offline, and unauthenticated does the measured loop —
  CodSpeed's optimizer requires an account and uploads your measurements.
- No tool attributes a measured regression to a V8 cause ("this frame got
  hotter because these two constructors introduced new maps").

**Honest weakness:** this is an evidence gap and a policy gap, not a
capability gap. Biome could publish per-rule benchmarks in a sprint if it
decided to. "No linter anywhere does this" remains unverified — only the
checked set is known.

## 7. The kill experiment — run this before writing rule code

One week. Build only the fresh-process benchmark runner from §4.

Pre-register six comparisons: accumulating spread and repeated
`Intl.Collator` construction as positive controls; receiver maps at 1/2/4/5/8;
`new Array(n)` manual fill versus `.fill`; `Float64Array` versus packed-double
array; escaping versus non-escaping closure allocation. Run 10 pilot plus 50
measured randomized pairs on Node 22.23.2 and current LTS, confirming winners
on a second machine or Node release.

Then scan 10-20 substantial TypeScript repositories and hand-classify the
first 100 findings for semantic correctness and precision.

**Kill the standalone plugin unless at least three rules simultaneously:**

- reach 1.10x or better with a 95% lower bound above 1.05x on both Node
  versions;
- are not already substantially covered by e18e, Biome, or Unicorn;
- achieve 95% or better diagnostic precision with a safe rewrite;
- improve a representative end-to-end workload by at least 5%.

If it dies, publish the benchmark corpus and the graveyard anyway, and
contribute the validated rules and their evidence to e18e, Biome, or Unicorn.
The corpus is worth more than the plugin either way.

## 8. Non-goals

- turbocharge compiles nothing: no code generator, no Wasm target, no IR.
- It does not assert V8 optimization state, force optimization, or gate on
  tier. §2 explains why.
- It does not sample or draw flame graphs. It consumes a profile you already
  have.
- It does not claim to make code faster. It reports patterns with measured
  evidence, in code measured to be hot.
- It does not target non-V8 engines. Every number is Node/V8 and is labelled
  as such.
- It does not prove allocations are eliminated; V8 exposes no escape-analysis
  signal.

## 9. Open questions and decisions owed

- **Does profile ingestion belong in scope?** Codex is explicit: without it,
  do not build a standalone plugin at all — contribute the rules upstream
  instead. That makes profile gating the load-bearing feature, not an add-on.
- **The paying segment is helped least** (§5). Unresolved.
- **The moat is thin.** The evidence policy is a decision anyone can copy.
- **Which surviving rules already exist upstream** — accumulating spread is in
  Biome and e18e today. If all four survivors are already shipped elsewhere,
  the plugin is a documentation project.
- **The working-set sweep** for the elements-kind burials is not run.
- **Profile-to-source mapping through source maps and bundlers** is
  unspecified and is where most of the engineering risk sits.
- **Whether a `@hot` annotation is still needed** once a profile supplies
  hotness. Probably not — that is the point of §1's property 2.

## 10. Corrections carried forward

- **"TypeScript cannot tell V8 anything" was too strong.** A declared type
  could in principle seed a guess, but a type is not a shape (field count,
  order, elements kind, prototype identity); tiering policy, not type
  information, decides when optimizing compilers run; and erased types have no
  channel. Static Hermes and AssemblyScript are where types drive codegen;
  neither is V8.
- **Unboxed double object fields no longer exist.** Under pointer compression
  a double in a plain object field is heap-boxed; only array elements and
  typed arrays hold doubles unboxed.
- **The 4-shape budget was in this spec on secondary-source authority and did
  not survive measurement.** `max_valid_polymorphic_map_count=4` governs
  receiver-map ICs; call ICs track callable targets differently, and V8
  carries experimental homomorphic IC machinery, so no permanent cliff can be
  assumed.
- **Adding one property after construction does not force dictionary mode.**
  Ordinary additions take a fast map transition. The blanket rule was wrong.
- **CodSpeed's cycle counts are a model**, not ground truth — retired
  instructions plus modelled cache-miss costs, excluding syscall time. Better
  than JIT state, still a proxy.
- **Deopt Explorer is not a funded maintained rival.** Last release May 2023;
  its README says keeping pace with V8 is hard "for one person."
- **CLIs were the wrong evidence base.** For a short process V8 declining to
  optimize is correct behaviour. Tier-share claims must be remeasured on
  compilers, parsers under load, warmed services, and data pipelines.

## 11. What is built

TypeScript, run directly by Node — type stripping is on by default from Node
22.18, so there is no build step and no `dist/`.

```
bin/turbocharge.ts    entry; exits 1 on any finding
lib/ts.ts             resolves the project's own typescript, builds a Program
lib/scan.ts           finds annotated functions, classifies every call in them
lib/rules.ts          the four rules, each carrying its measurement
lib/report.ts         output
test/check.test.ts    7 tests, and the important ones assert silence
bench/shapes.js       one variant per process; plain JS on purpose (below)
bench/run.js          driver: paired runs, AB/BA randomized, bootstrap interval
bench/meme.js         renders the chart from shapes.jsonl, so it cannot drift
```

`make test`, `make lint` (`tsc --noEmit`, clean), `make check`, `make bench`.

`bench/*.js` stays plain JavaScript deliberately. A skeptic re-running the
measurement should read exactly what V8 executes, with no type-stripping step
between the source and the engine.

### The four rules

| rule | fires on | measured cost | must stay silent on |
|---|---|---|---|
| `boxed-elements` | array parameter of `any`, `unknown`, or a union mixing primitives | 1.45-1.89x reads, 2.36-3.28x with construction | holey arrays (0.94-1.09) |
| `megamorphic-elements` | array parameter with 5+ object shapes | 4.01-8.28x reads; 1.07-1.63x with construction | 2 to 4 shapes (1.18-1.58x) |
| `delete-property` | `delete` inside the region | 28-67x per load | plain property assignment |
| `closed-world` | call to an unannotated user function | none — a coverage fact | primitives, annotated callees |

The "must stay silent" column is enforced by tests, not by intent. A rule that
fires there contradicts this project's own evidence, and the test fails.

### Replication: what survived a second sweep

The 24-cell sweep was run twice, independently, same harness and machine. Nine
cells did not replicate, and the pattern is the whole lesson:

| cell (reads) | sweep 1 | sweep 2 | agrees |
|---|---|---|---|
| L1, 2 shapes | 1.28 (1.10-1.54) | 1.12 (0.90-1.45) REJ | no |
| L1, 4 shapes | 1.33 (1.27-1.38) | 1.12 (0.93-1.34) REJ | no |
| L2, 2 shapes | 1.18 (1.14-1.23) | 1.08 (0.96-1.22) REJ | no |
| L3, 4 shapes | 1.33 (1.05-1.64) | 1.20 (0.93-1.52) REJ | no |
| **L1, 5 shapes** | **5.34 (4.96-5.80)** | **6.88 (5.81-8.10)** | **direction, yes** |
| **L2, 5 shapes** | **8.28 (8.02-8.56)** | **8.70 (7.39-10.02)** | **yes** |
| **L3, 5 shapes** | **4.01 (3.55-4.62)** | **3.39 (2.87-4.04)** | **yes** |

**Every effect between 1.0x and 1.7x flipped** between significant and
rejected; `incl L1, 5 shapes` flipped direction outright (1.07 REJ to 1.49).
**Every five-shape reads cell held**, in all six measurements across both
sweeps, at 3.4-8.7x.

So this harness, at 20 pairs on this VM, resolves large effects and cannot
resolve small ones. The published figures change accordingly: the cliff is
quoted as a replicated range, and the 2-to-4-shape numbers are withdrawn as
point estimates. The rule stays silent below five for a better reason than
before — not "the effect is small" but "we cannot measure it".

That also puts a caveat on `boxed-elements`, whose 1.45-1.89x comes from one
unreplicated sweep inside exactly that unresolvable band. The tool now says so
in its own output.

### The rule this caught in its own tool

`megamorphic-elements` shipped its first draft firing at **three** shapes and
quoting a **five**-shape cost, across a gap nobody had measured. Measuring 3
and 4 (`bench/shapes.jsonl`, 24 cells) killed that threshold:

| shapes | L1, 256 rows | L2, 16k rows | L3, 262k rows |
|---|---|---|---|
| 2 | 1.28x | 1.18x | 0.98x REJ |
| 3 | 1.26x | 1.58x | 1.11x |
| 4 | 1.33x | 1.50x | 1.33x |
| **5** | **5.34x** | **8.28x** | **4.01x** |

Two, three and four shapes are all ~1.3x. The fifth is 4-8x. That is V8's
inline cache holding four maps and going megamorphic on the fifth — a step, not
a slope. The threshold is now 5, and 4 is locked silent by a test.

**And the cliff is read-side only.** Counting construction in the same loop,
the fifth shape costs 1.07x (L1, interval includes 1), 1.63x (L2), 1.23x (L3).
Code that builds its arrays as often as it reads them will not see this. The
tool prints that caveat with the finding rather than burying it here.

### What is still wrong with it

1. **Only parameters are examined.** Locals and return values are not. This
   matches codex round 4's restriction to already-escaping values, so it is
   defensible, but it is a coverage limit and not a design.
2. **`closed-world` has no escape hatch.** A call you have accepted — logging
   on a cold branch — fires forever. `@njit` has the same property and it is
   survivable, but it is untested against a real codebase.
3. **No runtime half.** Shape divergence that types cannot see — one declared
   type built by two constructors — is invisible to this. `DESIGN.md` holds
   the verified mechanism, restricted per codex round 4 to observing values
   that already escape.
4. **One machine, one Node build.** Everything above is directional.

### Not yet decided

Whether the runtime half enables V8 natives via `v8.setFlagsFromString` from a
preload, which would let it run under Jest and Vitest, or restricts to
`node --test`. This decides which test runners v1 supports.

## 12. What V8's own source says

`v8src/` is a sparse checkout of github.com/v8/v8 (96 MB, `src` and `include`).
It was read to answer one question: are there other thresholds worth a rule, or
is the megamorphic cliff the only one?

| constant | value | where | meaning |
|---|---|---|---|
| `max_valid_polymorphic_map_count` | **4** | `flags/flag-definitions.h:3320`, used at `ic/ic.cc:802` | the fifth map at a load site forces megamorphic |
| `max_optimized_bytecode_size` | 60 KB | `flag-definitions.h:1630` | above this TurboFan never runs |
| `max_maglev_optimized_bytecode_size` | 512 KB | `flag-definitions.h:1634` | the same cap for Maglev |
| `max_inlined_bytecode_size` | 460 | `flag-definitions.h:1606` | normal inlining limit |
| `max_inlined_bytecode_size_absolute` | 4600 | `flag-definitions.h:1618` | hard inlining limit |
| `max_inlined_bytecode_size_small` | 30 | `flag-definitions.h:1625` | always-inline candidates |
| `fast_properties_soft_limit` | 12 | `flag-definitions.h:3329`, used by `Map::TooManyFastProperties` | out-of-object fields before a keyed store goes dictionary |
| `kMaxFastLiteralDepth` | 3 | `compiler/globals.h:102` | nesting depth for the fast object-literal path |
| `kMaxNumberOfTransitions` | 1536 | `objects/transitions.h:149` | map transition tree cap |
| `kMaxInstanceSize` | 255 words | `objects/js-objects.h:965` | largest object with in-object properties |
| `invocation_count_for_maglev` / `_turbofan` | 400 / 3000 | `flag-definitions.h:1187,1204` | tier-up thresholds |

**The first row is the important one.** The measured cliff in §11 and this
constant are the same fact, found from opposite ends: a benchmark that knew
nothing about the source, and a source constant that predicted the benchmark.
That is the only rule in the project with both.

### Verified from this, but not shipped

A function above the optimization cap is **never optimized at all** — not
Maglev, not TurboFan. Measured with `bench/optsize.js`: 3455 generated
statements reach Maglev, 3456 reach nothing, and 3456 stays unoptimized at
3,000,000 invocations, so it is a real limit rather than a tier-up budget that
had not been reached. Cost across that one-statement edge is **2.74x per
statement** (3.822 vs 10.484 ns).

It does not ship as a rule because source statements are a poor proxy for
bytecode size and that mapping is unmeasured. Recorded as `BUGS.md` TC-3.

### Candidates the source suggests, all unmeasured

`fast_properties_soft_limit` (12) sharpens `delete-property` into a rule about
field counts. `kMaxFastLiteralDepth` (3) suggests a rule on deeply nested object
literals. `max_inlined_bytecode_size` (460) suggests that an annotated helper
too large to inline silently loses the benefit of being annotated at all.

None of them ship. The project rule holds: a constant in V8's source is a
hypothesis, and only a benchmark makes it a rule.

### The one identified path to a large win

`createProgram` plus the type checker is 89% of a run (692-981 ms parse,
260-393 ms check); all four rules together are 8-10 ms, under 1%. So the tool's
cost is TypeScript's, not ours, and no amount of tuning our own code moves it.

TypeScript 7 (`microsoft/typescript-go`) is a Go port of that compiler, and its
own claimed speedup is roughly 10x — **unverified here, that is Microsoft's
number, not a measurement of ours**. Two things about it were verified against
the repository at HEAD on 2026-08-10:

- **It cannot be linked.** Every package is under `internal/` — `internal/checker`,
  `internal/ast`, `internal/compiler` — which Go enforces against import from
  another module. There is no `pkg/`. Rewriting turbocharge in Go would not get
  us access to it.
- **The sanctioned integration is IPC**, `internal/api`: a jsonrpc/msgpack
  server over a unix socket. To that server a Go client and a Node client are
  identical, so the host language is irrelevant to the win.

The API exposes exactly the calls the four rules make — `getSymbolAtLocation`,
`getTypeAtLocation`, `getIndexTypeOfType`, `typeToString`, `isArrayLikeType`,
`getPropertiesOfType`. `getIndexTypeOfType` is the call in `lib/rules.ts`'s
`elementType` helper.

So the migration is a **client swap, not a rewrite**, and it stays in
TypeScript. That is the whole reason to keep the checker's own logic small and
free of TypeScript-API assumptions beyond those six calls.
