# turbocharge

Add a `@turbocharge` comment to a TypeScript function. turbocharge checks that
function and every function it calls. It reports code patterns that measurements
show can push V8, Node's JavaScript engine, off its fast path.

The engine puts some objects in dictionary mode, which stores properties in a
lookup table instead of a fixed layout. The report below shows one example.

```ts
/** @turbocharge */
export function total(rows: Row[]): number { … }
```

```
$ turbocharge demo
turbocharge — 14 annotated functions, 8 findings

  demo/lib.ts:71  viaCallee()
    delete-property
      demo/lib.ts:66
      delete o[k] puts its object in dictionary mode
      measured 28-67x per property load once the object is in dictionary mode
      fix: assign undefined, or build the object without the property
```

`viaCallee` has the annotation. Line 66 is `dropInner`. Nobody annotated it.
turbocharge followed the call and reported the line where the slowdown starts.

V8 already has a good JIT, a compiler that speeds up code while it runs. A
hidden class, also called an object shape, records which properties an object
has. An inline cache remembers what a code location has seen, so the engine can
reuse a fast lookup. A packed array has no missing slots. The engine uses all of
these. It also has two more stages that speed up code that runs often.

The engine usually makes your code fast. But a short list of ordinary-looking
patterns can quietly turn off those speedups. JavaScript does not warn you when
this happens.

turbocharge contains that measured list. Its checker looks for each pattern in
the function you marked and in every function called from it. It follows a
callee, the function being called, when TypeScript can connect it to real source
code. A package that ships a `.d.ts`, a file that describes types without the
source body, stops that walk. Most typed dependencies are therefore a stopping
point, not code turbocharge can enter. It reports every call it cannot follow by
name. The report shows what went unchecked instead of pretending it was checked.

*Where the idea came from:* Numba's `@njit` marks one Python function and pulls
in its whole call tree, the chain of functions it calls. Numba compiles that
tree or stops with a line and a reason. turbocharge borrows the annotation and
call-tree design. The jobs differ. CPython does not JIT, so Numba must compile.
V8 already compiles code while it runs, so turbocharge only tells you where your
code blocks its optimizations.

## Install and run

Requires Node `>=22.18`. Node strips types on its own, so you do not need a
build step. It also requires TypeScript `>=5.0.0` as a peer dependency, which
means your project provides that package. turbocharge loads *your* copy of
TypeScript. It sees the same code and types as your build.

```sh
turbocharge src        # check annotated functions under src/
```

Exit codes tell scripts what happened: `0` means clean, `1` means turbocharge
found problems, and `2` means the tool itself failed. A path that does not
exist returns `2`, never a clean run.

## The rules

Six rules ship. The first five check every function in the call tree. The sixth
reports where the walk stops. Megamorphic means one code location has seen many
object shapes. Quadratic means the work grows with the square of the input size.

| Rule | What it looks for | Where the measurement found no effect |
|---|---|---|
| `megamorphic-elements` | the fifth object shape at a load site | two to four shapes |
| `accumulating-spread` | `[...acc, v]` or `{ ...acc, k: v }` in a loop — quadratic | no loop re-runs the spread |
| `chained-allocation` | `.map().filter()` allocates between stages | one stage; large n |
| `boxed-elements` | mixed element types cannot stay unboxed | holey arrays |
| `delete-property` | `delete` demotes an object to dictionary mode | a single delete on one object |
| `closed-world` | calls to code with no readable body | a callee small enough to inline costs nothing |

**Every rule includes the benchmark that earned it, and the case where the same
benchmark found nothing.** `closed-world` measures the mechanism a call boundary
controls: a callee V8 refuses to inline costs 4.42-4.79x in a hot loop. Read
that as a bound on what one unchecked call can cost, not a claim about any
particular one.
If a rule fires in a case a test declares silent, `make test` fails.
Measurements have blocked a rule from shipping three times.

**Read the third column as a limit on the evidence, not as a promise about the
code.** No rule checks the condition in its own third column at runtime. The
`delete` rule fires on a single delete even though a single delete measured
free. The chaining rule cannot see how big your array is. This is a real
weakness and it is written up as TC-9 in `BUGS.md`, along with TC-8, where the
main rule fires without checking that your code loads a property at all.

## Evidence

```sh
make bench          # the 24-cell object-shape sweep
make bench-spread   # accumulating spread
make bench-chained  # chained array passes
make bench-inline   # the inlining boundary behind closed-world
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
make test    # 16 unit tests, including the must-stay-silent cases
make lint    # tsc --noEmit
make check   # run the checker against demo/
```

`SPEC.md` defines the contract. `DESIGN.md` describes watching code while it
runs. That design is not built yet. `BUGS.md` holds the open queue. `useless.md`
explains why the old design failed.

## Licence

**GPL-2.0-only**. The full text is in `LICENSE`. You may use, modify and
redistribute it under those terms. A derivative work carries the same licence.
It is not published to npm. Get it by cloning the repository.

Status: v0.2.0, single machine, six rules.
