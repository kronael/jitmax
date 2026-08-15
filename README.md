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

## What you get

```
turbocharge — 35 annotated functions, 15 findings

  demo/lib.ts:87  viaCallee()
    delete-property
      demo/lib.ts:82
      delete o[k] puts its object in dictionary mode
      measured 28-67x per property load once the object is in dictionary mode
      fix: assign undefined, or build the object without the property
```

Four things, and the second is the point:

- **the line**, `demo/lib.ts:82` — which is inside `dropInner`, a function
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

```sh
turbocharge src        # check annotated functions under src/
```

Exit codes tell scripts what happened: `0` means clean, `1` means turbocharge
found problems, and `2` means the tool itself failed. A path that does not
exist returns `2`, never a clean run.

## The rules

Eight rules ship. The first seven check every function in the call tree. The
eighth reports where the walk stops. Megamorphic means one code location has
seen many object shapes. Quadratic means the work grows with the square of the
input size.

| Rule | What it looks for | Where the measurement found no effect |
|---|---|---|
| `megamorphic-elements` | the fifth object shape at a load site | two to four shapes |
| `megamorphic-dispatch` | `x.step()` where `x` is one of five object types | two to four types, for a method on a class |
| `accumulating-spread` | `[...acc, v]`, `{ ...acc, k: v }`, `acc.concat(v)` or `Object.assign({}, acc, …)` in a loop — quadratic | no loop re-runs the copy; `Object.assign(acc, …)`, which mutates; strings, which V8 appends to instead of copying |
| `chained-allocation` | `.map().filter()` or `Object.entries(o).map()` allocates between stages | one stage; large n; `Object.keys(o).map()`, `.sort()`, `.split().map().join()` |
| `allocating-select` | `x = Lib.min(x, y)` in a loop returns a new object every pass | the same loop on numbers |
| `boxed-elements` | mixed element types cannot stay unboxed | holey arrays |
| `delete-property` | `delete` demotes an object to dictionary mode | a single delete on one object |
| `closed-world` | calls to code with no readable body | a callee small enough to inline costs nothing |

**Every rule includes the benchmark that earned it, and the case where the same
benchmark found nothing.** `closed-world` measures the mechanism a call boundary
controls: a callee V8 refuses to inline costs 4.42-4.79x in a hot loop. Read
that as a bound on what one unchecked call can cost, not a claim about any
particular one.
If a rule fires in a case a test declares silent, `make test` fails.
Measurements have blocked a rule or a rule's extension from shipping seven times.
One went further and took a case away from a rule that was already shipping.
`accumulating-spread` matched `.concat()` by name, so it reported `s = s.concat(x)`
on a string as a quadratic array copy. Measured, appending to a string is
*faster* than the rewrite the tool was demanding — `make bench-strings`.

The seventh is the most repeated claim in V8 folklore, and it is the reason
there is no rule about it here. Adding a property after you build the object —
`const o = { a: 1 }; o.b = 2;` — is supposed to cost you a second hidden class.
V8's own debug output says otherwise: every object built the same way ends at
the *same* hidden class, so the code that reads them sees one, not two. Measured
against writing both properties at once, it costs 1.21–1.34x, inside the band
this harness has twice failed to reproduce. An optional property is no worse,
and is *cheaper* to build. `make bench-addprop`.

**Read the third column as a limit on the evidence, not as a promise about the
code.** No rule checks the condition in its own third column at runtime. The
`delete` rule fires on a single delete even though a single delete measured
free. The chaining rule cannot see how big your array is. This is a real
weakness and it is written up as TC-9 in `BUGS.md`, along with TC-8, where the
main rule fires without checking that your code loads a property at all.

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
- Never trust V8 optimization state as a speed signal. `%GetOptimizationStatus`
  reported `optimized=true` throughout a 5x megamorphic slowdown. An earlier
  version used exactly that signal as a CI gate, an automated check that could
  block a change. That was wrong, so the gate was deleted.

## Development

```sh
make test    # 37 unit tests, including the must-stay-silent cases
make lint    # tsc --noEmit
make check   # run the checker against demo/
```

`SPEC.md` defines the contract. `docs/v8-evidence.md` is the second kind of
evidence: one section per rule tracing the mechanism to V8's own source, with
the quoted lines and a statement of what each citation does and does not prove.
`make v8-check` verifies every one of them against a pinned checkout and fails
with the drifted line. `DESIGN.md` describes watching code while it runs. That
design is not built yet. `BUGS.md` holds the open queue. `useless.md` explains
why the old design failed.

## Licence

**GPL-2.0-only**. The full text is in `LICENSE`. You may use, modify and
redistribute it under those terms. A derivative work carries the same licence.
It is not published to npm. Get it by cloning the repository.

Status: v0.4.1, single machine, eight rules.
