# BUGS

Review queue. Found during audits, fixed only when the owner asks.

## ✅ FIXED 2026-08-10 — TC-1 — SPEC §4 and bench/run.js disagreed on protocol

§4 requires 10 discarded pilot pairs, 50 measured pairs, and published raw
observations. `bench/run.js` runs 1 calibration process, 20 measured pairs, and
writes only per-cell aggregates to `bench/shapes.jsonl`.

`bench-arrays.md` already declared a sanctioned reduction to 20 pairs on
wall-clock grounds, so the pair count is defensible; the 1-vs-10 pilot gap and
the missing raw observations are not. A reader cannot recompute the intervals
from what is published, which is the one thing this project claims to offer.

Found by: codex round 5. Fixed both ways: §4 now states the sanctioned
reduction to 20 pairs and one calibration run, and requires any near-1.0 cell
to be re-run at fifty before a rule ships on it; `bench/run.js` now writes the
raw per-pair `base` and `test` arrays next to each aggregate, so the interval
is recomputable.

## ✅ FIXED 2026-08-11 — TC-5 — the driver calibrated from a cold run, and it inflated ratios

Fixed in `bench/driver.js`: `calibrate()` now iterates the probe until two
successive rep-count estimates agree within 20%, so the count is derived from
warm cost; and `cell()` asserts the achieved timed region landed within 2x of
the 120 ms target, throwing when it did not. A mis-sized cell can no longer be
published as a result. SPEC §4 rule 3 states both.

`bench/spread.jsonl` was re-run under the fix and the old file kept as
`bench/spread-precal.jsonl`. The re-run changed the published claims: the
`excl` cells at n=1000 and n=10000 both moved to REJECTED (0.87x CI 0.67-1.05
and 1.05x CI 0.89-1.26), which withdraws the "a spread-built array reads
faster" claim entirely — it was the artifact this defect predicted. The
construction effect grew rather than shrank once both sides were sized from
warm cost. `bench/chained.jsonl` is kept as `bench/chained-precal.jsonl` and
needs the same re-run before `chained-allocation` can be reconsidered.

The original report follows.

## TC-5 — the driver calibrates from a cold run, and it inflates ratios (2026-08-11, proposal)

`driver.js` `calibrate()` sizes the timed region from one `reps=1` run. For a
kernel whose cold cost is far above its warm cost that undersizes the rep
count — and it undersizes it *worst for the slowest variant*, so the side a
rule wants to indict gets the shortest timed region and therefore the least
warmup dilution. The ratio comes out inflated, in the direction that ships
rules.

Measured on `bench/chained.js`, n=1000, construction included:

| | cold probe (5 repeats) | warm | reps given | timed region |
|---|---|---|---|---|
| fused | 91–128 ns/op | ~2.8 ns/op | 1294 | 14.4 ms |
| chained | 1,000–20,600 ns/op | ~21 ns/op | 11 | **2.4 ms** |

The target is 120 ms (`driver.js`, and SPEC §4 rule 3). The chained side got
2.4 ms. The cell reported **19.73x, CI 12.42-33.73**; sized from warm cost on
both sides it is roughly **6-11x**. The probe is not merely biased, it is
unstable — a 20x spread across five repeats decides the rep count from one
sample. The `chained-allocation` rule did not ship because of this.

`bench/spread.jsonl` came out of the same `calibrate()`. Accumulating spread is
quadratic so its 86x and 2343x very likely survive — but "very likely" is not
this project's standard, and its `excl` cells sit near 1.0 where this defect
bites hardest.

Not fixed inline: iterating the calibration changes the method behind every
published figure and requires re-running `spread.jsonl` and re-deriving both
the SPEC §3 tables and the shipped `EVIDENCE` strings. Proposal: iterate
`calibrate()` until two successive probes agree within 20%, then assert the
achieved region is within 2x of 120 ms and **fail the cell loudly** when it is
not, so a mis-sized cell can never again be published as a result. Then re-run
spread and chained and re-derive both.

## ✅ FIXED 2026-08-11 — TC-7 — a truncated walk reported "clean"

The recursive walk stops at `MAX_BODIES` (200). It stopped silently, so a
function whose call tree exceeded the cap could be checked in part and still
print with no findings — and the run could end with "every annotated function
is clean". That is the failure mode this project exists to prevent: a checker
that quietly checks less than it claims.

Found by the CEO audit of the onepager, which caught the page admitting it in
its own limits section — *"the tool does not currently tell you it hit the
cap"* — and correctly called that unacceptable for anything gating CI.

Fixed: `Mark.truncated` records it, the report prints `WALK TRUNCATED` under
the affected function with the line "treat any silence from this function as
unproven", and the summary now refuses to say "clean" when any walk truncated —
it says "no findings, but N walks truncated: this is not a clean run."

## ✅ FIXED 2026-08-11 — TC-6 — an interrupted sweep lost every cell it had measured

All three runners wrote rows to an `fs.createWriteStream`. The sweep body
blocks the event loop from end to end in `execFileSync`, so the stream's
asynchronous `open()` callback never fired and every row stayed in the stream's
buffer until the run finished. The file did not exist on disk while the sweep
was printing results to the terminal.

Found by inspecting `/proc/<pid>/fd` after `ls bench/*.jsonl` showed no output
file for a sweep that had already printed eight cells. A 24-cell sweep that was
stopped part-way lost all twelve cells it had measured — half an hour of
machine time, gone, with the numbers visible in the log but not recorded
anywhere a tool could read.

Fixed: `bench/run.js`, `bench/run-spread.js` and `bench/run-chained.js` now
`fs.appendFileSync` one row per cell, so a cell is durable the moment it is
measured and an interrupted sweep keeps everything it finished.

## ✅ FIXED 2026-08-11 — TC-4 — two copies of the measurement protocol

`bench/run.js` now runs on `bench/driver.js` like every other sweep, so there
is one protocol and one place to fix it. Its own copy of `once`, `calibrate`,
`bootstrap` and `cell` is gone, and with it the single cold calibration probe
that TC-5 showed inflates ratios toward shipping a rule.

The 24 cells were re-run under the fixed driver and written to
`bench/shapes-calibrated.jsonl`. The two earlier sweeps stay on disk under
their own names — `shapes.jsonl` and `shapes-aggregates-only.jsonl` — because
they were produced by the old method and are not comparable cell-for-cell with
the new one. Nothing was deleted and nothing was overwritten.

The original report follows.

## TC-4 — two copies of the measurement protocol (2026-08-11, proposal)

`bench/driver.js` was extracted so the accumulating-spread sweep could reuse the
protocol instead of copying it, but `bench/run.js` still carries its own copy of
`once`, `calibrate`, `bootstrap` and `cell`. Two copies drift, and the whole
claim of this project is that the protocol is one thing.

They are not identical either. The driver calibrates **each side separately**,
because accumulating spread is two orders of magnitude slower than its baseline
and one shared rep count would either run for hours or leave the fast side
unmeasurably short. `run.js` calibrates once, on the baseline.

Not fixed inline, because porting `run.js` onto the driver changes the method
that produced the published `shapes.jsonl`. That needs the 24-cell sweep re-run
under the new calibration and the published figures re-derived — a redesign,
so it wants sign-off first. Proposal: port `run.js` to the driver, re-run all
24 cells, and keep the old file's output as a third sweep to compare against.

## TC-9 — rules fire outside the conditions their own evidence establishes (2026-08-11, open)

The `EVIDENCE` table records a `silent` condition for every measured rule. No
rule implementation reads it. The boundary is prose next to the code, not a
guard inside it, so three rules fire in conditions their own measurement
excludes.

- **`chained-allocation`** measured 7.13x at n=1000 and 1.45x at n=100000. The
  implementation matches two chained calls and cannot know n, the callback
  cost, or whether the result escapes. It cannot implement its stated boundary,
  and the docs claim it stays silent at large n.
- **`delete-property`** cites 28-67x for repeated per-row deletion, and this
  project separately measured a single delete on a singleton object at 0x —
  up to 10% *faster*. The rule flags every `delete` expression with no loop, no
  repetition, and no receiver population. The demo fixture `drop` deletes one
  property from one object and is reported.
- **`megamorphic-elements`** is TC-8, the same defect in its sharpest form.

**And `closed-world` has no evidence at all.** `EVIDENCE` has five entries;
`closed-world` is not among them, so its findings carry `evidence: null`. It
still counts toward the finding total and still drives exit code 1. The README
and the onepager both claimed "every rule carries the benchmark that earned
it", which was false for one rule in six. The claim has been corrected; the
rule has not.

Found by the adversarial teardown in `useless2.md`, all four points verified
here against the code and the demo output.

Proposal: either give each rule a machine-checked precondition matching its
`silent` field, or restate the rules as heuristics whose evidence bounds the
*worst* case rather than the fired case. The second is honest and cheap; the
first is what the project's own marketing implies.

## TC-8 — megamorphic-elements fires without a property load (2026-08-11, open)

The rule reports "loads here go megamorphic" from the *type of a parameter*
alone. It never checks that the function loads a property from an element. The
cost it quotes, 3.6-10.6x, was measured on a kernel that does
`s += r.x + r.y` — an actual property load in a loop.

The project's own demo fixture proves the gap:

```ts
/** @turbocharge */
export function fiveShapes(rows: (A | B | C | D | E)[]): number {
  return rows.length;
}
```

`rows.length` is a load on the array, not on any element. No element property is
ever read, so no element load site exists, so nothing can go megamorphic — and
the rule fires anyway, quoting the full cliff. `test/check.test.ts` asserts this
firing, which means the suite currently locks in a false positive.

Found by the adversarial teardown in `useless2.md`, verified here by running
the demo. This is the same family as TC-2 (a union member is not a V8 map) but
strictly worse: TC-2 is an unsound inference about how many maps reach a site,
TC-8 is firing where there is no site at all.

Not fixed inline: requiring a property-load site on the element changes what
the rule triggers on, which is a redesign of the flagship rule and needs
sign-off. Proposal: fire only when the annotated call tree contains an element
access on that parameter — an indexed access followed by a property read, or a
`for...of` binding whose properties are read — and re-point the demo fixture at
a kernel that matches the benchmark.

## TC-2 — a TypeScript union member is not a V8 map (2026-08-10, partial)

`megamorphic-elements` infers "five maps at this load site" from "five members
in the element union". Those are different claims. Five members built by one
factory can share fewer maps; one declared type built two ways can be two maps.

Partially addressed: the finding now says "unions N object types", states the
four-map mechanism, and leaves the judgement to the reader. The rule can still
fire where no load site ever sees five maps. The real fix is the runtime half
in `DESIGN.md`, which observes maps instead of inferring them.

Found by: codex round 5, which argued for downgrading or deleting the rule.

## TC-3 — no rule for functions V8 refuses to optimize (2026-08-10, open)

Measured on this machine: a function of 3455 generated statements reaches
Maglev; 3456 is never optimized at all, and stays unoptimized at 3,000,000
invocations, so it is a hard limit and not a tier-up budget artifact. Cost is
2.74x per statement across that one-statement edge (3.822 vs 10.484 ns).

No rule ships, because source statements are a poor proxy for bytecode size and
the mapping is unmeasured. `bench/optsize.js` reproduces it.
