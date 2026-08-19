# BUGS

Review queue. Found during audits, fixed only when the owner asks.

> **2026-08-17 — adversarial review.** TC-31 through TC-36 come from a hostile
> review commissioned to argue the tool is useless. Every one was re-run here
> before it was written down; the reproductions below are this repository's, not
> the reviewer's. The reviewer's verdict was "do not publish in its current
> form", and on the rules it names that verdict is defensible.

## TC-43 — `accumulating-spread` is evaded by three tokens, and no rule is inter-procedural (2026-08-17, open, proposal)

Five annotated functions, each holding the measured defect in a form one
keystroke from `bench/spread.js`'s `spread` variant. **`0 findings`, exit 0:**

- `this.acc = [...this.acc, x]` — the rule requires `ts.isIdentifier(node.left)`,
  and a property target is not an identifier.
- `xs.forEach(x => { acc = [...acc, x] })` — `walkLoops` knows five loop node
  kinds; `reduce` was hand-special-cased and `forEach` was not.
- `acc = append(acc, x)` with `append = (a, x) => [...a, x]` — **the walk enters
  `append`**, but no rule is inter-procedural, so the loop is in one body and
  the copy is in another and neither sees the other.
- `const doubled = xs.map(f); const kept = doubled.filter(g)` — the same two
  allocations `chained-allocation` measures, but `stage()` only matches a call
  whose receiver is itself a call.

The call-tree walk is the product's premise — the annotation exists so the tool
can follow calls the way `@njit` follows them — and every rule is a single-body
syntax match. Hoisting three tokens into a helper the walk already visits
silences the tool completely.

**Proposal:** either make the allocation rules inter-procedural over
`mark.reached`, which is the walk's whole point, or say plainly that rules are
single-body and the walk only widens *where* they are applied.

## TC-42 — the flagship rule cannot detect what its own benchmark measured (2026-08-17, open — half fixed 2026-08-19)

**The most serious entry in this file.** Both directions were re-run here.

`bench/shapes.js` says what it builds, in its own comment:

> Five key orders. Same three fields, same object size, five distinct maps — so
> the only thing that varies across variants is shape count.

    (x, y, z) => ({ x, y, z }),  (x, y, z) => ({ x, z, y }),  (x, y, z) => ({ y, x, z }), …

**Key order is not part of a TypeScript type.** All five builders have the type
`{ x: number; y: number; z: number }`. So the measured program has ONE
TypeScript type and FIVE V8 maps, and `megamorphic-elements` triggers on the
count of union MEMBERS — which is 1 there.

Verified with `--allow-natives-syntax` on this machine:

    five aliases of one type share one map:              true
    five discriminated-union variants share one map:     true
    five KEY ORDERS share one map:                       false

**Direction A — silent on its own kernel.** `bench/shapes.js` transliterated to
TypeScript with its construction sites intact:

    turbocharge — 1 annotated function, 0 findings
      every annotated function is clean.

**Direction B — fires where V8 has one map.** Five *aliases* of one identical
type, `type P1..P5 = { x: number; y: number }`:

    megamorphic-elements
      ps unions 5 object types; V8 caches four maps per load site …

The reviewer went further and measured the fired case with this project's own
`bench/driver.js` and `cellOrVoid`: the key-order control reproduced 10.787x at
L1 while five union members read **0.898x [0.793-1.009]** — and their
replications read 0.975 / 1.100 / 1.008 at n=256, which protocol rule 6 rejects
outright, and 0.961 / 1.139 / 1.210 at n=16384, which rule 13 withdraws. Those
cells were measured under load above the gate and are not evidence-grade; they
are recorded here as a reason to run the cell properly, not as a published
number. **The direction they point is not in doubt, because the map identity
above is not a measurement — it is what V8 reports.**

**And the printed fix is a rename.** "Get the element type to four shapes or
fewer" is satisfied by deleting `P5` and writing `P1` in its place:
`(P1|P2|P3|P4|P1)` — identical emitted JavaScript, `0 findings`, exit 0.

`megamorphic-dispatch` has the same defect in its own form: one class with five
phantom generic instantiations fires at 14.6-20.0x, and at runtime the five
instances share one map AND one call target.

This is not TC-2 ("a TypeScript union member is not a V8 map", filed as a known
imprecision) and not TC-8. TC-2 records the gap as an inference limit and says
the fix "belongs to a runtime half this project does not have". That excuse does
not survive the two commonest false-positive classes here: repeated aliases and
same-key-set discriminated unions are both killable by comparing the members'
property-name lists, which `checker` already has.

**Proposal, and it decides whether the rule ships at all:**

1. Compare member property-name lists and stay silent when they match. Kills the
   two false-positive classes above; does nothing for direction A.
2. Re-measure the cell with five variants that differ the way the RULE detects —
   different property sets — and publish that number instead. If it reads ~1.0x,
   the rule has no evidence and should be withdrawn the way `boxed-elements`
   was.
3. Withdraw the rule now and reinstate it if (2) finds an effect.

Until one of those happens the page must not print `4.4-11.5x` beside a
description of what this rule detects. **The page is corrected as of this
entry.**

**Proposal 1 shipped 2026-08-19.** `objectShapes` counts distinct property-name
sets, not union members. Five aliases of one type answer 1, so do five
discriminated-union variants over one key set, and both are demo fixtures with a
test each. The printed finding says "reaches this line as N distinct property
sets" and the fix line says a rename does not merge two shapes — the old wording
could be satisfied by deleting `P5` and writing `P1`. `megamorphic-dispatch`
counts the same way, which closes its half of this entry too.

**Proposal 2 is running.** `bench/shape-sets.js` is `bench/shapes.js` with the
five key ORDERS replaced by five key SETS — the shapes a TypeScript type can
express and this rule can see, at the same three sizes, in both modes, three
sweeps per cell. `%HaveSameMap` reports the five as five distinct maps here as
well, so the kernel and the rule finally agree about what is being counted. If
the cell reads about 1.0x the rule has no evidence and follows `boxed-elements`
out of the tool; until it lands, `EVIDENCE` still quotes the key-order sweep and
the page still points here.

## TC-41 — an example's `.after.ts` is a rewrite, and its costly axis is never swept (2026-08-17, open, proposal)

`CLAUDE.md` says `examples/` holds "a `.after.ts` carrying the fix turbocharge
printed and nothing besides". The printed `delete-property` fix is one English
sentence with two branches: "assign undefined where the key may stay present,
**or build the object without it**". `examples/estoolkit-omit.after.ts` takes
branch two as a nested loop — for each of n keys, a scan over the k omitted
ones. es-toolkit ships O(n+k); the "fix" is O(n·k).

`examples/workloads.ts:182` pins **k = 2** (`['password', 'token']`) at both
sizes. n is swept (12 and 48). **k is never swept**, and k is the only axis in
which the rewrite changes complexity — so protocol rule 12 was applied to the
axis the rewrite leaves alone.

`1.64-3.36x` is therefore what one hand-chosen reading of an English sentence is
worth at the most favourable value of the parameter that reading regresses. A
user who wrote `Object.fromEntries(Object.entries(o).filter(...))` — an equally
faithful reading — gets a number nobody measured.

**Proposal:** sweep k, and publish what happens where the rewrite loses.

## TC-40 — the published page is a highlight reel of numbers README retracts (2026-08-17, open)

README carries four qualifications it calls the honesty condition. The page
carries none of them, while printing the same ratios under a column headed
**Measured**:

| the page says | README says |
|---|---|
| `allocating-select` … 2.56-2.87x | **no instance of the measured shape in 850 functions**; all six real findings are cursor advances (TC-18) |
| `delete-property` … 12.3-23.0x | the 23.0x end is a cell whose three sweeps read 22.98 / 13.73 / 15.53 and do not replicate (TC-27) |
| `.map().filter()` … 6.48-7.51x | — and its own cell fails rule 13, see TC-37 |
| a call it cannot read … 3.21-4.95x | `closed-world` "makes no speed claim"; 92% of all findings; n=100000 does not replicate |

The page also carries **no end-to-end number at all**, while README's own table
puts the delivered result on real functions at 1.03x to 4.88x with three
rejections and one 9x regression.

**Proposal:** the page inherits the honesty conditions, or the page stops
quoting the ratios. A number is not more true for being on a nicer background.

## TC-39 — two rules measure MORE where they stay silent than where they fire (2026-08-17, open, proposal)

The page's argument for trusting the rules is: "Every rule also records where
the same benchmark found nothing, and a test fails if the rule fires there
anyway." For two of seven rules, "found nothing" is not what the benchmark
found.

- **`megamorphic-dispatch`** fires on `disp.proto.reads` = **14.6-20.0x** and
  stays silent on `disp.silent.own` = **3.5-14.8x**. The ranges overlap. The
  silent case is every shape carrying its OWN function, which the same sweep
  measured at up to 14.8x — the rule declines to report a cost the size of the
  one it exists to warn about, because no declared type separates the two.
- **`allocating-select`** fires at `select.heap` = 2.56-2.87x and is silent at
  `select.silent.local` = 2.01-2.45x, kept in a local where escape analysis
  could see it. The ranges do not overlap, but 2.45x is not "nothing".

The `silent` clauses say this in prose, and the prose is honest. The page's
summary of them is not: "where the benchmark found nothing" is false for both.

**Proposal:** the silent clause is not one thing. Split "measured and rejected"
from "measured, real, and deliberately not reported", and say which on the page.

## TC-38 — the tool passes its own fix as clean while that fix is 9x worse (2026-08-17, open)

The sharpest defect in this round, because it defeats the exit code.

    node bin/turbocharge.ts examples/remeda-merge-all.before.ts   -> exit 1, 1 finding
    node bin/turbocharge.ts examples/remeda-merge-all.after.ts    -> exit 0, clean

The `.after.ts` is the fix turbocharge itself printed. `bench/example.jl`
measures the caller's reads of the result it builds at ratio 0.106-0.123 across
all twelve sweeps — the fixed object reads **8.15-9.47x SLOWER** than the one
the defect built, because `Object.assign` in a loop leaves the object in
`[DictionaryProperties]`.

So the tool reports the strictly worse file as clean, and `CLAUDE.md` is
explicit that a gate "reads only the second" — the exit code. Anyone who applies
the advice and re-runs the checker to confirm gets a green run for a regression.

The warning exists, but only in the `fix:` line of the file that still has the
defect. It is gone at exactly the moment it becomes true.

This is the same class as TC-7 and TC-31: the text and the exit code say
different things. Unlike those, the text here is not even present.

**Not a documentation fix.** Either `delete-property`/dictionary-mode detection
has to see the object the fix produces, or the fix line has to stop being
offered where the measurement says it loses. Both change shipped output.

## TC-37 — protocol rule 13 has no code path to publication (2026-08-17, FIXED 2026-08-19)

`CLAUDE.md` gives rule 13 a paragraph: three whole sweeps per published cell,
"agreement is a value common to all three intervals … without one the cell is
**withdrawn as unreplicable**". Three near-identical constructions measuring
1.64x, 0.91x and 0.89x is the story the whole rule exists for.

`replicates()` is defined at `bench/driver.js:205`. It is imported by
`bench/run.js`, which uses it to print the word `DISAGREES` to a terminal while
a sweep runs, and by `bench/tc11-report.js`. **`lib/derive.ts` never calls it,
and until today no test did either.** Every `agg: 'range'` citation min/maxes
across sweeps with no agreement check at all.

So the rule was enforced by a human happening to re-read rows. Twelve published
cells were not re-read:

| cell | three sweeps | verdict |
|---|---|---|
| `chained.jl chained\|incl\|1000` | 7.51 / 6.58 / 6.48 | max(lo) 7.152 > min(hi) 7.057 |
| `inline.jl large\|excl\|100000` | 4.73 / 4.68 / 3.21 | max(lo) 4.282 > min(hi) 3.880 |
| `shapes-calibrated.jl 3\|incl\|16384\|L2` | 1.57 / 1.37 / 1.28 | no common value |
| `shapes-calibrated.jl 4\|incl\|16384\|L2` | 1.31 / 1.58 / 1.47 | no common value |
| plus 8 more, all listed in `test/check.test.ts` | | |

The first two are **on the published page**. `6.48-7.51x` is the
`.map().filter()` headline. And `3.21-4.95x` is worse than unreplicable: its low
end 3.21 **is the dissenting sweep's own ratio**, and its high end comes from a
different cell (n=1000) that does replicate — an advertised interval assembled
from one cell that agrees with itself and one that does not.

**Fixed in part, today:** `make test` now recomputes agreement for every
replicated cell in every re-measured file and fails on any disagreement not on
an explicit list. A new one breaks the build; a listed one that starts agreeing
also breaks it, so the list cannot rot. That makes the twelve visible and
bounded.

**Fixed 2026-08-19.** `lib/derive.ts` groups every citation's rows into cells and
calls `replicates()` on each one. A cell whose sweeps share no common value is
withdrawn from the aggregate; the count and the cell keys go into the
provenance, so a range over four cells cannot pass for a range over six. A
citation left with nothing throws, and the number cannot be published at all.

Three citations were left with nothing, and all three carried a claim:

| citation | was | now |
|---|---|---|
| `chained.mapfilter` | 6.48-7.51x, one cell, n=1000 | **1.44-1.52x**, the cell that replicates |
| `inline.reads` | 3.21-4.95x, low end from the dissenting sweep | **4.64-4.95x**, n=1000 only |
| `delete.silent.undef.build` | 0.98-1.18x | gone; the clause claims the reads and not the build |

The three withdrawn cells are still published — as refutations. A citation may
set `unreplicable: true`, which reads the withdrawn cell and quotes its three
sweeps as the three numbers they are (`6.48x and 6.58x and 7.51x`). Such a
citation throws if its cell ever starts replicating, for the same reason the
register below fails on a healed entry.

The gate counts SWEEPS, not the `protocol: 'replicated'` marker a row carries.
Reading the marker let 46 dispatch cells past it: each had one plain sweep and
two replicated ones, which is three sweeps of that cell under one runner.

`test/check.test.ts` keeps the register, over every sweep file rather than only
the cited cells, and calls the same `unreplicable()` the gate uses.

## TC-36 — `delete-property` names the wrong V8 mechanism for `delete xs[i]` (2026-08-17, open, proposal)

The rule flags every `DeleteExpression`. Its benchmark deletes a NAMED property
from an object (`bench/delete.js`, the middle property of a fixed shape), and
the finding text says "puts its object in dictionary mode".

```ts
/** @turbocharge */
export function d(xs: number[], i: number): number[] { delete xs[i]; return xs; }
```

    delete xs[i] puts its object in dictionary mode
    measured 12.3-23.0x per property load once the object is in dictionary mode …

Deleting an ARRAY ELEMENT does not put the array in dictionary mode. It makes
the elements backing store holey — a different representation, a different cost,
and a different part of V8. The number is real and belongs to the named-property
case; it is being printed about a case nobody measured.

Worse, the printed fix makes it a regression. Verified here:

    fresh array             fastProps true   double true    holey false
    after delete a[50]      fastProps true   double true    holey true
    after b[50]=undefined   fastProps true   double false   object true

The array never leaves fast properties — it goes PACKED_DOUBLE to HOLEY_DOUBLE.
And "assign undefined instead" turns PACKED_DOUBLE_ELEMENTS into
PACKED_ELEMENTS, which is the boxing `bench/arrays.jl` measured at 1.39-1.66x on
reads and over which this project WITHDREW a rule. It is also a type error on
`number[]`.

**Proposal:** narrow the trigger to a named property on a non-array receiver,
or measure the holey-elements case and give it its own number and its own text.
Either changes shipped output, so it waits for sign-off.

## TC-35 — `chained-allocation` matches method NAMES, so it fires on strings (2026-08-17, open, proposal)

The rule pairs adjacent calls whose names are in a set (`map`, `filter`,
`concat`, `slice`, …) and deliberately does not consult the receiver's type.

```ts
/** @turbocharge */
export function s(str: string): string { return str.concat("x").slice(1); }
```

    .concat() then .slice() allocates a whole array between the stages

The receiver is a `string`. No array is allocated anywhere in that expression,
and the finding says one is. The same fires on any lazy collection whose `map()`
returns `this`. This is sharper than TC-9, which is about the rule not knowing
`n`: here the rule does not know it is looking at an array at all, and
`accumulating-spread` already consults the receiver's type for exactly this
reason — the string case was measured there and found to be FASTER.

**Proposal:** check the receiver type the way `accumulating-spread` does. The
type is available; the rule declines to read it.

## TC-34 — `allocating-select` reads an object return TYPE as an allocation (2026-08-17, open, proposal)

`allocates()` asks whether the call's static return type is an object.

```ts
type P = { a: number };
function pick(a: P, b: P): P { return a; }   // allocates nothing, ever
/** @turbocharge */
export function loop(xs: P[]): P {
  let x = xs[0];
  for (const y of xs) x = pick(x, y);
  return x;
}
```

    x is replaced by pick(...), which returns a new object every pass,
    including the passes that choose the value it already held

`pick` returns its argument. There is no allocation on any pass, and the finding
asserts one on every pass. The benchmark measured `Box.min`, which runs
`new Box(...)` in its body. A return type is not an allocation site.

This compounds TC-18, which already records that the rule's six real-world
findings are all cursor advances rather than the measured shape. Between them,
the rule has no confirmed true positive on real code.

**Proposal:** require evidence of allocation in the callee's body when the body
is readable, and stay silent when it is not.

## TC-33 — `closed-world`'s trigger and its benchmark measure different things (2026-08-17, open, proposal)

The most load-bearing entry here, because this rule is **1539 of the 1672
findings** in the twelve-library survey — 92% of everything the tool has ever
said about real code.

- The rule fires when TypeScript resolves a callee to a declaration file: it has
  the signature and no body (`lib/scan.ts`, `unreadable()`).
- The benchmark measures two fully visible LOCAL functions, identical in
  behaviour, one padded with dead code past V8's `max_inlined_bytecode_size` of
  460 so the inliner refuses it (`bench/inline.js`).

Those are not the same condition. A dependency shipping a `.d.ts` says nothing
about the size of its runtime JavaScript; V8 loads and may inline that function
perfectly well. The checker cannot see the body, so it cannot know whether V8
would. Every one of those 1539 findings prints `3.21-4.95x` for a mechanism that
has not been established at the site it fired on.

README is already candid that the rule is 92% of output and that its n=100000
cell does not replicate. It is not candid that the trigger and the measurement
are different mechanisms, and the published page said "V8 cannot inline what it
cannot see", which is simply not what the benchmark shows. **That sentence is
corrected as of this entry** — a false mechanism claim in public is not a
proposal, it is a defect, and it is fixed.

**Proposal, and it is a scope decision rather than a patch:** either
(a) restate `closed-world` as coverage reporting — "here is what I could not
check" — and stop attaching a cost to it, which is what it honestly is; or
(b) keep the cost and gate it on something that actually predicts non-inlining.
(a) is what the evidence supports.

## TC-32 — the documented invocation discards the project's tsconfig (2026-08-17, open)

`lib/ts.ts` loads `tsconfig.json` only when the caller passed no input paths:

```ts
if (configPath && inputs.length === 0) { … }
```

README's own instruction is `turbocharge src`, which passes an input path, so
the documented form never reads the config. It compiles under built-in
ES2022/NodeNext options instead. Path aliases, JSX mode, `types`, `strict` and
ambient declarations can all resolve differently from the project's real build —
and every type-based rule and every call edge depends on that resolution.

README claimed turbocharge "sees the same code and types your build sees".
**That sentence is corrected as of this entry**, because it was false.

The fix is small and unambiguous: read the config's `options` whenever one is
found, and use the caller's file list when they gave one. Recorded rather than
applied only because it changes what every rule sees, which is a behaviour
change on a released tool.

## TC-31 — a call through a parameter is neither followed nor reported (2026-08-17, open)

```ts
/** @turbocharge */
export function hot(cb: (x: number) => number): number { return cb(1); }
```

    turbocharge — 1 annotated function, 0 findings
      every annotated function is clean.

`cb` has no body anywhere in the program. The walk resolves it to a parameter
declaration, which is not followable and is not in a declaration file, so it
falls through both branches: not walked, not counted as an escape, not listed.
Calls through interface methods behave the same way.

The tool's coverage promise is the thing that makes its exit code trustworthy —
"a run that could not see everything is never a pass". Here it could not see
into the call, said nothing, and exited 0. README's "every call with no readable
body is listed by name" **is corrected as of this entry.**

This is the same failure TC-7 fixed for the walk cap and TC-10 records for
constructors: the walk has a third way of stopping silently.


## TC-30 — the launch loop uses Google's V8 mark, and nobody has cleared that (2026-08-16, open, proposal)

`demo/meme/` builds the loop on the page at krons.fiu.wtf/pub/turbocharge/ from
`v8.dev/_img/v8-outline.svg` — Google's V8 logo, recoloured to the PH3 palette.
`demo/meme/recolour.py` rewrites fill and stroke attributes only; every
coordinate is upstream's, because a redrawn mark reads as a cheap imitation and
a real one reads as the real thing.

Two separate questions, and only the first is settled:

1. **Copying.** The mark is NOT committed here. `make meme` fetches it into
   `tmp/`, which is gitignored, so this repository redistributes no Google
   asset. That was the TC-29 lesson applied before the fact rather than after.
2. **Trademark, which is open.** Using someone's logo to refer to their product
   is normally nominative use, and the loop does refer to V8 — it is about what
   V8 does to code. But the loop is also promotional material for a different
   product, it is published, and the mark is altered (recoloured, shaken, struck
   by lightning). Altering a mark is the part that most often stops being
   nominative use. Nobody at Google has been asked.

**Not fixed, because there is no defect to fix — there is a decision to take,
and it is the owner's.** Three ways out, in order of how much they cost:

1. Ship as is. The tool is about V8 and says so; the loop is not passing itself
   off as a Google product; the page names the tool, not V8, in its wordmark.
2. Keep the composition and drop the mark for something generic — the cost is
   that the loop stops being instantly readable as "this is about V8", which is
   the whole reason the mark is in it.
3. Ask. Slowest, and the only answer that is not a guess.

Until then the fetch stays a build step, so the question stays visible in the
Makefile rather than buried in a committed binary.

## ✅ FIXED 2026-08-16 — TC-29 — four MIT libraries vendored without the notice MIT requires

Found in the pre-publication audit, and fixed in the same pass because the
owner asked for a release that survives one.

`examples/` holds eight files vendored verbatim from radash, remeda, es-toolkit
and zod. Every one carried its upstream copyright line, its version and the
commit it came from — and none carried the permission notice. MIT is not
satisfied by attribution: it requires that "the above copyright notice **and
this permission notice**" travel with every copy of a substantial portion of
the software. A whole function copied byte for byte is a substantial portion,
four times over.

Nothing in the repository held that text. `LICENSE` is the GPL-2.0-only body,
the eight file headers hold two lines each, and README's Licence section said
"each file carries its upstream's copyright line, version and commit" — an
accurate description of a set that was incomplete.

The failure is one an audit finds and a test cannot: the repo checks that every
published NUMBER matches its data, and had no check at all on the terms it
redistributes somebody else's code under. It was introduced with the examples
directory itself, so it has been wrong since the day the examples landed.

**Fixed**: `examples/LICENSE-MIT` reproduces the MIT permission notice in full,
with the four copyright holders, the upstream version, the source path and the
commit each function was taken at, and the files each one produced. README's
Licence section points at it and now says the examples stay under MIT rather
than the GPL, which is what is actually true of them.

Still open after this: nothing enforces it. A fifth vendored example would
reintroduce the defect silently, exactly as the first four did. The cause fix
is a check in `make test` that every `examples/*.before.ts` names an upstream
covered by `examples/LICENSE-MIT`. That is a new check and not a correction, so
it is a proposal and waits for sign-off.

## ✅ FIXED 2026-08-16 — TC-28 — four silent clauses have drifted, and that is now a pattern

The fifth rule to show it, so the pattern is the entry. `EVIDENCE.silent` is exempt
from derivation because it is an argument about where a rule must not fire, and
`lib/derive.ts` says so on purpose. The consequence is that the numbers carrying
those arguments are the only published numbers in the repo that a re-measurement
does not move — so every one of them is now quoting a sweep that no longer
exists.

| rule | the clause says | the r2 rows say | where |
|---|---|---|---|
| `megamorphic-elements` | two to four shapes cost **1.2-2.0x** on reads | **1.05-1.81x** | here |
| `allocating-select` | on numbers, **no effect at all**, 1.03x and 0.99x | **1.13-1.22x** at n=10000, no interval spanning 1 | TC-23 |
| `accumulating-spread` | strings build in 0.27-0.56x and **0.74-0.97x** read back | **0.26-0.52x** and **0.78-1.13x**, seven of nine spanning 1 | TC-26 |
| `delete-property` | undefined costs 1.01-1.10x, **two of three** intervals spanning 1 | 1.00-1.06x, **three of three** | TC-27 |
| `chained-allocation` | reading the finished array costs nothing, **0.94-1.03x** | **0.95-1.10x** | here |
| `chained-allocation` | the split chain is **1.06-1.09x**, every point estimate **under** the 1.10x a broad warning needs | **0.99-1.10x** — one point estimate is now exactly 1.10x, so "under" is false by a hundredth | here |
| `chained-allocation` | at n=100000 map-then-filter falls to **1.47x** | **1.44-1.52x** | here |

Four of the five still carry their argument: the fifth shape is still an order
of magnitude past the fourth, the string still wins at building, assigning
undefined is still the fix. One does not — `allocating-select` claims no effect
where there is now a measurable one.

**The proposal is the one TC-26 already made, generalised.** The numbers inside
a clause are not arguments and should be derived like every other number; the
sentences around them stay hand-written. That is a change to what `lib/derive.ts`
covers, so it needs sign-off, and it is the only fix that stops this recurring —
five rules in two days is the evidence that a reminder will not.

**Fixed**, with sign-off, and this entry closes TC-23, TC-26 and TC-27 with it.
`lib/derive.ts` gained one citation per figure a clause quotes — 21 of them —
and every `silent` string now interpolates `N[…]` exactly as `cost` and `source`
already did. The sentences stay hand-written; not one figure is. `make numbers`
moves them with their rows and `make test` fails when a clause and its data
disagree, which is the same guarantee the rest of the repo has had all along.

Four clauses changed what they claim, not only what they quote:

- `allocating-select` said "no effect at all, both intervals spanning 1" on
  numbers. It now says the effect is small and **changes sign with the working
  set** — above 1 at n=10000, below it at n=100000 — and says the old sentence
  was wrong (TC-23).
- `accumulating-spread` said all three string forms "BEAT the rewrite". They
  beat it at building; once the caller reads the result back most of the
  intervals span 1.0, so the clause now says the two are **indistinguishable**
  there rather than the string winning (TC-26).
- `delete-property` improved: **three** of three intervals span 1 on reads, not
  two (TC-27).
- `chained-allocation`'s split chain now reads "at the 1.10x a broad warning
  needs rather than clear of it — the margin is one hundredth", because one
  point estimate landed exactly on the threshold.

Two comments in `lib/rules.ts` that repeated measurements in prose were cut to
name their citation keys instead. A comment quoting a number is a copy nothing
checks, which is how three of these drifted.

Still open: `bench/dispatch.jl` is the one sweep not yet whole under r2, so the
three dispatch clauses read the older rows and README says so on every line that
quotes them.

## ✅ FIXED 2026-08-16 — TC-27 — delete's silent clause drifts, and one published cell stops replicating

Fixed by the derivation in TC-28. The clause's numbers now come from the rows.
The second half of this entry stands and is not a defect: `delete.rows` keeps
the 23.0x end that comes from a cell whose three sweeps disagree, deliberately,
because a range that drops its worst-behaved cell reads tighter than the
measurement was. README's honest-limits section says which cell it is.


`bench/delete.jl` re-measured whole under r2: 16 cells, 48 rows, 3 void.

The clause `delete-property` ships, hand-typed:

> assigning undefined instead of deleting is the fix and not the defect — it
> costs **1.01-1.10x** on reads with **two of three intervals spanning 1**, and
> **1.07-1.19x** to build

| cell | published | three replications | intervals |
|---|---|---|---|
| `rowundef/rowbase` excl n=16384 | 1.01-1.10x | 1.06x 1.00x 1.03x | span 0.96-1.12 |
| `rowundef/rowbase` incl n=16384 | 1.07-1.19x | 0.98x 1.05x 1.18x | span 0.92-1.22, **no common value** |

The clause's *argument* survives and gets stronger: on reads it is now **three**
of three intervals spanning 1, not two, so "the fix and not the defect" is
better supported than when it was written. The build half is the problem — its
three sweeps do not agree, so `1.07-1.19x` is a number quoted from a cell rule
13 would withdraw.

**And a published range moved onto a cell that does not replicate.**
`delete.rows` — which README quotes and every `delete-property` finding prints —
goes 12.6-17.1x to **12.3-23.0x**, and the 23.0x end is the first sweep of
`rowdel/rowbase excl n=262144`, whose three sweeps read 22.98x, 13.73x, 15.53x
with no value common to their intervals. The other five delete cells behind
published numbers all replicate; this one is the RAM-sized read, the same
position in its sweep as every other cell that has failed replication so far.

Left in the range rather than dropped, and said out loud in README's honest
limits, because a range that excludes its worst-behaved cell reads tighter than
the measurement was.

**Not fixed**, same reason as TC-23 and TC-26: `EVIDENCE.silent` is an argument,
not a derivation, and rewriting it is a judgement about a shipped rule's scope.

## ✅ FIXED 2026-08-16 — TC-26 — the strings clause's read-back half no longer says what it says

Fixed by the derivation in TC-28, taking proposal 2 and the substance of
proposal 1 together: both ranges are derived, and the read-back sentence now
says the string and the rewrite are indistinguishable rather than the string
winning.


`accumulating-spread` ships this, hand-typed:

> a STRING is not this rule at any n — `s = s + x`, `s += x` and
> `s = s.concat(x)` build in **0.27-0.56x** of a push-and-join and **0.74-0.97x**
> of it once the read back is counted, so **all three BEAT the rewrite**

`bench/strings.jl` is now re-measured whole under the r2 runner: 27 cells, three
sweeps each, 81 rows, no voids.

| half | published | re-measured | verdict |
|---|---|---|---|
| build only | 0.27-0.56x | **0.26-0.52x** | holds, and tightens |
| with the read back | 0.74-0.97x | **0.78-1.13x** | **does not hold** |

The build half is the rule's actual argument and it got *stronger*: every one of
the nine build cells is far below 1, from 0.26x at n=1000 to 0.52x at n=100000,
and eight of the nine replicate.

The read-back half is the problem, and not because the range moved. **Seven of
its nine cells now have an interval that spans 1.0**, which by protocol rule 6
is a rejection — no measurable difference in either direction. Only
`plus incl n=100000` (0.76-0.92) and `concat incl n=100000` (0.76-0.86) clear
it. And the top of the new range, 1.13x, is a sweep in which the string form was
*slower*: `plus incl n=1000` measured 0.98x, 1.13x, 0.99x.

So "all three BEAT the rewrite" is true of building and is not true once the
caller reads the result back, where at n=1000 and n=10000 the two are
indistinguishable. The clause states as a measured fact something six of its own
cells now refuse.

**Not fixed**, on the TC-23 precedent: `EVIDENCE.silent` is prose making an
argument about where a rule must stay quiet, `lib/derive.ts` deliberately
exempts it from derivation, and rewriting it is a judgement about a shipped
rule's scope. Two proposals:

1. Replace the read-back sentence with what the rows say — indistinguishable at
   n=1000 and n=10000, 0.76-0.92x only at n=100000 — and keep the build half,
   which carries the rule's silence on its own.
2. Derive both ranges instead, the way every other published number is derived.
   The clause is exempt because it is an argument; the numbers *inside* it are
   not arguments, and these two have now drifted from their rows twice.

The rule's behaviour does not change either way: it stays silent on strings, and
the build half is why.

## TC-25 — a row's `load1` cannot be compared to the `maxLoad` beside it (2026-08-15, open)

Every row the runner writes carries both `env.maxLoad`, the gate it declared,
and `load1`, the one-minute average read as that row was written. They sit two
fields apart and they are not the same kind of number, and nothing says so.

`load1` is read AFTER the cell's forty pinned observations and after the tier
diagnostic's four traced processes, so by then **the runner is most of its own
reading**. On this two-core machine the measured child holds a core for the
whole cell and the diagnostic runs unpinned on top of it, which puts something
near 2.0 into the average before any other tenant is counted. Every row of the
re-measurement therefore reports a `load1` above the gate of 1 that let it
start, including the rows written on the quietest stretch the machine offered:
`inline` starts at 0.83 and ends at 2.09 across three sweeps of the same cell,
with nothing else on the machine changing.

The gate reading — `env.loadStart`, and the per-cell check — is the clean one,
because it is taken when the runner is idle. `load1` is still worth recording:
its SPREAD across a file's rows is where an outside process announces itself,
and `shapes` at 1.50-4.75 against `inline` at 0.83-2.09 is exactly that signal.
It is the comparison to `maxLoad` that is meaningless.

Cost of getting this wrong: the first pass of this session's coverage tooling
counted "rows written above the gate" and reported every row of every clean
sweep as contaminated.

Not fixed. Two candidate fixes and they are not equivalent: name the field so it
cannot be read as the machine's idle load (`load1AfterCell`), or record the gate
reading of the NEXT cell as this row's clean-load-after, which costs nothing
because the gate reads it anyway.

## TC-24 — eighteen `select` rows predate the field they should carry (2026-08-15, open)

`bench/select.jl` holds 18 rows marked `runner: r2` that were written while the
runner was still being built, before `load1` moved out of `env` and onto the
row. They carry `env.load1` — one number for the whole sweep — where every row
written since carries its own.

They are not from a different protocol: three whole sweeps per cell, the same
gate, the same driver, the same twenty pairs. `lib/derive.ts` reads them as
current rows and is right to. What is missing is one provenance field on
eighteen of them, which makes `select` the one sweep whose rows cannot be
compared to another sweep's on when they were written.

Two ways to close it, and the cheap one is not obviously worse: re-run the six
cells under `--force`, which appends 18 rows carrying the field and leaves the
old 18 as history in the same file, or leave them and let this entry be the
record. Re-running was ranked below every sweep still on pre-`r2` rows, because
those are the numbers the exercise exists to move, and the machine did not offer
enough quiet time to reach both.

## ✅ FIXED 2026-08-16 — TC-23 — re-measuring select contradicts its own silent clause

Fixed by the derivation in TC-28, taking proposal 1. The rule still stays out of
the number case — it is about allocation, and `Math.min` allocates nothing — but
the clause now says so on the honest margin and records that it used to claim
"no effect at all".


`allocating-select` ships this, hand-typed:

> on numbers there is no effect at all — **1.03x and 0.99x, both intervals
> spanning 1** — because Math.min allocates nothing; and escape analysis does not
> rescue the boxed form either: kept in a local the same loop still costs
> **1.72-2.28x**

Both numbers are from single sweeps. Re-measured through the new runner — three
whole sweeps per cell, under the load gate, every cell replicating:

| cell | published | three replications | intervals |
|---|---|---|---|
| number n=10000 | 1.03x | **1.13x 1.21x 1.22x** | 1.06-1.21, 1.13-1.30, 1.15-1.30 |
| number n=100000 | 0.99x | 0.88x 0.94x 1.00x | 0.84-0.92, 0.88-0.98, 0.90-1.10 |
| local n=10000 | 2.28x | 2.45x 2.36x 2.40x | — |
| local n=100000 | 1.72x | 2.13x 2.02x 2.01x | — |

"No effect at all, both intervals spanning 1" is not what the data says any
more. At n=10000 **not one of the three intervals spans 1**, the point estimates
are 1.13-1.22x, and every lower bound clears 1.05 — which is the bar protocol
rule 6 sets for a broad warning. At n=100000 the effect reverses to 0.88-1.00x.
So the honest reading is not "no effect" but "an effect that changes sign with
the working set", and that is a different sentence with a different consequence
for where the rule should fire.

`1.72-2.28x` for the local case is now `2.01-2.45x`.

Why the drift, and it is not mysterious: these were one sweep each, and rule 13
exists because one sweep cannot see what varies between two. The old rows also
predate the load gate and carry no record of what the machine was doing.

**Not fixed.** The derived numbers were re-derived by `make numbers`, which is
mechanical. This clause is prose making an argument about where a rule must stay
quiet, `lib/derive.ts` deliberately exempts it from derivation, and changing it
is a judgement about a shipped rule's scope. Two proposals:

1. Rewrite the clause to what the rows say, and decide whether an effect of
   1.13-1.22x at L1 that reverses at RAM is still a case the rule stays silent
   in. It probably is — the rule is about *allocation*, and the number case
   allocates nothing — but the sentence has to stop claiming a measurement it no
   longer has.
2. Derive it. Every number in `silent` could come from `lib/derive.ts` the way
   `cost` does, leaving only the argument hand-written. That is the change that
   stops this recurring, and it is bigger than this entry.

## TC-22 — three workloads still dispatch on the variant string inside the timed region (2026-08-15, open)

The repo has a rule about this — *"Never dispatch on a variant string inside a
timed loop. Resolve the kernel to a function once, before timing. A `switch` in
a timed region produced a wrong result here."* It was written after `chained.js`
was caught, and `chained`, `arrays`, `dispatch`, `addprop`, `delete` and
`strings` were all converted to a `BUILD` table with the comment *"One function
per variant, resolved ONCE below"*. Three were not:

| workload | where | how often, per repetition |
|---|---|---|
| `select.js` | `scanHeap`, `scanNumber` | once |
| `select.js` | `minOf`, called 32× by `scanLocal` | **32 times** |
| `spread.js` | `build()` | once |
| `spread-object.js` | `build()` | once |

`select.js` resolves the *mode* to a function once, on line 112, which is
probably why nobody noticed the *variant* never was.

The cost of one string compare against a `BUCKETS`-sized loop is small and this
is not a claim that any number is wrong. What it is: an untaken branch sitting
inside every kernel V8 optimizes, which is one of the two candidate explanations
for TC-21's deopt storm and the cheaper of the two to eliminate.

Not fixed, because fixing it changes measured code and every cell in
`select.jl`, `spread.jl` and `spread-object.jl` would have to be re-measured to
stay comparable.

## TC-21 — nobody had checked which tier the measured code was in (2026-08-15, open, proposal)

**The assumption held, and it held for the reason that had been guessed at.**
`bench/tiers.js` re-ran all 280 published cell shapes under `--trace-opt
--trace-deopt`, at the rep count each cell was published at, with the region
boundaries marked. Of 1590 function-sides observed running inside a timed
region, **1287 were on TurboFan when the stopwatch started**. OSR is what does
it: the warmup passes are far too few to reach `invocation_count_for_turbofan`,
but the inner loop is hot on the first pass and V8 OSR-compiles it there. A cell
sized at two repetitions is still measuring optimized code.

Two facts that belong next to that, because they were assumed and are not true:

- **Maglev is off.** This Node reports `--maglev` as `default: --no-maglev`, so
  the tier ladder here is Ignition → Sparkplug → TurboFan and every number in
  this repo was measured with one of V8's two optimizing tiers switched off.
  Where a reader will see it: README's honest limits, next to the Node and V8
  versions. **This bullet first said that `invocation_count_for_maglev` was
  "cited in README's V8 table and verified by `make v8-check`". It is not, and
  never was** — `git log -S maglev -- README.md` is empty, and the V8 table
  cites seven mechanisms, none of them a tier-up budget. The fact about the
  machine was right; the claim about where it was published was invented.
- **Sparkplug is invisible.** `--trace-opt` traces the optimizing tiers only. A
  function this diagnostic calls `none` was in Ignition or in Sparkplug and the
  diagnostic cannot say which.

**And the diagnostic is noisy, which is why it says so.** Each side is traced
twice; **101 of the 280 cells** had at least one function whose token differed
between the two traces of the *same side*. Concurrent compilation landing before
or after a boundary is a race with the machine, and this machine was not quiet.
Those names go in `tierUnstable` and are excluded from `tierMismatch` — a race
reported as a finding is how a diagnostic starts inventing rules. The aggregate
above is far more solid than any single cell in it, and every per-cell claim
below was re-run by hand.

### What is NOT clean

**Four cells enter their region at different tiers on the two sides.** These are
ratios that are partly measuring tiering:

| cell | reps | ratio | what differs |
|---|---|---|---|
| `spread` incl n=10000 spread/push | 3616/2 | 1749.89x | baseline's `build` marked and not yet installed; variant's is `TF/osr` |
| `dispatch` excl n=16384 cls3/cls1 | 7206/5078 | 1.32x | `step` TF on the baseline, never optimized on the variant |
| `example` incl n=48 estoolkit-omit | 570/175 | 3.25x | `omit` TF on the `after` side, never optimized on the `before` side |
| `example` incl n=16 zod-clean-enum | 467/404 | 0.91x | `cleanEnum` TF on `after`, none on `before` — **and unstable between two traces of the same side**, so this one may be a race and not a fact |

Every one of them penalises the side that would make the printed ratio *larger*,
which is the uncomfortable direction. The spread cell is 1750x and a few percent
of tiering does not touch it. The other three are between 0.91x and 3.25x, where
it could matter, and none of them is a number `lib/derive.ts` publishes.

**Nine cells run a deoptimization storm inside the timed region, and in eight of
them the two sides storm differently.** This is the larger finding:

| cell | reps | ratio | deopts in region, base / test |
|---|---|---|---|
| `strings` build n=100000 plus/joined | 19/41 | 0.46x | **19 / 0** |
| `strings` build n=100000 pluseq/joined | 22/29 | 0.54x | **30 / 0** |
| `strings` build n=100000 concat/joined | 23/41 | 0.54x | **23 / 0** |
| `strings` incl n=100000 plus/joined | 8/9 | 0.80x | **15 / 0** |
| `strings` incl n=100000 pluseq/joined | 7/9 | 0.81x | **12 / 0** |
| `strings` incl n=100000 concat/joined | 7/8 | 0.76x | **7 / 0** |
| `select` heap n=100000 | 468/156 | 2.73x | **66 / 135** |
| `select` number n=100000 | 578/572 | 0.99x | 101 / 66 |
| `chained` incl n=10000 splitjoin/packed | 68/82 | 1.06x | **68 / 0**, and the baseline was `TF` in one trace and a 68-deopt storm in the other |

All of them are at the largest `n` of their sweep — the same cells TC-11's audit
flagged for low repetition counts, found again by a completely different probe.
The deopts are one reason, repeated: *"Insufficient type feedback for compare
operation"*. Two candidate mechanisms, neither established here:

1. Feedback-vector flushing under GC. Every one of these cells allocates hard at
   the largest `n`, and a flushed vector is exactly "insufficient type feedback".
2. The untaken variant branch inside the kernel — TC-22.

### Which published claims sit on these

- **`allocating-select`, and it survives.** `select.heap` publishes **2.65-2.73x**
  and README quotes it. The 2.73x end is the storming cell. The 2.65x end,
  n=10000, is **completely clean** — every function TurboFan at the gun, no
  deopt, no mismatch — and the two agree to within 3%. The claim rests on a clean
  cell and is corroborated by a dirty one, which is the right way round. The
  published *interval* for n=100000 (`select.heap.ci100k`) is measured on the
  storming cell and should be read as such.
- **`accumulating-spread`'s silent clause on strings** — and this bullet had it
  wrong twice, corrected here against the rows rather than left standing. It is
  `accumulating-spread` that publishes "0.27-0.56x ... and 0.74-0.97x once the
  read back is counted", not `accumulating-select`. And the storming n=100000
  cells do not make the upper end of *both* ranges:

  | range | its low end | its high end | which end is the storming cell |
  |---|---|---|---|
  | build, 0.27-0.56x | 0.27x pluseq n=1000 | 0.56x plus n=100000 | the **high** end |
  | with the read back, 0.74-0.97x | 0.74x pluseq n=100000 | 0.97x plus n=10000 | the **low** end |

  Which reverses the sentence that followed it. The claim is that a string beats
  the rewrite — a ratio below 1, and the further below the stronger. For the
  build range the storming cells sit at 0.40-0.56x against 0.27-0.38x on the
  clean ones, so the contamination pushes *against* the claim, not toward it.
  Only in the read-back range does it push the way the claim wants. Either way
  the direction survives: every clean cell of both ranges is below 1.
- **Nothing else.** `chained` splitjoin/packed and `select number` are not in any
  `lib/derive.ts` citation beyond the cell counts.

### The proposal, not shipped

1. **Warm to a stated invocation count and record what was achieved.** The
   workloads warm 3 flat passes, or `max(4, 2e6/n)` in the newer four, and
   neither number was measured — they are TC-11's rejected repetition floor
   wearing a different hat. The fix is not a bigger constant. It is to warm
   until the kernel is observed optimized, and to record the count it took in
   the row next to `repsBase`/`repsTest`, the way the tier is now recorded. A
   fact, not a threshold.
2. **A deopt inside the timed region is a property of the cell and belongs in
   the row.** The runner records `deoptBase`/`deoptTest` today. Whether an
   asymmetric storm should *void* a cell is a protocol change and is exactly the
   kind of threshold this project has been wrong about twice.
3. **Re-measure the nine storming cells and the four mismatched ones** and see
   whether anything moves. Started here; blocked on a quiet machine.

Recorded rather than acted on: 1 and 2 change the measurement protocol, and
CLAUDE.md says a redesign gets signed off before it ships.

### Proposal 2 answered on evidence: an asymmetric storm must NOT void a cell

The re-measurement records `deoptBase`/`deoptTest` on every row, so a storming
cell is now three observations of the storm next to three observations of the
ratio. That is the comparison the question needed and nobody had.

| cell | three ratios | common value? | in-region deopts, base / test |
|---|---|---|---|
| `select` heap n=100000 | 2.56x 2.87x 2.65x | **yes**, 2.30-3.09 | 53/66, 41/66, **47/41** |
| `select` number n=100000 | 0.88x 0.94x 1.00x | **yes**, 0.84-1.10 | 101/47, 81/66, **101/101** |
| `strings` concat build n=100000 | 0.49x 0.52x 0.51x | **yes**, 0.41-0.57 | 8/0, 8/0, **21/0** |
| `strings` plus build n=100000 | 0.52x 0.50x 0.48x | **yes**, 0.41-0.57 | 8/0, **22/0**, 8/0 |
| `strings` pluseq build n=100000 | 0.52x 0.50x 0.51x | **yes**, 0.48-0.55 | 8/0, 8/0, 8/0 |
| `strings` concat incl n=100000 | 0.80x 0.82x 0.81x | **yes**, 0.76-0.86 | 8/0, **0/0**, 8/0 |
| `strings` plus incl n=100000 | 0.79x 0.81x 0.83x | **yes**, 0.76-0.92 | 8/0, 7/0, 7/0 |
| `strings` pluseq incl n=100000 | 0.80x 0.78x 0.90x | **yes**, 0.76-1.04 | 7/0, 7/0, 8/0 |
| `inline` excl n=100000 | 4.73x 4.68x 3.21x | **no** | **0/0, 0/0, 0/0** |
| `strings` pluseq build n=1000 | 0.27x 0.27x 0.31x | **no** | **0/0, 0/0, 0/0** |
| `strings` concat excl n=1000 | 1.02x 0.98x 1.08x | **no** | **0/0, 0/0, 0/0** |

Read the two columns against each other. In `select number` the asymmetry runs
from 101-against-47 to 101-against-101 — it *disappears* between sweeps — and
the ratio does not move out of a common interval. In `select heap` the side that
storms harder changes between sweeps, and the ratio does not care.

`strings concat incl n=100000` is the cleanest instance in the table: the storm
is 8 deopts against 0, then **none at all**, then 8 against 0, and the three
ratios are 0.80x, 0.82x, 0.81x. The contamination was removed and the number did
not move. `plus build n=100000` runs the same experiment the other way, 8 to 22
and back to 8 against a silent baseline, for 0.52x, 0.50x, 0.48x. The storm
varies far more between sweeps than the number it is supposed to be corrupting.

And **every cell in the re-measurement that failed to replicate has no deopt at
all**, on either side, in any of its sweeps — three of them now, from two
different sweeps. Eight storming cells, eight that replicate; three cells that
do not replicate, zero deopts between them. A void rule keyed on asymmetric
storms would have thrown away eight cells that replicate and kept all three that
do not. That is not a filter, it is noise with a threshold on it.

Three further reasons, none of which needed the data:

- **The storm is never observed in the process whose timing is published.** The
  counts come from `bench/tiers.js`, which runs the same shape again under
  `--trace-opt --trace-deopt`, because protocol rule 8 keeps tracing out of a
  measured process. So voiding a measurement on a storm means voiding it on a
  replica's behaviour — and that replica disagreed with *itself* on 101 of 280
  cells, which is the number recorded above.
- **`void` already means something else.** It means the timed region missed
  60-240 ms: the cell measured a different quantity than it was asked for. A
  deopt inside the region is not a different measurement, it is part of what the
  pattern costs at that size, and deleting it would publish a cost with the
  expensive part removed.
- **There is no threshold to pick.** How many deopts, and how lopsided? Every
  answer is a constant nobody measured, which is the objection this project
  raises against every rule it refuses, and the mistake TC-11 already made once
  with a repetition floor.

**So: recorded, never voided.** The row carries the counts and their phase; rule
13 is the instrument that decides whether a storm mattered, because a storm that
changes the answer shows up as three sweeps that disagree, and a storm that does
not change the answer was never a defect in the measurement. Proposals 1 and 3
stand.

## TC-20 — a development row reached a published `.jl` (2026-08-15, fixed)

While the runner was being built, `node bench/run.js spread --max-load=99` was
run to check that a flag parsed, on a machine at load 1.91, and it appended a
real measured row to `bench/spread.jl`. `spread.array.reads` picks every
`spread`/`excl` row in that file, so a number README publishes would have moved
because of a row measured to test an argument parser.

Reverted with `git checkout` before anything was derived from it. The fix is
`--scratch`, which sends a run to `bench/scratch.jl` — gitignored, and read by
nothing. The never-overwrite rule protects published sweeps from being replaced;
it had nothing to say about a published file gaining a row that was never a
sweep, and now the runner does.

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
