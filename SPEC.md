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
| Accumulating spread in a loop | 146–366x at n=10k | ship — superseded below |
| `delete` on per-row objects | 28–67x (1.4 to 39–92 ns/row) | ship |
| `delete` on a singleton object | 0x — dictionary mode up to 10% *faster* | the second half of the same rule |
| Four-shape polymorphic budget | No clean cliff at 5; K=4 the least stable config measured | graveyard |
| Smi-to-double field widening | Undetectable — TS `number` erases the distinction | graveyard |

**The lesson that must not be lost:** measuring reads without construction
reversed two verdicts. Every rule benchmark runs both halves, or it is not
evidence. This is now rule 11 in §4.

**The graveyard is the launch artifact.** Published refutations — holey
arrays, the 4-shape budget, two-shape arrays, `delete` on singletons, string
building, which the tool was wrongly reporting until it was measured, and the
property added after construction, the most repeated claim in V8 folklore —
are a more credible claim than a long rule list nobody measured.

**Accumulating by copying** — four ways to write one defect. Each variant is
paired against a baseline that mutates in place (`push`, `acc[k] = v`) and
builds the identical value, which the driver's per-pair checksum enforces. Node
v22.23.2, 20 pairs per cell, `bench/spread.jsonl` and `bench/spread-object.jsonl`.
With construction counted:

| Cell | Ratio | 95% CI | Verdict |
|---|---|---|---|
| `acc = [...acc, v]`, n=1000 | 156.40 | 145.61–166.84 | **ship** |
| `acc = [...acc, v]`, n=10000 | 1877.26 | 1715.50–2057.28 | **ship** |
| `acc = acc.concat(v)`, n=1000 | **778.52** | **732.95–821.39** | **ship — new** |
| `acc = acc.concat(v)`, n=10000 | — | — | VOID, region 282 ms |
| `acc = { ...acc, [k]: v }`, n=500 | 209.89 | 195.33–229.24 | **ship** |
| `acc = Object.assign({}, acc, {[k]: v})`, n=500 | **814.80** | **769.05–874.10** | **ship — new** |
| either object form, n=2000 | — | — | VOID, regions 426 and 524 ms |

The same four forms with construction excluded — the half that says what the
finished value costs to read, rather than what building it costs:

| Cell | n | Ratio | 95% CI | Verdict |
|---|---|---|---|---|
| array spread | 1000 / 10000 | 0.98 / 1.07 | 0.87–1.10 / 1.01–1.14 | REJ / marginal |
| array concat | 1000 / 10000 | **1.72 / 1.73** | 1.60–1.82 / 1.67–1.80 | real, and not what the rule fires on |
| object spread | 500 / 2000 | 0.03 / 0.97 | 0.03–0.03 / 0.92–1.02 | spread-built reads *faster* / REJ |
| object `Object.assign` | 500 / 2000 | 0.94 / 1.03 | 0.90–0.97 / 0.93–1.15 | faster / REJ |

**The call forms cost as much as the literal ones, so the rule may see them.**
`acc.concat(v)` and `Object.assign({}, acc, …)` were invisible to a rule that
matched array and object literals, and the reason to extend it is these two
cells and nothing else. `Object.assign(acc, …)` — the accumulator as the
*first* argument — mutates in place and is the rewrite the rule asks for, so it
stays silent and a test locks it there.

**The concat read cell withdraws a published claim.** The rule's evidence used
to say reading the finished value costs nothing. That holds for three forms and
not for the fourth: an array built by repeated `concat` costs **1.72–1.73x** to
read, in both size cells, intervals well clear of 1.0. The mechanism is not
measured here, so no rule is built on it — a plausible reading is that the
non-array argument takes `concat` off its fast path and the result is no longer
a packed-smi array, which would make it the same effect `boxed-elements`
measured at 1.45–1.89x. Recorded as an observation, not a rule.

**The 0.03 cell is the assign baseline, not the spread.** Five hundred keyed
stores drive the baseline object into dictionary mode, so reading it costs ~33x
the spread-built one. It is a fact about the *fix*, and it is why this rule's
evidence names construction explicitly.

**Replication.** This sweep re-ran the two literal forms that shipped in
0.1: 156 against 177 at n=1000, 1877 against 2348 at n=10000, 210 against 197 at
n=500. Direction and order of magnitude hold; the point estimates move 12–20%,
which is what a three-orders-of-magnitude effect looks like when it is measured
twice. The rule quotes both sweeps as a range rather than the newer number.

**Building a string by appending — refuted, and the rule was already firing on
it.** `s = s + x` in a loop is the same syntax the cells above measure at
156–2348x for arrays, and `accumulating-spread` matched `.concat()` by *name*
with no type behind it, so `s = s.concat(x)` on a string was reported as a
quadratic array copy. Three forms against a baseline that pushes into an array
and calls `join('')` at the end, building the identical string — the driver's
per-pair checksum is a full character scan, so a variant that builds a different
string is a failed run. Node v22.23.2, 20 pairs per cell, three sizes spanning
L1 to L3 (6 KB, 60 KB, 600 KB of string), `bench/strings.jsonl`, 27 cells, none
void. Ratios are string form / push-and-join, so **below 1.0 means the string
form wins**:

| Cell | n=1000 | n=10000 | n=100000 |
|---|---|---|---|
| `s = s + x`, construction only | **0.31** (0.29–0.34) | **0.33** (0.31–0.36) | **0.54** (0.51–0.57) |
| `s += x`, construction only | **0.27** (0.25–0.29) | **0.34** (0.32–0.36) | **0.48** (0.46–0.50) |
| `s = s.concat(x)`, construction only | **0.29** (0.26–0.31) | **0.38** (0.36–0.41) | **0.52** (0.49–0.54) |
| `s = s + x`, construction and read back | 0.94 (0.92–0.96) | 0.97 (0.94–0.99) | 0.79 (0.76–0.81) |
| `s += x`, construction and read back | 0.96 (0.95–0.97) | 0.97 (0.93–1.01) REJ | 0.79 (0.76–0.83) |
| `s = s.concat(x)`, construction and read back | 0.96 (0.94–0.99) | 0.96 (0.94–0.98) | 0.79 (0.76–0.83) |
| `s = s + x`, reads only | 1.01 (1.00–1.03) REJ | 1.06 (1.03–1.10) | 1.06 (1.02–1.10) |
| `s += x`, reads only | 1.02 (0.98–1.06) REJ | 1.03 (1.00–1.05) REJ | 1.01 (0.98–1.04) REJ |
| `s = s.concat(x)`, reads only | 1.02 (0.99–1.06) REJ | 1.03 (1.00–1.07) | 1.06 (1.04–1.08) |

**There is no quadratic term, and the three sizes are how we know.** A copy that
re-runs is a cost that *grows* with n: the array cells go 156x → 1877x over one
order of magnitude. These go the other way. Every construction cell is between
0.27x and 0.54x, and the ratio drifts *toward* 1.0 as n grows, which is the
signature of a constant factor being diluted, not of a copy. V8 does not copy
the accumulator here — it builds a cons-string, a node holding pointers to its
two halves, so appending is O(1) and the loop is O(n) like the baseline.

**A third mode was needed, because a cons-string moves the cost rather than
removing it.** Flattening on first access is real work, and neither of the usual
two modes isolates it: `excl` reads a string built once, and the warmup already
flattened it. So construction is measured on its own, consumed by `.length`,
which is O(1) on a cons-string and does not flatten. The gap between the two
columns is the flatten: appending wins 3.7x at construction and gives most of it
back on the first read, landing at 0.79–0.97x for the round trip. **It never
lands above 1.0.** Building a string by appending and then reading it is at
worst a wash and at best a 1.27x win, against the rewrite this rule would have
demanded.

**The read side carries a residual, and it is reported rather than shipped.**
Once flattened, a string built by appending costs 1.01–1.06x to scan. Four of
the nine cells exclude 1.0, so something is there — plausibly the cons-string
wrapper surviving the flatten — but §4 rule 6 asks a warning for a point
estimate at or above 1.10x and no cell reaches it. Recorded as an observation,
exactly like the 1.72x concat *array* read cell above.

**This is the first measurement that took output away from the tool rather than
withholding it.** The graveyard until now was a list of rules that never
shipped. This one un-shipped a live behaviour: `accumulating-spread` had no type
check at all, so it told anyone building a string by appending that their code
was a quadratic array copy — the opposite of what appending measures. The rule
is now type-aware and a test locks it silent on strings.

**Only `.concat()` had that hole, and the reason is worth stating.** `.concat`
is a *name* shared by two prototypes whose mechanisms are opposite, and the
receiver's type survives the loop — a string stays a string, so the wrong branch
runs every pass. The other three forms name *one operation each*. `[...acc, v]`
and `{ ...acc, k: v }` copy the iterable or the own enumerable properties
whatever the receiver is; spreading a string materialises its characters, which
really is quadratic. `Object.assign({}, acc, …)` copies own enumerable
properties whatever `acc` is, and its result is a plain object, so the second
pass onward is a genuine copy regardless of what the first pass received. None
of them can be handed a receiver that makes the operation cheap. Checked against
all three; no change made to any.

The same type check silences two other false positives that were never
measured but follow from the mechanism: a `.concat()` on an `any` receiver, where
two measured-opposite mechanisms wear one syntax and there is nothing to tell
them apart, and a `.concat()` on a user class — a persistent list shares
structure and is not copying either.

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

**Which other methods belong in the chain** — the 0.3 sweep, 24 cells, same
protocol, each chain against a fused single pass building the identical value.
The map/filter row is the shipped cell re-run. With construction counted:

| Cell | n | Ratio | 95% CI | Verdict |
|---|---|---|---|---|
| `xs.map(f).filter(g)` | 1000 | **7.89** | 7.41–8.41 | **ship — replicates 7.64** |
| `xs.map(f).filter(g)` | 100000 | 1.47 | 1.38–1.58 | bandwidth-bound, as before |
| `Object.entries(o).map(f)` | 1000 | **3.59** | **3.44–3.77** | **ship — new** |
| `Object.entries(o).map(f)` | 10000 | **2.65** | **2.56–2.74** | **ship — new** |
| `Object.keys(o).map(f)` | 1000 | 0.94 | 0.88–1.00 | the chain is *faster* — refused |
| `Object.keys(o).map(f)` | 10000 | 0.95 | 0.91–1.00 | same — refused |
| `xs.map(f).sort(c)` | 1000 | 1.05 | 0.99–1.12 | **REJ** — refused |
| `xs.map(f).sort(c)` | 10000 | 1.04 | 1.00–1.08 | **REJ** — refused |
| `s.split(sep).map(f).join(sep)` vs full scan | 1000 | 1.09 | 1.06–1.13 | under 1.10x — refused |
| `s.split(sep).map(f).join(sep)` vs full scan | 10000 | 1.00 | 0.95–1.05 | **REJ** — refused |
| `s.split(sep).map(f).join(sep)` vs one array | 1000 | 1.08 | 1.04–1.13 | under 1.10x — refused |
| `s.split(sep).map(f).join(sep)` vs one array | 10000 | 1.06 | 1.02–1.11 | under 1.10x — refused |

Every reads-only cell rejects — 0.94 to 1.03 across all six forms — which says
the same thing the original pair said: the cost is the allocation, not the
value it leaves behind.

**Only `Object.entries` was added, and the keys row is why.** Both chains have
the same shape and the same fused baseline, a `for...in` loop. `entries` costs
3.59x and `keys` costs 0.94x against it. The difference is exactly what
`entries` allocates that `keys` does not: a two-element array *per key* on top
of the array itself. So the rule's own claim — one array between stages — is an
understatement for `entries` and simply false for `keys`, where the loop this
rule would ask for is *slower than the chain*. A rule that fired on `keys`
would be demanding a pessimization on its own evidence.

**`.sort()` and `.reverse()` are not stages.** Both sort in place and return
the *same array reference*, which is verifiable in one line and was verified
before any cell was run. `xs.map(f).sort(c)` therefore allocates exactly one
array — what `xs.map(f)` alone allocates, which is this rule's baseline, not
its defect. The measurement agrees: 1.04–1.05x, both intervals spanning 1. The
sort also dominates the runtime, so these two cells could not have resolved a
small effect; they are reported as consistent with the mechanism rather than as
independent proof of it. The mechanism is the reason, and it is the stronger
one. `radash`'s own `array.slice().sort(...)` is the case this protects: one
array, deliberately, so the input is not mutated.

**The split chain allocates and still does not clear the bar.** It gets two
baselines because there is no way to remove `split`'s array without hand-scanning
the string in JS, and that scan is a cost of its own. The strongest fusion —
no arrays at all, result string appended to directly — wins 1.09x at n=1000 and
nothing at n=10000. The weaker one, which drops only `split`'s array and keeps
`join`, wins 1.06–1.08x. §4 rule 6 asks a broad warning for a point estimate at
or above 1.10x; no cell reaches it. The arrays are real and the string work
simply costs more than they do. Refused, and a test locks it silent.

**`.reduce()` is refused as unmeasured.** It has the shape of a terminal stage
— it reads the array before it once — but it was not measured, and it returns
whatever the callback returns, which need not be an array. Shipping it on
`join`'s reasoning would be shipping an analogy. It is also what keeps the
`radash` run at one finding: `Object.entries({ ...a, ...b }).reduce(...)` would
otherwise report twice at one site.

**A note on the harness, because it nearly published a wrong number.** The
first run of this sweep used a kernel that dispatched on `switch (variant)`
inside the timed loop. TurboFan miscompiled that switch: the `default` arm ran
on a value the very next statement reported as strictly equal to its own case
label, on roughly one run in four above ~150 reps, and never under `--no-opt`
or `--no-turbofan`. It surfaced as a thrown error only because the default arm
threw; a mis-dispatch into a *different* variant would have corrupted the
timing while the end-of-run checksum still matched. Those 24 rows are void and
are kept in `bench/chained.jsonl` without the `kernel` field that marks the
re-run. The lesson is narrower than "V8 has a bug": **variant dispatch does not
belong inside the timed region**, and hoisting it to a table resolved once is
the fix.

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

**A property added after construction — refuted, and the mechanism was already
wrong before the first cell ran.** The claim is the most repeated one in V8
folklore and this project had never tested it: `const o = { a: 1 }; o.b = 2;` is
said to be a defect, because it makes a second map and a transition to reach it.

The mechanism was read out of V8 with `--allow-natives-syntax` first, and it
does not say what the folklore says:

| probe | answer |
|---|---|
| `{x,y,z}` literal | instance size 48, 3 in-object properties, `PropertyArray[0]` |
| `{x,y}` then `o.z = v` | instance size 40, 2 in-object, `PropertyArray[3]`, `z` at `properties[0]` |
| two objects, same path, `%HaveSameMap` | **true** — one final map, not two |
| `{x}+y+z` against `{x}+z+y`, `%HaveSameMap` | false — different paths really are two maps |
| 16 named `o.k = v`, `%HasFastProperties` | true, at any count |
| 16 keyed `o[k] = v`, `%HasFastProperties` | **false** — dictionary mode at exactly 16 |

**"A second map" is a fact about the map TREE, not about what a load site
sees.** Every object built the same way lands on the same final map, so a site
reading them is monomorphic and there is no polymorphism to pay for. What
actually differs is where the field lives: an added field sits in the property
backing store, one dereference away from the object, and that store is
allocated in blocks of `JSObject::kFieldsAdded` = 3.

53 cells, Node v22.23.2, 20 pairs each, `bench/addprop.jsonl`, none void. Every
variant is paired against the rewrite the folklore asks for — the same
properties, the same values, in one object literal — and the driver compares
checksums inside every pair. Three modes: construction alone, reads alone, and
both.

**The case most real code is in — one path, one final map:**

| Cell | L1 n=256 | L2 n=16384 |
|---|---|---|
| `{x,y}` then `o.z`, reads only | 1.25 (1.20–1.30) | 1.21 (1.15–1.27) |
| `{x}` then `o.y`, `o.z`, reads only | 1.34 (1.27–1.42) | 1.24 (1.21–1.28) |
| `{x,y}` then `o.z`, construction only | 1.26 (1.20–1.34) | 1.50 (1.44–1.57) |
| `{x}` then `o.y`, `o.z`, construction only | 1.20 (1.15–1.25) | 1.28 (1.23–1.33) |
| `{x,y}` then `o.z`, construction and read | 1.34 (1.28–1.40) | 1.62 (1.49–1.73) |
| `{x}` then `o.y`, `o.z`, construction and read | 1.31 (1.24–1.39) | 1.41 (1.35–1.48) |

**Every cell is inside the 1.0–1.7x band, and §11 is what that band means
here.** The 24-cell shape sweep was run twice and *every* effect between 1.0x
and 1.7x flipped between significant and rejected; only the five-shape cells
held. These intervals exclude 1.0 and would clear §4 rule 6 on their face, and
the project has already refused a rule on exactly this ground once: two to four
shapes measure 1.2–2.0x, real and measured, and `megamorphic-elements` stays
silent there because the effect it does ship on is an order of magnitude
larger. The same judgement applies here, and it is recorded as a judgement
rather than as an absence of evidence.

A second transition costs no more than the first — 1.20–1.34x against
1.25–1.34x — which is what the mechanism predicts, because one `PropertyArray`
of three slots serves both.

**Two paths really are two maps, and it is still small:**

| Cell | L1 n=256 | L2 n=16384 | n=262144 |
|---|---|---|---|
| `{x}+y+z` half, `{x}+z+y` half, reads only | 1.74 (1.65–1.82) | 1.47 (1.41–1.52) | 1.91 (1.73–2.10) |
| the same, construction only | 1.33 (1.29–1.37) | 1.27 (1.22–1.32) | — |
| the same, construction and read | 1.47 (1.40–1.54) | 1.46 (1.38–1.56) | — |

Divergence on its own is the ratio of those reads cells to the same-path ones:
1.39x at L1 and 1.21x at L2. That lands on the two-shape numbers the object
sweep already published — 1.34 and 1.35 — from a completely different
construction, and it is the only independent replication of that figure this
project has.

**The optional property — `y?: number`, literally two hidden classes reaching
one load site.** The sweep reads the property both shapes have, because reading
the optional one would be measuring `undefined` on a quarter of the rows and no
rewrite fixes that:

| Cell | L1 n=256 | L2 n=16384 |
|---|---|---|
| written as two literals, reads only | 1.21 (1.10–1.32) | 1.04 (0.99–1.10) **REJ** |
| written as two literals, construction and read | 0.97 (0.93–1.01) **REJ** | 0.90 (0.84–0.98) |
| reached by assignment, reads only | 1.32 (1.25–1.40) | 1.14 (1.09–1.19) |
| reached by assignment, construction and read | 1.04 (1.00–1.09) | 1.46 (1.40–1.53) |

**The optional property is refused on its own evidence.** Written the way it is
actually written — some literals carry it, some do not — it rejects outright at
L2 on reads, and with construction counted it is *faster* than the shape that
always carries the property, because there is less to build. A rule demanding
`y: number` with a default would be demanding a slower program.

**Added after the load site is already hot.** The sweep warms the read over the
first shape, adds the property to every row, warms again, then times. The
one-time deopt is deliberately outside the timed region: it is O(1) and a 120 ms
region amortizes it to nothing. What is measured is the steady state of a site
that has seen the old map and the new one:

| Cell | L1 n=256 | L2 n=16384 | n=262144 |
|---|---|---|---|
| against the one-literal rewrite | 1.09 (1.03–1.16) | 0.84 (0.82–0.87) | 0.51 (0.45–0.58) |
| against identical objects the site never saw grow | 1.10 (1.03–1.17) | 0.79 (0.76–0.81) | 0.38 (0.33–0.44) |

**Refused, and the sub-1.0 cells are the interesting half.** At L1 the residual
is 1.09–1.10x, under the 1.10x §4 rule 6 asks of a warning. At L2 and above the
mutated objects are *faster* than identical objects built field-complete, and
the plausible reading is allocation order rather than maps. This sweep grows the
objects in one pass and adds the property in a second, so the objects land
packed against each other; building them one at a time interleaves every object
with its own property array. Both sweeps read only in-object fields, so the
interleaved one walks further for the same data. That is inference from the
instance sizes above, not a measurement of layout, and it is recorded as such —
but it says the thing worth saying: at the sizes where memory dominates, field
layout swamps anything the map bookkeeping does, and it can go either way.

**The one large effect, and it is not the folklore's.**
`fast_properties_soft_limit` is 12, and `Map::TooManyFastProperties` consults it
only when the store origin is `kMaybeKeyed` — a **keyed** store. A named store
never normalizes at any count. Probed at exactly 16 keyed adds on `{x:1}`, cold
and after 20,000 builds:

| Cell | n=256 | n=8192 |
|---|---|---|
| 12 keyed adds, reads only | 1.02 (0.99–1.06) **REJ** | 1.04 (1.01–1.06) |
| 16 named adds, reads only | 0.92 (0.89–0.94) | 1.05 (1.03–1.08) |
| **16 keyed adds, reads only** | **6.17 (5.94–6.41)** | **6.34 (6.14–6.57)** |
| 12 keyed adds, construction and read | 7.19 (6.62–7.75) | 3.67 (3.39–4.00) |
| 16 named adds, construction and read | 2.07 (1.89–2.27) | 3.33 (3.11–3.57) |
| 16 keyed adds, construction and read | 24.61 (23.48–26.06) | 12.97 (12.35–13.64) |

**Two controls pin it, and that is what makes it clean.** The same seventeen
fields reached by *named* stores read at 0.92–1.05x — nothing. The same keyed
syntax stopped at *twelve* reads at 1.02–1.04x — nothing. One variable moves and
reads cost 6.17–6.34x. This is the mechanism `delete-property` ships on, reached
by a different route, and it is the first direct measurement of dictionary mode
in this project rather than a figure carried over from `options.md`.

**It still ships no rule, for two reasons, and the first is fatal on its own.**
The effect appears past a count no checker can see. Twelve keyed stores measured
1.02–1.04x with an interval spanning 1; sixteen measured 6.17x. A rule firing on
`acc[k] = v` in a loop would fire on the twelve-key case its own benchmark
rejected, which is the one thing this project does not do, and nothing in the
type system separates a loop that runs twelve times from one that runs sixteen.
Second, the rewrite is unmeasured: where the keys are dynamic — the only case
where anyone writes keyed stores — the object literal this sweep used as its
baseline cannot be written at all, so the measured comparison names no fix a
developer could apply. The honest baseline for that population is `Map`, and
`Map` was not measured. Recorded as a proposal in `BUGS.md` TC-12, for the owner
rather than for the tool.

**The RAM-sized construction cells are void in everything but name, and the
region guard did not catch it.** At n=262144 a rep builds a quarter of a million
objects, so the 120 ms region is reached at 4 to 7 reps. Three near-identical
constructions then disagree flatly — one added property at 1.64x, two added
properties at 0.91x, two divergent paths at 0.89x, every interval excluding 1.0
and no two of them able to be true together. The bootstrap interval is over
process-to-process variation at a fixed rep count and cannot see the variance one
GC pause introduces when there are five reps to hide in. Those cells are
withdrawn and are not quoted above; the reads-only cells at the same size ran at
86–312 reps and are kept. Recorded as `BUGS.md` TC-11: §4 rule 3 bounds the
achieved region and says nothing about the rep count, and a region can be met by
a handful of very slow reps.

**Megamorphic dispatch — the same V8 constant at a call site, and the sharpest
threshold this project has measured.** `megamorphic-elements` found
`max_valid_polymorphic_map_count` = 4 at a *load* site, on the element type of
an array. A call site is governed by the same four maps, and `x.step()` on a
union-typed parameter is far more common in real TypeScript than an array of a
five-way union. 80 cells, Node v22.23.2, 20 pairs each, `bench/dispatch.jsonl`,
none void. One call site — `s += rows[i].step()` — with K shapes reaching it,
every K against K = 1.

A call site has **two** things that can diverge, and the folklore rolls them
into one: the receiver's MAP, which decides where `step` is found, and the call
TARGET, which decides what runs. Four families split them. The map questions
were answered with `--allow-natives-syntax` before any cell ran
(`bench/dispatch-probe.js`, rerunnable):

| probe | answer |
|---|---|
| two instances of one class | `%HaveSameMap` true |
| instances of two hand-written classes, identical fields | **false** — two maps |
| one key order, two different function values in one slot | **true** — one map |
| two key orders, the same function value | false — two maps |

| family | maps | targets | what it is |
|---|---|---|---|
| `cls` | K | K | K classes, method on the prototype — the TypeScript union of classes |
| `lit` | K | K | K literal shapes, each carrying its own function |
| `tgt` | **1** | K | one literal shape, K different functions in the same slot |
| `shr` | K | **1** | K literal shapes, all carrying one shared function |

The classes and the functions are written out rather than produced by a
factory. Every closure one factory hands back shares a `SharedFunctionInfo`,
and V8's call feedback treats closures of one SFI as a case of its own, so a
generated class would not be the hand-written case this measures.

**The cliff, reads only, ratio against one shape, 95% interval in brackets:**

| K | `cls` L1 | `cls` L2 | `cls` L3 | `shr` L1 | `shr` L2 |
|---|---|---|---|---|---|
| 2 | 1.47 (1.37–1.58) | 1.21 (1.14–1.29) | 1.16 (1.12–1.20) | 1.40 (1.31–1.49) | 1.29 (1.22–1.37) |
| 3 | 1.49 (1.34–1.63) | 1.32 (1.27–1.37) | 1.39 (1.26–1.51) | 1.93 (1.80–2.07) | 1.63 (1.58–1.68) |
| 4 | 1.56 (1.50–1.62) | 1.38 (1.29–1.46) | 1.40 (1.34–1.46) | 2.21 (2.08–2.38) | 2.14 (2.06–2.21) |
| **5** | **19.37** (18.12–20.59) | **14.59** (13.76–15.45) | **14.85** (13.90–15.94) | **8.25** (7.80–8.70) | **6.92** (6.67–7.16) |
| 6 | 19.97 (18.32–21.64) | 16.44 (15.49–17.48) | 15.36 (13.96–16.82) | 8.09 (7.74–8.39) | 7.20 (6.90–7.58) |

**A step, not a slope, and it is sharper than the one at a load site.** Two,
three and four classes cost 1.16–1.56x — the same band the object sweep
published for two-to-four shapes at a load site, 1.15–1.97x, from a completely
different kernel. The fifth costs 14.59–19.97x, and it holds at all three
working sets. `shr` puts the same cliff on the map side *alone*: one function,
K maps, 2.14–2.21x at four and 6.92–8.25x at five.

**The other two families say the map is only half of it:**

| K | `lit` L1 | `lit` L2 | `lit` L3 | `tgt` L1 | `tgt` L2 |
|---|---|---|---|---|---|
| 2 | 6.78 (6.55–6.99) | 5.70 (5.49–5.94) | 3.63 (3.28–3.99) | 10.29 (8.52–11.77) | 7.90 (7.24–8.57) |
| 3 | 6.70 (6.19–7.25) | 6.32 (5.50–7.42) | 3.54 (3.22–3.95) | 11.14 (9.59–12.55) | 8.33 (7.93–8.76) |
| 4 | 13.02 (12.33–13.79) | 9.11 (8.46–9.72) | 4.34 (3.74–5.06) | 11.13 (9.71–12.46) | 7.68 (7.02–8.36) |
| 5 | 14.78 (13.24–16.56) | 10.59 (9.71–11.54) | 7.51 (6.53–8.60) | 11.93 (10.73–13.09) | 8.91 (8.25–9.62) |
| 6 | 14.46 (13.75–15.10) | 11.27 (10.64–11.84) | 7.51 (6.68–8.38) | 11.07 (9.58–12.50) | 8.58 (7.94–9.19) |

**`tgt` has no threshold at all.** One map, K functions in one slot: 7.68–11.93x
from the *second* target to the sixth, flat, every interval clear of 1.0 and no
step anywhere. The four-map budget is a budget for the receiver's map and
nothing else. A target that is a value loaded out of the object gets none of
it — V8's call feedback is monomorphic or megamorphic, with no polymorphic
middle, which is stated here as the reading of these numbers and not as
something this sweep probed.

**So `lit` is off the cliff at TWO, not at five.** A union of five object
literal types that each carry their own function-valued property costs
3.63–6.78x at the second shape, before any map budget is exhausted, because the
second function has already made the call site megamorphic on its target. That
is the form a lot of TypeScript is actually in, and it is the form no rule here
fires on.

**One anomaly, recorded rather than explained.** `tgt` costs *more* than `lit`
at the same K — 10.29x against 6.78x at L1, 7.90x against 5.70x at L2 —
although it has one map where `lit` has two. The intervals are tight and do not
overlap. A plausible reading is field constness: the shared baseline `lit1`
builds every object at one literal site with one function value, which V8 can
track as a constant field, and the `tgt` variants generalize that slot to
mutable while the `lit` variants keep one function per site. Not probed, so it
is an observation, and it means the `tgt` column bounds the target effect from
above rather than measuring it exactly.

**With construction counted**, at the two sizes whose cells are measurements:

| K | `cls` L1 | `cls` L2 | `lit` L1 | `lit` L2 |
|---|---|---|---|---|
| 2 | 3.30 (3.15–3.45) | 1.72 (1.62–1.85) | 2.90 (2.70–3.10) | 1.66 (1.56–1.75) |
| 3 | 3.31 (3.13–3.48) | 1.74 (1.59–1.93) | 3.22 (3.07–3.34) | 1.42 (1.32–1.52) |
| 4 | 3.27 (3.16–3.39) | 1.78 (1.67–1.91) | 3.43 (3.31–3.57) | 1.84 (1.75–1.93) |
| 5 | **5.54** (4.85–6.34) | **2.34** (2.22–2.48) | 4.15 (3.89–4.45) | 1.89 (1.79–1.98) |
| 6 | 5.53 (5.29–5.81) | 2.37 (2.23–2.50) | 3.76 (3.64–3.89) | 1.77 (1.67–1.86) |

**The step survives construction and the level does not mean what it looks
like.** `cls` goes 3.27x at four to 5.54x at five at L1, and 1.78x to 2.34x at
L2, so the fifth shape is still visible with allocation counted. But the
K = 2 row is already 3.30x, and that is not dispatch: selecting the constructor
from a table is a second polymorphic site that the reads-only half does not
have, and both the fourth and the second shape pay it. The rule quotes the
reads half and says so.

**Ten cells are withdrawn under TC-11.** Every `incl` cell at n = 262144 ran at
**2 to 4 reps** — a rep builds a quarter of a million objects, so the 120 ms
region is met by a handful of them and one GC pause decides the cell. They are
not quoted above. The reads-only cells at the same size ran at 25 to 435 reps
and are kept; the runner now prints the rep count with every cell so this is
visible without opening the `.jsonl`.

**`megamorphic-dispatch` ships on the fifth shape, and the threshold is wrong
in the direction of silence.** Firing at five is supported by every family that
has a threshold — `cls` at 14.59–19.97x and `shr` at 6.92–8.25x — and staying
quiet at four is supported by the same two, at 1.16–1.56x and 2.14–2.21x. It is
*not* supported for `lit`, which costs 4.34–13.02x at four; there the rule
misses a real effect rather than inventing one, and nothing in a declared type
separates a prototype method from a function held in a field. The rule requires
the call: TC-8 is the flagship rule reporting a megamorphic load from a
parameter's type without checking that anything is loaded, and a second rule
with that hole would be the same defect twice. `demo/lib.ts` `idOfFive` is five
object types with a field read and no call, and a test locks it silent.

**A method called on the elements of an array reports once.** A parameter that
is an array of a five-way union whose elements have methods called on them is
one union reaching one site, and `megamorphic-elements` already reports that
parameter. The dispatch rule steps aside there rather than billing one defect
twice — the judgement `chained-allocation`'s `consumed` check already makes for
a three-stage chain. `demo/lib.ts` `totalArea` is the fixture and a test locks
it at one finding.

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
test/check.test.ts    24 tests, and the important ones assert silence
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

The checkout is pinned at `c635f0d160b6e988b5ea5a907511a2929beb5d5e`, V8
15.3.0.0. Every row below was re-read at that revision, and `make v8-check`
re-checks them — and the per-rule mechanism citations in `docs/v8-evidence.md` —
against the checkout, failing with the drifted line. It exits non-zero when
`v8src/` is missing rather than passing quietly.

| constant | value | where | meaning |
|---|---|---|---|
| `max_valid_polymorphic_map_count` | **4** | `flags/flag-definitions.h:3320-3321`, used at `ic/ic.cc:802` | the fifth map at a load site forces megamorphic |
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

The first row was the one correction this re-read found: 3320 defines the value
as `DEFAULT_MAX_POLYMORPHIC_MAP_COUNT` and 3321 is the flag that takes it. The
other nine are exact. `invocation_count_for_maglev` is defined twice — 1184 is
the Android branch at 1000, 1187 the one that applies here.

**The first row is the important one.** The measured cliff in §11 and this
constant are the same fact, found from opposite ends: a benchmark that knew
nothing about the source, and a source constant that predicted the benchmark.

Every shipped rule now has a section in `docs/v8-evidence.md` tracing its
mechanism to the source the same way — including the two rules where the honest
answer is that there is no mechanism to trace (`accumulating-spread` is a
complexity class) and the one where the source contradicts the shipped threshold
(`megamorphic-dispatch`, `BUGS.md` TC-13). A citation still proves only that the
mechanism exists; the magnitude is always the benchmark's.

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

`kMaxFastLiteralDepth` (3) suggests a rule on deeply nested object literals.
`max_inlined_bytecode_size` (460) suggests that an annotated helper too large to
inline silently loses the benefit of being annotated at all.

None of them ship. The project rule holds: a constant in V8's source is a
hypothesis, and only a benchmark makes it a rule.

`fast_properties_soft_limit` (12) is no longer on that list: it was measured in
the §3 sweep and it is the sharpest threshold in the project. `TooManyFastProperties`
consults it only for a **keyed** store, so `o.k = v` never normalizes at any
count while `o[k] = v` normalizes at exactly 16 adds on a one-field object —
`max(12, in-object count)` external fields, with the backing store full. Reads
past that threshold cost **6.17–6.34x**, against 1.02–1.04x for twelve keyed
adds and 0.92–1.05x for sixteen named ones. It ships no rule because no checker
can see the count, which is the argument in full in §3 and the proposal in
`BUGS.md` TC-12. `max_fast_properties` (128) is defined in
`flag-definitions.h:3332` and has no use site anywhere in `v8src/src`.

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
