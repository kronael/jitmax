# tierlock is useless — kill it

> **Provenance note, 2026-08-15.** The documents this review cites — the spec,
> the design and the product-design notes — were deleted when the specs came out
> of the repository ("remove all specs, focus on finishing the tool"). Their
> quotations and line numbers below are left exactly as they were written and
> resolve against git history. What replaced them: `CLAUDE.md` carries the
> measurement protocol, `lib/derive.ts` derives every published number from the
> `.jl` sweeps, and README carries the V8 citation table.

Adversarial review of `SPEC.md` (2026-08-09). Every runtime claim below was
tested on this machine: Node v22.23.2, V8 12.4.254.21. Probe scripts:
`/tmp/claude-1001/-home-onvos-sandbox-turbo/a9300ef7-fedd-451c-9e70-d6227b7de3be/scratchpad/p1_status.js`
… `p5_maglev.js`, `npm-deopt.log`, `npm2.log`, `npm3.log`. Web claims carry
URLs; anything I could not check is marked **unverified**.

Verdict up front: the tool gates CI on a proxy signal (V8 optimization
state) that is version-unstable, order-dependent, benign-event-riddled, and
already better served by a maintained deterministic cycle-count gate
(CodSpeed) and a maintained IC/deopt viewer (Microsoft's Deopt Explorer).
The spec's own evidence section contains **zero measurements of its own
premise**. Do not build it.

## 1. The premise does not survive modern V8 — or the spec's own evidence

The one-sentence thesis is "most real JS slowness is megamorphic call sites
and boxed or holey arrays." §3, the evidence section, contains **no
measurement of a megamorphic call site or a holey array anywhere**. Every
filed number is a Wasm boundary-crossing or startup figure — evidence for
rejecting Option A, none of it evidence for Option B. The only
megamorphism number in the whole document is the *hypothetical output*
`7.4x at risk` in §5.6. The load-bearing premise is asserted, never
measured, in a spec that prides itself on filed baselines.

Modern V8 also moved the ground under it:

- **Maglev shipped in Chrome M117** (2023) precisely because, per V8's own
  post, real workloads "spend a lot of time in functions that don't get hot
  enough to be optimized by TurboFan"
  ([v8.dev/blog/maglev](https://v8.dev/blog/maglev)). The steady-state
  top-tier world the spec polices is a minority slice of real execution.
  Measured here: `npm --version` — megabytes of JS — completes with **zero
  functions reaching TurboFan and zero deopts**. `npm ls -g --all`, a real
  fs-walking JSON-heavy command: **32 functions optimized, total**. The
  rest of the program never met the optimizer the tool guards.
- **Tiering is policy, not property.** Defaults on this build: feedback
  vectors allocated at 8 invocations, Maglev at 400, TurboFan at 3000,
  and `--efficiency-mode-delay-turbofan=15000` — the *engine's mode*
  quintuples the threshold. These are flags; they change per release.
- **The Crankshaft folklore in §5.2 is dead.** The rule row "no `arguments`
  leak, no `delete`, no `with` … forces bailout" — tested (p1_status.js):
  functions using `arguments`, `delete`, and `try/catch` **all reach
  TurboFan** (`optimized=true turbofan=true`). TurboFan removed the
  Crankshaft bailout list years ago; the rule prevents nothing.

### `%GetOptimizationStatus` is not a stable oracle

- **The Maglev-not-TurboFan state is unadjudicated.** The spec's check 2
  asserts "optimized". Is Maglev-optimized a pass? The spec never says,
  and the answer changes what the gate means: Maglev code is real
  optimized code at roughly mid-tier speed. Worse, **which tiers exist
  depends on the Node patch level**: Maglev was enabled in Node 22.0,
  **disabled in 22.9.0 for codegen crashes**, re-enabled in Node 24
  ([nodejs.org v22.9.0](https://nodejs.org/en/blog/release/v22.9.0),
  [nodejs/node#50690](https://github.com/nodejs/node/issues/50690)).
  Verified here: on 22.23.2 even an explicit `--maglev` flag is a no-op —
  the Maglev status bit never appears; functions go interpreted → TurboFan
  at call ~3502. The same annotated function produces different tier
  trajectories, and different status bits, on two minor versions of one
  LTS line. A gate whose pass condition flips with `nvm use` is not a gate.
- **The status word forgets.** After a real observed deopt
  (p2_benign_deopt.js), the re-optimized function reports
  `kMaybeDeopted = false`. V8's own introspection does not retain the
  event the tool wants to fail on; the only record is the human-oriented
  `--trace-deopt` stderr format, which is exactly the churning surface
  that broke the dead viewers in §3 below.
- The bit layout of `%GetOptimizationStatus` is defined in
  `runtime-test.cc`, a **test-support file with no stability contract**;
  Node's docs stamp V8-inherited flags "Stability: 1 – Experimental …
  subject to change upstream"
  ([nodejs.org/api/cli.html](https://nodejs.org/api/cli.html)). A renamed
  intrinsic is a **parse-time SyntaxError** (verified) — the harness does
  not degrade, it dies.

## 2. The signal is alarming, not actionable

Deopts are the mechanism working, not the mechanism failing. Measured on
real code:

- `npm ls -g --all`: **2 deopt events** in the entire command ("wrong
  map", "insufficient type feedback") against 32 optimized functions.
  Both were one-shot re-speculation events; the process ran to completion
  at full speed. Under §5.5 check 3 — "fail on any deopt event" — this
  healthy run is a red build.
- **The innocent-bystander deopt** (p2_benign_deopt.js): warm `hot(o)`
  monomorphic to TurboFan; then *one line in an unrelated module* creates
  `{x: 1.5}` at a shared construction site. Field generalization
  deprecates the map chain and `hot` deopts with `reason: wrong map` —
  then re-optimizes and reports optimized again within the same run. The
  gate fails the annotated function's author for a data value that flowed
  through **someone else's package**. In a monorepo this is a
  spooky-action-at-a-distance flake generator: red builds pointing at
  functions whose source did not change.
- And the inverse hole the spec admits: the genuinely expensive state —
  megamorphic ICs — **fires no deopt at all**, and my probe shows the
  function stays `optimized=true` while running 5x slower (p3_ratio.js).
  So check 3 red-flags harmless events and green-lights the harmful one.
  Check 4 would fix that, except the spec concedes its "mechanism
  [is] unresolved" — there is no supported API for IC state; the only
  source is `--trace-ic` log scraping, the format that keeps breaking.
- Check 2 is vestigial: `%OptimizeFunctionOnNextCall` bypasses the tiering
  policy that decides whether production ever optimizes the function, and
  modern TurboFan compiles essentially everything when forced (verified:
  even the "killer" functions pass). A check that cannot fail is not a
  check. One incidental positive: `--trace-deopt` works on release Node —
  §7's open question resolves trivially, in the tool's favor.

## 3. Prior art: the middle is empty because the middle is a mirage

- **Deopt Explorer** — Microsoft TypeScript team, May 2023, maintained by
  a funded team: parses `--log-deopt --log-ic --log-maps --prof`, shows
  mono/poly/megamorphic ICs inline in VS Code, map evolution, deopt
  reasons; used to cut `Symbol` maps from 30 to 2 for an 8–10% compile
  win ([devblogs.microsoft.com](https://devblogs.microsoft.com/typescript/introducing-deopt-explorer/)).
  The discovery/diagnosis half of tierlock exists, is better, and is free.
- **CodSpeed** — runs benchmarks on a simulated CPU (Callgrind-style),
  **deterministic, <1% variance, gates pull requests in CI**, with flame
  graphs per benchmark
  ([codspeed.io/docs/instruments/cpu](https://codspeed.io/docs/instruments/cpu),
  [github.com/CodSpeedHQ/codspeed](https://github.com/CodSpeedHQ/codspeed)).
  §5.8 dismisses CI perf gates as "noisy on shared runners" — that
  objection is CodSpeed's solved problem, and it measures the **actual
  quantity** (cycles, cache misses). A megamorphic regression shows up as
  a cycle increase; no V8 internals, no natives flag, works for Rust and
  Python too. The claimed gap — "a CI gate that is not noisy and says
  why" — is filled by a maintained commercial product.
- **The gate-on-optimization-state middle**: `deoptigate` — last commit
  **Dec 12, 2022** ([github](https://github.com/thlorenz/deoptigate/commits/master));
  `v8-deopt-viewer` — last code change **Mar 2023**
  ([github](https://github.com/andrewiggins/v8-deopt-viewer/commits/master)).
  Both dead, both pre-Maglev, both broken by exactly the log-format churn
  tierlock would inherit. I found no tool that gates CI on
  `%GetOptimizationStatus` (**unverified as an exhaustive claim**). Two
  readings: an open gap, or ten years of V8 tooling authors concluding
  the signal cannot bear a gate. Sections 1–2 above are the second
  reading, demonstrated.

## 4. Static shape derivation (§5.4) is unsound in both directions

The spec calls this "the load-bearing unknown." It is not unknown; it is
false, and a 40-line probe (p4_maps.js) shows it:

- **Map identity is temporal, not static.** Same construction site,
  called twice: `%HaveSameMap` = true. Then one `site(1.5)` call
  anywhere in the process generalizes the field, deprecates the map, and
  `site(3)` now yields a **different map than the earlier objects** —
  `%HaveSameMap` = false, same source line. "The map is the production
  map by construction" is wrong: the map is a function of the *process's
  entire store history*, which a clean checker process does not have.
  §5.4's central sentence fails on a one-line counterexample.
- **Construction-site enumeration over-approximates and
  under-approximates simultaneously.** Verified: `Object.assign`,
  `Object.fromEntries`, and assign-after-`{}` factories produce maps
  distinct from the literal; meanwhile static reachability ("which shapes
  *can* reach this function") through callbacks, `map`/`filter`,
  dependency injection, or any higher-order boundary is undecidable, so
  the tool must guess. Under-approximate → warm with too few shapes →
  green gate, megamorphic production (the spec's own nightmare, §7).
  Over-approximate → warm a production-monomorphic site polymorphic →
  false red. There is no safe direction to be wrong in.
- **The shapes that matter are born outside the program.** Hot server
  functions eat DB driver rows (pg builds row objects from the wire, keys
  from the SQL string at runtime), HTTP bodies, framework request
  objects, message-queue payloads. None have in-repo construction sites;
  all fall to the "recording fallback" the spec itself brands
  unreliable. What remains statically derivable is self-contained compute
  kernels — parsers, encoders, math. I cannot quantify the fraction of
  real hot functions that is (**unverified**), but structurally: every
  function fed across an I/O boundary is out, and those are precisely the
  hot functions in server JS. The tool's sound domain is toy-shaped.
- One probe result even flips a spec assumption in the embarrassing
  direction: `JSON.parse('{"a":1,"b":2}')` lands on the **same map** as
  the literal `{a:1,b:2}` (verified) — the case §5.4 sends to the
  recording fallback is one the derivation handles, while the case it
  claims (same-site stability over time) is the one that breaks.

## 5. The §5.6 measurement is noise theater — replicated and refuted

I implemented §5.6 exactly as specified (p3_ratio.js): warm monomorphic,
measure; force megamorphic with 5 derived shapes in the same process;
print the ratio. Five identical runs on an **idle** machine:

```
6.91x   4.40x   4.76x   2.56x   3.85x
```

A 2.7x run-to-run spread in the headline number, on dedicated hardware —
before a shared CI runner touches it. The spec prints `7.4x at risk` with
a decimal point; by its own standard ("a ratio printed without an
uncertainty band is a rumor with a decimal point") its flagship output is
a rumor.

Worse than variance, the number is an **artifact of measurement order**:
run the megamorphic phase first and the "ratio" is **1.05x** — because
feedback contamination is one-way. Once the ICs go megamorphic they never
recover; after the mega phase, mono-shaped data runs at 16.7 ns vs 3.2 ns
in a clean process (verified). The two phases are not independent
measurements of one function; they are one destructive experiment sold as
a comparison. And throughout the megamorphic phase
`%GetOptimizationStatus` reports `optimized=true` — the tool's green
state and its own slowdown metric contradict each other in the same
process. The number that "changes what the tool is" (§5.6) does not exist.

## 6. Nobody can run this, and the people who could don't need it

- `--allow-natives-syntax` is a **test-only debug surface**: intrinsics
  live in V8's test-support runtime, have no naming or behavior contract,
  and Node marks inherited V8 flags Experimental/subject-to-upstream-change
  ([nodejs.org/api/cli.html](https://nodejs.org/api/cli.html)). tierlock's
  entire runtime half is a hard dependency on the one API class every
  upstream explicitly refuses to stabilize — in CI, where breakage is a
  blocked merge queue.
- Version skew is not hypothetical: within the Node 22 LTS line alone the
  tier set changed (Maglev on → off), and `--flush-bytecode` is **on by
  default**, so V8 discards code and feedback of idle functions — "holds
  the top tier" is not a property V8 even offers long-running processes.
- **The sophistication paradox.** A team that can act on "deopt: wrong
  map at patch.ts:44" — i.e., thinks in hidden classes and elements kinds
  — already runs Deopt Explorer or reads `--trace-deopt` raw, and owns
  benchmarks worth gating with CodSpeed. A team that cannot act on it
  gets red CI it can neither interpret nor fix, from code it may not own
  (§2's bystander deopt). The tool's message is legible exactly to the
  audience that has no use for the tool.
- Scope: the gate is V8-only. Library code increasingly runs on Bun
  (JavaScriptCore), browsers (three engines), workerd. Shape discipline
  helps every engine; a *prover* welded to one engine's test intrinsics
  and a 4-map threshold the spec itself flags as unverified folklore
  (mrale.ph, 2015) does not.

## 7. The warmup-curve idea, evaluated honestly

Proposal: instead of a steady-state verdict, report each function's tier
trajectory (Ignition → Sparkplug → Maglev → TurboFan) over time.

It is *more honest* than the steady-state gate — my npm traces show
warmup is where real programs actually live, and a curve cannot pretend
to be a boolean. It is also *more diagnosable*: "reached TurboFan at call
3502, deopted twice, re-optimized" is a narrative a human can follow.

It is still not a product, for three reasons:

1. **The curve measures V8's scheduler, not your code.** Transition
   points are set by engine policy — invocation budgets (8 / 400 / 3000 on
   this build), concurrent-compiler thread timing, OSR, efficiency mode
   (15000). The same source produces different curves across Node minors
   (Maglev on/off within v22) and across runs (background compilation is
   racy). Gating on it is gating on nondeterministic engine internals —
   strictly worse than the steady-state gate.
2. **It is not actionable.** No source change moves a tier threshold. If
   warmup is the pain (CLIs, serverless), the fixes are V8 code cache /
   snapshots / SEA — none of which this tool's lint-and-assert machinery
   touches.
3. **As observability it already exists**: `--trace-opt --trace-deopt`
   timestamps and Deopt Explorer's function-state timeline are this
   feature. Repackaging them as a curve is a weekend viewer, not a
   package ecosystem with an ESLint plugin and a CLI.

Verdict: as a CI gate, worse than useless; as a report, a minor feature
of an existing viewer. It also flatly contradicts SPEC §6 ("turbo does
not … touch warmup curves"), so it is not a pivot, it is a different,
smaller tool.

## What survives

Not the gate, not the derivation, not the ratio, not the annotation
scheme. Two salvageable slivers:

1. **A handful of static lint rules with real teeth**, stripped of every
   V8-internals claim: flag `new Array(n)` / index-grown holey arrays,
   post-construction property add/delete on hot-path types, and
   mixed-representation numeric fields. These are cheap, version-proof,
   and defensible as *hygiene* across all engines. That is a ~500-line
   contribution to an existing ESLint plugin ecosystem — not a
   four-package platform, and it must drop the "provable fast path"
   marketing, because §§1–5 show the proof is not available.
2. **A regression story that measures the real quantity.** If a function
   is hot enough to deserve a CI guard, benchmark it under CodSpeed (or
   instruction-count harness of choice): deterministic, maintained,
   engine-agnostic, and a megamorphic regression appears as what it is —
   more cycles. For diagnosis when a number moves, Deopt Explorer.

A developer who wants what tierlock promises should today run: CodSpeed
for the gate, Deopt Explorer for the why, and `node --cpu-prof` for the
where. All three exist, all three are maintained, and none of them parse
`%GetOptimizationStatus`. That is not a coincidence; it is the market
having already run this teardown.
