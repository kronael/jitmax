# jitmax

Mark a TypeScript function with `/** @jitmax */`. jitmax reports the
lines in it, and in every callee whose source it can read, that match patterns
measured to push V8 off its fast path. Each finding carries the fix and names
the sweep that priced the rule. The cost itself is in this file, not beside the
finding: a ratio is a property of the input, and the annotation says the
function is hot, not how large its data is.

![jitmax finding one line in a function radash ships](demo/demo.gif)

## Use it

Get it. Running needs no build step and it is not on npm, so clone it and run
it where it lands:

```sh
git clone <repo-url> jitmax
cd jitmax && npm install
```

Mark the function you need fast:

```ts
/** @jitmax */
export function total(rows: Row[]): number { … }
```

Point it at your sources:

```sh
node /path/to/jitmax/bin/jitmax.ts src
```

It exits 0 when every annotated function is clean, 1 when it has an error to
report **or when it could not see everything** — a truncated walk, a module it
could not resolve, or a hot frame from a profile that matched no function here —
and 2 when the tool itself failed. A gate reads the exit code, so a run that
could not see everything is never a pass. Warnings alone do not fail a run.

**Installing it as a dependency does not work, and that is a defect, not a
policy.** `bin/jitmax.ts` is TypeScript run directly by Node, and Node refuses
to strip types from a file inside `node_modules`, so a packed install fails at
startup with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`. Clone it and run it
by path until that is fixed. `BUGS.md` TC-72.

It loads *your* TypeScript, not a bundled copy.

## Configure it

Two optional layers turn a rule off. Neither is required — with no config and
no overrides, jitmax behaves exactly as above.

**A TOML config**, the first CLI positional, named by its `.toml` suffix:

```sh
jitmax jitmax.toml src
```

```toml
[rules]
"megamorphic-elements" = false
"TC-9" = false
```

**A per-function override**, in the same comment as the promise:

```ts
/** @jitmax -megamorphic-elements */
export function total(rows: Row[]): number { … }

/** @jitmax -TC-2 -TC-9 */
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

## Or let a profile decide what is hot

The annotation is you asserting a function is hot. A profile is a measurement of
it. Record one and hand it over as the second suffix-named positional:

```sh
node --cpu-prof --cpu-prof-dir=. your-workload.js
jitmax run.cpuprofile src
```

Every function at or above `[profile] min_self_pct` of the profile's sampled
self time is marked, and the report says what marked it:

```
  src/hash.ts:8  compress() — 58.6% of samples, run.cpuprofile
```

Nothing else changes: the walk, the rules and the exit code cannot tell a
profiled mark from an annotated one. There is no static "hotness" mode and there
will not be one — a loop with an unknown trip count and a high call-graph fan-in
predict hotness weakly, and this tool prints "hotness is a property of the
workload" under every run it makes. A profile that matches no function in the
program is exit `2`, not a clean run: it means the profile is stale against the
source beside it. `min_self_pct` defaults to 1 and is a constant nobody has
measured, so the TOML owns it and every run prints the value it used.

## What you get

```
jitmax — 46 annotated functions, 15 errors, 1 warning

  demo/lib.ts:164  viaCallee()
    error  delete-property
      demo/lib.ts:159
      delete o[k] puts its object in dictionary mode
      fix: assign undefined where the key may stay present, or build the object without it —
      the rebuild helps at 12 keys and not at 48, where filling it key by key normalizes it too
      measured in bench/delete.jl
      known defect: TC-9 — rules fire outside the conditions their own evidence establishes
```

`error` or `warn`, and only an error fails the run. A rule warns when no
benchmark measures the program it fires on; `closed-world` is the only one, and
it was 98.8% of every finding across the 22-codebase survey below, so before
this it decided nearly every exit code on evidence this project does not have.

Four things, and the second is the point:

- **the line**, `demo/lib.ts:148` — which is inside `dropInner`, a function
  nobody annotated. `viaCallee` has the annotation; jitmax followed the
  call and reported where the cost actually is.
- **the sweep that priced the rule**, named, so you can read the cost in this
  file and re-run it yourself with `make bench-*`. No ratio is printed beside
  the finding, because the tool cannot see the size of what will run through
  that line and the ratio depends on it: accumulating spread measured 149-166x
  at n=1000 and 1766-1889x at n=10000, the same rule on the same machine.
- **the fix**, concretely, not "consider optimising" — and where the fix itself
  stops paying, wherever applying it to somebody else's function found a limit.
- **what it could not check** — a call that resolves to a declaration with no
  body is listed by name, and a walk that hits its limit prints
  `WALK TRUNCATED`, exits `1`, and is never reported as clean. A call through a
  parameter or an interface method is NOT listed: it resolves to a declaration
  that is neither followable nor a declaration file, and falls through both
  branches (`BUGS.md` TC-31). Read the coverage line as "the calls it could
  name", not "everything it could not see".

Exit codes: `0` clean or warnings only, `1` jitmax has an error to report OR
could not see everything, `2` the tool itself failed. A path that does not exist
is a `2`, never a clean run. Three things are a `1` with no error in them,
because a run that proves nothing about part of your call tree is not a clean
run either: a walk that hit its limit, a module that would not resolve (every
type it declares reads as `any`, so every type-based rule went quiet on the
files importing it), and a hot frame in a profile that matched no function in
these sources.

## Requirements

Node `>=22.18`, which strips types itself, so RUNNING the tool needs no build
step. Development has one, for the derived artifacts only:

```sh
make          # all: lint, test, check — asserts the committed artifacts
              # still match their sources; regenerates nothing
make build    # numbers + builtins: regenerate lib/numbers.ts and
              # lib/builtins.ts after a .jl sweep or a V8 re-pin, then commit
```

`make` never runs `build`: regenerating right before the drift assertions would
compare fresh output against fresh output, and a stale committed artifact could
never fail again.

TypeScript `>=5.0.0` as a peer dependency — jitmax loads *your* copy, so it
parses with the same compiler your build does. It does **not** yet read your
`tsconfig.json` when you pass it a path: the config is loaded only for a bare
`jitmax` with no arguments, and the documented `jitmax src` form
compiles under built-in ES2022/NodeNext options instead. Path aliases, JSX mode
and ambient types can therefore resolve differently from your build
(`BUGS.md` TC-32).

## Why this exists

V8 already optimises your code well. But a short list of ordinary-looking
patterns quietly turns those optimisations off, and nothing warns you. This is
that list, measured.

*Where the idea came from:* Numba's `@njit` marks one Python function and pulls
in its whole call tree. It compiles that tree or stops with a line and a reason.
jitmax borrows the annotation and the call-tree walk. The jobs differ:
CPython does not JIT, so Numba must compile; V8 does, so jitmax only tells
you where your code blocks it.

## The rules

Seven rules ship. The first six check every function in the call tree. The
seventh reports where the walk stops. Megamorphic means one code location has
seen many object shapes. Quadratic means the work grows with the square of the
input size.

Each rule carries two clauses, and they are not the same clause. `silent` is
where the same benchmark **refused** the rule — it measured the case and found
nothing worth reporting, and a test fails if the rule fires there. `unreported`
is where the benchmark found a **real cost the rule does not report**, because
no declared type separates that case from one it would be wrong to warn about.
Two rules have one. Summarising both as "where the benchmark found nothing" was
false for both (`BUGS.md` TC-39).

| Rule | What it looks for | Where the measurement found no effect |
|---|---|---|
| `megamorphic-elements` | the fifth distinct property set at a load site — 3.4-11.3x on reads | two to four sets, 0.95-1.47x |
| `megamorphic-dispatch` | `x.step()` where `x` is one of five object types | two to four types, for a method on a class |
| `accumulating-spread` | `[...acc, v]`, `{ ...acc, k: v }`, `acc.concat(v)` or `Object.assign({}, acc, …)` in a loop — quadratic | no loop re-runs the copy; `Object.assign(acc, …)`, which mutates; strings, which V8 appends to instead of copying |
| `chained-allocation` | `.map().filter()` or `Object.entries(o).map()` allocates between stages | one stage; large n; `Object.keys(o).map()`, `.sort()`, `.split().map().join()` |
| `allocating-select` | `x = Lib.min(x, y)` in a loop returns a new object every pass | the same loop on numbers |
| `delete-property` | `delete` demotes an object to dictionary mode — 12.3-13.6x per property load after it | assigning `undefined` instead, which costs 1.00-1.06x |
| `closed-world` | calls to code with no readable body | a callee small enough to inline costs nothing |

**Every rule includes the benchmark that earned it, and the case where the same
benchmark found nothing.** `closed-world` measures the mechanism a call boundary
controls: a callee V8 refuses to inline costs 4.64-4.95x in a hot loop at
n=1000. That is a bound on what one unchecked call can cost, not a claim about
any particular one — and it is why `closed-world` warns rather than erring and
never fails a run: the rule fires on a callee with no readable body and the
sweep measures a readable one padded past the inlining budget (`BUGS.md`
TC-33). That range used to be 4.42-4.79x, one sweep per size,
and then 3.21-4.95x. Re-measured three times over, the n=1000 cell replicates
and the n=100000 cell **does not replicate at all**: 3.21x, 4.68x and 4.73x,
with intervals 2.54-3.88, 3.88-5.58 and 4.28-5.39 that share no common value.
`lib/derive.ts` now withdraws that cell instead of quoting it, which is why the
range no longer reaches down to 3.21x: the old bottom end **was** the dissenting
sweep.
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
code.** Two rules now check a condition in their own third column, and the rest
do not. `megamorphic-elements` requires a read off an element before it fires
(TC-8, fixed). `chained-allocation` stays silent when a `.slice()` in the chain
bounds the result to a literal below the smallest n its sweep covers (TC-54,
fixed) — and where nothing bounds it, the rule still cannot see how big your
array is, which is the general case and is why no cost is printed beside a
finding. The `delete` rule fires without knowing whether anything reads the
object afterwards, and its cost is *per read*. The gap is written up as TC-9 in
`BUGS.md`.

**One entry left that column by being wrong.** Until 2026-08-15 the `delete` row
read "a single delete on one object", published since the first round as a case
this project had refuted — 0x, with dictionary mode up to 10% *faster*.
Re-measured against a kernel that has to load the object on every pass, one
object with one delete costs **13.1-15.1x**, in all nine of its sweeps, more
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
| `1.44-1.52x` | `bench/chained.jl` — map then filter with construction counted at n=100000, where bandwidth dominates |
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
| `n=12 and n=48` | `bench/example.jl` — the key counts es-toolkit omit was swept at, which delete-property quotes in its fix |
| `11.2-11.6x` | `bench/example.jl` — es-toolkit omit — the caller's reads of the result at 12 keys |
| `0.97-1.04x` | `bench/example.jl` — the same at 48 keys, where the fix stops fixing the read — what its three sweeps agree on |
| `1.10-1.12x` | `bench/example.jl` — zod cleanEnum — the whole call at a 16-member enum, what its three sweeps agree on |
| `1.03-1.10x` | `bench/example.jl` — the same at 256 members — rejected under rule 6 (the broad-warning bar), quoted as the refutation it is |
| `1.36-1.38x` | `bench/example.jl` — remeda mergeAll — building the result at n=8 |
| `18.78-20.87x` | `bench/example.jl` — the same at n=64 — the triple that disagreed, re-swept, and what these three agree on |
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
program gets. So: take a function a library ships, apply the fix jitmax
printed on it and nothing else, and time the whole call the way a caller makes
it. The pairs are in `examples/` — `diff` a `.before.ts` against its `.after.ts`
and the fix is the entire change. `make example` prints the findings, then runs
the sweep.

Nothing here was searched for. Eleven libraries were cloned shallow and
annotated by `examples/annotate.js` — every function not nested inside another
whose body loops — and these are the findings that came back. radash is the
twelfth, marked by hand a round earlier, and it took fixing three classes of
false positive to get that run from eight findings to one. The
ratio is before/after, so above 1.0 the shipped code costs that much more and
**below 1.0 the fix made it slower**. Three whole sweeps per cell, per §4
rule 13, all three printed.

**The whole call, which is what a caller gets:**

| Function, and the finding | n | three sweeps | agreement |
|---|---|---|---|
| radash `assign` — `accumulating-spread` | 16 | 3.22 / 3.25 / 3.46 | **3.13–3.38** |
| radash `assign` | 128 | 4.60 / 4.65 / 4.44 | **4.38–4.79** |
| remeda `mergeAll` — `accumulating-spread` | 8 | 1.36 / 1.37 / 1.38 | **1.33–1.42** |
| remeda `mergeAll` | 64 | 20.29 / 18.09 / 19.88 | **18.78–20.87** |
| es-toolkit `omit` — `delete-property` | 12 | 1.70 / 1.77 / 1.62 | **1.67–1.71** |
| es-toolkit `omit` | 48 | 3.13 / 3.17 / 3.32 | **3.14–3.30** |
| zod `cleanEnum` — `chained-allocation` | 16 | 1.05 / 1.20 / 1.14 | **1.10–1.12** |
| zod `cleanEnum` | 256 | 1.03 / 1.06 / 1.08 | **1.03–1.10** |

**Reads on the value the function returns**, which is where `delete-property`'s
cost is actually paid — by the caller, not inside the function:

| Function | n | three sweeps | agreement |
|---|---|---|---|
| radash `assign` | 16 / 128 | 1.98 / 1.93 / 2.01 · 1.61 / 1.70 / 1.55 | **1.91–2.06** · **1.57–1.70** |
| remeda `mergeAll` | 8 / 64 | 0.12 / 0.11 / 0.12 · 0.11 / 0.11 / 0.11 | **0.11–0.12** · **0.11** |
| es-toolkit `omit` | 12 | 11.18 / 11.65 / 11.29 | **10.89–11.77** |
| es-toolkit `omit` | 48 | 0.99 / 1.01 / 1.05 | **0.97–1.04, REJECTED** |
| zod `cleanEnum` | 16 | 0.98 / 1.11 / 1.01 | **none — DISAGREES** |
| zod `cleanEnum` | 256 | 1.02 / 1.01 / 1.05 | **0.98–1.07, REJECTED** |

**The honesty condition.** An end-to-end number is far below the microbenchmark
ratio, always. `accumulating-spread` cites 186-200x for an object spread at
n=500; applied to radash's `assign` it moves the whole call 3.22-4.65x, because
the function around that one line also allocates, recurses and branches. That
gap is the most useful thing in this table: it is what a reader gets, and the
200x is not.

Four things in these tables say something worse than "smaller", and they are
here at the same size as the wins. **Two of the four were different when this
section was written**, and the re-measurement moved them in opposite directions
— which is the reason each cell is run three times and each of the three is
printed:

- **`omit` at 48 keys rejects on reads** — 0.97–1.04x, an interval spanning 1.0
  in all three sweeps. `%HasFastProperties` is false on *both* sides: building a
  46-key object one key at a time normalizes it just as `delete` does. The fix
  stops fixing the read somewhere between 12 keys and 48, and the rule still
  cannot see the width — so the `fix:` line says it: *"the rebuild helps at 12
  keys and not at 48, where filling it key by key normalizes it too"*.
- **`mergeAll` at n=64 stopped disagreeing, and that is not a promotion.** It
  read 17.34x, 19.34x, 20.10x with no value inside all three intervals, and was
  printed here as a cell rule 13 refuses. Three fresh sweeps read 20.29x,
  18.09x, 19.88x and *do* share one, 18.78–20.87x. Six sweeps, the same six
  numbers scattered over the same range, and the second three happened to
  overlap. It stays in this list: a cell that agrees on one triple and not on
  another has shown that its interval is narrower than its spread, which is the
  thing rule 13 exists to catch, and one agreeing triple does not unshow it.
- **`mergeAll` reads are 8x slower after the fix**, 0.11–0.12x at both sizes in
  all six sweeps. `Object.assign(out, item)` in a loop — the form this project's
  own evidence names as the fix — returns a `[DictionaryProperties]` object,
  where the spread returns a `[FastProperties]` one. `accumulating-spread` fixed
  a quadratic build and created a per-load cost it never mentioned, so the rule
  now prints a different fix for each form: pushing onto an **array** costs the
  reader nothing (0.96-1.02x) and carries no condition, and the **object** form
  says *"that fills the result key by key, which normalizes the object: the
  SPREAD-built object reads 0.11-0.12x of what the filled one costs"*. Read the
  ratio in that direction: the object the defect builds is the CHEAPER one to
  read back, which is the whole reason the clause exists. Same detection, honest
  advice — radash's `assign` is the same fix with the reads coming out
  1.57–2.06x *faster*, which is why it is a condition to check and not a rule to
  apply. `BUGS.md` TC-16. And zod's `cleanEnum` reads went the other way from
  `mergeAll`'s: they rejected at 1.00–1.15x and now do not replicate at all
  (0.98x, 1.11x, 1.01x), so of the six read cells here, one agrees on a real
  effect, three reject, one is 8x worse and one has stopped agreeing with
  itself.
- **`chained-allocation`'s fix is worth almost nothing on the real instance**,
  and this is the verdict the re-measurement moved. It used to read "worth
  nothing at either size" — 0.98–1.03x rejecting at a 256-member enum, three
  sweeps that could not agree at a 16-member one. Re-run, both sizes now clear
  1.0: **1.10–1.12x** at 16 and **1.03–1.10x** at 256, neither interval spanning
  it. So the fix is worth something, and what it is worth is three to twelve
  percent against a rule that cites **1.44-1.52x** for `map` then `filter`,
  where the loop body is one multiply and the allocation is the whole cost.
  That figure read 6.48-7.51x until rule 13 was enforced in `lib/derive.ts`:
  it came from an n=1000 cell whose three sweeps share no common value, and
  what is left is the cell that replicates. In zod's `cleanEnum` the same two stages sit next to an `Object.entries`
  allocation neither version avoids and a `Number.parseInt` per key that dwarfs
  both, and the fused loop pays back most of what it saved by growing its result
  array instead of getting it pre-sized by `.map()`. Two orders of magnitude
  between the microbenchmark and the function is the finding either way.

**The whole survey, so the four examples are not four picks out of a hat.**
Twelve libraries, 850 annotated functions, 1500 findings — **54 of them errors,
at 54 distinct source lines.** No library produced nothing.

Re-measured 2026-08-28, and the counting changed with it. A finding is now one
per SITE: a line reached from 28 annotated functions used to be 28 findings, so
every count in this section used to be the call-graph fan-in rather than the
work (`BUGS.md` TC-62). Calls into the platform are counted for the run and
never listed (TC-55), and every call the walk cannot follow is now reported
rather than falling through both branches and vanishing (TC-45).

| Library | annotated | findings | what fired |
|---|---|---|---|
| es-toolkit 1.50.0 | 286 | 192 | 180 `closed-world`, 7 `delete-property`, 3 `chained-allocation`, 2 `accumulating-spread` |
| ramda 0.32.0 | 100 | 199 | 198 `closed-world`, 1 `delete-property` (`_dissoc`) |
| immutable 5.1.9 | 89 | 270 | 267 `closed-world`, 2 `chained-allocation`, 1 `delete-property` |
| remeda 2.0.0 | 79 | 81 | 78 `closed-world`, 2 `delete-property`, 1 `accumulating-spread` |
| zod 4.4.3 (`v4/core`) | 78 | 123 | 102 `closed-world`, 15 `delete-property`, 5 `chained-allocation`, 1 `megamorphic-elements` |
| just 1.22.4 | 61 | 76 | 74 `closed-world`, 1 `delete-property`, 1 `chained-allocation` |
| luxon 3.7.2 | 52 | 105 | 99 `closed-world`, 3 each `delete-property` and `chained-allocation` |
| decimal.js 10.6.0 | 36 | 220 | 220 `closed-world` |
| date-fns 4.4.0 (`core`) | 28 | 24 | 21 `closed-world`, 1 each `delete-property`, `chained-allocation`, `accumulating-spread` |
| dinero.js 2.0.2 | 20 | 145 | 143 `closed-world`, 1 `chained-allocation`, 1 `accumulating-spread` |
| big.js 7.0.1 | 13 | 53 | 53 `closed-world` |
| radash 12.1.1 | 8 | 12 | 11 `closed-world`, 1 `accumulating-spread` |

Three things in that table are about the tool rather than the libraries.

**`closed-world` is 1446 of the 1500 findings** — 96% — and it warns rather
than erring, so none of it fails a run. Three different things live under that
one rule and the report now says which: a typed dependency the walk cannot read
into, a callee reached through an interface whose body IS in the checkout, and
a missing `npm install`. Node's own API is no longer among them at all — those
calls are counted for the run and never listed, because "inline what you need
from `path.join`" is advice nobody can take (`BUGS.md` TC-55, TC-69, TC-51).
The 54 errors under it are what a reader is actually asked to act on.

**`megamorphic-dispatch` never fired once** in these 850 annotated functions.
The sharpest cliff this project measured, 12.9-22.7x, is not a shape utility
libraries have. It does appear in the two applications below.

**`megamorphic-elements` fires at exactly one site in 850 functions** — zod's
`prefixIssues`, whose `issues` parameter unions twelve issue types and which
reads `.path` off every element through an `as any`. It used to print as ten
findings, which was the same line reported from ten annotated roots that reach
it; one site is what the flagship rule is worth across twelve libraries, and the
ten was the fan-in flattering it.

### Two applications, and the rules twelve libraries could not reach

A utility library is a pipeline. Two programs that are neither small nor fast
were run exactly the same way — cloned shallow, annotated by
`examples/annotate.js`, nothing picked by hand:

| Program | annotated | findings | what fired |
|---|---|---|---|
| TypeScript 5.9.3 (`src/compiler`) | 465 | 6454 | 6430 `closed-world`, 12 `allocating-select`, 5 `megamorphic-elements`, 4 `chained-allocation`, 2 `accumulating-spread`, 1 `delete-property` |
| typescript-eslint 8.67.0 | 311 | 2893 | 2882 `closed-world`, 8 `chained-allocation`, 2 `delete-property`, 1 `megamorphic-dispatch` |

Read those `closed-world` totals as a defect in this tool before reading them
as anything about either codebase. Neither checkout had `node_modules` installed, so every call into a
missing package is an unresolvable callee, reported once per annotated caller
that reaches it. `BUGS.md` TC-51. The two rows are kept out
of the table above for the same reason: mixed in they would move
`closed-world`'s share from 96% to 99% and teach a reader nothing.

Under the flood are the two rules twelve libraries never exercised.

**`megamorphic-dispatch` fired, for the first time on code this project did not
write.** `packages/eslint-plugin/src/rules/no-misused-promises.ts:543` calls
`tsNode.name.getText()`, and `name` reaches that call as six distinct property
sets — a TypeScript declaration name is not one node type. Six is past the four
maps V8 caches for the site.

**`megamorphic-elements` fires at five sites in the compiler**, against one in
all twelve libraries, and its widest instance is `checker.ts:44260`:
`checkUnusedIdentifiers` walks a `PotentiallyUnusedIdentifier[]` and reads
`node.kind` off every element, where that union is 20 distinct property sets at
one load site. TC-2's caveat still applies — a union member is not a V8 map —
but 20 against a budget of 4 is the widest gap this survey has found.

The plainest finding in either program needs no caveat at all.
`typescript-estree/src/ast-converter.ts:48` deletes `range` and `loc` from
every node of the converted AST when the parser is asked not to emit them, and
`delete` is the one pattern here whose mechanism is not an estimate: the object
goes to dictionary mode, and every rule that later reads that node reads it
from a dictionary.

### A wider net, and the one thing it settled

Twelve libraries and two applications left one rule with no instance of the
shape its own benchmark measured. Eight more codebases were run the same way,
so that the absence would mean something:

| Codebase | annotated | findings | what fired besides `closed-world` |
|---|---|---|---|
| svelte (`packages/svelte/src`) | 504 | 2813 | 16 `allocating-select`, 13 `delete-property`, 12 `chained-allocation`, 2 `accumulating-spread` |
| vue (`packages/*/src`) | 409 | 2340 | 13 `delete-property`, 6 `chained-allocation`, 4 `accumulating-spread`, 2 `megamorphic-elements`, 1 each `allocating-select` and `megamorphic-dispatch` |
| typebox | 199 | 57 | **29 `accumulating-spread`**, 3 `delete-property` |
| mobx | 49 | 132 | 2 `delete-property` |
| valibot | 87 | 176 | 9 `chained-allocation`, 1 `delete-property` |
| rxjs | 60 | 241 | nothing |
| immer | 10 | 54 | 2 `delete-property` |
| ts-pattern | 9 | 23 | nothing |

**Vue is the only codebase that fires all seven rules.** A framework is not a
pipeline, and both megamorphic rules find shapes in it that no utility library
has.

**And the survey is what closed TC-8.** Vue reported 46 `megamorphic-elements`
before the rule was made to check for a read off an element. Of 46 findings on a
real framework, every one was a function that never read a property off the
thing being reported — `rows.length` and nothing else. A defect that reads as a
caveat in a tracker reads differently at the whole of a rule's output on a real
codebase.

The same survey caught the fix overshooting. zod's `prefixIssues` writes
`(iss as any).path.unshift(path)`, and reading the receiver's type off the cast
returned `any`, so the one true instance of this rule in twelve libraries went
silent with the false ones. A cast is a claim about the type checker, not about
the object; V8 loads from the object's map either way.

**What the rule is worth, counted per site: eight lines in 2953 annotated
functions** — five in the TypeScript compiler, two in vue, one in zod. That is
the flagship rule's whole footprint on 22 real codebases, and it is the number
this README leads with. `BUGS.md` TC-64 reaches the same place from 30 other
corpora and a different annotation rule.

**TypeBox has 29 distinct accumulating-spread sites, more than every other
codebase here put together.** It used to print as 119, which was those sites
counted once per annotated function reaching them. `FromObject` in
`value/create/from_object.ts` is six lines and is the whole rule:
`required.reduce((result, key) => ({ ...result, [key]: … }), {})`.

**`allocating-select` fires at 29 distinct sites across 2953 annotated
functions, and not once on the shape it measures.** Every finding is a value being
*advanced* or *wrapped* — `date = addMinutes(date, step)`, `initial =
b.call('$.proxy', initial)`, `spread = getSpreadType(…)` — where the value
changes on every pass and "compare first" saves nothing. The benchmark measured
a *choice* between two values where the incumbent almost always wins. Twenty-two
codebases is a large enough net that this stops reading as a gap in the search
and starts reading as a verdict on the rule. `BUGS.md` TC-18.

### Which rules have an end-to-end example, and which cannot have one

`examples/` can only hold a rule whose printed fix is a change to the function
the rule fired on. That is not a property of every rule here, and saying which
is which is worth more than four more tables.

| Rule | End to end |
|---|---|
| `accumulating-spread` | radash `assign`, remeda `mergeAll` — **3.22-4.65x**, and a read cost the fix line now carries |
| `delete-property` | es-toolkit `omit` — **1.62-3.32x**, and a width past which it stops |
| `chained-allocation` | zod `cleanEnum` — **1.10-1.12x** at 16 members clears the broad-warning bar; **rejected under rule 6 at 256** (1.03-1.10x — lower bound under 1.05x, point estimate under 1.10x), published above |
| `allocating-select` | **no instance of the measured shape in 2953 functions.** Its six findings are all `x = advance(x, step)` — `date = addMinutes(date, step)` in four date-fns functions, `sink = lazy(sink)` in es-toolkit's `pipe`. The benchmark measured a *choice* between two values where the incumbent almost always wins, and the fix, "compare first and assign only when x really changes", saves an allocation exactly on the passes that change nothing. A cursor changes on every pass. `BUGS.md` TC-18 |
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
- **Two cells failed replication, and neither is inside a range this page
  quotes.** Protocol rule 13 runs every published cell three whole times and
  calls the three in agreement when a value sits inside all three intervals.
  `closed-world`'s n=100000 cell read 3.21x and 4.68x and 4.73x with no such
  value, and `delete-property`'s n=262144 read cell disagreed the same way.
  Both are withdrawn inside `lib/derive.ts`, where the number is made, so
  4.64-4.95x and 12.3-13.6x rest on the cells that replicate and on nothing
  else. The withdrawn triples are still printed, because a range that quietly
  excluded its worst-behaved cell would read tighter than the measurement was —
  but they are printed as refutations, not folded into a range. This bullet said
  the opposite until 2026-08-29, and had contradicted the paragraph above it
  since rule 13 was enforced. `BUGS.md` TC-21, TC-37.
- **592 published rows were measured under a load gate that could not see a
  tenant.** Protocol rule 9 refuses to start a cell while the machine is busy.
  Until 2026-08-21 the gate read the one-minute load average, and on a two-core
  machine that average was mostly the sweep's own children — one pinned child at
  a time, each worth about 1.0 in the window — so an idle machine read ~1.5
  against a gate of 1, while a real tenant sitting behind the harness moved it
  barely at all. The gate now counts runnable threads outside the harness, read
  as each row is written, and refuses above `nproc - 1`. The rows written above
  the old gate are **registered per file in `test/check.test.ts` and withdrawn
  nowhere**: the old pair cannot say which of them had a real tenant, only that
  the gate was not answering its question, and withdrawing most of the corpus on
  a number like that is the owner's call rather than a query's. A new row over
  the reworked gate fails `make test`. `BUGS.md` TC-46.
- **One of V8's two optimizing tiers was switched off the whole time.** This
  Node reports `--maglev` as `default: --no-maglev`, so the ladder under every
  number here is Ignition → Sparkplug → TurboFan, with no Maglev in it. A tier
  that compiles faster and optimizes less is exactly the one that could move a
  ratio, and nothing in this repo has ever run on it. `BUGS.md` TC-21.
- The recursive walk has limits. A visited set stops cycles. Each annotation
  also has a hard cap of 200 function bodies. When the walk hits the cap, it
  prints `WALK TRUNCATED` and exits `1`. The run is not reported as clean, in
  the text or in the exit code.
- **Every rule matches inside one body.** The walk widens *where* the rules are
  applied — it visits every callee whose source the program has — and it does
  not widen what any single rule can see. So `acc = append(acc, x)` in a loop,
  with `append = (a, x) => [...a, x]` next to it, is a loop in one body and a
  copy in another, and no rule here joins them, even though the walk reads both
  files. Hoisting the measured pattern into a helper silences the tool.
  `BUGS.md` TC-43 holds the two forms this still misses and what closing them
  would take.
- `megamorphic-elements` used to report from the parameter's type alone, so a
  function whose only contact with the array was `rows.length` triggered it —
  46 of vue's 46 findings were that shape, and 38 of them survived nothing else.
  It now requires a READ off an element, and it is narrowed to a read on
  purpose: V8 charges the same four-map budget at a store and at `in`, but the
  sweep measures `s += r.x + r.y`, so firing on `r.x = v` would quote a read's
  number for a write. `in` is the remaining gap. `BUGS.md` TC-8.
- `megamorphic-dispatch` fires on the fifth object type. That is right for a
  method on a class: four types cost 1.41-1.65x and the fifth costs
  12.9-22.7x, the sharpest step measured here. It is late for an object that
  carries its own function in a field. There the cost starts at the *second*
  one — 3.5-15.8x, flat from two targets to six, no threshold at all — and no
  declared type tells the two apart. The rule misses that case rather than
  guessing at it, which is a miss and not a refutation: it is in the rule's
  `unreported` clause, never in its `silent` one.
- A TypeScript union member is not a V8 map, which is the engine's internal
  object shape. `megamorphic-elements` estimates the shape count from the
  declared type. It can report a problem even if no load site ever sees five
  maps. What it no longer does is count NAMES: five aliases of one type, and
  five discriminated-union variants over one key set, are one map each —
  `%HaveSameMap` says so — and the rule counted them as five until 2026-08-19.
  It counts distinct property-name sets, which no rename can change. `BUGS.md`
  TC-2 and TC-42.
- The same rule's benchmark used to measure a program the rule is silent on.
  `bench/shapes.ts` varies key ORDER — five builders, one key set, five V8 maps,
  and exactly one TypeScript type. `bench/shape-sets.ts` varies the key SET, at
  the same three sizes and in both modes, and that is where 3.4-11.3x comes
  from. The key-order sweep is still on disk and still quoted, in the rule's
  `unreported` clause: it costs 4.4-11.5x and nothing static can find it.
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
make test    # 67 unit tests, including the must-stay-silent cases
make lint    # tsc --noEmit
make numbers # re-derive every published number from the .jl sweeps
make check   # run the checker against demo/
make example # the checker against examples/, then the end-to-end sweep
make demo    # re-record demo/demo.gif — a real asciinema run, not a mock-up
make meme    # re-render the launch loop from demo/meme/
```

`CLAUDE.md` holds the layout, the rules of this repo, and how to verify both
kinds of evidence. `BUGS.md` holds the open queue, and the entries commissioned
adversarial reviews produced — each reviewer told to argue the tool is
worthless, every finding re-run here before it was written down.

## Licence

**GPL-2.0-only**. The full text is in `LICENSE`. You may use, modify and
redistribute it under those terms. A derivative work carries the same licence.
It is not published to npm. Get it by cloning the repository.

`examples/` is the exception, and deliberately so: the `.before.ts` files are
functions vendored verbatim from radash, remeda, es-toolkit and zod, all
**MIT**, and each file carries its upstream's copyright line, version and
commit. Those files stay under their upstream MIT licence rather than the GPL,
and `examples/LICENSE-MIT` reproduces the permission notice MIT requires to
travel with them, alongside the four copyright holders and the commit each
function came from. The point of the whole exercise is that the code measured
there is somebody else's.

V8 is a trademark of Google LLC. This project is not affiliated with, endorsed
by, or sponsored by Google, and every use of the name here is a reference to the
engine the measurements were taken on.

Status: v0.10.0, single machine, seven rules. Every sweep behind a published
number is re-measured whole under the current runner: three sweeps per cell, and
a cell whose three share no common value is withdrawn by `lib/derive.ts` before
the number is written. Twenty-two are withdrawn today, and `test/check.test.ts`
lists every one.
