# The rules

For installation and your first scan, use the [README quick start](../README.md#quick-start).
It covers Bun, TypeScript and the checkout fallback while public GitHub access
is blocked by TC-133. Bun runs the checker; these rules concern V8 performance.

What each of the eight rules detects, what makes it fire, where it stays quiet,
and what the fix is.

`TC-` codes identify known defects. The report explains each cited code; the
full Git clone's `BUGS.md` contains the internal issue history, not an installed guide.

Eight rules ship. The first six check every function in the call tree. The
last two report where the walk stops — one for a callee with no body anywhere,
one for a call the walk cannot bind to a single implementation. A *hidden class*
is the internal shape V8 gives an object; two objects with the same property
names, added in the same order, share one. An *inline cache* is the small table
V8 keeps at each line that reads or calls, holding the shapes it has already
seen there. Megamorphic means one code location has
seen many object shapes. Quadratic means the work grows with the square of the
input size.

Each rule carries two clauses, and they are not the same clause. `silent` is
where the same benchmark **refused** the rule — it measured the case and found
nothing worth reporting, and a test fails if the rule fires there. `unreported`
is where the benchmark found a **real cost the rule does not report**, because
no declared type separates that case from one it would be wrong to warn about.
Two rules have one. Summarising both as "where the benchmark found nothing" was
false for both (`BUGS.md` TC-39).

Every snippet below is quoted from `demo/lib.ts`, which holds one fixture per
rule and per silent case and is the file `make check` runs. Nothing here was
written as an illustration: a fixture is tested, and an illustration is not.

## megamorphic-elements

**What it detects.** The fifth distinct property set at a load site.

**It fires on** `fiveShapes`, which reads a property off an element of an array
whose type has five members with five different property names:

```ts
/** @jitmax */
export function fiveShapes(rows: (A | B | C | D | E)[]): number {
  let s = 0;
  for (const r of rows) s += r.x;
  return s;
}
```

**It is silent on** `fourShapes` in the same file: four shapes are under the
four-map budget, and the measurement agrees — two to four sets cost
0.95-1.47x, which is where the rule stays quiet. It is also silent on
`fiveShapesNoLoad`, where `rows.length` is a load off the array and not off an
element, so no site exists for a fifth map to reach.

**How to act.** The report names the collection declaration and the first
property read found through it, both with line and column. Inspect where those
elements are built: related locations include representative class and literal
sources when the bounded flow query can find them. Missing, cyclic and
budget-limited source paths are stated, not inferred from type names.
If semantics allow, use consistent own properties and
insertion order, then benchmark the full caller including construction.
Adding a property can change enumeration and presence checks; a type assertion
changes neither the object nor its runtime shape. Library callers may need an
upstream change. This is an investigation path, not a verified rewrite.

The count describes declared property sets, not observed V8 maps. V8 tracks
runtime property layout and insertion order; a TypeScript type does not record
that history. See [V8's fast-properties explanation](https://v8.dev/blog/fast-properties).

**The cost.** 3.4-11.3x on reads, in `bench/shape-sets.jl` and
`bench/shapes-calibrated.jl`. `examples/README.md` records a successful Zod
detection, not a verified caller speedup.

## megamorphic-dispatch

**What it detects.** `x.step()` where `x` is one of five object types.

**It fires on** `areaOfFive`:

```ts
/** @jitmax */
export function areaOfFive(x: Circle | Square | Rect | Tri | Hex): number {
  return x.area();
}
```

**It is silent on** `areaOfFour`, the same call at four types: two to four
types, for a method on a class, is where the measurement found no effect.
`interface-dispatch` still reports that call, because the walk cannot pick
which body runs — a different question from how many shapes reach it.

**How to act.** Inspect the receiver builders or named implementations and
profile the reported call. Related locations point to the source definitions
the flow walk found; `--verbose` shows every available location. If a runtime guard can separate receiver kinds,
test dedicated call sites and benchmark the full caller. Splitting sites can
add branches and code size; a type assertion does not specialize a call.
Library callers may need an upstream change.

Declared property sets and statically reachable implementations are different
counts. Neither proves how many maps this workload sends through the site.
The implementation count is a lower bound within the program; external
consumers can supply more implementations. `examples/README.md` records a
date-fns detection, with no verified speedup from a caller rewrite.

**The cost.** 12.9-22.7x, in `bench/dispatch.jl`. The rule is late for an
object that carries its own function in a field; that gap is in
`docs/limits.md`.

## accumulating-spread

**What it detects.** `[...acc, v]`, `{ ...acc, k: v }`, `acc.concat(v)` or
`Object.assign({}, acc, …)` in a loop — quadratic.

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
`mergeInto`, which is `Object.assign(acc, …)` and mutates; and on `joinByPlus`
and `joinByConcat`, which are strings, and V8 appends to a string instead of
copying it.

**How to act.** Push into an array only when the code owns it and no caller
needs an earlier snapshot. Preserve order and sparse-array behavior, and avoid
passing an unbounded batch as function arguments. The finished array reads
the same in the benchmark,
0.96-1.02x. For the object
form there is no rewrite this project has measured as a win on both halves:
assigning the key on `acc` builds faster, 186-200x at n=500, and fills the
result key by key, which normalizes the object — the spread-built object reads
0.11-0.12x of what the filled one costs. Benchmark a privately owned mutable
accumulator including the caller's reads. Preserve aliases, own keys, symbols,
getters and property order. Assignment can invoke target setters, including
`__proto__`; it does not have object spread's data-property semantics. See
[CopyDataProperties](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-copydataproperties)
and [Object.assign](https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-object.assign).

**The cost.** 149-166x at n=1000 and 1766-1889x at n=10000, in
`bench/spread.jl` and `bench/spread-object.jl`. End to end: radash `assign` and
remeda `mergeAll` in `examples/README.md`.

## chained-allocation

**What it detects.** `.map().filter()` or `Object.entries(o).map()` allocates
between stages.

**It fires on** `twoStages`:

```ts
/** @jitmax */
export function twoStages(rows: number[]): number[] {
  return rows.map((v) => v * 2).filter((v) => v > 10);
}
```

**It is silent on** `oneStage`, which allocates once and is the baseline, not
the defect; on `keysMap`, because `Object.keys(o).map()` beat its fused loop;
on `sortedStages`, because `.sort()` returns the array it was given; on
`splitJoin`, whose split-map-join chain measured under the bar a warning needs;
and on `topTen`, whose own `.slice(0, 10)` bounds the result below the smallest
n the sweep covers. Reading the finished array costs nothing either —
0.95-1.10x across all six forms — so a chain built once and read many times is
not what this sweep measured. The clause used to say the same of a large n as
well; the n=1000 cell it compared against was withdrawn under rule 13, and
map-then-filter now has no measured silence at any size (`BUGS.md` TC-37,
TC-9).

**How to act.** Fuse stages only when their observable behavior stays the same.
Preserve callback order, side effects, indices, array arguments and holes;
for `Object.entries`, preserve own enumerable string keys and their order.
A fused loop can interleave callbacks that run in separate passes in the
original expression. [Array.prototype.map's contract](https://tc39.es/ecma262/multipage/indexed-collections.html#sec-array.prototype.map)
specifies callback arguments, iteration and holes. Benchmark construction in
the caller before keeping the change.

**The cost.** 1.44-1.52x for map-then-filter with construction counted, and
3.67-3.76x for `Object.entries(o).map(f)` at n=1000, in `bench/chained.jl`.
End to end: zod `cleanEnum` in `examples/README.md`.

**And that end-to-end instance fails this rule's own bar at one of its two
sizes.** This is the only rule held to rule 6's broad-warning threshold — a
point estimate at or above 1.10x and a lower bound above 1.05x — and
`cleanEnum` clears it at a 16-member enum, 1.10-1.12x, and does not at 256:
1.03-1.10x, whose lower bound is under 1.05x and whose point estimate is under
1.10x. `lib/derive.ts` publishes that cell as the rejection it is rather than as
evidence. So the mechanism replicates in the microbenchmark and the transfer to
the one real function this rule was tried on is worth three to twelve percent,
with one of the two sizes rejected. `BUGS.md` TC-83.

## allocating-select

**What it detects.** A loop replaces a stored object through a call with peer
arguments, and that callee contains an allocation in a returned expression.
This is not proof that the call selects a candidate or allocates on every path.

**It fires on** `lowest`:

```ts
/** @jitmax */
export function lowest(rows: Money[], bucket: { lo: Money }): void {
  for (const r of rows) bucket.lo = Money.min(bucket.lo, r);
}
```

**It is silent on** `lowestNumber`, the same loop on numbers, where `Math.min`
allocates nothing. That silence is measured, not assumed: at n=10000 the number
loop still costs 1.10-1.19x, an interval whose lower bound sits under the
broad-warning bar, and at n=100000 three sweeps read 0.89x, 0.97x and 1.03x, so
rule 13 withdraws the cell and there is no measurement to warn from.

**How to act.** Open the related returned allocation. If the call only selects
a candidate, compare first and assign only when the chosen value changes.
Preserve ties, comparison edge cases, identity and call side effects. Keep the
call if it merges, transforms or must return a fresh object.

**The cost.** 2.60-2.89x where the chosen value outlives the loop, in
`bench/select.jl`. In 2953 annotated functions the rule never fired on the
shape it measures; `examples/README.md` has that verdict.

## delete-property

**What it detects.** `delete` can move an ordinary object into dictionary mode — a slower
storage form V8 uses when an object stops looking like a fixed shape.

**It fires on** `drop`:

```ts
/** @jitmax */
export function drop(o: Record<string, number>, k: string): void {
  delete o[k];
}
```

**It is silent on** `dropElement`, a `delete` on an array element: that makes
the backing store holey and does not put the array in dictionary mode, which is
the only thing `bench/delete.jl` measured. It is silent on `clearToken`, a
`delete` on `process.env`, which Node implements with a named-property
interceptor and which has no hidden class to demote. And the measurement
refused the rewrite as a defect: assigning `undefined` instead costs
1.00-1.06x.

**The fix it prints.** "assign undefined where the key may stay present, or
build the object without the key", with the note that assigning undefined is
equivalent only while nothing downstream tells an absent key from one holding
undefined, and that the rebuild helps at the smaller of n=12 and n=48 and not
at the larger, where filling it key by key normalizes it too. Where the walk
sees the object reach `Object.keys`, a spread or another observer that tells an
absent key from one holding `undefined`, the first branch is dropped and the
observer is named with its file, line and column, even when it is in a caller.
Rebuilding changes object identity; preserve aliases, prototypes and property
semantics before keeping that rewrite.

**The cost.** 12.3-13.6x per property load after the delete, in
`bench/delete.jl`. End to end: es-toolkit `omit` in `examples/README.md`.

**One entry left this rule's silent clause by being wrong.** Until 2026-08-15
the `delete` row read "a single delete on one object", published since the
first round as a case this project had refuted — 0x, with dictionary mode up to
10% *faster*. Re-measured against a kernel that has to load the object on every
pass, one object with one delete costs **13.1-15.1x**, in all nine of its
sweeps, more consistently than a hundred thousand objects do. The old probe's
fast side could be served by a load hoisted out of its loop; the dictionary
side could not. The exception is withdrawn and the rule is right to fire there
— a refutation has to be refutable too. `make bench-delete`.

## closed-world

**What it detects.** Calls to somebody's code with no readable body anywhere in
the checkout.

**It fires on** `usesDependency`, which calls into a typed dependency that
ships a `.d.ts` and no body:

```ts
/** @jitmax */
export function usesDependency(src: string): number {
  const file = tsapi.createSourceFile('x.ts', src, tsapi.ScriptTarget.ES2022);
  return file.statements.length;
}
```

**It is silent on** `usesHelper`, whose callee is in this program, and on the
platform — `globalThis`, a V8 builtin, `@types/node` — which is counted in the
report header and never named.

**It is not silent on a small callee**, and this clause claimed it was until
2026-09-01. Nothing in the rule consults a size and nothing could: a declaration
file carries the signature and no way to size the JavaScript behind it, so a
one-line callee V8 would inline without hesitating fires exactly like a large
one — `test/fixtures/tiny` is that callee, and a test holds it. What was true is
a fact about the *benchmark*: the sweep's small variant costs nothing. Written
down as a silence, it was the bound described as the trigger, which is `BUGS.md`
TC-33 in one sentence.

**How to act.** Inspect related implementations when the walk located bodies
but did not follow them. Otherwise resolve the dependency to TypeScript source,
or review it separately and add `-closed-world` to the root's `@jitmax`
annotation. A `.d.ts` describes an API, not its implementation. Missing source
does not prove that V8 failed to inline the runtime code.

**The cost.** 4.64-4.95x for a callee past the inlining budget against the same
callee under it, in `bench/inline.jl`. That is a bound on what ONE unchecked
call can cost, not a claim about the call it fired on: the sweep's callee is
readable and padded, the rule's is unreadable and unsized. Every finding prints
`known defect: TC-33` for that reason.

## interface-dispatch

**What it detects.** A call through an interface, whose body IS here but cannot
be picked.

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
receiver: the walk follows it instead of reporting, and finds the
`accumulating-spread` inside it.

**How to act.** Inspect the related implementations. Annotate a concrete
implementation to check its body, or review it separately and add
`-interface-dispatch` to the root's `@jitmax` annotation. Do not remove an
abstraction or add a type assertion to clear this finding: a type assertion
does not select a runtime implementation.

**The cost.** None. This rule makes no speed claim; it reports what was not
checked.

## The two escape rules, and why they are two

These two were one rule until 2026-08-29, and the split matters to anyone who
ran the tool: a call through an interface has a body in this checkout — the walk
simply cannot decide which one runs — and telling you to inline it is telling
you to undo the abstraction. It was 96.7% of every finding in the survey, so
`[rules] closed-world = false`, the obvious way to quiet it, also switched off
the one cause that is honest about not being able to look. `BUGS.md` TC-93.

Both count first. The dataflow walk asks what actually reaches the receiver at
every escape, not only at the ones that resolved to an interface member, and
five or more implementations at one call site is `megamorphic-dispatch`'s claim
carrying `megamorphic-dispatch`'s benchmark — the same site, whether or not the
walk could read the callee's body. Below that threshold the count is printed
rather than acted on. And neither rule fires on the platform: a call into
`globalThis`, a V8 builtin or `@types/node` has no body an `npm install`
produces and no map to count, so it is counted and not named. `BUGS.md` TC-110.

**Every rule that makes a speed claim includes the benchmark that earned it, and
the case where the same benchmark found nothing — and one of these two makes
none.** `interface-dispatch` has no sweep at all: its own evidence says "no
sweep" where every other rule names a `bench/*.jl`, and its cost is "nothing
this project has measured". Read it as coverage, never as a price. The
unqualified form of this sentence stood here until 2026-09-01 and was false for
that rule; `BUGS.md` TC-15 is the same sentence being false for
`delete-property`, before `bench/delete.jl` existed to make it true.

`closed-world` measures the mechanism a call boundary
controls: a callee V8 refuses to inline costs 4.64-4.95x in a hot loop at
n=1000. That is a bound on what one unchecked call can cost, not a claim about
any particular one: the rule fires on a callee with no readable body and the
sweep measures a readable one padded past the inlining budget (`BUGS.md`
TC-33). That gap is why the rule warned until 2026-08-31, and it is why every
one of its findings still prints `known defect: TC-33`. That range used to be 4.42-4.79x, one sweep per size,
and then 3.21-4.95x. Re-measured three times over, the n=1000 cell replicates
and the n=100000 cell **does not replicate at all**: 3.21x, 4.68x and 4.73x,
with intervals 2.54-3.88, 3.88-5.58 and 4.28-5.39 that share no common value.
`lib/derive.ts` now withdraws that cell instead of quoting it, which is why the
range no longer reaches down to 3.21x: the old bottom end **was** the dissenting
sweep.

## What the measurements refused

If a rule fires in a case a test declares silent, `make test` fails.
Measurements have blocked a rule or a rule's extension from shipping seven times.
Two went further and took something away from a rule that was already shipping.
`accumulating-spread` matched `.concat()` by name, so it reported `s = s.concat(x)`
on a string as a quadratic array copy. Measured, appending to a string is
*faster* than the rewrite the tool was demanding — `make bench-strings`.
And `boxed-elements` was withdrawn outright: a boxed array really does cost
1.39-1.66x to read, but the rule fired on the *declared* element type, and V8
picks the representation from the values actually stored. The *elements kind* is
the storage class V8 gives an array from the values put in it. A
`(number | string)[]`
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

## Read a silent clause as a limit on the evidence, not as a promise

Two rules now check a condition in their own silent clause, and the rest
do not. `megamorphic-elements` requires a read off an element before it fires
(TC-8, fixed). `chained-allocation` stays silent when a `.slice()` in the chain
bounds the result to a literal below the smallest n its sweep covers (TC-54,
fixed) — and where nothing bounds it, the rule still cannot see how big your
array is, which is the general case and is why no cost is printed beside a
finding. The `delete` rule fires without knowing whether anything reads the
object afterwards, and its cost is *per read*. The gap is written up as TC-9 in
`BUGS.md`.

## Every finding is an error

Every finding is an error, and every error fails the run. **The annotation is
the filter**: you write `/** @jitmax */` on a function you need fast, so
a finding on one is actionable by definition and a second severity tier gates
nobody. Three rules — `closed-world`, `interface-dispatch` and
`megamorphic-dispatch` — warned and exited 0 until 2026-08-31, on the argument
that no benchmark measures the program they fire on. That gap is real and is
still stated: they carry `TC-33`, and the report prints `known defect: TC-33`
under every finding they make. It is also 98.6% of every finding across the
22-codebase survey in `examples/README.md`, so a build can now fail on a
mechanism this project
has not priced for that program. Switch a rule off in the `[rules]` table, or
per function with `-closed-world` / `-TC-33` on the annotation — and since
v0.11.0 `interface-dispatch` is separately silenceable, so quieting the loud
cause no longer switches off the honest "no body anywhere" one.

## Turning a rule off

Save the following as `rules.toml` in your project's root:

```toml
[rules]
"megamorphic-elements" = false
"TC-9" = false
```

While GitHub access is blocked, use the
[checkout command prefix](../README.md#use-an-existing-checkout).
The repository command is `bunx github:kronael/jitmax rules.toml src`.
Run from your project's root and replace `src` with your source directory.
For a megamorphic-only scan, use the [supplied preset](../examples/megamorphic.toml).

Both layers accept a rule name such as `megamorphic-elements` or a defect code
such as `TC-9`, which selects every rule carrying that code. In TOML, `false`
disables the selection; `true` does not suppress it. In an annotation, prefix the
name with `-` to disable it. See the `known defects` legend after the findings
for what a code names. An unknown name or code fails with exit `2`, the same as a
missing path. Suppression is never silent: the report always says how many
findings were removed and by what, e.g.
`3 findings suppressed (TC-9, megamorphic-elements)` — a clean run that is
clean because rules were switched off says so.

A per-function override such as `/** @jitmax -megamorphic-elements -TC-9 */`
disables those rules for that function and everything its walk reaches,
and nowhere else.
