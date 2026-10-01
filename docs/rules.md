# The rules

What each of the eight rules reports, what makes it fire, where it stays
silent, what to do about a finding, and what the pattern cost when measured.
Setup is in the [README](../README.md#quick-start).

The first six rules report a pattern a benchmark in this repository measured
as slower. The last two, `closed-world` and `interface-dispatch`, report calls
the walk could not check, and make no speed claim. Every rule runs over every
function the walk reaches from a marked function.

## Terms

- A **hidden class** is the shape V8 gives an object. Objects built the same
  way — by the same constructor or literal, with the same property names added
  in the same order — share one. V8's source calls it a **map**.
- An **inline cache** is the small table V8 keeps at each property read,
  holding the shapes it has seen there. It holds four. A call keeps a separate
  record of the function it called, and that record holds one.
- **Megamorphic** means one site has seen more shapes than its inline cache
  holds, so V8 stops specialising it and looks the property up instead.
- **Dictionary mode** is the slower storage an object moves to when it stops
  looking like a fixed shape, for example after a `delete`.
- **Quadratic** means the work grows with the square of the input size.
- **n** is the size a benchmark ran at — keys, items or inputs, depending on
  the sweep.
- **A ratio** is before time divided by after time: above 1.0 the change was
  faster, below 1.0 it was slower, and 1.0 is no change. A measured cell that
  misses the protocol's bar is **rejected**, and one whose three sweeps
  disagree is **withdrawn**; [how a cell is
  measured](../bench/README.md#how-a-cell-is-measured) gives both tests.
- **Silent**: a neighbouring case the rule must not report, mostly one its own
  benchmark measured and found no cost worth reporting. A test fails if the
  rule fires there. For the two coverage rules, the silent case says what the
  walk can see instead.
- **Misses**: a cost the rule knowingly does not report, or a case its cited
  benchmark does not match, because nothing in the source separates that case.
  On a clean run, `-v` prints each rule's misses.

Every snippet below comes from [`demo/lib.ts`](../demo/lib.ts), the fixture
file `make check` runs: each rule has a fixture that fires and one for each
silent case.

## megamorphic-elements

**What it detects.** The fifth distinct property set at one property read off
an array's elements. It counts from three sources: the element type's union
members, the classes and object literals the dataflow walk finds reaching the
array, and — only where that trace cannot see every origin — every class the
program constructs that the element type admits through `extends`. It counts
property-name sets, so five classes that agree on their property names are one
set, not five.

**It fires on** `fiveShapes`, a read off an element of an array whose type has
five members with five different property names:

```ts
/** @jitmax */
export function fiveShapes(rows: (A | B | C | D | E)[]): number {
  let s = 0;
  for (const r of rows) s += r.x;
  return s;
}
```

**It is silent on** `fourShapes`: four shapes fit the inline cache, and two to
four sets measured 0.95-1.47x. It is also silent on `fiveShapesNoLoad`, where
`rows.length` is a read off the array, not off an element, so no site exists
for a fifth map to reach.

**It misses** five key orders of one key set. That is five maps at one site,
costing 4.4-11.5x, but one TypeScript type, so nothing static separates it
from five builders that agree.

**How to act.** The report names the array and the first property read through
it. When the union alone explains the count, the message says the element type
has N property sets. When classes or builders the walk found add to it, the
message says the elements receive N, and `related:` names them. Look where
those elements are built. If the program allows it, give them the same own
properties in the same order, then benchmark the whole caller, construction
included. Adding a property can change key enumeration and `in` checks; a type
assertion changes neither the object nor its map. A library caller may need an
upstream change.

**The cost.** 3.4-11.3x on reads, in `bench/shape-sets.jl`. The
[examples](../examples/README.md) record one detection on Zod and no measured
caller speedup.

## megamorphic-dispatch

**What it detects.** A method call whose receiver has five or more distinct
property sets in its declared type, or that five or more traced
implementations reach. In a declared type, five classes with the same property
names count as one set.

**It fires on** `areaOfFive`:

```ts
/** @jitmax */
export function areaOfFive(x: Circle | Square | Rect | Tri | Hex): number {
  return x.area();
}
```

**It is silent on** `areaOfFour`, the same call at four types: four shapes on
a prototype method cost 1.41-1.65x, an order of magnitude below the fifth.
`interface-dispatch` still reports that call, because the walk cannot pick
which body runs.

**It misses** two cases. Five classes with identical fields are five maps but
one property set. And an object that carries its own function in a field
costs 3.5-15.8x from the *second* target, flat up to six, with no threshold:
a call slot caches one target, not four (`TC-13`). No declared type separates
that from a prototype method.

**How to act.** Look at the receiver's builders or the named implementations,
and profile the reported call. If a runtime check can separate the receiver
kinds, try one call site per kind and benchmark the whole caller. Splitting
sites adds branches and code; a type assertion does not specialise a call. The
implementation count covers this program only: code that imports yours can
add more.

**The cost.** 12.9-22.7x on reads with the method on a prototype, in
`bench/dispatch.jl`. That sweep varies key order and call targets over one
property set, so it prices the mechanism, not this rule's trigger (`TC-33`).

## accumulating-spread

**What it detects.** `[...acc, v]`, `{ ...acc, k: v }`, `acc.concat(v)` or
`Object.assign({}, acc, …)` in a loop. Each pass copies everything the
accumulator holds. When the accumulator grows every pass, the total work is
quadratic on any engine; the rule does not check that it grows, so a loop that
only overwrites a fixed set of keys fires too.

**It fires on** `collect`:

```ts
/** @jitmax */
export function collect(rows: number[]): number[] {
  let acc: number[] = [];
  for (const r of rows) acc = [...acc, r];
  return acc;
}
```

**It is silent on** `appendOnce`, where no loop re-runs the copy; on
`mergeInto`, which is `Object.assign(acc, …)` and mutates in place; and on
`joinByPlus` and `joinByConcat`, which build strings: V8 appends to a string
without copying it.

**How to act.** Push into the array only when the code owns it and no caller
needs an earlier copy. Keep order and holes, and do not pass an unbounded
batch as function arguments. The finished array reads the same either way,
0.96-1.02x. For the object form, benchmark a privately owned accumulator,
including the caller's reads: on remeda's `mergeAll` the rewrite is slower at
n=8, 0.13x, faster at n=64, 1.48-1.59x, and gains no reads at either size. To
keep object spread's copy semantics, define own data properties: plain
assignment can call setters, including `__proto__`. Keep aliases, own keys,
symbols, getters and property order. See
[CopyDataProperties](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-copydataproperties)
and [Object.assign](https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-object.assign).

**The cost.** 149-166x at n=1000 and 1766-1889x at n=10000, in
`bench/spread.jl` and `bench/spread-object.jl`. End to end: radash `assign`
and remeda `mergeAll` in the [examples](../examples/README.md).

## chained-allocation

**What it detects.** Two chained stages on an array, each one of `map`,
`filter`, `flatMap`, `concat`, `slice` or `flat`, or `Object.entries(o)`
followed by one of them: each stage allocates an array the next stage throws
away. A longer chain is one finding, at its end. Its sweep measured
map-then-filter and `Object.entries(o).map()`, not every pair.

**It fires on** `twoStages`:

```ts
/** @jitmax */
export function twoStages(rows: number[]): number[] {
  return rows.map((v) => v * 2).filter((v) => v > 10);
}
```

**It is silent on** `oneStage`, which allocates once and is the baseline; on
`keysMap`, because `Object.keys(o).map()` beat its fused loop; on
`sortedStages`, because `.sort()` returns the array it was given; on
`splitJoin`, whose split-map-join chain measured under the bar a broad warning
needs; and on `topTen`, whose `.slice(0, 10)` bounds the result below the
smallest n the sweep covers. Reading the finished array costs nothing,
0.95-1.10x across all six forms. Map-then-filter has no measured silent size,
and the rule cannot see an array's length unless an array literal with no
spread, or a literal `.slice()` before the allocation, bounds it (`TC-9`).

**How to act.** Fuse stages only when the observable behaviour stays the same:
callback order, side effects, indices, array arguments and holes, and for
`Object.entries` its own enumerable string keys in order. A fused loop
interleaves callbacks that ran in separate passes.
[Array.prototype.map](https://tc39.es/ecma262/multipage/indexed-collections.html#sec-array.prototype.map)
specifies what a callback sees. Benchmark construction in the caller before
keeping the change.

**The cost.** 1.44-1.52x for map-then-filter with construction counted, and
3.67-3.76x for `Object.entries(o).map(f)` at n=1000, in `bench/chained.jl`.
This is the one rule held to the broad-warning bar: a point estimate at or
above 1.10x and a lower bound above 1.05x. End to end, zod `cleanEnum` clears
it at a 16-member enum, 1.10-1.12x. At 256 members it measured 1.03-1.10x,
whose lower bound and point estimate both fall short, so that cell is
published as rejected.

## allocating-select

**What it detects.** A loop replaces a stored object through a call with peer
arguments, and the callee returns a fresh allocation. It does not prove that
the call only selects a candidate, or that it allocates on every path.

**It fires on** `lowest`:

```ts
/** @jitmax */
export function lowest(rows: Money[], bucket: { lo: Money }): void {
  for (const r of rows) bucket.lo = Money.min(bucket.lo, r);
}
```

**It is silent on** `lowestNumber`, the same loop on numbers, where `Math.min`
allocates nothing. At n=10000 that loop measured 1.10-1.19x, with intervals
reaching under the broad-warning bar. At n=100000 its three sweeps read 0.89x,
0.97x and 1.03x and disagree, so the cell is withdrawn and there is nothing to
warn from.

**It misses** the difference between a value that outlives the loop and one
kept in a local: the local form costs 2.02-2.47x, and the rule cites the
escaped figure for both (`TC-44`).

**How to act.** Open the related allocation. If the call only selects a
candidate, compare first and assign only when the chosen value changes. Keep
ties, comparison edge cases, identity and the call's side effects. Keep the
call if it merges, transforms or must return a fresh object.

**The cost.** 2.60-2.89x when the chosen value outlives the loop, in
`bench/select.jl`. In 2953 annotated functions across 22 codebases the rule
never fired; see the [examples](../examples/README.md).

## delete-property

**What it detects.** `delete` of a property on an ordinary object, which can
move the object into dictionary mode. Every later read of it pays.

**It fires on** `drop`:

```ts
/** @jitmax */
export function drop(o: Record<string, number>, k: string): void {
  delete o[k];
}
```

It fires on a single delete too: one object with one delete costs 13.1-15.1x
per read.

**It is silent on** `dropElement`, a `delete` on an array element, which makes
the array holey but not a dictionary; on `clearToken`, a `delete` on
`process.env`, which Node implements without a hidden class; and on
`evictSlot`, a `delete` on an object a `const`, `let` or class field
initialises with `Object.create(null)`, which starts in dictionary mode. The
rule reads only that initializer: a null-prototype object a factory returns
still fires. Assigning `undefined` instead is the fix, not the defect:
1.00-1.06x on reads.

**How to act.** The finding prints "assign undefined where the key may stay
present, or build the object without the key". Assigning `undefined` is
equivalent only while nothing tells an absent key from one holding
`undefined`: spread and `Object.assign` copy it, and `in`, for-in,
`hasOwnProperty`, `Object.keys` and their relatives see it. Where the walk
sees the object reach such an observer, even in a caller, the finding drops
that advice and names the observer. Rebuilding changes object identity, and
can cost more than it saves: on es-toolkit's `omit` the own-property rebuild
improves reads at n=12 and n=48, but makes the whole call slower, 0.17-0.51x.
Benchmark construction and reads together.

**The cost.** 12.3-13.6x per property read after the delete, in
`bench/delete.jl`. End to end: es-toolkit `omit` in the
[examples](../examples/README.md).

## closed-world

**What it detects.** A call with no body the walk can read: a callee the
program sees only as a declaration (a `.d.ts`, even with its JavaScript
installed beside it), or a function passed in through a typed parameter, such
as a callback.

**It fires on** `usesDependency`, which calls into the `typescript` package.
The program resolves that import to its `.d.ts`:

```ts
/** @jitmax */
export function usesDependency(src: string): number {
  const file = tsapi.createSourceFile('x.ts', src, tsapi.ScriptTarget.ES2022);
  return file.statements.length;
}
```

**It is silent on** `usesHelper`, whose callee is in the program, and on the
platform: `globalThis`, V8 builtins and `@types/node` are counted in the
report header and never named. A method read off a value typed `any` is not
this rule either; it is a coverage gap, and the run fails.

It fires on a one-line callee as readily as on a large one. A declaration
carries no size, so the rule cannot tell whether V8 would inline the code
behind it; `test/fixtures/tiny` holds that case.

**How to act.** If `related:` names bodies the walk located, look at them.
Otherwise point the program at the dependency's TypeScript source, or review
the dependency separately and add `-closed-world` to the annotation. A missing
body does not prove V8 failed to inline the code.

**The cost.** None claimed. One helper padded past V8's inlining budget
measured 4.64-4.95x against the same helper under it, at n=1000, in
`bench/inline.jl`. That is one possible cost of a call V8 does not inline; it
does not bound or predict what an unchecked call costs. The sweep's callee is
readable and padded; the rule's is unreadable and unsized, so every finding
prints `TC-33`.

## interface-dispatch

**What it detects.** A call through an interface or a function value whose
target the walk cannot resolve to one body: several bodies may be visible, or
the receiver may come from a caller outside the program. `related:` lists the
bodies it found; `sources:` says where an origin is missing. A method whose whole body
throws counts as a declaration, and the walk does not follow its error path.

**It fires on** `runTrio`, where three classes implement the interface the
receiver is typed as:

```ts
/** @jitmax */
export function runTrio(vs: number[]): number {
  let s = 0;
  for (const op of TRIO) {
    for (const v of vs) s += op.run(v);
  }
  return s;
}
```

**It is silent on** `viaOneImpl`, where one implementation reaches the
receiver: the walk follows it instead, and finds the `accumulating-spread`
inside it.

**It misses** implementations outside the program, and it counts classes by
identity and literals by shape, so its count is a lower bound on maps.

**How to act.** Look at the related implementations. Annotating one of them
checks its body but does not clear this error. To clear it, review the
implementations and add `-interface-dispatch` to the annotation. Do not remove
an abstraction or add a type assertion to clear it: an assertion does not
choose which implementation runs.

**The cost.** None claimed, and no sweep. It reports what was not checked;
read it as coverage, never as a price.

## How the two coverage rules divide the work

They are two rules so that each can be switched off without the other.
`closed-world` is a callee with no readable body. `interface-dispatch` is a
call the walk cannot resolve to one body — several may be visible, or none.

Both count first. The dataflow walk asks what reaches the receiver at every
call it cannot follow. For a method called on a typed receiver, five or more
implementations at one site is a megamorphic call, reported as
`megamorphic-dispatch` with that rule's benchmark; two to four are printed as
a count. A bare function call keeps its coverage finding, whatever the count.

## Reading a finding

The [README](../README.md#read-a-finding) shows one finding in full. Its
lines, in order:

- The first line names the annotated function the walk started from. The
  finding under it can sit in any function it calls, in any file.
- The second gives the position, the severity and the rule, then what the
  rule saw.
- `related:` points to representative builders, implementations or
  allocations, and `sources:` says where tracing stopped. Neither proves the
  value reaches the site at run time. `-v` shows every location, not five.
- `next:` is what to look at or try; `note:` is what that change can break
  besides speed.
- `measured in` names the sweep behind the rule. `known defects:` are the
  rule's recorded limits, explained [below](#known-defects).

After the findings, the report says what each cited defect code means and
where the rule evidence and measurements are. A finding prints no cost: a
measured ratio depends on how much data passes through the code, and the
annotation does not say.

## Severity

Every finding on a per-call path is an error, and every error fails the run.
The annotation is the filter: you mark only the functions you need fast.

A finding reached only through a static field initializer prints `warn` with
a `once:` line naming the initializer, and does not fail the run: that code
runs once, when its class is defined. A constructor and an instance field run
per call, and so does a closure a once-only body builds. A body that a
per-call path also reaches keeps its error.

## Known defects

A finding prints the defect codes its rule carries, and the legend under the
findings names each one. These are open limits, not bugs in your code.

| Code | What it means |
|---|---|
| `TC-2` | A TypeScript union member is not a V8 map. `megamorphic-elements` counts the property-name sets it can see; V8's maps also depend on the order properties were added and on which objects arrive at run time. |
| `TC-9` | A rule can fire outside the conditions its own benchmark measured, because it cannot see your data size. `chained-allocation` was measured at n=1000 and above and fires at any length unless an array literal or a literal `.slice()` before the allocation bounds it; `delete-property`'s cost is paid per read and it fires without knowing whether anything reads the object again. |
| `TC-13` | A method stored in a field has no four-map budget: a call slot caches one target, so the cost starts at the second. `megamorphic-dispatch` waits for the fifth. |
| `TC-33` | The rule's trigger is not the program its benchmark measured. `closed-world`'s sweep times a readable callee padded past the inlining budget; `megamorphic-dispatch`'s sweep varies call targets over one property set; `interface-dispatch` has no sweep. |
| `TC-44` | `allocating-select` fires on a value that never leaves the loop, and its evidence quotes the figure measured for one that does. |

Patterns that were measured and ship no rule — boxed arrays, adding a property
after construction, sparse arrays, the `arguments` object — are in
[the benchmarks](../bench/README.md#measured-effects-that-ship-no-rule).

## Turning a rule off

jitmax reads `jitmax.toml` from the working directory upward, the way it finds
`tsconfig.json`, and prints `rules from <path>, found from the working
directory` when it uses one. A `.toml` named on the command line wins. Save
this as `jitmax.toml` in your project root:

```toml
[rules]
"megamorphic-elements" = false
"TC-9" = false
```

Then run `bunx github:kronael/jitmax src` from that root. For a
megamorphic-only scan, copy the
[megamorphic preset](../examples/megamorphic/jitmax.toml) there as
`jitmax.toml` instead.

A key is a rule name or a defect code; a code selects every rule that carries
it. `false` switches the selection off; `true` does not suppress anything. On
an annotation, prefix the name with `-`:
`/** @jitmax -megamorphic-elements -TC-9 */` switches those rules off for that
function and everything its walk reaches, and nowhere else.

An unknown name or code exits `2`. Suppression is never silent: the report
says how many findings were removed and which rules they came from, such as
`3 findings suppressed (megamorphic-elements)`. Suppressing a rule never clears
a coverage gap.
