# Turbocharge is bullshit: a second autopsy

## Verdict

Turbocharge does not measure whether code is hot, does not observe V8 inline caches, does not identify runtime hidden classes, does not test the user’s workload, and does not demonstrate an application-level speedup.

Its flagship rule counts TypeScript union members and pretends that count describes V8 maps at a property-load site. The implementation does not even require a property load.

That is not “measured V8 fast-path analysis.” It is speculative linting decorated with benchmark receipts.

The project’s own specification supplies the correct verdict:

> “The tool does not measure the user’s program, so it cannot claim that fixing a finding speeds up the user’s workload.” (`SPEC.md:100-107`)

It also states that shape discipline ranks behind “I/O, algorithm, allocation, and warmup” in ordinary applications (`SPEC.md:317-319`), admits that its competitive advantage is an “evidence and policy gap, not a capability gap” (`SPEC.md:390-393`), calls its moat “thin” (`SPEC.md:441-444`), and defines kill criteria that the current project has not met (`SPEC.md:395-415`).

By its own standards, Turbocharge should have been killed before the rule engine was written.

## The flagship rule is not merely imprecise; it detects an event that may not exist

`megamorphicElements` is presented as a rule about a V8 property-load site seeing too many receiver shapes. The benchmark measures repeated `r.x + r.y` property reads.

The implementation in `lib/rules.ts:127-143` does something else:

1. Find an annotated function.
2. Find an array-typed parameter.
3. Count union constituents carrying TypeScript’s `Object` flag.
4. Warn when the count is at least five.

It never finds a property-access expression. It never determines which array element flows to which load. It never observes a runtime map. It never checks whether the objects have different layouts.

The project’s own demo makes the fraud executable:

```ts
function fiveShapes(rows: (A | B | C | D | E)[]) {
  return rows.length;
}
```

Running the checker reports this as megamorphic. The function never reads an element, much less a property from five receiver maps. Its only access is the array’s `length`.

The same defect appears in the boxed-number rule: the demo’s `mixed(vals)` returns `vals.length`, yet the parameter’s union type is enough to produce a warning. The supposed expensive operation is absent.

This is not a false positive at the edge of a sophisticated analysis. It is the canonical demonstration of the product.

The theory underneath it is also wrong. TypeScript is structurally typed and intentionally permits relationships that do not correspond to nominal runtime classes. Its types are erased before JavaScript executes. [TypeScript’s own documentation describes both structural compatibility](https://www.typescriptlang.org/docs/handbook/type-compatibility) and the erasure of types from runtime behavior](https://www.typescriptlang.org/docs/handbook/typescript-from-scratch).

V8 maps are created dynamically from runtime construction history: property names, insertion order, attributes, transitions, and prototypes matter. Two different TypeScript union constituents can share one map. One constituent can produce many maps. [V8’s hidden-class documentation](https://v8.dev/docs/hidden-classes) and [fast-properties explanation](https://v8.dev/blog/fast-properties) explicitly describe that runtime machinery.

The project already knows this:

> “A TypeScript type is not a V8 shape.” (`SPEC.md:453-458`)

`BUGS.md` goes further: TC-2 concedes that the rule can fire where no relevant load sees five maps. The shipped response was to weaken the wording, not repair the inference.

The flagship rule therefore has no defensible semantic contract. A TypeScript union member is not a V8 map, and this implementation does not even locate the inline cache whose state it claims to predict.

## The premise has not survived contact with production evidence

V8 shape polymorphism is real. Turbocharge has not shown that it is an important bottleneck in ordinary production JavaScript.

The project contains no production profiles, no corpus of application traces, no telemetry from deployed services, no framework benchmark, and no end-to-end workload result. Its planned profile-ingestion path remains unresolved (`SPEC.md:437-449`).

Published evidence points to a much messier world:

- V8’s study of roughly 25 popular sites found that Octane-style benchmarks poorly represented real sites. Synthetic suites disproportionately exercised JavaScript execution, while real pages exposed parser, compiler, and broader loading costs. Some optimizations that helped benchmarks actually slowed sites. V8’s real-world methodology produced 10–20% page-load improvements—not because it statically counted TypeScript union alternatives, but because engineers measured actual pages. [V8: Real-world performance](https://v8.dev/blog/real-world-performance)
- Node’s official profiling example spends 97.2% of sampled time in C++, 0.2% in JavaScript, and 0% in GC because the actual bottleneck is synchronous password derivation. It is only one example, not a population estimate, but it demonstrates how irrelevant JS property-shape advice can be even in CPU-bound Node code. [Node.js profiling guide](https://nodejs.org/ta/learn/getting-started/profiling)
- Node documents a 50 MB JSON operation taking roughly 0.7 seconds to stringify and 1.3 seconds to parse, explicitly identifying JSON as an event-loop hazard. [Node.js: Don’t block the event loop](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop)
- V8 reported more than a 2× engine-level improvement to `JSON.stringify` in 2025. That illustrates both the importance of non-IC costs and the speed at which the platform invalidates static performance folklore. [V8: How we made JSON.stringify more than twice as fast](https://v8.dev/blog/json-stringify)
- V8’s explicit compile-hints experiment improved 17 of 20 popular pages and reduced foreground parse/compile work by an average of 630 ms. Again, a major measured target was startup compilation, not hidden-class counting. [V8: Explicit compile hints](https://v8.dev/blog/explicit-compile-hints)

**UNVERIFIED:** No evidence in this repository, and no production-corpus study found during this review, quantifies megamorphic property loads as a material share of time across representative Node or browser applications.

That missing base rate destroys the product case. Even a perfect detector would be niche until production profiles showed the niche mattered. Turbocharge is not a perfect detector.

## The microbenchmarks prove kernels, not the product

The README admits that its ratios “do not predict a workload.” The specification says the same thing more formally. That concession is fatal because workload prediction is the only reason to install the checker.

Current shape results on one Node/V8 build report approximately:

- 10.586× for the one-load kernel.
- 8.664× for the two-load kernel.
- 3.614× for the three-load kernel.
- With object construction included, the three-load result falls to 1.082× and its interval includes parity.

Those results establish that a deliberately constructed steady-state kernel can make a particular IC transition expensive. They do not establish:

- that annotated functions are hot;
- that union members become distinct maps;
- that the relevant property load exists;
- that construction and allocation are negligible;
- that fixing the warning moves request latency or throughput;
- that the effect survives another V8 release or CPU;
- that a developer will choose the same semantic rewrite used by the benchmark.

The benchmarking literature has been warning about exactly this category error for years. Mytkowicz et al. demonstrated that seemingly innocuous experimental details can reverse conclusions and that measurement bias is commonplace. [“Producing Wrong Data Without Doing Anything Obviously Wrong”](https://doi.org/10.1145/1508284.1508275) Georges et al. describe the nondeterminism introduced by JIT compilation, garbage collection, heap layout, and system effects in managed runtimes. [“Statistically Rigorous Java Performance Evaluation”](https://users.elis.ugent.be/~leeckhou/papers/oopsla07-stat.pdf)

A later empirical study of microbenchmark-based regression detection examined 70 and 110 commits in two systems. Benchmark coverage reached only 47% and 36%; useful configurations required tolerating frequent false positives; and raw microbenchmark movements could not be directly mapped to application latency. [“Assessing the Effectiveness of Microbenchmark Suites”](https://arxiv.org/abs/2212.09515)

**UNVERIFIED:** No published evidence found here shows a 10× hidden-class microkernel ratio translating into anything close to a 10× application improvement.

The strongest relevant success story is Microsoft’s Deopt Explorer work on the TypeScript compiler. Engineers observed actual runtime inline-cache data, reduced one structure from about 30 maps to two, measured 3–5% improvements in affected compiler components, and reported an aggregate compile-time win of roughly 8–10%. [Microsoft: Introducing Deopt Explorer](https://devblogs.microsoft.com/typescript/introducing-deopt-explorer/)

That case undercuts Turbocharge twice:

1. A dramatic runtime-shape cleanup translated to a single-digit component/application improvement, not the kernel ratio.
2. It succeeded through runtime observation and application benchmarking—the two things Turbocharge deliberately omits.

## Several rules do not enforce the conditions their own evidence requires

The benchmark metadata in `lib/rules.ts` is decorative. The rule implementations do not use its “fires when” and “stays silent when” boundaries.

### Chained array allocation

The evidence says the warning should remain silent at `n = 100000`, where the measured cost falls to about 1.45×. The implementation in `lib/rules.ts:213-250` flags two chainable calls without knowing `n`, cardinality, callback cost, allocation pressure, or whether the result escapes.

It cannot implement its claimed boundary. The README nevertheless says the rule “stays silent” for large `n`.

### `delete`

The project’s own notes report that singleton deletion has no demonstrated penalty and can be up to 10% faster, while repeated per-row deletion can be 28–67× worse.

The implementation in `lib/rules.ts:252-267` flags every `delete` expression. It does not require a loop, repeated objects, a subsequent property read, dictionary-mode transition, or a population of affected receivers.

The demo’s `drop` function performs one deletion and is still reported. The must-stay-silent case is again the product demonstration.

### Accumulating spread

This is a real quadratic pattern, and the local benchmark reports roughly 177× at 1,000 items and 2,348× at 10,000 items. It is also already a recommended Biome warning and an Oxlint rule. [Biome `noAccumulatingSpread`](https://biomejs.dev/linter/rules/no-accumulating-spread/) [Oxlint `no-accumulating-spread`](https://oxc.rs/docs/guide/usage/linter/rules/oxc/no-accumulating-spread)

Turbocharge’s contribution is to put an annotation in front of an already-detectable syntax pattern.

### Closed-world analysis

The closed-world rule has no performance benchmark at all—its evidence field is `null`—yet it counts as a finding and causes a nonzero exit. The demo warns about `typescript.createSourceFile` and recommends inlining what is needed.

This is architectural policy smuggled into a performance checker. It directly contradicts the promise that every warning has measured V8 evidence.

## Prior art already owns every useful layer

Turbocharge does not occupy an empty category. It occupies the least useful slice between mature static linting and actual profiling.

- Biome and Oxlint already detect the strongest generic rule, accumulating spread.
- ESLint is a mature plugin platform; older performance-oriented plugins such as [`eslint-plugin-perf-standard`](https://www.npmjs.com/package/eslint-plugin-perf-standard) also demonstrate that “encode V8 folklore as lint warnings” is not a new product idea.
- Node exposes `--prof` and a stable `--cpu-prof` interface. [Node CLI documentation](https://nodejs.org/api/cli.html)
- Chrome DevTools can inspect Node CPU activity using bottom-up and call-tree views. [Chrome DevTools Node performance profiling](https://developer.chrome.com/docs/devtools/performance/nodejs)
- Deopt Explorer visualizes actual runtime deoptimizations, inline caches, and maps instead of guessing them from erased types. [Deopt Explorer repository](https://github.com/microsoft/deoptexplorer-vscode)
- CodSpeed supplies CI performance checks against real benchmark suites and lets teams fail changes at configured regression thresholds. [CodSpeed performance checks](https://codspeed.io/docs/features/performance-checks)

Turbocharge adds three things:

1. An opt-in annotation.
2. A static guess about whether syntax resembles a benchmark.
3. A prose receipt containing a ratio from one machine.

The annotation carries no runtime information. The guess is unsound. The ratio does not predict the workload.

The specification admits that Biome could reproduce the useful portion “in a sprint” and that overlap would reduce Turbocharge to “a documentation project.” That is not a moat assessment. It is an obituary.

## The annotation model has no credible adoption story

Numba’s `@njit` annotation invokes a compiler mode that removes Python interpreter involvement and produces specialized native code. Numba’s own examples show a loop falling from 25.2 seconds to 0.670 seconds. [Numba performance tips](https://numba.readthedocs.io/en/stable/user/performance-tips.html)

Turbocharge’s annotation compiles nothing. It proves nothing is hot. It changes no generated JavaScript. It merely gives a speculative linter permission to complain.

Worse, it imposes typed-program analysis. The TypeScript ESLint project warns that type-aware linting incurs the cost of building the TypeScript project. [typescript-eslint typed linting](https://typescript-eslint.io/getting-started/typed-linting/)

The adoption evidence is hostile. A study of 83,892 JavaScript repositories found ESLint configuration in 9,548—about 11.4% at the time. Of ESLint projects, 67.2% used presets. Only 18% of preset-using projects had any warnings configured, while interviewees overwhelmingly preferred errors; 38.3% reported configuration maintenance as challenging, and roughly a third identified false positives as a problem. [TU Delft ESLint configuration study](https://pure.tudelft.nl/ws/files/46810031/tse_js.pdf)

That study is old, but its central lesson is durable: defaults and trusted presets win; bespoke opt-in annotations with false positives do not.

Turbocharge is private, version `0.0.0`, unpublished to npm, requires Node 22.18 or newer, and has no real-repository adoption results. The specification required scanning 10–20 repositories and achieving at least 95% precision before survival. That work is absent.

**UNVERIFIED:** There is no evidence that any external project has adopted Turbocharge, accepted one of its rewrites, or measured a workload improvement from it.

## Current V8 preserves the mechanism, not Turbocharge’s interpretation

As of this review, current V8 source still defines `DEFAULT_MAX_POLYMORPHIC_MAP_COUNT` as four. The inline-cache implementation transitions based on accumulated valid maps and includes megamorphic cache handling. [V8 current flag definitions](https://chromium.googlesource.com/v8/v8/+/refs/heads/main/src/flags/flag-definitions.h) [V8 current IC implementation](https://chromium.googlesource.com/v8/v8.git/+/refs/heads/main/src/ic/ic.cc)

So the number four is not invented. Everything Turbocharge builds on top of it is.

The constant denotes an engine feedback-state policy. It does not mean:

- the fifth TypeScript union constituent creates the fifth map;
- every relevant IC observes all constituents;
- every fifth map produces the project’s measured ratio;
- megamorphic access falls back to an unoptimized generic lookup;
- the resulting cost matters to an application.

Current V8 contains megamorphic stub-cache machinery. It also has multiple optimizing tiers. Maglev, introduced in Chrome 117, consumes runtime feedback and inserts shape checks as an intermediate optimizing compiler. V8 reported substantial benchmark improvements from the tier itself. [V8 Maglev](https://v8.dev/blog/maglev)

The source also contains experimental IC controls beyond the simple four-map story. The engine is evolving underneath the policy.

The project’s own specification acknowledges that its earlier “four-shape budget” did not survive measurement, that different IC machinery behaves differently, and that there is no universal permanent cliff (`SPEC.md:462-466`). Later sections nevertheless market an exact four-map constant as unique corroboration (`SPEC.md:593-608`).

A constant remaining in V8 source validates an engine implementation detail. It does not validate this checker.

## The measurement record is disqualifying

This project has already found two harness bugs that biased results in the direction most useful for shipping rules.

TC-5 found cold calibration. In one case the supposedly slow side received 11 repetitions and ran for about 2.4 ms against a nominal 120 ms target, while the other side received 1,294 repetitions. A reported 19.73× effect collapsed to roughly 7×. A spread claim was withdrawn.

TC-6 found a streaming bug that discarded approximately half an hour of work and 12 benchmark cells.

The project’s replication record is worse than the headline implies:

- 9 of 24 cells failed replication.
- Every original effect in the 1.0–1.7× range changed direction.
- One unreplicated result was retained inside an explicitly unresolved band.
- The first flagship rule fired at three shapes while citing evidence about a five-shape transition.

The current harness still has integrity defects:

- Benchmark runners append to canonical JSONL files with `appendFileSync`.
- There is no run identifier.
- Re-running the suite mixes multiple sweeps in one file.
- `bench/meme.js` uses `.find()` and therefore selects the oldest matching result after new rows are appended.
- The generated website can silently display stale measurements while claiming it “cannot drift.”
- The site describes an agreement-based calibration process, while the current driver performs six fixed iterations and takes the median of the last three.
- `bench-arrays.md` references `bench/results.jsonl`, `bench/arrays_kind.js`, `bench/arrays_obj.js`, and `bench/verify_kinds.js`; those artifacts are absent.
- The array notes say the Node binary hash was not recorded and turbo state was unknown.
- The specification demands Node/V8 hashes, flags, lockfile, commit, CPU, microcode, affinity, kernel, governor, turbo state, heap flags, and seeds. The current JSONL records contain nothing close to that provenance.
- This checkout is not a Git repository, so the benchmark commit cannot be identified from the supplied artifact.

A team that twice discovered systematic, favorable measurement errors should raise its evidentiary bar. Turbocharge instead converted the remaining one-machine ratios into CI-failing rules.

The rational posterior is not “the third harness must now be right.” It is that untested assumptions remain, especially where the results support the product narrative.

## The project fails its own kill criteria

`SPEC.md:395-415` says a rule should be killed unless it:

- reproduces across two Node versions;
- reproduces on a second machine or published release;
- has a ratio of at least 1.10 with a lower confidence bound above 1.05;
- is not redundant with Biome, Unicorn, or equivalent tools;
- reaches at least 95% precision on real repositories;
- has a safe rewrite;
- produces at least a 5% end-to-end workload improvement.

The current project has:

- one recorded Node/V8 build;
- one machine;
- no representative repository scan;
- no precision measurement;
- no real-workload benchmark;
- no demonstrated 5% end-to-end win;
- direct redundancy for its strongest generic rule;
- rules that fire on their own must-stay-silent cases;
- a flagship warning with no relevant property load.

The specification says these gates apply “before writing rule code.” The rule code exists anyway.

That is the cleanest possible definition of bullshit: a project that writes down the standard required to justify itself, fails the standard, and ships the conclusion.

## What survives

- V8’s current default still allows four polymorphic maps before the relevant IC transition. The engine mechanism is real.
- The local read-only five-shape kernel reports a reproducible 3.6–10.6× effect on the one tested Node/V8/machine combination. That result applies only to that kernel.
- Runtime-observed hidden-class cleanup has produced real application gains: Microsoft reported roughly 3–5% component improvements and 8–10% aggregate TypeScript compile-time improvement using Deopt Explorer.
- Accumulating spread is a genuine quadratic trap, with enormous local ratios. Biome and Oxlint already detect it.
- Small-array chaining and repeated per-object `delete` can be expensive in the exact measured kernels. Turbocharge’s unconditional static rules do not establish that those kernels describe the warned code.
- Publishing raw paired samples, confidence intervals, failed replications, and retractions is better than publishing unqualified folklore. The surviving benchmark corpus may be useful after its provenance and append/staleness defects are repaired.
- Nothing in the available evidence establishes that Turbocharge itself improves a real application.
