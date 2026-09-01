# The benchmarks

How every number this project publishes was measured, and how to re-check it.

Every rule carries two evidences: **a benchmark**, which says what the pattern
cost on this machine, and **a V8 citation**, which says what mechanism in the
engine exists. Neither substitutes for the other. A benchmark cannot say why; a
citation cannot say what it costs. Both are below, and both are re-runnable.

The protocol these sweeps obey is written out in full, rule by rule, in
`CLAUDE.md` under "The measurement protocol". `bench/driver.ts` implements it,
`bench/sweeps.ts` holds the cells, `bench/run.ts` is the runner, and
`bench/kernel.ts` is the contract a workload meets.

## Re-run any claim

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

Nothing else may run on the machine during a sweep. These are timings, and the
load gate refuses to start a cell on a busy machine.

## Every number this project publishes, and the rows it is

`make numbers` writes the table below, and the `EVIDENCE` strings the tool
prints, straight from the `.jl` files. Nothing here is typed twice, and
`make test` fails when a published number is no longer what its rows say.

<!-- generated: numbers -->

| Number | The rows it is |
|---|---|
| `3.4-11.3x` | `bench/shape-sets.jl` — five distinct property sets, reads only, L1 through RAM |
| `3.61-3.71x` | `bench/shape-sets.jl` — construction counted, five property sets, L1 and L2 — 1 of 2 cells withdrawn as unreplicable (rule 13): 5|1|incl|16384|L2 |
| `1.08-1.20x` | `bench/shape-sets.jl` — construction counted at RAM size, five property sets |
| `20` | `bench/shape-sets.jl` — the whole sweep — 4 of 24 cells withdrawn as unreplicable (rule 13): 2|1|incl|16384|L2, 2|1|incl|262144|L3, 4|1|incl|16384|L2, 5|1|incl|16384|L2 |
| `0.95-1.47x` | `bench/shape-sets.jl` — two to four property sets, reads only, every size — where the rule stays quiet |
| `4.4-11.5x` | `bench/shapes-calibrated.jl` — five key orders of ONE key set, reads only, L1 through RAM |
| `12.9-22.7x` | `bench/dispatch.jl` — a method on a prototype, five and six shapes, reads only |
| `1.52-1.65x` | `bench/dispatch.jl` — a method on a prototype, four shapes, reads only at L1 |
| `19.22-22.71x` | `bench/dispatch.jl` — a method on a prototype, five shapes, reads only at L1 |
| `7.1-9.0x` | `bench/dispatch.jl` — one shared function held as an own property, five and six shapes, reads only |
| `1.9-5.8x` | `bench/dispatch.jl` — five shapes with construction counted, prototype and own-property, L1 and L2 |
| `1.58-1.72x` | `bench/dispatch.jl` — a method on a prototype at RAM size, five and six shapes — 1 of 2 cells withdrawn as unreplicable (rule 13): cls5|cls1|incl|262144|L3|cls|5|dispatch-table |
| `1.00-1.14x` | `bench/dispatch.jl` — the same cells at two to four shapes |
| `73` | `bench/dispatch.jl` — the whole sweep — 7 of 80 cells withdrawn as unreplicable (rule 13): cls2|cls1|excl|262144|L3|cls|2|dispatch-table, cls5|cls1|incl|262144|L3|cls|5|dispatch-table, lit6|lit1|incl|16384|L2|lit|6|dispatch-table, lit6|lit1|incl|262144|L3|lit|6|dispatch-table, tgt2|lit1|excl|256|L1|tgt|2|dispatch-table, tgt3|lit1|excl|256|L1|tgt|3|dispatch-table, tgt5|lit1|excl|16384|L2|tgt|5|dispatch-table |
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
| `0.26-0.52x` | `bench/strings.jl` — s = s + x, s += x and s = s.concat(x) against a push-and-join, building only — 1 of 9 cells withdrawn as unreplicable (rule 13): pluseq|joined|build|1000|dispatch-table |
| `0.78-1.13x` | `bench/strings.jl` — the same three with the read back counted |
| `0.71-1.48` | `bench/strings.jl` — every interval measured for those nine cells |
| `2.56-2.87x` | `bench/select.jl` — the chosen value stored where it outlives the loop, both sizes |
| `2.59-2.92` | `bench/select.jl` — the intervals at n=10000, across the first sweep and the three replications |
| `2.30-3.09` | `bench/select.jl` — the intervals at n=100000, across the first sweep and the three replications |
| `6` | `bench/select.jl` — the whole sweep |
| `0.88-1.22x` | `bench/select.jl` — the same loop on numbers, both sizes — where the rule stays quiet |
| `0.84-1.30` | `bench/select.jl` — every interval measured on numbers |
| `2.01-2.45x` | `bench/select.jl` — the boxed form kept in a local, where escape analysis could see it, both sizes |
| `1.44-1.52x` | `bench/chained.jl` — xs.map(f).filter(g) against one fused pass, construction counted, both sizes — 1 of 2 cells withdrawn as unreplicable (rule 13): chained|fused|incl|1000|dispatch-table |
| `6.48x and 6.58x and 7.51x` | `bench/chained.jl` — the three sweeps of the n=1000 cell this rule used to headline — withdrawn under rule 13, quoted as the refutation it is |
| `1.37-1.63` | `bench/chained.jl` — every interval measured for the cells that replicate — 1 of 2 cells withdrawn as unreplicable (rule 13): chained|fused|incl|1000|dispatch-table |
| `3.67-3.76x` | `bench/chained.jl` — Object.entries(o).map(f) against a for-in walk at n=1000, construction counted |
| `3.50-4.04` | `bench/chained.jl` — every interval measured for that cell |
| `2.55-2.61x` | `bench/chained.jl` — the same at n=10000 |
| `2.23-2.97` | `bench/chained.jl` — every interval measured for that cell |
| `22` | `bench/chained.jl` — the 0.3 sweep, which is every row the dispatch-table kernel wrote — 2 of 24 cells withdrawn as unreplicable (rule 13): chained|fused|incl|1000|dispatch-table, splitjoin|packed|excl|1000|dispatch-table |
| `1000` | `bench/chained.jl` — the smallest n any construction-counted cell in this sweep was measured at — 1 of 12 cells withdrawn as unreplicable (rule 13): chained|fused|incl|1000|dispatch-table |
| `0.95-1.10x` | `bench/chained.jl` — reading the finished array back, all six chained forms, both sizes — 1 of 12 cells withdrawn as unreplicable (rule 13): splitjoin|packed|excl|1000|dispatch-table |
| `0.84-1.00x` | `bench/chained.jl` — Object.keys(o).map(f) against the for-in walk that fuses it, construction counted |
| `0.99-1.09x` | `bench/chained.jl` — xs.map(f).sort() against the same map, construction counted — .sort() is in place |
| `0.91-1.22` | `bench/chained.jl` — every interval measured for those cells |
| `0.99-1.10x` | `bench/chained.jl` — s.split(sep).map(f).join(sep) against two different fusions, construction counted |
| `4.64-4.95x` | `bench/inline.jl` — a callee past the inlining budget against the same callee under it — 1 of 2 cells withdrawn as unreplicable (rule 13): large|small|excl|100000 |
| `3.21x and 4.68x and 4.73x` | `bench/inline.jl` — the three sweeps at n=100000 — withdrawn under rule 13, quoted as the refutation it is |
| `4.34-5.22` | `bench/inline.jl` — the interval at n=1000 |
| `1` | `bench/inline.jl` — the whole sweep — 1 of 2 cells withdrawn as unreplicable (rule 13): large|small|excl|100000 |
| `12.3-13.6x` | `bench/delete.jl` — one delete per object, reads only, at n=16384 and n=262144 — 1 of 2 cells withdrawn as unreplicable (rule 13): rowdel|rowbase|excl|262144|dispatch-table |
| `n=16384` | `bench/delete.jl` — the sizes the cells behind delete.rows still replicate at — 1 of 2 cells withdrawn as unreplicable (rule 13): rowdel|rowbase|excl|262144|dispatch-table |
| `11.5-13.2x` | `bench/delete.jl` — the same delete against assigning undefined instead, n=16384 |
| `13.1-15.1x` | `bench/delete.jl` — one object with one delete, reads only, every size and every sweep |
| `23.7-24.8x` | `bench/delete.jl` — one delete per object with construction counted, n=256 |
| `3.3-8.7x` | `bench/delete.jl` — the single object with construction counted, every size |
| `12` | `bench/delete.jl` — the whole sweep — 4 of 16 cells withdrawn as unreplicable (rule 13): rowdel|rowbase|excl|262144|dispatch-table, rowdel|rowbase|incl|16384|dispatch-table, rowdel|rowbase|incl|262144|dispatch-table, rowundef|rowbase|incl|16384|dispatch-table |
| `1.00-1.06x` | `bench/delete.jl` — assigning undefined instead of deleting, reads only — the fix, not the defect |
| `0.96-1.12` | `bench/delete.jl` — every interval measured for that cell |
| `0.98x and 1.05x and 1.18x` | `bench/delete.jl` — the three construction-counted sweeps at n=16384 — withdrawn under rule 13, quoted as the refutation it is |
| `3.22-4.65x` | `bench/example.jl` — radash assign — the whole call, both sizes, three sweeps each |
| `1.57-2.06x` | `bench/example.jl` — radash assign — the caller's reads of the result, both sizes, what each cell's three sweeps agree on |
| `1.62-3.32x` | `bench/example.jl` — es-toolkit omit — the whole call, 12 and 48 keys |
| `0.78-1.31` | `bench/arguments.jl` — the `arguments` object against a rest parameter, escaping, indexed and length-only — 2 of 9 cells withdrawn as unreplicable (rule 13): argesc|restesc|excl|16384, arglen|restlen|excl|262144 |
| `7` | `bench/arguments.jl` — the cells behind args.null — 2 of 9 cells withdrawn as unreplicable (rule 13): argesc|restesc|excl|16384, arglen|restlen|excl|262144 |
| `24.3-65.5x` | `bench/sparse.jl` — dictionary elements against a packed array, reads only |
| `20.4-40.1x` | `bench/sparse.jl` — the same with construction counted — 1 of 3 cells withdrawn as unreplicable (rule 13): dict|packed|incl|262144 |
| `1.32-1.47x` | `bench/sparse.jl` — a holey array against a packed one, reads only — 1 of 3 cells withdrawn as unreplicable (rule 13): holey|packed|excl|262144 |
| `0.28-0.68x` | `bench/sparse.jl` — the same with construction counted, where the holey array wins |
| `1.39-1.66x` | `bench/arrays.jl` — a genuinely boxed array against a double one, reads only, every size — the older sweep, not re-measured under r2 |
| `1.58-1.69x` | `bench/arrays.jl` — the same with construction counted, at RAM size — the older sweep, not re-measured under r2 |
| `0.96-1.08x` | `bench/arrays.jl` — a union-typed array holding only numbers, both halves, every size — the older sweep, not re-measured under r2 |
| `n=12 and n=48` | `bench/example.jl` — the key counts es-toolkit omit was swept at, which delete-property quotes in its fix |
| `11.2-11.6x` | `bench/example.jl` — es-toolkit omit — the caller's reads of the result at 12 keys |
| `0.97-1.04x` | `bench/example.jl` — the same at 48 keys, where the fix stops fixing the read — what its three sweeps agree on |
| `1.10-1.12x` | `bench/example.jl` — zod cleanEnum — the whole call at a 16-member enum, what its three sweeps agree on |
| `1.03-1.10x` | `bench/example.jl` — the same at 256 members — rejected under rule 6 (the broad-warning bar), quoted as the refutation it is |
| `1.36-1.38x` | `bench/example.jl` — remeda mergeAll — building the result at n=8 |
| `18.78-20.87x` | `bench/example.jl` — the same at n=64 — the triple that disagreed, re-swept, and what these three agree on |
| `0.11-0.12x` | `bench/example.jl` — remeda mergeAll — the caller's reads on the result, both sizes, all six sweeps |

<!-- /generated -->

## How a cell is measured

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

Which tier V8 actually compiled the measured code to is a separate diagnostic,
never an evidence run: `make tiers` re-runs every published cell's shape under
`--trace-opt --trace-deopt` in its own processes and appends what it finds to
`bench/tiers.jl`. A pair whose two sides reach different tiers has a ratio that
is partly a measurement of tiering, and `tierMismatch` says so in that file's
row. It is recorded, never gated on.

Results apply only to the engine and hardware tested.

## Two sweeps that produced no rule

Not every measurement earns a rule, and these two are in the file because they
did not.

**`arguments` against a rest parameter: nothing.** The advice to avoid the
`arguments` object is old, widely repeated, and this project could not price it.
Nine cells — escaping, indexed, and length-only, at 256, 16384 and 262144 — three
sweeps each. Seven replicate and every one of those intervals contains 1.00
(`args.null`, spanning 0.78-1.31 across them); the other two agree on nothing at
all and are withdrawn, which is what a sweep does when the effect it is looking
for is not there. No rule reports `arguments`, and `bench/arguments.jl` is why.
`BUGS.md` TC-53.

**Dictionary-mode ELEMENTS, which no rule reports, is the largest ratio here.**
An array V8 has moved to dictionary elements reads 24.3-65.5x slower
than a packed one, and 20.4-40.1x slower with construction counted —
an order of magnitude past anything else in this file. It has no rule because
nothing static separates an array that went sparse from one that did not.

**And the folklore beside it is refuted.** A holey array — the transition people
actually warn about — reads only 1.32-1.47x slower, and is FASTER than
packed once you count building it: 0.28-0.68x. So "holey arrays are
slow" is not the sparse transition worth a rule, and the one that is cannot be
detected. `BUGS.md` TC-52.

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
