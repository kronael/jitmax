# BUGS

Review queue. Found during audits, fixed only when the owner asks.

## TC-19 — megamorphic-elements prints a fix nobody at the finding can apply (2026-08-15, open, proposal)

Found while giving every rule an end-to-end example. `examples/` can only hold a
rule whose printed fix is a change to the function the rule fired on, and this
one never is.

The rule reads a **parameter's** declared element type and reports the load
site inside the callee. Its fix line says *"get the element type to four shapes
or fewer, or give it one construction path"* — and the function holding the
finding received that array already built. Whoever can act on the line is a
caller the report never names, in a file the walk may never have visited.

So there is no before/after pair to vendor, and the gap is not a missing
example: it is the finding addressing the wrong reader.

The survey that found it also refutes what README said until today. Extended
from five libraries to twelve — 850 annotated functions — `megamorphic-elements`
fires **ten times, and all ten are one function**: zod's `prefixIssues`, whose
`issues` parameter unions twelve `$ZodRawIssue` types and whose body loads and
mutates `.path` on each element. Nine of the ten are that one site reported from
nine annotated roots that reach it. So the rule is not unfireable, as the
previous survey suggested; it is narrow, and its advice is misaddressed.

Proposals, none of them shipped:

1. **Say whose problem it is.** The fix line becomes something like *"the array
   reaching this parameter has to be built with four shapes or fewer — that is a
   change where it is built, not here"*. Cheap, honest, and still not actionable
   at the finding.
2. **Report at the construction site instead.** Needs whole-program flow to the
   parameter, which this tool does not have and which the annotation model
   (one root, its call tree) does not obviously give it.
3. **Withdraw the rule** on the grounds that a warning nobody at the site can
   act on is not worth a false-positive budget. TC-8 and TC-2 are already open
   against it.

A change to the printed contract, so: **owner signs off before anything ships.**

Reproduce: `node examples/annotate.js tmp/lib-zod/packages/zod/src/v4/core` then
`node bin/turbocharge.ts tmp/lib-zod/packages/zod/src/v4/core`.

## TC-18 — allocating-select fires on advancing a cursor, which its benchmark never measured (2026-08-15, open, proposal)

Twelve libraries, 850 annotated functions, six `allocating-select` findings, and
**not one of them is the shape `bench/select.jl` measured.**

The benchmark keeps a running minimum: `b.lo = Box.min(b.lo, v)`, where after
the first item the incumbent almost always wins, so nearly every allocation is
for a value the target already held. That is what the 2.65-2.73x buys, and it is
what the fix — *"compare first and assign only when x really changes"* — saves.

What actually fires in real code:

- `date = addMinutes(date, step)`, `date = addQuarters(date, step)`,
  `currentDate = addWeeks(currentDate, step)`, `date = oneDayLater(date)` — four
  date-fns functions, one per loop, walking a cursor forward.
- `sink = lazyFunctions[index].lazy!(sink)` in es-toolkit's `pipe`, reported
  twice from one site.

Every one of them changes the value on **every** pass. The compare the fix asks
for never skips a store, so the fix cannot save an allocation; it can only add a
comparison. The rule is firing where its own evidence says there is nothing to
win — TC-9 again, in a fourth rule.

The rule already tries to separate the two: it requires the target to appear
among the ARGUMENTS, which is what makes `x = x.plus(1)` (target as receiver)
stay silent. Written as a free function, `x = plus(x, 1)`, the same arithmetic
walks straight through that test.

Proposal, not shipped: require a **peer** — at least one argument besides the
target whose type is the target's type. `Box.min(a, b)` and `Decimal.min(a, b)`
have one; `addMinutes(date, step)` does not, and neither does `lazy(sink)`. On
the survey that would take the rule from six findings to zero, which is the
honest outcome for a rule whose shape has not been seen in the wild — and it
needs a measurement of its own before anything is claimed for it.

A change to what the rule fires on, so: **owner signs off before anything
ships.**

Reproduce: the survey in README's "whole survey" table; the four date-fns sites
are in `pkgs/core/src/{differenceInBusinessDays,eachMinuteOfInterval,eachQuarterOfInterval,eachWeekOfInterval}/index.ts`.

## ✅ FIXED 2026-08-15 — TC-17 — a truncated walk printed "not a clean run" and exited 0

TC-7 taught the *report* to refuse the word "clean" when a walk hit the cap. It
never reached the exit code. `bin/turbocharge.ts` sets it from
`findings.length > 0` alone, so a run that prints

    no findings, but 1 walk truncated: this is not a clean run.

exits `0` — and a CI gate reads exit codes, not prose. README's "a walk that
hits its limit prints `WALK TRUNCATED` and is never reported as clean" is true
of the text and false of the contract underneath it.

Found while fixing the detection half of the same defect: the walk stopped at
the cap without setting `Mark.truncated` whenever `reached` filled at the END
of a body rather than mid-body, so a 250-deep call chain printed "every
annotated function is clean" outright. That part is a plain bug and is fixed —
`lib/scan.ts` now walks every body it admitted. What remains is the exit code,
and only the shapes that DO set the flag ever reached it.

**Not fixed inline: the three exit codes are the tool's public contract.**
`0` clean, `1` findings, `2` the tool failed. Making a truncated walk exit `1`
overloads "findings" with "unproven", and a fourth code is a new contract. Both
are a change to what a CI gate means, so: **owner signs off before anything
ships**.

Reproduce: a call chain deeper than `MAX_BODIES` (200) with no finding in it —
`node bin/turbocharge.ts <dir>; echo $?` prints the truncation warning and `0`.

**Fixed 2026-08-15, signed off: a truncated walk exits `1`.** No fourth code —
`1` already means "turbocharge has something to report", and a run that proves
nothing about part of a call tree is something to report. `bin/turbocharge.ts`
now sets the code from `findings.length > 0 || mark.truncated`. The repro is
checked in as `test/fixtures/deep/chain.ts` — 211 links against a cap of 200,
no finding anywhere in it — and a test runs the binary over it and asserts the
code is 1 with `0 findings` in the output, so the contract is tested where a CI
gate reads it rather than in the library beneath it. README's exit-code
paragraph and `CLAUDE.md` say the same thing.

## ✅ FIXED 2026-08-15 — TC-16 — the fix a rule printed could cost more than the defect

Found by `bench/example.jl` — the first sweep in this project that applies a
printed fix to a function somebody else shipped and measures the whole call.
Two of the three examples say the fix is not free, and the rules do not know it.

**One mechanism, two rules.** Adding properties to an object one at a time
normalizes it to dictionary mode. `%DebugPrint` on the result of
`examples/remeda-merge-all.after.ts` reads `[DictionaryProperties]`; on the
result of the shipped version it reads `[FastProperties]`. That is the same
demotion `delete-property` exists to warn about, reached through the fix for a
different rule.

- **`accumulating-spread`.** Its fix line is "mutate acc in place — push, or
  assign the key". On remeda's `mergeAll` that fix makes the caller's reads
  **8x slower**: 0.11-0.12x at n=8 and n=64, in all six sweeps, with no
  interval near 1.0. The build gets faster (1.31-1.36x at n=8; the n=64 cell
  reads 17.34/19.34/20.10x and does not replicate), so the rule trades a
  quadratic build for a per-load cost it never mentions. The rule's own
  EVIDENCE already contains the fact — `bench/spread-object.jl` measured the
  spread-built object reading 30-50x FASTER — and the `fix:` line does not
  carry it.
- **`delete-property`.** Its fix line is "assign undefined, or build the object
  without the property". On es-toolkit's `omit` the second branch works at 12
  keys — the caller's reads are 10.95-11.86x faster, the rule's 12.6-17.1x
  landing almost intact — and stops working by 48, where the cell rejects at
  0.94-1.02x with an interval spanning 1.0 in all three sweeps.
  `%HasFastProperties` is false on **both** sides there: the fixed object was
  normalized by being built key by key. The first branch, "assign undefined",
  is not available at all in `omit`, because it leaves the key present and
  computes a different object; the driver's checksum rejects it.

**Not a symptom to log louder.** The honest shape of the fix is conditional —
below some width, build the object without the property; above it, the
rewrite buys nothing on reads — and neither rule can see the width, which is
TC-9 again from the other end. A cause fix means the `fix:` line stops being
one sentence, and that is a contract change, so it is a proposal, not an inline
edit: **owner signs off before anything ships**.

Reproduce: `make example`; `node --allow-natives-syntax` over the pairs for the
properties state. Data in `bench/example.jl`, all 36 sweeps.

**Fixed 2026-08-15, signed off: the advice changed, the detection did not.**
Both rules now print the condition their own measurement established, and
neither fires anywhere it did not fire before.

`accumulating-spread` prints **two** fix lines, because it always knew which of
the four forms it matched and was throwing that away:

- array (`[...acc, v]`, `acc.concat(v)`) — *"push onto acc instead of rebuilding
  it — the finished array reads the same either way, 0.96-1.07x"*. No condition,
  because the sweep found none: `bench/spread.jl`'s reads-only cells are
  0.96-1.07x across both sizes and both sweeps.
- object (`{ ...acc, k: v }`, `Object.assign({}, acc, …)`) — *"assign the key on
  acc instead of rebuilding it — but that fills the result key by key, which
  normalizes it: its reads measured 0.11-0.12x of the spread-built object's
  (remeda mergeAll)"*.

`delete-property` prints *"assign undefined where the key may stay present, or
build the object without it — the rebuild helps at 12 keys and not at 48, where
filling it key by key normalizes it too"*. The first branch is conditioned on
what `omit` proved: it computes a different object when the key must go. The
second carries the width the sweep bracketed.

Both quoted ratios are derived from the `.jl` rows like every other published
number — `spread.array.reads`, `spread.object.reads` and `ex.mergeall.reads` in
`lib/derive.ts` — so a re-run that moves them moves the printed advice, and
`make test` fails if the two ever disagree. Two tests assert the sentences.
`EVIDENCE.silent` for `accumulating-spread` was reading its own 0.03x as
evidence that the value left behind does not matter, when that number IS the fix
reading slower; it now says so.

What is NOT fixed, and stays with TC-9: neither rule can see the width or the
reads at check time. The fix line states the condition; it does not evaluate it.

## ✅ FIXED 2026-08-15 — TC-15 — delete-property's number predates the current protocol

**Closed by `bench/delete.jl`: 16 cells, 20 pairs each, every cell replicated
three times. The audit below was right, and the probe it doubted was wrong in
both directions.**

The number moved down. 28-67x becomes **12.6-17.1x per property load** —
13.35-16.32x at n=16384 and 12.57-17.14x at n=262144, both replicating; the
n=256 cell spread 10.75-14.49x with mutually exclusive intervals and is
withdrawn. With construction counted it is 23.22-24.33x at n=256, where the
delete is paid on every object built; the n=16384 construction cell disagrees
across sweeps (11.68/16.79/12.89) and is withdrawn, and at n=262144 one rep
builds 262144 dictionary objects and overruns the 240 ms region guard, so all
three sweeps are void. Void and printed, not rounded into the range.

**And the singleton half of the probe is refuted, which is the bigger result.**
The audit above asked for both populations to be reproduced, expecting the 0x to
stand. It does not: ONE object with ONE delete, read in a loop, costs
**13.32-15.57x** — at every working set, in all nine of its sweeps, with tighter
intervals than the per-row population manages. Both families run the identical
kernel over an array of the same length (`sh` fills n slots with n references to
one object), so the only variable is how many distinct receivers reach the load
site, and the answer is that it does not matter.

The old probe guessed why its own singleton read 0x — *"TurboFan appears to
specialize the constant object"* — and that guess is the explanation for the
whole discrepancy. A bare loop over one object in a local has nothing the
optimizer cannot see through; the fast side can be served by a load hoisted out
of the loop while the dictionary side keeps calling into the runtime.

The probe's stated *mechanism* is wrong too. `%HaveSameMap` reports that every
normalized object in the per-row population shares one map
(`node --allow-natives-syntax bench/delete.js rowdel 262144 kinds 1 1`), so
"every dictionary-mode object gets its own map, so the site goes megamorphic" is
false: the site is not megamorphic and what costs is the dictionary lookup — the
reason one object pays as much as a quarter of a million.

The fix the rule names holds: `o.tmp = undefined` costs 1.01-1.10x on reads
(withdrawn — two of three intervals span 1.0 and they disagree) and 1.07-1.19x
to build, and `delete` measured against *that* rather than against never adding
the property still costs 12.38-12.86x.

EVIDENCE is derived from the file by `lib/derive.ts`, and `make bench-delete`
re-runs it. TC-9's delete bullet goes with it — see TC-9 below.

## TC-15 — the original entry (2026-08-14)

`EVIDENCE['delete-property']` quotes **28-67x per property load**, sourced to
"round 3b" of the product-design document — the probe appendix at the bottom of
it: an ad-hoc median-of-runs on a noisy VM, taken before `bench/driver.js`
existed. That document is gone; `bench/delete.jl` is the sweep that replaced it.

It has none of the six things every other shipped number has: fresh process per
observation, AB/BA randomization, 20 paired runs, a bootstrap interval, a
recorded rep count, a per-pair checksum. There is no `bench/delete*.jl` and
no `bench/delete*.js`, so `make bench-…` cannot re-run it and a skeptic cannot
either. The README's "every rule includes the benchmark that earned it" is
false for this rule in the same way it was false for `closed-world` before
`bench/inline.js` was written.

V8's source is *strongly* on the rule's side about the mechanism — every named
`delete` on a fast object normalizes it unconditionally
(`src/objects/lookup.cc:843`), a dictionary receiver loses inlined property
access (`src/compiler/access-info.cc:57`), and nothing in normal execution puts
it back (`src/objects/js-objects.cc:5097` is the only automatic caller of
`MigrateSlowToFast`, and it is for prototypes). See the V8 table in `README.md`.

That makes this a provenance defect, not a refutation: the mechanism is real and
the magnitude is unverified. Closing it means writing `bench/delete.js` with
both populations the old probe measured — singleton (0x, dictionary up to 10%
*faster*) and per-row over 100k objects (28-67x) — and re-deriving the EVIDENCE
string from the `.jl`. Until then the number should be read as a decorated
memory of a probe, not as this project's evidence standard. Related: TC-9,
which is about the rule firing on the singleton case regardless.

## ✅ FIXED 2026-08-15 — TC-14 — boxed-elements cannot be re-run, and its trigger is an inference

**Closed by withdrawing the rule.** Both halves of the audit below were right,
and `bench/arrays.jl` — 20 cells, 20 pairs each, every cell replicated three
times — settles which half is fatal.

**The first half: the numbers were re-derived and they moved.** A genuinely
boxed array (PACKED_ELEMENTS holding doubles, so every element is a pointer to a
HeapNumber) costs **1.39-1.66x** to read against PACKED_DOUBLE across n=256,
16384 and 262144 — nine sweeps, no rejecting interval. The published 1.45-1.89x
overstates the top. The construction claim was simply wrong: 2.36-3.28x was
quoted, and it measures 1.07-1.23x in cache and 1.58-1.69x at RAM size, where
allocating a quarter of a million HeapNumbers is the whole difference. So the
effect is real, replicates, and is *not* lost inside the 1.0-1.7x band §11 warns
about — the reads are not the problem.

**The second half is the one that kills it.** The rule fires on the declared
element type. `node --allow-natives-syntax bench/arrays.js unionnum 8 kinds 1 1`
reports `%HasDoubleElements` **true** for an array built exactly the way
`(number | string)[]` code builds one when it only ever stores numbers, and the
benchmark agrees: **0.96-1.08x** over six cells and eighteen sweeps, seventeen of
them with an interval spanning 1.0. The single sweep that excluded 1.0 read
1.08x and its own two replications read 1.00x and 0.99x.

There is no narrower trigger to retreat to, and that is why this is a withdrawal
rather than a re-derivation. What decides the representation is what gets
stored; no annotation decides that. An array that really does hold both types is
a different kernel, and "give the array one element type" is not a rewrite
available to code whose data is genuinely mixed — so the case where the fix
applies is the case where nothing is wrong.

The rule is gone from `lib/rules.ts`, TC-14 is gone from the `DEFECT` map,
`demo/lib.ts` `mixed` is a must-stay-silent fixture with a test on it, and the
effect stays published in `bench/arrays.jl` as a measured cost that ships no rule —
the same shape as TC-12. The controls reproduce as well: holey 0.93-1.06x on
reads (and faster to build, though that cell compares a preallocated array
against a grown one and measures allocation strategy too), `Float64Array`
0.97-1.10x on reads with every interval spanning 1.0 and 0.44-0.53x to build at
RAM size, where round 2 reported roughly 3x rather than 2x.

`make bench-arrays` re-runs it. The audit that found this stands below.

## TC-14 — the original entry (2026-08-14)

Two defects in one rule, both found while tracing mechanisms to V8's source.

**The benchmark is not in the repository.** `EVIDENCE['boxed-elements']` cites
"round 2, suite A" of a benchmark write-up for 1.45-1.89x on reads and
2.36-3.28x with construction. That write-up's §Results says, in full:
*"(filled in after the runs; raw observations in `bench/results.jsonl`)"*. There
is no `bench/results.jsonl`, and the kernels it names — `bench/arrays_kind.js`,
`bench/arrays_obj.js` — do not exist either. The numbers survive only as a table
in the spec. This is the project's central claim ("a rerunnable benchmark per
rule") failing for the rule with the weakest number: one sweep, unreplicated,
inside the 1.0-1.7x band this harness has twice failed to resolve. Both
documents are gone; `bench/arrays.jl` is the sweep that replaced them.

**And V8's source does not support the trigger.** The elements kind is decided
by the values actually stored — `Object::OptimalElementsKind`
(`src/objects/objects-inl.h:700`) is called per store from
`LookupIterator::PrepareForDataProperty` (`src/objects/lookup.cc:449`). The rule
fires on the *declared* element type. A `(number | string)[]` that only ever
holds numbers stays `PACKED_DOUBLE_ELEMENTS` and pays nothing, exactly as a
five-member union can reach a load site as one map. That is TC-2 in a second
rule, and the mechanism citation makes it concrete rather than theoretical.

Not fixed, and the two halves have different remedies: the first needs a
`bench/arrays.js` sweep written and run (and the rule's numbers re-derived or
withdrawn); the second is unfixable statically and belongs to a runtime half
this project does not have — one that asks V8 for the elements kind instead of
inferring it from a declared type.

Full write-up in the V8 table in `README.md`.

## TC-13 — a method in a field has no four-map budget (2026-08-14, open, proposal)

`bench/dispatch.jl` split a call site into its two halves and they do not
obey the same rule. With one shape and K different functions in the same slot
(`tgt`), the cost is **7.68–11.93x from the second function to the sixth,
flat** — no threshold anywhere. With K shapes and one shared function (`shr`)
the four-map budget is intact: 2.14–2.21x at four, 6.92–8.25x at five.

`megamorphic-dispatch` ships on five, which is right for a method on a
prototype and **late** for an object carrying its own function: `lit` costs
3.63–6.78x at two shapes and 4.34–13.02x at four, all of it below the threshold
the rule fires at.

Nothing static separates the two. `type T = { area(): number }` is satisfied by
a class instance, whose method is one function on the prototype, and by an
object literal with method shorthand, whose method is a fresh closure per
literal site. The declaration is identical and the runtime layout is opposite.

Two ways forward, neither taken:

- **Fire on a union of two object types whose common member is declared as a
  property of function type** (`area: () => number`) rather than a method
  signature. That syntax is *correlated* with an own-property closure and does
  not determine it, so it would be shipping an inference the benchmark did not
  establish.
- **Observe it at runtime.** This is what a runtime half would be for: a
  call site's targets are observable and its receiver maps are observable, and
  the two together are exactly the decomposition this sweep did by hand.

The static rule stays at five, missing the case rather than guessing at it, and
the rule's own `silent` clause says so.

**V8's source now says the same thing, independently (2026-08-14).** A call
site's feedback slot does not hold maps and has no polymorphic tier at all: it
holds one target function as a weak reference
(`src/builtins/ic-callable.tq:14`), and `CollectCallFeedback` offers exactly
three outcomes — same target, already megamorphic, or uninitialized
(`src/builtins/ic-callable.tq:107-109`). A second, different target goes
straight to the megamorphic sentinel, and the only escape is two closures
sharing one `FeedbackCell`. So the four-map budget the rule's message quotes
governs the *load* of the method, and the *call* has a budget of one. This is
the sweep's `tgt` result predicted from the engine's source, and it raises the
proposal from "measured once on this machine" to "measured, and the mechanism
is in the source". Citations in `README.md`.

## TC-12 — a 6.3x effect nothing static can detect (2026-08-14, open, proposal)

The `bench/addprop.jl` sweep found one large effect: an object whose
properties are added with a **keyed** store past `fast_properties_soft_limit`
goes to dictionary mode, and reading its fields then costs **6.17–6.34x**
(CI 5.94–6.41 and 6.14–6.57). Two controls pin it — the same field count by
named stores costs 0.92–1.05x, and twelve keyed stores cost 1.02–1.04x with the
interval spanning 1.

It is not shipped as a rule, and the owner should decide whether that stands:

- **The count is invisible.** The threshold is 16 keyed adds on a one-field
  object. A rule matching `acc[k] = v` inside a loop cannot know whether the
  loop runs twelve times or sixteen, so it would fire on the case its own
  benchmark rejected. That is TC-9 in a place where the evidence is unusually
  sharp about where the effect is not.
- **The rewrite is unmeasured.** The sweep's baseline is a single object
  literal, which is only writable when the keys are static — and when the keys
  are static nobody writes keyed stores. For the dynamic-key population the
  honest baseline is `Map`, and `Map` was not measured. Shipping the rule would
  mean naming a fix this project has not benchmarked.

Closing it needs a `Map` sweep first, and then a decision about firing on a
count that cannot be proven. `demo/lib.ts` `growByKey` is the fixture and a test
locks it silent.

## ✅ FIXED 2026-08-15 — TC-11 — one sweep's interval cannot see between two sweeps

**The audit below stands. The diagnosis under it was wrong, and it was mine.**
It said a cell whose rep count falls below some floor is not a measurement, and
proposed a floor of five repetitions with the region extended to a cap of about
1000 ms to reach it. Five and 1000 are numbers nobody measured, and a constant
nobody measured is a hypothesis, not a protocol — the same objection this project
raises against every rule it refuses to ship. A kernel that fits two passes into
the 120 ms region has been measured for 120 ms; how many passes that took is a
fact about the kernel. The floor was written into `driver.js` and reverted before
a single cell ran under it.

What the audit actually found is in the original report, mis-read there as a rep
count problem: three near-identical `addprop` constructions measured 1.64x, 0.91x
and 0.89x, every interval excluding 1.0 and no two of them able to be true
together. **The bootstrap resamples the twenty pairs of ONE sweep.** It sees what
varies between two processes and is blind to what varies between two sweeps — a
different calibration, a heap that grew differently, a machine ten minutes older.
A low rep count travels with that blind spot, because a slow cell has fewer and
larger passes and each one lands somewhere different. It is a correlate, not the
mechanism, and thresholding it would have treated the symptom.

Fixed three ways, none of them a threshold:

- `bench/driver.js` records the achieved region in milliseconds beside the rep
  count in every cell — `msBase` and `msTest` — and `bench/run.js` prints
  both with every sweep. Facts in the file, no cut-off.
- `driver.js` gains `replicate()` and `replicates()`. A cell is run **whole,
  three times**, and agreement is a value common to all three 95% intervals: a
  criterion the intervals supply rather than one this project picks.
- Protocol rule 13 (`CLAUDE.md`) is the contract, and it says in as many words
  that there is no floor on the repetition count.

**33 flagged cells, three sweeps each, 99 sweeps, `make bench-tc11`.** Every
row is appended to the sweep's own `.jl` and carries `protocol: "replicated"`,
so nothing that was published before is overwritten or hidden:

| Sweep | cells | replicate | do not |
|---|---|---|---|
| `shapes-calibrated` incl, n=262144 | 4 | 4 | — |
| `spread` incl, n=10000 | 1 | 1 | — |
| `spread-object` incl, n=500 | 2 | 2 | — |
| `strings`, n=100000 | 9 | 8 | `s += x` at construction |
| `addprop`, n=262144 and `keyed16` n=8192 | 7 | 1 | 6 |
| `dispatch` incl, n=262144 | 10 | 9 | `lit3` |

**The addprop cells are the result.** Five of six do not replicate, and the sixth
contradicts what it replaces: two divergent construction paths published 0.89x
and then measured 1.14x, 1.21x and 1.34x on three consecutive sweeps — a cell
that was on the wrong side of 1.0. Two sweeps failed the region guard outright.
Those cells were already withdrawn by hand; they are now withdrawn on evidence.

**Everything else came back, and eleven published point estimates fell outside
their own replicated range** — `bench/tc11-report.js` prints each one. The most quoted
number in the project, accumulating array spread at n=10000, replicates at
1750–2011x — so **2348x is outside the replicated range and is no longer
quoted**. `Object.assign` copying at n=500 moved *up*, from 815x to 846–875x.
The ten `dispatch` and four `shapes` cells withdrawn under the old diagnosis are
measurements again: at RAM size the five-shape step survives construction for
`cls` (1.46–1.86x against 0.93–1.20x below it) and there is no step at all for
the object-shape load sweep (1.05–1.20x flat from two shapes to five). The
`strings` read-back cells came back at 0.74–0.87x.

**No rule's verdict moved.** Every rule that shipped still ships and every
refusal still refuses; what changed is the ranges they quote and, in four places,
which cells they are allowed to quote at all. `megamorphic-elements`,
`megamorphic-dispatch` and `accumulating-spread` carry new `EVIDENCE` strings.

Still open after this: the three cells this sweep left VOID under the region
guard are void because their single repetition overshoots 240 ms, which is a
different guard (TC-5) and is not touched here. Every benchmark in
`bench/run.js` that is not marked `replicated` still runs one sweep per cell —
rule 13 binds what is published, and only the flagged cells have been re-run
under it.

The audit follows, then the original report.

## TC-11 — the audit (2026-08-14)

**Audited 2026-08-14, every cell this project has ever published.** 329 non-void
cells across ten `.jl` files. **35 ran below 20 repetitions**, and the defect
is systematic rather than scattered: it hits the largest `n` of every sweep,
because a slow kernel fills the 120 ms region with a handful of passes.

Withdrawn, because a low rep count can flip a verdict only where the effect is
small, and every one of these is small:

| Cell | reps | was | now |
|---|---|---|---|
| `shapes-calibrated` incl, n=262144, K=2..5 | 1–2 | 1.08–1.21x | withdrawn; the construction claim is now 1.25–3.52x from the L1 and L2 cells, which ran at 46–15181 |
| `strings` incl and excl, n=100000 | 7–15 | 0.79x, 1.06x | withdrawn; the read-back claim is now 0.94–0.97x |
| `addprop` build and incl, n=262144 | 5–7 | 1.64/0.91/0.89x | already withdrawn when the sweep ran |
| `dispatch` incl, n=262144, ten cells | 2–4 | 0.84–1.79x | already withdrawn when the sweep ran |

Kept, and the reason is stated rather than assumed: a cell whose effect is two
or three orders of magnitude cannot be flipped by a GC pause inside a 120 ms
region. `spread` incl n=10000 ran at **2** repetitions and measured 1877x and
2348x across two sweeps; `spread-object` incl n=500 ran at 10–15 and measured
197x and 210x; `assign-copy` ran at **4** and measured 815x. Their *direction*
and *order of magnitude* stand. Their intervals are narrower than the truth,
because the bootstrap resamples processes at a fixed rep count and cannot see
within-run variance. Anyone quoting those intervals as precision is over-reading
them, and this paragraph is the disclosure.

**Superseded 2026-08-15 by the entry above.** The proposal recorded here was a
repetition floor of 5 with the region extended to a cap of about 1000 ms, voiding
only a cell whose single repetition exceeded the cap. It was signed off, written,
and reverted before it ran: both constants were invented, and the two tables
above are wrong about which cells survive — `strings` and `dispatch` and
`shapes-calibrated` all came back, and `spread-object`'s `assign-copy` moved
*further from* 1.0 rather than closer. The disclosure paragraph about intervals
being "narrower than the truth" is the one thing here that was right, and rule 13
is what replaced it.

The original report follows.

## TC-11 — the original report (2026-08-14)

`bench/driver.js` asserts the achieved timed region lands within 2x of 120 ms.
A kernel slow enough can meet that with 4 to 7 reps, and then a single GC pause
decides the cell. The `addprop` sweep's RAM-sized construction cells are the
demonstration: three near-identical constructions measured 1.64x, 0.91x and
0.89x, every interval excluding 1.0 and no two of them able to be true
together. The bootstrap interval is over process-to-process variation at a fixed
rep count and cannot see that variance.

Those cells are withdrawn by hand in the rule's own evidence. The guard should
do it: a cell
whose rep count is below some floor is not a measurement, the same way a cell
outside the region window is not. The floor is unmeasured — picking it needs a
sweep of its own — so this is recorded rather than applied.

*(That last paragraph is the wrong diagnosis, kept as written. The sentence
after it — that the bootstrap "cannot see that variance" — is the right one, and
it is what the fix acted on.)*

## TC-10 — the walk follows calls but not constructors (2026-08-13, open)

`reach()` in `lib/scan.ts` visits `ts.isCallExpression(node)` only. A
`new Foo(...)` is a `NewExpression`, so the walk never enters the constructor
and never reports it as unreadable either.

Two consequences. A constructor in your own source is not checked, so a rule
violation inside it is missed. A constructor from a typed dependency is not
listed as an escape, so the closed-world report says the world is closed when
it is not — the failure mode the whole rule exists to prevent.

This matters more now that `allocating-select` ships: the pattern it detects is
an allocation, and allocation is what constructors do.

The fix is one predicate — accept `NewExpression` alongside `CallExpression`,
since both carry `expression` and `arguments` — plus a demo function, a test,
and a check that `usesDependency` does not double-report. Not applied: the
closed-world report is a published contract and widening what it reports
changes output for every existing user of the tool. Sign-off first.

## ✅ FIXED 2026-08-10 — TC-1 — the protocol and bench/run.js disagreed

The protocol required 10 discarded pilot pairs, 50 measured pairs, and raw
observations. `bench/run.js` runs 1 calibration process, 20 measured pairs, and
writes only per-cell aggregates to `bench/shapes.jl`.

The array sweep's write-up already declared a sanctioned reduction to 20 pairs on
wall-clock grounds, so the pair count is defensible; the 1-vs-10 pilot gap and
the missing raw observations are not. A reader cannot recompute the intervals
from what is published, which is the one thing this project claims to offer.

Found by: codex round 5. Fixed both ways: the protocol now states the sanctioned
reduction to 20 pairs and one calibration run, and requires any near-1.0 cell
to be re-run at fifty before a rule ships on it; `bench/run.js` now writes the
raw per-pair `base` and `test` arrays next to each aggregate, so the interval
is recomputable.

## ✅ FIXED 2026-08-11 — TC-5 — the driver calibrated from a cold run, and it inflated ratios

Fixed in `bench/driver.js`: `calibrate()` now iterates the probe until two
successive rep-count estimates agree within 20%, so the count is derived from
warm cost; and `cell()` asserts the achieved timed region landed within 2x of
the 120 ms target, throwing when it did not. A mis-sized cell can no longer be
published as a result. Protocol rule 3 states both.

`bench/spread.jl` was re-run under the fix and the old file kept as
`bench/spread-precal.jl`. The re-run changed the published claims: the
`excl` cells at n=1000 and n=10000 both moved to REJECTED (0.87x CI 0.67-1.05
and 1.05x CI 0.89-1.26), which withdraws the "a spread-built array reads
faster" claim entirely — it was the artifact this defect predicted. The
construction effect grew rather than shrank once both sides were sized from
warm cost. `bench/chained.jl` is kept as `bench/chained-precal.jl` and
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

The target is 120 ms (`driver.js`, protocol rule 3). The chained side got
2.4 ms. The cell reported **19.73x, CI 12.42-33.73**; sized from warm cost on
both sides it is roughly **6-11x**. The probe is not merely biased, it is
unstable — a 20x spread across five repeats decides the rep count from one
sample. The `chained-allocation` rule did not ship because of this.

`bench/spread.jl` came out of the same `calibrate()`. Accumulating spread is
quadratic so its 86x and 2343x very likely survive — but "very likely" is not
this project's standard, and its `excl` cells sit near 1.0 where this defect
bites hardest.

Not fixed inline: iterating the calibration changes the method behind every
published figure and requires re-running `spread.jl` and re-deriving both the
published tables and the shipped `EVIDENCE` strings. Proposal: iterate
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

Found by inspecting `/proc/<pid>/fd` after `ls bench/*.jl` showed no output
file for a sweep that had already printed eight cells. A 24-cell sweep that was
stopped part-way lost all twelve cells it had measured — half an hour of
machine time, gone, with the numbers visible in the log but not recorded
anywhere a tool could read.

Fixed: the runners now `fs.appendFileSync` one row per cell, so a cell is durable the moment it is
measured and an interrupted sweep keeps everything it finished.

## ✅ FIXED 2026-08-11 — TC-4 — two copies of the measurement protocol

`bench/run.js` now runs on `bench/driver.js` like every other sweep, so there
is one protocol and one place to fix it. Its own copy of `once`, `calibrate`,
`bootstrap` and `cell` is gone, and with it the single cold calibration probe
that TC-5 showed inflates ratios toward shipping a rule.

The 24 cells were re-run under the fixed driver and written to
`bench/shapes-calibrated.jl`. The two earlier sweeps stay on disk under
their own names — `shapes.jl` and `shapes-aggregates-only.jl` — because
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
that produced the published `shapes.jl`. That needs the 24-cell sweep re-run
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
- **`delete-property`** — **this bullet is withdrawn on evidence, 2026-08-15.**
  It said the rule fires on a singleton delete the project had measured at 0x.
  `bench/delete.jl` measures that exact case at 13.32-15.57x, in all nine of its
  sweeps, so `drop` is a true positive and the boundary the bullet invoked does
  not exist. See TC-15. What the rule still carries under this heading is
  narrower and was not the original complaint: the cost is per property *load*
  on the demoted object, and the rule fires on the `delete` without knowing
  whether anything reads the object afterwards.
- **`megamorphic-elements`** is TC-8, the same defect in its sharpest form.
- **`boxed-elements`** was a fourth entry here by way of TC-14 and is gone with
  the rule, 2026-08-15.

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
fire where no load site ever sees five maps. The real fix belongs to a runtime
half this project does not have — one that observes the maps instead of
inferring them.

Found by: codex round 5, which argued for downgrading or deleting the rule.

## TC-3 — no rule for functions V8 refuses to optimize (2026-08-10, open)

Measured on this machine: a function of 3455 generated statements reaches
Maglev; 3456 is never optimized at all, and stays unoptimized at 3,000,000
invocations, so it is a hard limit and not a tier-up budget artifact. Cost is
2.74x per statement across that one-statement edge (3.822 vs 10.484 ns).

No rule ships, because source statements are a poor proxy for bytecode size and
the mapping is unmeasured. `bench/optsize.js` reproduces it.
