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
`3 findings suppressed (megamorphic-elements, TC-9)` — a clean run that is
clean because rules were switched off says so.

## What you get

```
turbocharge — 37 annotated functions, 14 findings

  demo/lib.ts:116  viaCallee()
    delete-property
      demo/lib.ts:111
      delete o[k] puts its object in dictionary mode
      measured 12.6-17.1x per property load once the object is in dictionary mode … [bench/delete.jl]
      fix: assign undefined, or build the object without the property
      known defect: TC-9 — rules fire outside the conditions their own evidence establishes
```

Four things, and the second is the point:

- **the line**, `demo/lib.ts:111` — which is inside `dropInner`, a function
  nobody annotated. `viaCallee` has the annotation; turbocharge followed the
  call and reported where the cost actually is.
- **the measurement**, so you can judge whether it is worth your time, and
  re-run it yourself with `make bench-*`.
- **the fix**, concretely, not "consider optimising".
- **what it could not check** — every call with no readable body is listed by
  name, and a walk that hits its limit prints `WALK TRUNCATED` and is never
  reported as clean.

Exit codes: `0` clean, `1` findings, `2` the tool itself failed. A path that
does not exist is a `2`, never a clean run.

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
make example              # three shipped library functions, before and after
make v8-check             # every V8 citation, against the pinned checkout
```

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

Nothing here was searched for. Four libraries were cloned shallow and annotated
by `examples/annotate.js` — every function not nested inside another whose body
loops — and these are the findings that came back. The ratio is before/after, so
above 1.0 the shipped code costs that much more and **below 1.0 the fix made it
slower**. Three whole sweeps per cell, per §4 rule 13, all three printed.

**The whole call, which is what a caller gets:**

| Function, and the finding | n | three sweeps | agreement |
|---|---|---|---|
| radash `assign` — `accumulating-spread` | 16 | 3.08 / 3.21 / 3.31 | **3.15–3.30** |
| radash `assign` | 128 | 4.59 / 4.58 / 4.62 | **4.32–4.88** |
| remeda `mergeAll` — `accumulating-spread` | 8 | 1.38 / 1.31 / 1.37 | **1.31–1.36** |
| remeda `mergeAll` | 64 | 20.10 / 17.34 / 19.34 | **none — DISAGREES** |
| es-toolkit `omit` — `delete-property` | 12 | 1.71 / 1.73 / 1.73 | **1.64–1.79** |
| es-toolkit `omit` | 48 | 3.27 / 3.39 / 3.25 | **3.24–3.36** |

**Reads on the value the function returns**, which is where `delete-property`'s
cost is actually paid — by the caller, not inside the function:

| Function | n | three sweeps | agreement |
|---|---|---|---|
| radash `assign` | 16 / 128 | 1.98 / 2.02 / 1.97 · 1.69 / 1.68 / 1.57 | **1.93–2.08** · **1.58–1.71** |
| remeda `mergeAll` | 8 / 64 | 0.12 / 0.12 / 0.12 · 0.12 / 0.11 / 0.11 | **0.12** · **0.11–0.12** |
| es-toolkit `omit` | 12 | 11.46 / 11.37 / 11.08 | **10.95–11.86** |
| es-toolkit `omit` | 48 | 0.98 / 0.99 / 1.02 | **0.94–1.02, REJECTED** |

**The honesty condition.** An end-to-end number is far below the microbenchmark
ratio, always. `accumulating-spread` cites 188–203x for an object spread at
n=500; applied to radash's `assign` it moves the whole call 3.2–4.9x, because
the function around that one line also allocates, recurses and branches. That
gap is the most useful thing in this table: it is what a reader gets, and the
200x is not.

Three cells say something worse than "smaller", and they are here at the same
size as the wins:

- **`omit` at 48 keys rejects on reads** — 0.94–1.02x, an interval spanning 1.0
  in all three sweeps. `%HasFastProperties` is false on *both* sides: building a
  46-key object one key at a time normalizes it just as `delete` does. The fix
  stops fixing the read somewhere between 12 keys and 48, and the rule has no
  idea.
- **`mergeAll` at n=64 does not replicate** — 17.34x, 19.34x, 20.10x, with no
  value inside all three intervals. Under rule 13 that is not a published
  number, and it is printed here rather than dropped.
- **`mergeAll` reads are 8x slower after the fix**, 0.11–0.12x at both sizes in
  all six sweeps. `Object.assign(out, item)` in a loop — the form this project's
  own evidence names as the fix — returns a `[DictionaryProperties]` object,
  where the spread returns a `[FastProperties]` one. `accumulating-spread` fixes
  a quadratic build and creates a per-load cost it never mentions.

Two further libraries were annotated the same way and produced no new pattern:
ramda one `delete-property` (in `_dissoc`) and just one `delete-property` plus
one `chained-allocation`, on top of 125 and 65 `closed-world` reports. The
`closed-world` flood is the honest shape of that rule on real code — 267 of
es-toolkit's 288 findings are a builtin the walk cannot read into.

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
  prints `WALK TRUNCATED`. The run is not reported as clean.
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
  boxed array costs 1.39-1.66x to read and 1.58-1.69x to build at RAM size, and
  whether an array is boxed depends on what was stored in it, which a type
  annotation does not decide. `make bench-arrays`, `BUGS.md` TC-14. The same
  shape as the 6.17-6.34x dictionary effect in TC-12.
- Never trust V8 optimization state as a speed signal. `%GetOptimizationStatus`
  reported `optimized=true` throughout a 5x megamorphic slowdown. An earlier
  version used exactly that signal as a CI gate, an automated check that could
  block a change. That was wrong, so the gate was deleted.

## Development

```sh
make test    # 45 unit tests, including the must-stay-silent cases
make lint    # tsc --noEmit
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
functions vendored verbatim from radash, remeda and es-toolkit, all **MIT**, and
each file carries its upstream's copyright line, version and commit. MIT is
compatible with the GPL, and the point of the whole exercise is that the code
measured there is somebody else's.

Status: v0.4.1, single machine, seven rules.
