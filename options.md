# turbocharge — options, live design, and the graveyard

2026-08-09. Inputs: `useless.md` (adversarial teardown, probes on Node
v22.23.2 / V8 12.4.254.21), `tmp/codex-round1.md` (independent review),
`SPEC.md` (dead tierlock design, context only — not edited).

Two rounds in one document. **Part I is the live design** per the owner's
scope change: an ESLint plugin whose every rule is backed by its own
experimental benchmark, targeting all TypeScript. **Part II preserves the
round-1 segments and candidate designs with their critiques** — kept, not
discarded, per the owner's instruction.

All local measurements in this file were run this session on Node v22.23.2
(same build the teardown probed) on a noisy sandbox VM. Probe scripts:
`scratchpad/{probe_pipeline,probe_alloc,r1_shapes,r2_elements,r3_dict,r3b_dict_many,r4_spread}.js`.
Treat every local number as directional, single-machine, single-session.
That caveat is not a disclaimer of convenience: the product's whole thesis
is that numbers like these must be regenerated per environment, and Part
I.3 specifies how.

---

# Part I — Live design: the benchmark-backed lint plugin

## I.1 Product statement

**`eslint-plugin-turbocharge`** (name free on npm — no such package exists;
nearest are `eslint-config-turbocharge` and `eslint-plugin-turbo`, both
unrelated. The bare npm name `turbocharge` is a squatted placeholder,
`0.0.0-pre.1`, last published 2022-10-25 — a candidate for an npm
abandoned-package dispute, outcome unverified).

- Every rule ships with a **benchmark pair**: the violating form and the
  compliant form, measured under the methodology in I.3. The rule's doc
  page and its editor diagnostic both carry the measured ratio, the
  uncertainty band, the Node version, and the date.
- **Rules that fail their own benchmark are dropped publicly.** The
  graveyard page is a first-class deliverable — the teardown already
  killed three (`arguments`, `delete`-in-function, `try/catch` all reach
  TurboFan on V8 12.4), and this session's probes killed more (I.2).
- No CI gate, no `%GetOptimizationStatus`, no shape derivation, no runtime
  harness, no runtime marker functions. JSDoc annotations (`/** @hot */`)
  are used only to opt files/functions into aggressive rules.
- **`turbocharge`, the command, is a verifier and nothing else**: bare
  invocation, no subcommands. It reads the repo's ESLint config, finds
  which turbocharge rules are enabled, re-runs those rules' benchmark
  pairs on the user's machine and Node version, and prints the local
  table next to the published one. One mode by construction: lint runs
  inside ESLint (not our binary), so the only thing left for a CLI to do
  is regenerate evidence. It satisfies the original hard constraint —
  every recommendation ships with a measured speedup — because the
  measurement *is the rule's admission ticket*, and the verifier lets any
  user re-measure it locally in about a minute. It is possibly not needed
  for v1; the published CI-generated numbers may suffice. Ship it only if
  the falsification experiment (I.6) shows cross-machine variance large
  enough that published numbers get challenged.

## I.2 Which rules survive? (predictions were committed before measuring)

Effect-size predictions below were fixed before the probes ran, so the
numbers could falsify them. Several did.

| candidate rule | statically detectable in TS? | predicted (pre-measurement) | measured (this machine) | verdict |
|---|---|---|---|---|
| shape count at a call site (1/2/4/5/8) | weak — only as "param typed as 5+-way union of distinct-layout types" heuristic | K2 1.1–1.3x, K4 1.3–1.6x, K5/K8 2.5–4x, clean cliff at 5 | K2 1.3x, K5 2.4x, K8 2.3x — **K4 unstable (2.6–10.4 ns across rounds); no clean cliff at 5** | conditional — informational, off by default |
| property insertion order | **yes** — two literals of one named type, different key order; cheap, autofixable | 1.05–1.3x at consumer sites | proxy: K2 arity = 1.3x load-site | **build** (autofix; small, honestly labeled) |
| `delete` (dictionary mode) | **yes** — trivial syntax | 2–5x on subsequent loads | **singleton object: 0x — dict was ≤10% *faster* (falsified). Per-row objects: 28–67x slower (1.4 → 39–92 ns/row)** | **build**, with both benchmarks in the doc |
| post-construction property add | partial — flow analysis on `Partial<T>` build-up, `any` escapes | 1.5–3x via map transitions | not measured this session | conditional — suggestion-level, FP risk from intentional builder patterns |
| elements kinds: holey vs packed | partial — `new Array(n)` trivially; holes via flow, leaky | holey read 1.2–1.5x slower | **0.65 vs 0.67 ns/elem — no penalty (falsified)** | **drop publicly** (pending the size-sweep in I.3; flagship graveyard entry) |
| elements kinds: boxed (`PACKED_ELEMENTS`) vs packed double | partial — `Array<number\|string>` in numeric context | 3–8x | **0.80 vs 0.67 ns/elem = 1.2x (falsified)** | **drop publicly** (same caveat) |
| field representation widening (Smi→double) | **no** — TS `number` erases the distinction | 1.1–1.3x | not measurable as a rule | **dead** — undetectable regardless of effect |
| typed arrays for bulk numbers | no — size/hotness statically unknown; FP flood | up to 1.4x read-side vs packed double | **0.66 vs 0.67 ns/elem — no read-side win (falsified)** | **dead as a rule**; docs guidance only (wins live at N-API/bulk boundaries per the benchmarks repo, which is not lintable) |
| allocation in hot loops (chained `map/filter` → fused; literal/closure in loop) | only when gated by `/** @hot */` — ungated it's an FP flood | 1.5–5x realistic; more when alloc-dominated | chained-vs-fused synthetic: **23–101x per-round ratio (median 59x)** — alloc-dominated best case, baseline itself spread 96–242 ms | conditional-build — `@hot`-gated only, benchmark pair labeled "best case" |
| accumulating spread (`[...acc, x]` in reduce/loop) | **yes** — near-zero FP | ≥50x at n=10k | **146–366x at n=10k (median 166x; 0.36 ms → 59.6 ms)** | **build** — but Biome/oxlint already detect it; ours adds the receipt and the n-scaling curve |
| `includes` on array in loop → `Set#has` | **yes** — unicorn ships it evidence-free | O(n·m); ~100x at n=1000 (committed, unmeasured) | not measured this session | build-candidate — measure first, per own methodology |
| regex literal in hot loop | yes (Biome `useTopLevelRegex` exists) | 1.1–1.5x (committed, unmeasured) | not measured | measure first; likely graveyard |

Three probe results deserve emphasis because they *are* the product
working as intended:

1. **The `delete` rule's verdict depends entirely on benchmark design.**
   Singleton object: no effect (TurboFan appears to specialize the
   constant object — the folklore benchmark refutes the folklore rule).
   100k row objects each missing a middle property: 28–67x, because every
   dictionary-mode object gets its own map, so the site goes megamorphic
   *and* every access is a hash probe. Biome ships `noDelete` citing a
   WebKit blog post; we ship it citing both numbers and stating when it
   does and does not matter. That asymmetry is the entire differentiator.
2. **The elements-kind rules failed their own benchmarks.** Holey-double
   reads matched packed; boxed reads cost 1.2x, not the folklore 3–8x.
   This extends the teardown's "Crankshaft folklore is dead" finding to
   elements kinds, measured. Caveat before final burial: the 8 MB working
   set may be bandwidth-bound, masking in-cache differences — the shipped
   benchmark must sweep working-set size (I.3) before the graveyard entry
   is finalized.
3. **The polymorphic "cliff at 5" did not reproduce cleanly.** Mega (K=5,
   K=8) is ~2.4x mono — real but modest — and K=4 was the *least stable*
   configuration measured (4x spread across rounds). The mrale.ph
   4-shape budget that SPEC.md hard-coded is not a rule this plugin can
   ship on this evidence.

Shipping set v1 is therefore honest and small: **accumulating-spread,
no-delete (two-benchmark story), consistent-key-order (autofix),
`@hot`-gated allocation rules; informational union-arity** — roughly four
real rules plus a graveyard that is longer than the rule list. Say that
plainly in the README; it is the credibility, not the weakness.

## I.3 Benchmark methodology (what makes a rule's evidence credible)

The teardown proved in-process A/B is invalid (ordering contamination:
6.9x mono-first, 1.05x mega-first — one destructive experiment sold as a
comparison). The house methodology:

- **Two source files per rule** — violating `V`, compliant `C` — that
  compute and print the same checksum from inputs seeded via `argv`. The
  printed checksum is the dead-code-elimination guard and the correctness
  check in one; a pair whose checksums differ is a build error.
- **Fresh process per measurement, always.** Never two variants in one
  process; never mono-then-mega in one feedback vector.
- **Interleaved invocation order** `V,C,V,C,…` to decorrelate machine
  drift; ≥10 process runs per variant in CI, ≥5 locally. Per-process
  statistic: median of ≥15 in-process reps after ≥3 warmup reps.
  Cross-process statistic: median. Uncertainty: MAD/median per variant;
  the ratio is published with a band, and **a ratio whose band spans 1.0
  is reported as "no effect" — that rule goes to the graveyard**, exactly
  the benchmarks-repo suppression rule.
- **Pinning and freshness.** Every published number carries the exact
  Node version and date. CI regenerates the full table on every plugin
  release and every new Node LTS line (20/22/24 matrix; Bun/JSC as a
  labeled extra column, since shape discipline claims should say which
  engine they are about). Evidence older than the current LTS is demoted
  to "unverified on current Node" automatically. This is the direct
  answer to the version churn that killed deoptigate — the claims rot,
  so the harness re-earns them on schedule.
- **Two design sweeps every object/array rule must include**, learned
  from this session's falsifications: (a) working-set size (in-cache
  ~32 KB and streaming ~8 MB — R2's null result may be bandwidth
  masking); (b) singleton vs population (R3 vs R3b flipped the `delete`
  verdict from 0x to 45x).
- **Determinism option:** the canonical CI numbers can additionally run
  under CodSpeed's CPU simulation (free for OSS; measured-cycles model,
  <1% variance) so the published table is stable; local `turbocharge`
  reruns are wall-time with bands. Note honestly, per codex: CodSpeed's
  simulated time is a model (instructions + cache-miss estimate,
  syscalls excluded — [codspeed.io/docs/instruments/cpu](https://codspeed.io/docs/instruments/cpu)), which is fine
  here because rule pairs are pure CPU.
- **Reporting a no-win rule:** the rule doc is not deleted; it is marked
  DROPPED with its numbers, date, and Node version. The graveyard is
  citable and permanent.

## I.4 Does this already exist? (verified 2026-08-09)

No linter surveyed cites measured benchmarks for the runtime cost of the
pattern it flags. Checked:

- **Biome `lint/performance`** — 5 rules (noAccumulatingSpread,
  noBarrelFile, noDelete, noReExportAll, useTopLevelRegex).
  noAccumulatingSpread cites Big-O only; noDelete cites a WebKit blog
  post, no measurements.
  [biomejs.dev/linter/rules/no-accumulating-spread/](https://biomejs.dev/linter/rules/no-accumulating-spread/),
  [biomejs.dev/linter/rules/no-delete/](https://biomejs.dev/linter/rules/no-delete/)
- **oxlint** — perf-tagged rules exist (no-accumulating-spread,
  no-map-spread, react-perf set, prefer-set-has …); no per-rule numbers.
  Its famous benchmarks are linter *throughput* (13–72x vs ESLint), not
  rule evidence. [oxc.rs](https://oxc.rs/docs/guide/usage/linter/rules.html)
- **eslint-plugin-unicorn `prefer-set-has`** — "Set#has() is faster than
  Array#includes()", no numbers.
  [github.com/sindresorhus/eslint-plugin-unicorn](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-set-has.md)
- **eslint-plugin-perf-standard** — abandoned ~10 years (v1.0.3), no
  benchmarks. [npmjs.com/package/eslint-plugin-perf-standard](https://www.npmjs.com/package/eslint-plugin-perf-standard)
- **eslint-plugin-regexp / optimize-regex** — no per-rule numbers.
- **eslint-rule-benchmark** ([github.com/azat-io/eslint-rule-benchmark](https://github.com/azat-io/eslint-rule-benchmark))
  times how fast a rule *implementation* lints — different category.
- **typescript-eslint #2749** — an open request touching per-rule
  benchmarks; whether it means pattern-runtime cost or rule-execution
  cost is unverified beyond a research-agent summary.
  [github.com/typescript-eslint/typescript-eslint/issues/2749](https://github.com/typescript-eslint/typescript-eslint/issues/2749)

So the differentiator is real — and thin. It is an **evidence gap, not a
capability gap**: Biome could add measured numbers to five rule docs in a
sprint. The moat, such as it is, is the harness + the regenerated-per-LTS
results + the graveyard's credibility, not the rules themselves.

## I.5 Is "every rule cites its benchmark" enough of a wedge?

**Not by itself.** Three reasons, stated against our own product:

1. Both reviews rank shape discipline ~5th for ordinary application code,
   and the probes agree: for the all-TS audience the honest per-rule wins
   are either small (1.05–1.4x site-level: key order, poly arity) or
   narrow catastrophes (spread accumulation, per-row `delete`). A plugin
   whose honest pitch is "four rules, two of which Biome has" does not
   spread on merit alone.
2. Linters are adopted through defaults, templates, and vibes — unicorn
   has shipped evidence-free perf claims for years without penalty. The
   marginal installer does not read benchmark methodology.
3. Our own probes killed half the candidate catalog. Honesty shrinks the
   product; that is the point, but it is not a growth loop.

The minimum extra things that make it worth installing:

- **The receipt travels into the editor.** The diagnostic itself reads
  e.g. `accumulating spread: measured 166x at n=10k on Node 22.23
  [link]` — no other linter puts a measured number in the squiggle. Cost:
  string formatting. Distinctiveness: total.
- **`turbocharge` as the one-command falsification kit** — "don't trust
  us, run it" (I.1). It converts the docs' claim into a local receipt on
  the user's own Node in about a minute, and it is what makes the plugin
  a *methodology* rather than a listicle.
- **The launch artifact is the graveyard, not the plugin.** "We
  benchmarked every V8 perf lint rule; half are folklore; here are the
  numbers and the harness" is the content that gets read; the plugin is
  the durable residue people install afterward. The teardown's own
  findings (arguments/delete/try-catch reach TurboFan) plus this
  session's falsifications (holey, boxed, typed-array reads, singleton
  delete) are launch-ready material.
- Longer term, the defensible asset may be the **per-LTS evidence table**
  (what still matters on Node 26? on Bun?) more than the lint rules —
  cheap to maintain, nobody has it, and it feeds every future rule
  proposal a falsification pipeline.

## I.6 Falsifiable experiment (<1 week) and cost of being wrong

- Days 1–2: harness — process-isolated pairs, checksum guard, interleave,
  bands, Node 20/22/24 matrix. Reuses the benchmarks-repo discipline.
- Days 3–4: port the 12 candidate pairs from I.2 (including size and
  population sweeps for the object/array rules).
- Day 5: publish the table; implement the plugin with the survivors.

**Kill criteria** (any one suffices): (a) fewer than 3 rules survive with
a band-excluding-1.0 win of ≥1.5x in their *realistic* (population,
size-swept) form; (b) every survivor is already detected by Biome or
oxlint with equivalent precision — then the correct product is a PR
adding measured numbers to *their* docs, not a plugin; (c) cross-machine
reruns flip any survivor's verdict, and the flip cannot be explained and
bounded — then the evidence model itself is unsound and the whole premise
dies, not just a rule.

**Cost of being wrong:** ~1 week. The residue is positive either way: the
harness plus a citable set of falsifications (the graveyard article works
as a standalone publication even if the plugin never ships). The real
downside risk is reputational-inverse: shipping a rule whose number does
not reproduce on readers' machines — mitigated by the band discipline,
the CodSpeed canonical run, and the local verifier.

---

# Part II — Recorded alternatives (round 1, preserved with critiques)

The original brief: a JS/TS performance tool named turbocharge, one bare
command, every recommendation with a measured speedup. The owner's scope
change supersedes the round-1 recommendation but everything below is
kept, argued, and remains the context the live design was chosen against.

## II.A User segments

**S1 — Maintainer of a CPU-bound JS library** (parser / serializer /
validator class: ajv, marked, prettier-like). Measures today: hand-rolled
`node bench.js` scripts, some tinybench/mitata; a minority gate PRs with
CodSpeed (its homepage shows Vercel, LangChain, Prisma among users — mix
of JS/Python, individual stacks unverified). What hurts: PR perf review
is manual re-running; regressions land silently between releases. Pay:
no (OSS). Adopt: yes — this is the adoption engine and the audience for
whom per-rule receipts read as craftsmanship. **Keep.**

**S2 — Team running a CPU-bound Node service** (SSR farms, JSON-heavy
APIs, GraphQL gateways). Measures today: APM p95s (Datadog — its Node
profiler needs Node ≥18,
[docs.datadoghq.com/profiler/enabling/nodejs](https://docs.datadoghq.com/profiler/enabling/nodejs/)),
occasional `--cpu-prof` in staging. What hurts: fleet CPU is real
dollars, but the hot code is often framework-internal (React render),
which no lint or transform on *their* code reaches. The only segment
that pays, and the segment the tool helps least. **Keep, narrowed** to
own-code hot paths (serialization, mapping).

**S3 — Framework/runtime authors.** Dozens of teams, already running
custom rigs (js-framework-benchmark, in-house perf CI). They need none
of this and amplify all of it. **Kill as market; keep as evangelists.**

**S4 — CLI tool authors.** Measured here: `npm --version` 63–125 ms;
`npm ls -g --depth=0` 443–776 ms. Known fixes now sit in Node core:
compile cache (`NODE_COMPILE_CACHE` v22.1+, `module.enableCompileCache()`
v22.8+, stable v25.4.0 —
[nodejs.org/api/module.html](https://nodejs.org/api/module.html#module-compile-cache)),
`--build-snapshot` (stable v25.4.0/v24.13.1), SEA (still "active
development", [nodejs.org/api/single-executable-applications.html](https://nodejs.org/api/single-executable-applications.html)).
Local probe: compile cache on `npm --version` — no win (median ~70 ms
uncached vs ~90 ms cached, within noise); on `npm ls` — suggestive ~27%
(585→425 ms) but n=4 with overlapping spread. Adopt: yes; pay: no.
**Keep only as D3 material.**

**S5 — Serverless/edge teams.** AWS SnapStart supports Java 11+, Python
3.12+, .NET 8+ — **not Node.js**
([docs.aws.amazon.com/lambda/latest/dg/snapstart.html](https://docs.aws.amazon.com/lambda/latest/dg/snapstart.html));
Lambda init reuse already amortizes warm starts; platforms own this
layer. **Kill.**

**S6 — Perf consultants / staff engineers on perf sprints.** Force
multiplier for a tiny population whose clients pay, not them. **Kill as
market; early users at best.**

## II.B Candidate designs

### D1 — Benchmark-triggered regression explainer (codex's proposal)
- **Contract:** `turbocharge [speed.toml]`; runs the declared workload on
  git merge-base and HEAD in fresh interleaved processes; gates on the
  measured delta with an uncertainty band; on regression, re-runs with
  diagnostics (`--cpu-prof`, GC perf hooks, versioned `--trace-deopt`/
  `--trace-ic` decoders) and prints causes ranked by overlap with newly
  hot frames. One command: base auto-detected; CI and local identical.
- **Measures:** time (or instructions) per workload — the real quantity.
  The V8 attribution is advisory decoration that fails soft when a log
  format is unknown.
- **Why stable:** the contract is the measured delta; only the
  explanation decays.
- **For:** S1, S2 with existing bench suites.
- **Strongest objection:** the explanation half inherits the exact V8
  log-format treadmill that killed deoptigate (last push 2022-12-12),
  v8-deopt-viewer (2023-10-03) and stalled Deopt Explorer (last release
  2023-05-31) — as a solo maintainer, against CodSpeed, which is alive,
  funded, already does Node walltime profiling with flamegraphs
  (changelog 2025-10-14) and could ship a "why" pane in a quarter. And
  it recommends no change, so it fails the round-1 "turbocharge"
  contract by name.
- **Verdict: conditional** — a module bolted onto a measuring product,
  not a product.

### D2 — Measured-transform loop (round-1 recommendation, superseded)
- **Contract:** `turbocharge [turbocharge.toml]`; TOML names a workload
  command. Loop: measure baseline (fresh processes, band) → profile CPU +
  allocation sampling to rank hot sites → apply catalog codemods in a
  scratch worktree → run tests → re-measure interleaved A/B →
  keep only wins whose band excludes 1.0 → emit diff + table
  (`transform, site, speedup ±band, bytes saved`). Recommends nothing it
  did not measure — the constraint satisfied by construction.
- **Local evidence for the catalog:** chained `map/filter/reduce` vs
  fused loop on 1M doubles: per-round ratios 23–101x (median 59x),
  alloc-dominated best case; the chained baseline itself spread
  96–242 ms across five fresh processes — which is why bands are
  mandatory, and why single-run "we made it 2x faster" claims are noise.
- **Allocation as targeting signal:** sampling heap profiler
  (`HeapProfiler.startSampling` with `includeObjectsCollectedByMajorGC/
  MinorGC` — without those flags the profile omits already-collected
  garbage and reads ~0) measured 938.0–943.1 MB across four runs of the
  same workload: **0.5% spread, versus up to 2.5x wall-time spread on
  the identical workload.** Allocated-bytes is the most stable signal
  found anywhere in this exercise. Attribution caveat: leaf frames land
  on builtins (`map`) — roll up by stack.
- **Strongest objections:** (1) catalog EV — the set of mechanical,
  semantics-preserving transforms with real wins is small; the honest
  frequent outcome is "nothing found," which kills word-of-mouth; (2)
  the correctness oracle is the user's test suite — coverage holes ship
  bugs wearing a green speedup; (3) LLM agents do this interactively
  now; the durable part is the honest-measurement referee, not the
  transforms — and **Codeflash already validated exactly this model in
  Python** (verify-then-benchmark optimization, active, last push
  2026-08-03, Python-only —
  [github.com/codeflash-ai/codeflash](https://github.com/codeflash-ai/codeflash)); a
  JS equivalent could appear any quarter (closest found:
  `thomasdavis/llm-benchmark`, weakly verified).
- **Verdict at round 1: build.** Superseded by the owner's pivot;
  preserved. Its measurement substrate is exactly what Part I.3 reuses,
  and its kill experiment (below, II.D) remains valid if the pivot ever
  reverts.

### D3 — Startup/warmup pack (code cache, snapshots, SEA)
- **Contract:** workload type `startup` in the TOML; measures cold-start
  distribution over ~30 spawns; tries compile cache, esbuild bundling,
  lazy-`require` of top offenders, `--build-snapshot` where applicable;
  ships the config/diff with measured deltas.
- **Already solved?** The *primitives* are now stable platform features
  (compile cache stable v25.4.0; `--build-snapshot` stable
  v25.4.0/v24.13.1; SEA active development). One tiny wrapper exists
  (`node-prewarm`, blog-claimed 20–30%, unverified —
  [ben3d.ca/blog/introducing-node-prewarm](https://ben3d.ca/blog/introducing-node-prewarm)); no
  measure-then-apply tool found (non-exhaustive). SnapStart does not
  cover Node, so the serverless variant is dead (II.A S5).
- **Strongest objection:** run-once economics — after the wizard flips
  the flags there is no reason to run it again; and this session's own
  probe found the compile-cache win on a real CLI to be noise-level on
  the small command and ~27%-suggestive-unproven on the bigger one.
- **Verdict: conditional** — a catalog family inside D2, not a product.

### D4 — Allocation/GC-pressure gate
- **Contract:** measure bytes/op + GC share per workload vs baseline;
  attribute to stacks; gate on allocation delta.
- **Why attractive:** the 0.5%-spread determinism measured above; both
  reviews rank allocation above shape discipline; the signal is
  engine-portable.
- **Strongest objections:** bytes ≠ time (scavenges are cheap; gating on
  bytes invites Goodharting into pooled-object code that is *slower*);
  and as a standalone gate it recommends nothing, failing the round-1
  constraint. Also: **CodSpeed shipped a memory instrument on 2026-01-21
  for Rust/C/C++ with "more languages coming"**
  ([codspeed.io/changelog](https://codspeed.io/changelog/2026-01-21-track-memory-usage-with-memory-instrument))
  — the incumbent is one language-port away.
- **Verdict: conditional** — the *targeting* signal inside D2 and the
  strongest single technical insight of round 1; dead standalone.

### D5 — Pinned-build compiler canary (library maintainers)
- **Contract:** exact-pinned Node in TOML; annotated kernels
  force-compiled; tier/deopt fingerprint compared across code changes.
- **Codex's defense stands:** on an exactly pinned build,
  "this kernel remains TurboFan-compilable" is a meaningful canary for
  V8-sensitive library maintainers.
- **Strongest objection:** it is a proxy signal — the exact thing the
  owner's constraint names as failure — its audience is perhaps fifty
  maintainers worldwide, and each of them can write the 200-line script
  themselves. No product lives here.
- **Verdict: dead** (constraint violation), preserved as the honest
  residue of the tierlock idea.

### D6 — Test-suite-as-benchmark ("perf coverage") — invented round 1
- **Contract:** derive per-test instruction counts so every repo gets
  perf regression coverage with zero benchmark authoring.
- **Strongest objection:** fixtures dominate runtime; short JIT-warmup
  tests measure compilation scheduling, not code; and CodSpeed already
  owns "attach measurement to an existing runner" (vitest/tinybench
  plugins, v5.7.1 2026-06-24).
- **Verdict: dead** — clever, unvalidated, incumbent-adjacent.

## II.C The gap (verified 2026-08-09; all statuses checked this session)

**Alive and funded — measurement/gating:**
- **CodSpeed** — active. Instruments: CPU simulation, walltime, memory
  (memory: Rust/C/C++ only since 2026-01-21). Node via
  `@codspeed/vitest-plugin` etc. (codspeed-node v5.7.1, 2026-06-24).
  Cross-language walltime flamegraphs incl. Node (2025-10-14). CLI
  "Benchmark Anything" (2026-01-23). AI assistant p99.chat (2025-06-05)
  is **Python/Rust only**. Pricing: free unlimited for OSS; Pro
  $15/user/mo. [codspeed.io/pricing](https://codspeed.io/pricing)
- **Bencher** — active continuous-benchmarking platform, Benchmark.js
  and Vitest adapters; cloud pricing unverified. [bencher.dev](https://bencher.dev)
- **github-action-benchmark** — active (v1.22.1, 2026-05-06).
- **Nyrkiö** — change-point detection GH action (2025-05-30).
  [github.com/nyrkio/nyrkio](https://github.com/nyrkio/nyrkio)
- Profilers: **0x** alive (v6.0.0, 2025-07-07); **Polar Signals** eBPF
  supports Node on amd64; **Datadog** Node ≥18; **memlab** active (push
  2026-08-07) but leak-focused, not bytes-per-op.

**Dead or dormant — diagnosis:**
- **Deopt Explorer** — last release v1.1.2 **2023-05-31**, last push
  2024-07-08; README warns V8 changes can break it; not a funded ongoing
  effort (codex's correction to the teardown, confirmed).
  [github.com/microsoft/deoptexplorer-vscode](https://github.com/microsoft/deoptexplorer-vscode)
- **deoptigate** — last push **2022-12-12**; open issue on V8 log format
  breakage. **v8-deopt-viewer** — last push **2023-10-03**.
- **clinic.js** — README: "not being actively maintained"; broken on
  Node ≥21.7 per open issue (Jun 2025).
  [github.com/clinicjs/node-clinic](https://github.com/clinicjs/node-clinic)

**Verified absent (each non-exhaustive but searched):**
- No tool gates CI on V8 optimization state.
- No ESLint/Biome/oxlint rule set enforces shape discipline as such, and
  **no linter cites per-rule measured benchmarks of the flagged
  pattern** (Part I.4) — the live design's gap.
- No JS/TS equivalent of Codeflash (verify-by-benchmark auto-optimizer);
  Codeflash itself is Python-only.
- No Node allocation-bytes-per-op CI gate; CodSpeed's memory instrument
  has not reached JS.

**The precise gap statement:** measurement-and-gating is a solved,
commercially occupied layer; V8-cause diagnosis is an abandoned layer
(three dead tools) because it rots faster than unfunded maintainers can
chase; the unoccupied ground is (a) *evidence-backed prescription* —
rules/transforms that carry their own measured, regenerated receipts — 
and (b) allocation-as-signal for JS, where the incumbent has announced
intent. (a) is the live design; (b) is D4, preserved above.

## II.D Round-1 recommendation (superseded, preserved)

Build **D2**, with D4 as its targeting signal, D3 as a catalog family,
D1 as its failure-explainer. Falsifiable in <1 week: build the
fresh-process A/B substrate (2 days), implement 5 transform families
(2 days), run against 8–10 real repos with runnable bench scripts
(1 day). **Kill if** fewer than 3 of 10 repos yield a change with a
band-verified ≥5% workload-level win and green tests. Cost of wrong: one
week, plus a reusable measurement substrate; market risk: Codeflash
ships JS support first. The owner's scope change redirects this energy
to Part I; the substrate is shared, so the pivot loses almost nothing.

---

## Probe appendix (this session, Node v22.23.2, noisy sandbox VM)

| probe | result |
|---|---|
| chained map/filter/reduce vs fused, 1M doubles | 96–242 ms vs 2.0–4.3 ms; per-round ratio 23–101x, median 59x |
| same workload, sampled allocation (4 runs) | 938.0–943.1 MB (0.5% spread) vs 86.8–94.5 MB fused (10.5x fewer bytes) |
| IC arity K=1/2/4/5/8, ns/load medians | 2.0 / 2.7 / 7.0 (unstable 2.6–10.4) / 4.8 / 4.7 |
| elements kinds, ns/elem medians | smi 0.54, double 0.67, holey 0.65, boxed 0.80, f64 0.66 |
| `delete` singleton, ns/3-loads | fast 20.4–27.0 vs dict 15.3–20.5 — no penalty |
| `delete` per-row (100k objects), ns/row | fast 1.3–1.5 vs dict 39–92 — 28–67x |
| accumulating spread n=10k, ms/op | push 0.16–0.40 vs spread 58.5–65.7 — 146–366x |
| `npm --version` startup | 63–125 ms; compile cache: no measurable win |
| `npm ls -g --depth=0` | 443–776 ms uncached; ~349–485 ms cached (suggestive, n=4, bands overlap) |
