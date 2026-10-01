# The benchmarks

How every number jitmax publishes was measured, and how to re-run it. The
benchmarks need a full Git clone after the
[development setup](../README.md#development-and-licence), Node, and Linux:
the runner's load gate reads `/proc/loadavg`. They measure V8 under Node, even
when you run the checker with Bun.

A rule can carry two kinds of evidence. **A benchmark** says what a pattern
cost on this machine, and cannot say why. **A V8 citation** says what mechanism
exists in the engine, and cannot say what it costs. Both are below, and both
can be re-run. `accumulating-spread` has a benchmark and no citation, because
quadratic copying is quadratic on any engine; `interface-dispatch` reports
unchecked calls and has neither.

`bench/driver.ts` implements the measurement protocol, `bench/sweeps.ts` holds
every sweep's cells, `bench/run.ts` runs them, and `bench/kernel.ts` is the
contract a workload meets. A sweep appends its rows, one JSON object per line,
to a `.jl` file beside its workload, and never overwrites one.

## Re-run any claim

Nothing else may run on the machine during a sweep: these are timings. To
measure a claim again, name its sweep:

```sh
node bench/run.ts shape-sets --force --scratch   # appends to bench/scratch.jl
```

That re-measures all 24 cells of `shape-sets`, three sweeps of 20 process
pairs each, and leaves the published rows alone. `--plan` lists the cells
without measuring, and `--only=<text>` keeps the cells whose label contains
the text, such as `--only=5/1`. Any name below takes the place of
`shape-sets`:

```text
shape-sets     property sets per element type — megamorphic-elements
shapes         five key orders of one key set — what that rule misses
dispatch       one method call on many object shapes — megamorphic-dispatch
spread         accumulating spread, array form
spread-object  accumulating spread, object form
strings        strings built by appending — why that rule skips them
chained        chained array passes
select         choosing between two boxed values — allocating-select
delete         delete, on many objects and on exactly one
inline         the inlining boundary behind closed-world
addprop        adding a property after construction — no rule
arguments      the arguments object against a rest parameter — no rule
sparse         dictionary and holey arrays — no rule
arrays         elements kinds — no rule
example        four shipped library functions, before and after
```

`make bench-<name>`, `make bench` for `shapes`, and `make example` run the
same sweeps without `--force`. They resume the published `.jl` files: each
measures only the cells its file lacks, so on a complete checkout it measures
nothing. `make example` also checks the four examples first. Two targets
measure no cost:

```sh
make tiers      # which V8 tier each published cell reached — a diagnostic
make v8-check   # every V8 citation, against the pinned checkout
```

## Derived numbers, and the rows they are

`make numbers` writes this table, and the evidence strings the tool prints,
from the `.jl` rows, and `make test` fails when a quoted number no longer
matches its rows. A few figures elsewhere in this guide are not derived; the
test keeps them as a named list of exceptions.

The second column says which rows a number reads, and its form says what was
computed from them:

- **A ratio or range with an `x`** runs from the lowest sweep ratio among
  those rows to the highest. It is a spread of measured ratios, not a
  confidence interval.
- **A row that says what sweeps agree on** gives rule 13's agreement instead:
  the range that every one of those sweeps' 95% intervals contains.
- **A range with no `x`** spans the 95% intervals themselves, from the lowest
  lower bound to the highest upper bound.
- **Ratios joined by `and`** are single sweeps, one by one.
- **A bare integer or an `n=` value** is a count of cells or an input size, as
  its row says.

<!-- generated: numbers -->

| Number | The rows it is |
|---|---|
| `3.4-11.3x` | `bench/shape-sets.jl` — five distinct property sets, reads only, L1 through RAM |
| `3.61-3.71x` | `bench/shape-sets.jl` — construction counted, five property sets, L1 and L2 — 1 of 2 cells withdrawn as unreplicable (rule 13): 5\|1\|incl\|16384\|L2 |
| `1.08-1.20x` | `bench/shape-sets.jl` — construction counted at RAM size, five property sets |
| `20` | `bench/shape-sets.jl` — the whole sweep — 4 of 24 cells withdrawn as unreplicable (rule 13): 2\|1\|incl\|16384\|L2, 2\|1\|incl\|262144\|L3, 4\|1\|incl\|16384\|L2, 5\|1\|incl\|16384\|L2 |
| `0.95-1.47x` | `bench/shape-sets.jl` — two to four property sets, reads only, every size — where the rule stays quiet |
| `4.4-11.5x` | `bench/shapes-calibrated.jl` — five key orders of ONE key set, reads only, L1 through RAM |
| `12.9-22.7x` | `bench/dispatch.jl` — a method on a prototype, five and six shapes, reads only |
| `1.52-1.65x` | `bench/dispatch.jl` — a method on a prototype, four shapes, reads only at L1 |
| `19.22-22.71x` | `bench/dispatch.jl` — a method on a prototype, five shapes, reads only at L1 |
| `7.1-9.0x` | `bench/dispatch.jl` — one shared function held as an own property, five and six shapes, reads only |
| `1.9-5.8x` | `bench/dispatch.jl` — five shapes with construction counted, prototype and own-property, L1 and L2 |
| `1.58-1.72x` | `bench/dispatch.jl` — a method on a prototype at RAM size, five and six shapes — 1 of 2 cells withdrawn as unreplicable (rule 13): cls5\|cls1\|incl\|262144\|L3\|cls\|5\|dispatch-table |
| `1.00-1.14x` | `bench/dispatch.jl` — the same cells at two to four shapes |
| `73` | `bench/dispatch.jl` — the whole sweep — 7 of 80 cells withdrawn as unreplicable (rule 13): cls2\|cls1\|excl\|262144\|L3\|cls\|2\|dispatch-table, cls5\|cls1\|incl\|262144\|L3\|cls\|5\|dispatch-table, lit6\|lit1\|incl\|16384\|L2\|lit\|6\|dispatch-table, lit6\|lit1\|incl\|262144\|L3\|lit\|6\|dispatch-table, tgt2\|lit1\|excl\|256\|L1\|tgt\|2\|dispatch-table, tgt3\|lit1\|excl\|256\|L1\|tgt\|3\|dispatch-table, tgt5\|lit1\|excl\|16384\|L2\|tgt\|5\|dispatch-table |
| `1.41-1.65x` | `bench/dispatch.jl` — four shapes on a prototype method, reads only, every size — where the rule is quiet |
| `2.10-2.28x` | `bench/dispatch.jl` — four shapes on one shared own-property function, reads only, every size |
| `3.5-15.8x` | `bench/dispatch.jl` — every shape carrying its OWN function, reads only, two to six targets, every size |
| `149-166x` | `bench/spread.jl` — array spread against push at n=1000, construction counted, both sweeps |
| `1766-1889x` | `bench/spread.jl` — the same at n=10000, the three replications |
| `1877x and 2348x` | `bench/spread.jl` — the two sweeps of that cell that predate the replication — the older sweep, not re-measured under r2 |
| `777-807x` | `bench/spread.jl` — acc.concat(v) against push at n=1000, construction counted |
| `695-928` | `bench/spread.jl` — every interval measured for that cell |
| `0.96-1.02x` | `bench/spread.jl` — the finished array read back, spread against push, both sizes and both sweeps |
| `0.03x` | `bench/spread-object.jl` — the finished object read back, spread against keyed assignment, n=500 |
| `186-200x` | `bench/spread-object.jl` — object spread against keyed assignment at n=500, the three replications |
| `814-887x` | `bench/spread-object.jl` — Object.assign({}, acc, …) at n=500, the three replications |
| `0.03-1.87x` | `bench/spread.jl` + `bench/spread-object.jl` — all four accumulating forms with construction excluded, every size |
| `0.26-0.52x` | `bench/strings.jl` — s = s + x, s += x and s = s.concat(x) against a push-and-join, building only — 1 of 9 cells withdrawn as unreplicable (rule 13): pluseq\|joined\|build\|1000\|dispatch-table |
| `0.78-1.13x` | `bench/strings.jl` — the same three with the read back counted |
| `0.71-1.48` | `bench/strings.jl` — every interval measured for those nine cells |
| `2.60-2.89x` | `bench/select.jl` — the chosen value stored where it outlives the loop, both sizes |
| `2.58-3.08` | `bench/select.jl` — the intervals at n=10000, across the three replications of the re-measurement |
| `2.48-2.86` | `bench/select.jl` — the intervals at n=100000, across the three replications of the re-measurement |
| `5` | `bench/select.jl` — the whole re-measurement — 1 of 6 cells withdrawn as unreplicable (rule 13): select\|compare\|number\|100000 |
| `1.10-1.19x` | `bench/select.jl` — the same loop on numbers at n=10000 — where the rule stays quiet |
| `1.03-1.29` | `bench/select.jl` — every interval measured on numbers at n=10000 |
| `0.89x and 0.97x and 1.03x` | `bench/select.jl` — the three sweeps of the n=100000 number cell — withdrawn under rule 13, quoted as the refutation it is |
| `2.02-2.47x` | `bench/select.jl` — the boxed form kept in a local, where escape analysis could see it, both sizes |
| `1.44-1.52x` | `bench/chained.jl` — xs.map(f).filter(g) against one fused pass, construction counted, both sizes — 1 of 2 cells withdrawn as unreplicable (rule 13): chained\|fused\|incl\|1000\|dispatch-table |
| `6.48x and 6.58x and 7.51x` | `bench/chained.jl` — the three sweeps of the n=1000 cell this rule used to headline — withdrawn under rule 13, quoted as the refutation it is |
| `1.37-1.63` | `bench/chained.jl` — every interval measured for the cells that replicate — 1 of 2 cells withdrawn as unreplicable (rule 13): chained\|fused\|incl\|1000\|dispatch-table |
| `3.67-3.76x` | `bench/chained.jl` — Object.entries(o).map(f) against a for-in walk at n=1000, construction counted |
| `3.50-4.04` | `bench/chained.jl` — every interval measured for that cell |
| `2.55-2.61x` | `bench/chained.jl` — the same at n=10000 |
| `2.23-2.97` | `bench/chained.jl` — every interval measured for that cell |
| `22` | `bench/chained.jl` — the 0.3 sweep, which is every row the dispatch-table kernel wrote — 2 of 24 cells withdrawn as unreplicable (rule 13): chained\|fused\|incl\|1000\|dispatch-table, splitjoin\|packed\|excl\|1000\|dispatch-table |
| `1000` | `bench/chained.jl` — the smallest n any construction-counted cell in this sweep was measured at — 1 of 12 cells withdrawn as unreplicable (rule 13): chained\|fused\|incl\|1000\|dispatch-table |
| `0.95-1.10x` | `bench/chained.jl` — reading the finished array back, all six chained forms, both sizes — 1 of 12 cells withdrawn as unreplicable (rule 13): splitjoin\|packed\|excl\|1000\|dispatch-table |
| `0.84-1.00x` | `bench/chained.jl` — Object.keys(o).map(f) against the for-in walk that fuses it, construction counted |
| `0.99-1.09x` | `bench/chained.jl` — xs.map(f).sort() against the same map, construction counted — .sort() is in place |
| `0.91-1.22` | `bench/chained.jl` — every interval measured for those cells |
| `0.99-1.10x` | `bench/chained.jl` — s.split(sep).map(f).join(sep) against two different fusions, construction counted |
| `4.64-4.95x` | `bench/inline.jl` — a callee past the inlining budget against the same callee under it — 1 of 2 cells withdrawn as unreplicable (rule 13): large\|small\|excl\|100000 |
| `3.21x and 4.68x and 4.73x` | `bench/inline.jl` — the three sweeps at n=100000 — withdrawn under rule 13, quoted as the refutation it is |
| `4.34-5.22` | `bench/inline.jl` — the interval at n=1000 |
| `1` | `bench/inline.jl` — the whole sweep — 1 of 2 cells withdrawn as unreplicable (rule 13): large\|small\|excl\|100000 |
| `12.3-13.6x` | `bench/delete.jl` — one delete per object, reads only, at n=16384 and n=262144 — 1 of 2 cells withdrawn as unreplicable (rule 13): rowdel\|rowbase\|excl\|262144\|dispatch-table |
| `n=16384` | `bench/delete.jl` — the sizes the cells behind delete.rows still replicate at — 1 of 2 cells withdrawn as unreplicable (rule 13): rowdel\|rowbase\|excl\|262144\|dispatch-table |
| `11.5-13.2x` | `bench/delete.jl` — the same delete against assigning undefined instead, n=16384 |
| `13.1-15.1x` | `bench/delete.jl` — one object with one delete, reads only, every size and every sweep |
| `23.7-24.8x` | `bench/delete.jl` — one delete per object with construction counted, n=256 |
| `3.3-8.7x` | `bench/delete.jl` — the single object with construction counted, every size |
| `12` | `bench/delete.jl` — the whole sweep — 4 of 16 cells withdrawn as unreplicable (rule 13): rowdel\|rowbase\|excl\|262144\|dispatch-table, rowdel\|rowbase\|incl\|16384\|dispatch-table, rowdel\|rowbase\|incl\|262144\|dispatch-table, rowundef\|rowbase\|incl\|16384\|dispatch-table |
| `1.00-1.06x` | `bench/delete.jl` — assigning undefined instead of deleting, reads only — the fix, not the defect |
| `0.96-1.12` | `bench/delete.jl` — every interval measured for that cell |
| `0.98x and 1.05x and 1.18x` | `bench/delete.jl` — the three construction-counted sweeps at n=16384 — withdrawn under rule 13, quoted as the refutation it is |
| `1.18-3.54x` | `bench/example.jl` — radash assign — the whole call, both sizes, three sweeps each |
| `1.66-2.01x` | `bench/example.jl` — radash assign — the caller's reads of the result, both sizes, what each cell's three sweeps agree on |
| `0.17-0.51x` | `bench/example.jl` — es-toolkit omit — the whole call, 12 and 48 keys |
| `0.78-1.31` | `bench/arguments.jl` — the `arguments` object against a rest parameter, escaping, indexed and length-only — 2 of 9 cells withdrawn as unreplicable (rule 13): argesc\|restesc\|excl\|16384, arglen\|restlen\|excl\|262144 |
| `7` | `bench/arguments.jl` — the cells behind args.null — 2 of 9 cells withdrawn as unreplicable (rule 13): argesc\|restesc\|excl\|16384, arglen\|restlen\|excl\|262144 |
| `24.3-65.5x` | `bench/sparse.jl` — dictionary elements against a packed array, reads only |
| `20.4-40.1x` | `bench/sparse.jl` — the same with construction counted — 1 of 3 cells withdrawn as unreplicable (rule 13): dict\|packed\|incl\|262144 |
| `1.32-1.47x` | `bench/sparse.jl` — a holey array against a packed one, reads only — 1 of 3 cells withdrawn as unreplicable (rule 13): holey\|packed\|excl\|262144 |
| `0.28-0.68x` | `bench/sparse.jl` — the same with construction counted, where the holey array wins |
| `1.39-1.66x` | `bench/arrays.jl` — a genuinely boxed array against a double one, reads only, every size — the older sweep, not re-measured under r2 |
| `1.58-1.69x` | `bench/arrays.jl` — the same with construction counted, at RAM size — the older sweep, not re-measured under r2 |
| `0.96-1.08x` | `bench/arrays.jl` — a union-typed array holding only numbers, both halves, every size — the older sweep, not re-measured under r2 |
| `n=12 and n=48` | `bench/example.jl` — the key counts es-toolkit omit was swept at, which delete-property quotes in its fix |
| `10.8-12.0x` | `bench/example.jl` — es-toolkit omit — the caller's reads of the result at 12 keys |
| `11.3-11.7x` | `bench/example.jl` — the same at 48 keys — what its three sweeps agree on |
| `1.10-1.12x` | `bench/example.jl` — zod cleanEnum — the whole call at a 16-member enum, what its three sweeps agree on |
| `1.03-1.10x` | `bench/example.jl` — the same at 256 members — rejected under rule 6 (the broad-warning bar), quoted as the refutation it is |
| `0.13x` | `bench/example.jl` — remeda mergeAll — building the result at n=8 |
| `1.48-1.59x` | `bench/example.jl` — the same at n=64 — what its three sweeps agree on |
| `1.00-1.03x` | `bench/example.jl` — remeda mergeAll — the caller's reads on the result, both sizes, all six sweeps |

<!-- /generated -->

## How a cell is measured

A **cell** is one configuration of one benchmark: a pattern against its
rewrite, at one input size, in one mode. A **sweep** is one full run of a cell.
The tables cite these rules by number.

1. **One fresh OS process per observation**, one variant per process. Two
   variants in one process share inline caches, and that contaminates the
   comparison.
2. **AB/BA order is randomised** across paired processes, with the same seeded
   input to both. Order is a large confound.
3. **The timed region is calibrated to about 120 ms** on warm cost. A single
   cold probe under-sizes the slowest variant, the one a rule wants to indict,
   and inflates its ratio. A cell whose region lands outside 60-240 ms, more
   than 2x off target, is **void**: recorded and printed with its error, never
   published.
4. **Twenty measured pairs per sweep**, 40 processes, declared before the run.
   No extra samples when a result is close.
5. **The ratio of mean process times, with a paired bootstrap 95% interval.**
   Every raw per-pair timing is published beside it, so the interval can be
   recomputed. Never a best run.
6. **An interval that spans 1.0 is rejected.** A number quoted as a rule's
   evidence needs an agreement (rule 13) whose lower end is above 1.00. A broad
   warning, which `chained-allocation` is held to, also needs that lower end
   above 1.05 and a mean of the three sweep ratios of 1.10 or more. A cell that
   fails is never evidence; where the docs quote one, they call it rejected.
7. **Dead-code elimination is defeated**: input from a runtime seed, results
   folded into a checksum printed after timing, no I/O in the timed region. The
   driver compares the checksums inside every pair.
8. **No tracing, profiling, forced GC or V8 natives syntax in an evidence
   run.** Tiering is a separate diagnostic, below.
9. **Every row records its environment**: Node and V8 versions, flags, seeds,
   warmup counts, core affinity, the machine load as the row was written, and
   the load gate it ran under. The gate counts runnable threads outside the
   harness, the median of five samples, and refuses above `nproc - 1`: each
   observation is pinned to one core, and one more runnable thread would have
   to share it. It is checked before every cell and between the sweeps of a
   cell; a busy machine stops the sweep, which is resumed later. `--max-load`
   overrides the gate, and the row records the override. Older rows, such as
   those in `bench/arrays.jl`, lack these fields.
10. **Failures print in the same format as results**: `REJ`, and a void cell
    with its error.
11. **Both halves, always**: reads only, and with construction counted.
    Measuring one half can reverse a verdict.
12. **The working set is swept from L1 cache to RAM.** One size hides the point
    where memory bandwidth flattens an effect.
13. **Every cell runs as three whole sweeps.** The interval in rule 5 resamples
    the pairs of one sweep and cannot see what varies between sweeps:
    near-identical constructions measured 1.64x, 0.91x and 0.89x with mutually
    exclusive intervals. A cell's **agreement** is the range every one of its
    three intervals contains. A cell with no agreement is **withdrawn as
    unreplicable**, and its three numbers are printed anyway.

`make tiers` re-runs every published cell's shape under
`--trace-opt --trace-deopt`, in its own processes, at the rep counts the cell
was published at, and appends to `bench/tiers.jl`. A pair whose two sides reach
different tiers has a ratio that partly measures tiering, and `tierMismatch`
marks it. It is recorded and never gated on.

Results apply only to the engine and hardware tested. Every row that records
its environment ran on Node 22.23.2 with V8 12.4, on an AMD Ryzen 9 5950X,
pinned to one core. The V8 15.3 pin below names the source the citations quote,
not the engine the benchmarks ran on.

## Measured effects that ship no rule

A measurement that refutes a rule is published like one that supports it.

- **The `arguments` object against a rest parameter: nothing.** Nine cells —
  escaping, indexed and length-only, at 256, 16384 and 262144 — three sweeps
  each. The seven that replicate all contain 1.00, spanning 0.78-1.31; the
  other two agree on nothing and are withdrawn. `bench/arguments.jl`.
- **Dictionary-mode elements: large, and invisible to a static check.** An
  array V8 has moved to dictionary elements reads 24.3-65.5x slower than a
  packed one, and 20.4-40.1x slower with construction counted. Nothing in the
  source separates an array that went sparse from one that did not.
  `bench/sparse.jl`.
- **Holey arrays: small.** A holey array reads only 1.32-1.47x slower than a
  packed one, and is faster once you count building it, 0.28-0.68x.
  `bench/sparse.jl`.
- **Boxed arrays: real, and decided by values.** A boxed array costs
  1.39-1.66x to read, and 1.58-1.69x to build at RAM size. But V8 picks the
  elements kind from the values stored, not the declared type: a
  `(number | string)[]` holding only numbers measures 0.96-1.08x against
  `number[]`. A rule on the declared type would fire on the wrong arrays.
  `bench/arrays.jl`.
- **Adding a property after construction: no rule.**
  `const o = { a: 1 }; o.b = 2;` ends at the same hidden class for every object
  built that way, so the code that reads them sees one shape. Against writing
  both properties at once it costs 1.21-1.34x, an effect size this harness has
  failed to reproduce. An optional property is no worse, and cheaper to build.
  `bench/addprop.jl`.
- **Many keyed stores: large, with a threshold no rule can see.** Sixteen keyed
  adds to a one-field object push it into dictionary mode, and reading its
  fields then costs 6.17-6.34x; twelve do not. A rule cannot count how many
  keys a loop adds, and the rewrite for dynamic keys, a `Map`, is unmeasured.
  `bench/addprop.jl`.

Strings built with `s = s + x`, `s += x` or `s.concat(x)` are not quadratic in
V8: they build faster than a push-and-join, which is why `accumulating-spread`
is silent on them. `bench/strings.jl`.

## What V8's source says

Six rules cite the mechanism in V8's own source. A citation says what exists,
never what it costs: a constant in the source is a hypothesis until a benchmark
prices it.

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
| *no rule* — the elements kind is decided by the values stored, one value at a time, which is why there is no boxed-array rule | | `src/objects/elements-kind.h:105` → `enum ElementsKind`, `src/objects/objects-inl.h:700` → `OptimalElementsKind` |

Three citations say something the benchmarks alone could not:

- **A call slot caches one target.** It has no polymorphic tier, so the
  four-map budget governs the method *load*, and the *call* has a budget of
  one. A method kept in a field is past its cliff at the second target, not
  the fifth (`TC-13`).
- **The elements kind follows the values.** V8 picks it from the values
  actually stored, one at a time. The last row above is that mechanism, kept as
  the reason there is no boxed-array rule.
- **Quadratic work needs no engine.** `accumulating-spread` has no citation,
  and its effect, the largest measured here, would survive any engine rewrite.

`make v8-check` compares every citation above with a pinned V8 checkout and
fails with the line that drifted. Without the checkout it exits non-zero and
says so. The full clone's `.github/workflows/ci.yml` has the checkout commands
and reads the revision from the pin above.
