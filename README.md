# turbocharge

Mark a TypeScript function. Get the lines in it, and in everything it calls,
that stop V8 from optimising your code — with the measurement behind each one
and the fix.

## Use it

Mark the function you need fast:

```ts
/** @turbocharge */
export function total(rows: Row[]): number { … }
```

Point it at your sources:

```sh
turbocharge src
```

## Configure it

Two optional layers turn a rule off. Neither is required — with no config and
no overrides, turbocharge behaves exactly as above.

**A TOML config**, the first CLI positional, named by its `.toml` suffix:

```sh
turbocharge turbocharge.toml src
```

```toml
[rules]
"megamorphic-elements" = false
"TC-9" = false
```

**A per-function override**, in the same comment as the promise:

```ts
/** @turbocharge -megamorphic-elements */
export function total(rows: Row[]): number { … }

/** @turbocharge -TC-8 -TC-9 */
export function other(rows: Row[]): number { … }
```

which disables those rules for that function and everything its walk reaches,
and nowhere else.

Both layers accept two forms of key: a rule name (`megamorphic-elements`)
disables that rule; a defect code (`TC-9`) disables every rule that carries it
— see the `known defect` line under a finding, or `BUGS.md`, for what a code
names. An unknown name or code fails loudly with exit `2`, the same as a
missing path. Suppression is never silent: the report always says how many
findings were removed and by what, e.g.
`3 findings suppressed (TC-9, megamorphic-elements)` — a clean run that is
clean because rules were switched off says so.

## What you get

```
turbocharge — 37 annotated functions, 14 findings

  demo/lib.ts:116  viaCallee()
    delete-property
      demo/lib.ts:111
      delete o[k] puts its object in dictionary mode
      measured 12.6-17.1x per property load once the object is in dictionary mode … [bench/delete.jl]
      fix: assign undefined where the key may stay present, or build the object without it —
      the rebuild helps at 12 keys and not at 48, where filling it key by key normalizes it too
      known defect: TC-9 — rules fire outside the conditions their own evidence establishes
```

Four things, and the second is the point:

- **the line**, `demo/lib.ts:111` — which is inside `dropInner`, a function
  nobody annotated. `viaCallee` has the annotation; turbocharge followed the
  call and reported where the cost actually is.
- **the measurement**, so you can judge whether it is worth your time, and
  re-run it yourself with `make bench-*`.
- **the fix**, concretely, not "consider optimising" — and where the fix itself
  stops paying, wherever applying it to somebody else's function found a limit.
- **what it could not check** — every call with no readable body is listed by
  name, and a walk that hits its limit prints `WALK TRUNCATED`, exits `1`, and
  is never reported as clean.

Exit codes: `0` clean, `1` turbocharge has something to report, `2` the tool
itself failed. A path that does not exist is a `2`, never a clean run — and a
walk that hit its limit is a `1` with no findings in it, because a run that
proves nothing about part of your call tree is not a clean run either.

## Requirements

Node `>=22.18`, which strips types itself, so there is no build step.
TypeScript `>=5.0.0` as a peer dependency — turbocharge loads *your* copy, so it
sees the same code and types your build sees.

## Why this exists

V8 already optimises your code well. But a short list of ordinary-looking
patterns quietly turns those optimisations off, and nothing warns you. This is
that list, measured.

*Where the idea came from:* Numba's `@njit` marks one Python function and pulls
in its whole call tree. It compiles that tree or stops with a line and a reason.
turbocharge borrows the annotation and the call-tree walk. The jobs differ:
CPython does not JIT, so Numba must compile; V8 does, so turbocharge only tells
you where your code blocks it.

## The rules

Seven rules ship. The first six check every function in the call tree. The
seventh reports where the walk stops. Megamorphic means one code location has
seen many object shapes. Quadratic means the work grows with the square of the
input size.

| Rule | What it looks for | Where the measurement found no effect |
|---|---|---|
| `megamorphic-elements` | the fifth object shape at a load site | two to four shapes |
| `megamorphic-dispatch` | `x.step()` where `x` is one of five object types | two to four types, for a method on a class |
| `accumulating-spread` | `[...acc, v]`, `{ ...acc, k: v }`, `acc.concat(v)` or `Object.assign({}, acc, …)` in a loop — quadratic | no loop re-runs the copy; `Object.assign(acc, …)`, which mutates; strings, which V8 appends to instead of copying |
| `chained-allocation` | `.map().filter()` or `Object.entries(o).map()` allocates between stages | one stage; large n; `Object.keys(o).map()`, `.sort()`, `.split().map().join()` |
| `allocating-select` | `x = Lib.min(x, y)` in a loop returns a new object every pass | the same loop on numbers |
| `delete-property` | `delete` demotes an object to dictionary mode | assigning `undefined` instead, which costs 1.01-1.10x |
| `closed-world` | calls to code with no readable body | a callee small enough to inline costs nothing |

**Every rule includes the benchmark that earned it, and the case where the same
benchmark found nothing.** `closed-world` measures the mechanism a call boundary
controls: a callee V8 refuses to inline costs 4.42-4.79x in a hot loop. Read
that as a bound on what one unchecked call can cost, not a claim about any
particular one.
If a rule fires in a case a test declares silent, `make test` fails.
Measurements have blocked a rule or a rule's extension from shipping seven times.
Two went further and took something away from a rule that was already shipping.
`accumulating-spread` matched `.concat()` by name, so it reported `s = s.concat(x)`
on a string as a quadratic array copy. Measured, appending to a string is
*faster* than the rewrite the tool was demanding — `make bench-strings`.
And `boxed-elements` was withdrawn outright: a boxed array really does cost
1.39-1.66x to read, but the rule fired on the *declared* element type, and V8
picks the representation from the values actually stored. A `(number | string)[]`
holding only numbers is the same array `number[]` builds — 0.96-1.08x, with
seventeen of eighteen intervals spanning 1.0 — and nothing static separates the
array that will hold a string from the one that will not. `make bench-arrays`.

The seventh of those blocks is the most repeated claim in V8 folklore, and it is
the reason there is no rule about it here. Adding a property after you build the object —
`const o = { a: 1 }; o.b = 2;` — is supposed to cost you a second hidden class.
V8's own debug output says otherwise: every object built the same way ends at
the *same* hidden class, so the code that reads them sees one, not two. Measured
against writing both properties at once, it costs 1.21–1.34x, inside the band
this harness has twice failed to reproduce. An optional property is no worse,
and is *cheaper* to build. `make bench-addprop`.

**Read the third column as a limit on the evidence, not as a promise about the
code.** No rule checks the condition in its own third column at runtime. The
chaining rule cannot see how big your array is. The `delete` rule fires on a
delete without knowing whether anything reads the object afterwards, and its
cost is *per read*. This is a real weakness and it is written up as TC-9 in
`BUGS.md`, along with TC-8, where the main rule fires without checking that your
code loads a property at all.

**One entry left that column by being wrong.** Until 2026-08-15 the `delete` row
read "a single delete on one object", published since the first round as a case
this project had refuted — 0x, with dictionary mode up to 10% *faster*.
Re-measured against a kernel that has to load the object on every pass, one
object with one delete costs **13.3-15.6x**, in all nine of its sweeps, more
consistently than a hundred thousand objects do. The old probe's fast side could
be served by a load hoisted out of its loop; the dictionary side could not. The
exception is withdrawn and the rule is right to fire there — a refutation has to
be refutable too. `make bench-delete`.

## Evidence

```sh
make bench                # the 24-cell object-shape sweep
make bench-spread         # accumulating spread, array form
make bench-spread-object  # accumulating spread, object form
make bench-strings        # string building — the refutation, not a rule
make bench-select         # choosing between two boxed values
make bench-chained        # chained array passes
make bench-inline         # the inlining boundary behind closed-world
make bench-addprop        # adding a property after construction — a refutation
make bench-dispatch       # calling a method on five object types
make bench-delete         # delete, on many objects and on exactly one
make bench-arrays         # elements kinds — the sweep that withdrew a rule
make example              # four shipped library functions, before and after
make v8-check             # every V8 citation, against the pinned checkout
```

**Every number this project publishes, and the rows it is.** `make numbers`
writes the table below, and the `EVIDENCE` strings the tool prints, straight
from the `.jl` files. Nothing here is typed twice, and `make test` fails when a
published number is no longer what its rows say.

<!-- generated: numbers -->

| Number | The rows it is |
|---|---|
| `3.6-10.6x` | `bench/shapes-calibrated.jl` — five shapes, reads only, L1 through RAM |
| `1.25-3.52x` | `bench/shapes-calibrated.jl` — construction counted, L1 and L2, two to five shapes |
| `1.05-1.20x` | `bench/shapes-calibrated.jl` — construction counted at RAM size, the four replicated cells only |
| `24` | `bench/shapes-calibrated.jl` — the whole sweep |
| `14.6-20.0x` | `bench/dispatch.jl` — a method on a prototype, five and six shapes, reads only |
| `1.56x` | `bench/dispatch.jl` — a method on a prototype, four shapes, reads only at L1 |
| `19.37x` | `bench/dispatch.jl` — a method on a prototype, five shapes, reads only at L1 |
| `6.9-8.2x` | `bench/dispatch.jl` — one shared function held as an own property, five and six shapes, reads only |
| `1.9-5.5x` | `bench/dispatch.jl` — five shapes with construction counted, prototype and own-property, L1 and L2 |
| `1.46-1.94x` | `bench/dispatch.jl` — a method on a prototype at RAM size, five and six shapes, the replicated cells |
| `0.93-1.20x` | `bench/dispatch.jl` — the same cells at two to four shapes |
| `80` | `bench/dispatch.jl` — the whole sweep |
| `156-177x` | `bench/spread.jl` — array spread against push at n=1000, construction counted, both sweeps |
| `1750-2011x` | `bench/spread.jl` — the same at n=10000, the three replications |
| `1877x and 2348x` | `bench/spread.jl` — the two sweeps of that cell that predate the replication |
| `779x` | `bench/spread.jl` — acc.concat(v) against push at n=1000, construction counted |
| `733-821` | `bench/spread.jl` — the interval of that cell |
| `0.96-1.07x` | `bench/spread.jl` — the finished array read back, spread against push, both sizes and both sweeps |
| `0.02-0.03x` | `bench/spread-object.jl` — the finished object read back, spread against keyed assignment, n=500 |
| `188-203x` | `bench/spread-object.jl` — object spread against keyed assignment at n=500, the three replications |
| `846-875x` | `bench/spread-object.jl` — Object.assign({}, acc, …) at n=500, the three replications |
| `2.56-2.87x` | `bench/select.jl` — the chosen value stored where it outlives the loop, both sizes |
| `2.48-2.92` | `bench/select.jl` — the intervals at n=10000, across the first sweep and the three replications |
| `2.30-3.09` | `bench/select.jl` — the intervals at n=100000, across the first sweep and the three replications |
| `6` | `bench/select.jl` — the whole sweep |
| `7.89x` | `bench/chained.jl` — xs.map(f).filter(g) against one fused pass at n=1000, construction counted |
| `7.41-8.41` | `bench/chained.jl` — the interval of that cell |
| `3.59x` | `bench/chained.jl` — Object.entries(o).map(f) against a for-in walk at n=1000, construction counted |
| `3.44-3.77` | `bench/chained.jl` — the interval of that cell |
| `2.65x` | `bench/chained.jl` — the same at n=10000 |
| `2.56-2.74` | `bench/chained.jl` — the interval of that cell |
| `24` | `bench/chained.jl` — the 0.3 sweep, which is every row the dispatch-table kernel wrote |
| `4.42-4.79x` | `bench/inline.jl` — a callee past the inlining budget against the same callee under it |
| `4.18-4.70` | `bench/inline.jl` — the interval at n=100000 |
| `4.56-5.05` | `bench/inline.jl` — the interval at n=1000 |
| `2` | `bench/inline.jl` — the whole sweep |
| `12.6-17.1x` | `bench/delete.jl` — one delete per object, reads only, at n=16384 and n=262144 |
| `12.4-12.9x` | `bench/delete.jl` — the same delete against assigning undefined instead, n=16384 |
| `13.3-15.6x` | `bench/delete.jl` — one object with one delete, reads only, every size and every sweep |
| `23.2-24.3x` | `bench/delete.jl` — one delete per object with construction counted, n=256 |
| `3.2-7.0x` | `bench/delete.jl` — the single object with construction counted, every size |
| `16` | `bench/delete.jl` — the whole sweep |
| `0.11-0.12x` | `bench/example.jl` — remeda mergeAll — the caller's reads on the result, both sizes, all six sweeps |

<!-- /generated -->

Every observation runs in a fresh OS process. An in-process A/B test shares
inline caches. That polluted the results and made an earlier round invalid.
Each cell uses 20 paired runs. AB/BA randomisation swaps which version runs
first. A 95% bootstrap interval is a range calculated by repeatedly resampling
the measured runs. The harness compares checksums, short values that show
whether outputs match, inside every pair. It publishes raw per-pair timings
beside every summary.

If the timed work in a cell misses its 120 ms target by more than 2x, the
benchmark **throws** instead of publishing. This guard exists because an older
harness inflated a result by more than double. Worse, the error made a rule
look worth shipping. See `BUGS.md` TC-5.

That interval is calculated from the 20 pairs of one sweep, so it cannot see
anything that changes between two sweeps. Six cells proved it: near-identical
work measured 1.64x, 0.91x and 0.89x, and no two of those can both be true. So a
cell behind a published number is run three times over, and the three answers are
published next to each other. Where they disagree, the cell is dropped and the
three numbers are printed anyway — `make bench-tc11`, `BUGS.md` TC-11.

## What the fix is worth on somebody else's code

Every number above is a microbenchmark, and a microbenchmark cannot say what a
program gets. So: take a function a library ships, apply the fix turbocharge
printed on it and nothing else, and time the whole call the way a caller makes
it. The pairs are in `examples/` — `diff` a `.before.ts` against its `.after.ts`
and the fix is the entire change. `make example` prints the findings, then runs
the sweep.

Nothing here was searched for. Eleven libraries were cloned shallow and
annotated by `examples/annotate.js` — every function not nested inside another
whose body loops — and these are the findings that came back. radash is the
twelfth, marked by hand a round earlier; `demo-real.md` is that run in full,
including the three false-positive classes it took to get to one finding. The
ratio is before/after, so above 1.0 the shipped code costs that much more and
**below 1.0 the fix made it slower**. Three whole sweeps per cell, per §4
rule 13, all three printed.

**The whole call, which is what a caller gets:**

| Function, and the finding | n | three sweeps | agreement |
|---|---|---|---|
| radash `assign` — `accumulating-spread` | 16 | 3.08 / 3.21 / 3.31 | **3.15–3.30** |
| radash `assign` | 128 | 4.59 / 4.58 / 4.62 | **4.32–4.88** |
| remeda `mergeAll` — `accumulating-spread` | 8 | 1.38 / 1.31 / 1.37 | **1.31–1.36** |
| remeda `mergeAll` | 64 | 20.10 / 17.34 / 19.34 | **none — DISAGREES** |
| es-toolkit `omit` — `delete-property` | 12 | 1.71 / 1.73 / 1.73 | **1.64–1.79** |
| es-toolkit `omit` | 48 | 3.27 / 3.39 / 3.25 | **3.24–3.36** |
| zod `cleanEnum` — `chained-allocation` | 16 | 1.32 / 1.46 / 0.91 | **none — DISAGREES** |
| zod `cleanEnum` | 256 | 1.16 / 0.85 / 1.05 | **0.98–1.03, REJECTED** |

**Reads on the value the function returns**, which is where `delete-property`'s
cost is actually paid — by the caller, not inside the function:

| Function | n | three sweeps | agreement |
|---|---|---|---|
| radash `assign` | 16 / 128 | 1.98 / 2.02 / 1.97 · 1.69 / 1.68 / 1.57 | **1.93–2.08** · **1.58–1.71** |
| remeda `mergeAll` | 8 / 64 | 0.12 / 0.12 / 0.12 · 0.12 / 0.11 / 0.11 | **0.12** · **0.11–0.12** |
| es-toolkit `omit` | 12 | 11.46 / 11.37 / 11.08 | **10.95–11.86** |
| es-toolkit `omit` | 48 | 0.98 / 0.99 / 1.02 | **0.94–1.02, REJECTED** |
| zod `cleanEnum` | 16 | 1.07 / 1.03 / 0.92 | **1.00–1.15, REJECTED** |
| zod `cleanEnum` | 256 | 1.02 / 0.98 / 0.96 | **0.98–1.03, REJECTED** |

**The honesty condition.** An end-to-end number is far below the microbenchmark
ratio, always. `accumulating-spread` cites 188–203x for an object spread at
n=500; applied to radash's `assign` it moves the whole call 3.2–4.9x, because
the function around that one line also allocates, recurses and branches. That
gap is the most useful thing in this table: it is what a reader gets, and the
200x is not.

Four things in these tables say something worse than "smaller", and they are
here at the same size as the wins:

- **`omit` at 48 keys rejects on reads** — 0.94–1.02x, an interval spanning 1.0
  in all three sweeps. `%HasFastProperties` is false on *both* sides: building a
  46-key object one key at a time normalizes it just as `delete` does. The fix
  stops fixing the read somewhere between 12 keys and 48, and the rule still
  cannot see the width — so the `fix:` line says it: *"the rebuild helps at 12
  keys and not at 48, where filling it key by key normalizes it too"*.
- **`mergeAll` at n=64 does not replicate** — 17.34x, 19.34x, 20.10x, with no
  value inside all three intervals. Under rule 13 that is not a published
  number, and it is printed here rather than dropped.
- **`mergeAll` reads are 8x slower after the fix**, 0.11–0.12x at both sizes in
  all six sweeps. `Object.assign(out, item)` in a loop — the form this project's
  own evidence names as the fix — returns a `[DictionaryProperties]` object,
  where the spread returns a `[FastProperties]` one. `accumulating-spread` fixed
  a quadratic build and created a per-load cost it never mentioned, so the rule
  now prints a different fix for each form: pushing onto an **array** costs the
  reader nothing (0.96-1.07x) and carries no condition, and the **object** form
  says *"that fills the result key by key, which normalizes it: its reads
  measured 0.11-0.12x of the spread-built object's"*. Same detection, honest
  advice — radash's `assign` is the same fix with the reads coming out
  1.58–2.08x *faster*, which is why it is a condition to check and not a rule to
  apply. `BUGS.md` TC-16.
- **`chained-allocation`'s fix is worth nothing on the real instance**, at
  either size: 0.98–1.03x with construction counted at a 256-member enum, and
  three sweeps that cannot agree at a 16-member one. The rule cites 7.89x for
  `map` then `filter` at n=1000, where the loop body is one multiply and the
  allocation is the whole cost. In zod's `cleanEnum` the same two stages sit
  next to an `Object.entries` allocation neither version avoids and a
  `Number.parseInt` per key that dwarfs both, and the fused loop pays back what
  it saved by growing its result array instead of getting it pre-sized by
  `.map()`. Published as it came out.

**The whole survey, so the four examples are not four picks out of a hat.**
Twelve libraries, 850 annotated functions, 1672 findings. No library produced
nothing.

| Library | annotated | findings | what fired |
|---|---|---|---|
| es-toolkit 1.50.0 | 286 | 288 | 267 `closed-world`, 12 `delete-property`, 4 `accumulating-spread`, 3 `chained-allocation`, 2 `allocating-select` |
| ramda 0.32.0 | 100 | 126 | 125 `closed-world`, 1 `delete-property` (`_dissoc`) |
| immutable 5.1.9 | 89 | 274 | 269 `closed-world`, 3 `chained-allocation`, 2 `delete-property` |
| remeda 2.0.0 | 79 | 47 | 44 `closed-world`, 2 `delete-property`, 1 `accumulating-spread` |
| zod 4.4.3 (`v4/core`) | 78 | 96 | 54 `delete-property`, 24 `closed-world`, 10 `megamorphic-elements`, 8 `chained-allocation` |
| just 1.22.4 | 61 | 67 | 65 `closed-world`, 1 `delete-property`, 1 `chained-allocation` |
| luxon 3.7.2 | 52 | 266 | 247 `closed-world`, 15 `delete-property`, 4 `chained-allocation` |
| decimal.js 10.6.0 | 36 | 282 | 282 `closed-world` |
| date-fns 4.4.0 (`core`) | 28 | 36 | 29 `closed-world`, 4 `allocating-select`, 1 each `delete-property`, `chained-allocation`, `accumulating-spread` |
| dinero.js 2.0.2 | 20 | 102 | 100 `closed-world`, 1 `chained-allocation`, 1 `accumulating-spread` |
| big.js 7.0.1 | 13 | 87 | 87 `closed-world` |
| radash 12.1.1 | 8 | 1 | 1 `accumulating-spread` — see `demo-real.md` |

Three things in that table are about the tool rather than the libraries.

**`closed-world` is 1539 of the 1672 findings** — 92% — nearly all of them a
builtin the walk cannot read into. That is the honest shape of the rule on real
code, and `BUGS.md` TC-10.

**`megamorphic-dispatch` never fired once** in 850 annotated functions. The
sharpest cliff this project measured, 14.6-20.0x, has still never been seen on
somebody else's code.

**`megamorphic-elements` fired ten times, and all ten are one function** —
zod's `prefixIssues`, whose `issues` parameter unions twelve issue types and
which loads and mutates `.path` on every element. Nine of the ten are that same
site reported from nine different annotated roots that reach it. Until this
survey the rule had never fired either; one function in 850 is what it is worth.

### Which rules have an end-to-end example, and which cannot have one

`examples/` can only hold a rule whose printed fix is a change to the function
the rule fired on. That is not a property of every rule here, and saying which
is which is worth more than four more tables.

| Rule | End to end |
|---|---|
| `accumulating-spread` | radash `assign`, remeda `mergeAll` — **3.15–4.88x**, and a read cost the fix line now carries |
| `delete-property` | es-toolkit `omit` — **1.64–3.36x**, and a width past which it stops |
| `chained-allocation` | zod `cleanEnum` — **rejects at both sizes**, published above |
| `allocating-select` | **no instance of the measured shape in 850 functions.** Its six findings are all `x = advance(x, step)` — `date = addMinutes(date, step)` in four date-fns functions, `sink = lazy(sink)` in es-toolkit's `pipe`. The benchmark measured a *choice* between two values where the incumbent almost always wins, and the fix, "compare first and assign only when x really changes", saves an allocation exactly on the passes that change nothing. A cursor changes on every pass. `BUGS.md` TC-18 |
| `megamorphic-elements` | **structurally impossible.** The rule fires on a *parameter*, so its fix — "get the element type to four shapes or fewer, or give it one construction path" — is always a change to whoever built the array, never to the function that was flagged. No before/after pair of the flagged function can carry it. `BUGS.md` TC-19 |
| `megamorphic-dispatch` | **nothing to demonstrate.** Zero findings in 850 functions |
| `closed-world` | makes no speed claim; it reports what was not checked |

## What V8's source says

Each rule carries a second, independent evidence: the mechanism, in the engine's
own source. A benchmark says what it cost here and cannot say why. A citation
says what mechanism exists and cannot say what it costs — **the source is silent
on all seven magnitudes**, and a constant in it is a hypothesis, never a
measurement.

```pin
revision = c635f0d160b6e988b5ea5a907511a2929beb5d5e
version = 15.3.0.0
```

| Rule | Mechanism in V8 | Citation |
|---|---|---|
| `megamorphic-elements` | the fourth map fills the inline cache's budget; the fifth makes the site megamorphic | `src/flags/flag-definitions.h:3320` → `DEFAULT_MAX_POLYMORPHIC_MAP_COUNT`, `src/ic/ic.cc:798` → `number_of_maps` |
| `megamorphic-dispatch` | a call slot holds ONE target as a weak reference and has no polymorphic tier | `src/builtins/ic-callable.tq:14` → `IsMonomorphic`, `src/builtins/ic-callable.tq:45` → `TransitionToMegamorphic` |
| `delete-property` | a named delete normalizes a fast object unconditionally, and only prototypes go back | `src/objects/lookup.cc:840` → `PropertyNormalizationMode`, `src/objects/js-objects.cc:5094` → `V8_DICT_PROPERTY_CONST_TRACKING_BOOL` |
| `chained-allocation` | every stage allocates its own result array; `Object.entries` allocates two objects per key | `src/builtins/array-map.tq:101` → `CreateJSArray`, `src/objects/objects-inl.h:1182` → `MakeEntryPair` |
| `allocating-select` | escape analysis removes an allocation only where it can see it, inside a 1300-byte budget | `src/compiler/escape-analysis.cc:302` → `kTrackingBudget`, `src/compiler/escape-analysis.cc:670` → `HasEscaped` |
| `closed-world` | bytecode length and a statically known target gate inlining | `src/objects/shared-function-info-inl.h:437` → `bytecode`, `src/flags/flag-definitions.h:1606` → `max_inlined_bytecode_size` |
| `accumulating-spread` | **none** — quadratic work is quadratic on any engine | — |
| *no rule* — the elements kind is decided by the values stored, one value at a time, which is why `boxed-elements` was withdrawn | | `src/objects/elements-kind.h:105` → `enum ElementsKind`, `src/objects/objects-inl.h:700` → `OptimalElementsKind` |

Three of these say something the benchmark alone could not:

- **It contradicts one shipped threshold.** A call slot has no polymorphic tier
  at all, so the four-map budget governs the method *load* and the *call* has a
  budget of one. A method kept in a field is off the cliff at two, not five.
  `BUGS.md` TC-13.
- **It refused one trigger, and the benchmark then agreed.** V8 picks the
  elements kind from the values actually stored; `boxed-elements` fired on the
  *declared* type. `make bench-arrays` measured that case at 0.96-1.08x, so the
  rule is gone — the last row above is a mechanism with no rule attached, kept
  because it is the reason there is no rule. `BUGS.md` TC-14.
- **It gives `accumulating-spread` nothing, correctly.** The largest effect
  measured here is the one that would survive an engine rewrite.

`make v8-check` verifies every citation above against a pinned checkout and
fails with the drifted line. It exits non-zero when the checkout is missing
rather than reporting success. `CLAUDE.md` has the three clone commands.

## Honest limits

- These ratios come from a microbenchmark, a small speed test, on one machine
  (Node v22.23.2, V8 12.4). They show that a pattern *can* cost that much. They
  do not say it costs that much in your workload.
- The recursive walk has limits. A visited set stops cycles. Each annotation
  also has a hard cap of 200 function bodies. When the walk hits the cap, it
  prints `WALK TRUNCATED` and exits `1`. The run is not reported as clean, in
  the text or in the exit code.
- `megamorphic-elements` does not check that your code loads anything. It reads
  the parameter's type and reports. A function that only reads `rows.length`
  triggers it, even though nothing there can go megamorphic. The demo fixture
  `fiveShapes` is that false positive. `BUGS.md` TC-8.
- `megamorphic-dispatch` fires on the fifth object type. That is right for a
  method on a class: four types cost 1.16-1.56x and the fifth costs
  14.6-20.0x, the sharpest step measured here. It is late for an object that
  carries its own function in a field. There the cost starts at the *second*
  one, 7.7-11.9x, with no threshold at all, and no declared type tells the two
  apart. The rule misses that case rather than guessing at it.
- A TypeScript union member is not a V8 map, which is the engine's internal
  object shape. `megamorphic-elements` estimates the shape count from the
  declared type. It can report a problem even if no load site ever sees five maps.
  `BUGS.md` TC-2.
- One measured effect ships no rule, because nothing static can find it. A
  boxed array costs 1.39-1.66x to read, and 1.58-1.69x to build at RAM size, and
  whether an array is boxed depends on what was stored in it, which a type
  annotation does not decide. `make bench-arrays`, `BUGS.md` TC-14. The same
  shape as the 6.17-6.34x dictionary effect in TC-12.
- Never trust V8 optimization state as a speed signal. `%GetOptimizationStatus`
  reported `optimized=true` throughout a 5x megamorphic slowdown. An earlier
  version used exactly that signal as a CI gate, an automated check that could
  block a change. That was wrong, so the gate was deleted.

## Development

```sh
make test    # 49 unit tests, including the must-stay-silent cases
make lint    # tsc --noEmit
make numbers # re-derive every published number from the .jl sweeps
make check   # run the checker against demo/
make example # the checker against examples/, then the end-to-end sweep
```

`CLAUDE.md` holds the layout, the rules of this repo, and how to verify both
kinds of evidence. `BUGS.md` holds the open queue. `useless.md` and `useless2.md`
are the adversarial teardowns — why the old design failed, and the case that
this one is worthless.

## Licence

**GPL-2.0-only**. The full text is in `LICENSE`. You may use, modify and
redistribute it under those terms. A derivative work carries the same licence.
It is not published to npm. Get it by cloning the repository.

`examples/` is the exception, and deliberately so: the `.before.ts` files are
functions vendored verbatim from radash, remeda, es-toolkit and zod, all
**MIT**, and each file carries its upstream's copyright line, version and
commit. MIT is compatible with the GPL, and the point of the whole exercise is
that the code measured there is somebody else's.

Status: v0.5.1, single machine, seven rules.
