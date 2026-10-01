# Examples

What a printed fix gains on real library code, and what the rules find across
real codebases. Each example is somebody else's function, vendored verbatim,
with the fix jitmax printed and nothing else. `diff` a `.before.ts` against its
`.after.ts` — [radash-assign.before.ts](radash-assign.before.ts) against
[radash-assign.after.ts](radash-assign.after.ts), for one — and the fix is the
whole change.

| function | library | rules it triggers |
|---|---|---|
| `assign()` | radash 12.1.1, `src/object.ts` and `src/typed.ts` @ 4cab190 — https://github.com/rayepps/radash | `accumulating-spread` |
| `mergeAll()` | remeda 2.0.0, `packages/remeda/src/mergeAll.ts` @ 72ca45e — https://github.com/remeda/remeda | `accumulating-spread` |
| `omit()` | es-toolkit 1.50.0, `src/object/omit.ts` @ bec4905 — https://github.com/toss/es-toolkit | `delete-property` |
| `cleanEnum()` | zod 4.4.3, `packages/zod/src/v4/core/util.ts` @ 5e60885 — https://github.com/colinhacks/zod | `chained-allocation` |

All four are MIT. Each `.before.ts` header carries its upstream copyright line,
version and commit, and [LICENSE-MIT](LICENSE-MIT) reproduces the permission
notice that travels with them. All four come from the survey below.

## What each fix is worth

| Rule | End to end |
|---|---|
| `accumulating-spread` | radash `assign` improves both measured halves; remeda `mergeAll` is a slower whole call at 8 inputs, a faster one at 64, and gains no reads |
| `delete-property` | es-toolkit `omit` improves reads at n=12 and n=48, but makes the whole call slower |
| `chained-allocation` | zod `cleanEnum` gains **1.10-1.12x** at 16 members; at 256 it measured 1.03-1.10x, **rejected under [rule 6](../bench/README.md#how-a-cell-is-measured)** |
| `megamorphic-elements` | a detection on Zod, below; no measured rewrite |
| `megamorphic-dispatch` | a detection on date-fns, below; no measured rewrite |
| `allocating-select` | no finding in the survey, so no instance to rewrite |
| `closed-world`, `interface-dispatch` | no speed claim; they report what was not checked |

`make example` prints the findings, then runs the sweep. It times the whole
call the way a caller makes it, because a microbenchmark cannot say what a
program gets. Each cell follows [the protocol](../bench/README.md#how-a-cell-is-measured):
three whole sweeps of twenty process pairs, all three printed. **Agreement** is
the range every sweep's 95% interval contains, so a sweep's own ratio can sit
outside it. A ratio is before time over after time: above 1.0 the shipped code
costs that much more, and **below 1.0 the fix made it slower**. `n` counts the
keys in each radash config object and each es-toolkit record, the objects
remeda merges, and the zod enum's members.

**The whole call, which is what a caller gets:**

| Function, and the finding | n | three sweeps | agreement |
|---|---|---|---|
| radash `assign` — `accumulating-spread` | 16 | 1.27 / 1.26 / 1.18 | **1.20–1.27** |
| radash `assign` | 128 | 3.54 / 3.35 / 3.44 | **3.23–3.53** |
| remeda `mergeAll` — `accumulating-spread` | 8 | 0.13 / 0.13 / 0.13 | **0.12–0.14** |
| remeda `mergeAll` | 64 | 1.52 / 1.51 / 1.54 | **1.48–1.59** |
| es-toolkit `omit` — `delete-property` | 12 | 0.17 / 0.17 / 0.18 | **0.17–0.18** |
| es-toolkit `omit` | 48 | 0.51 / 0.50 / 0.50 | **0.49–0.52** |
| zod `cleanEnum` — `chained-allocation` | 16 | 1.05 / 1.20 / 1.14 | **1.10–1.12** |
| zod `cleanEnum` | 256 | 1.03 / 1.06 / 1.08 | **1.03–1.10** |

**Reads on the value the function returns**, which is where `delete-property`'s
cost is paid — by the caller, not inside the function:

| Function | n | three sweeps | agreement |
|---|---|---|---|
| radash `assign` | 16 / 128 | 1.96 / 1.99 / 1.81 · 1.77 / 1.71 / 1.62 | **1.88–2.01** · **1.66–1.70** |
| remeda `mergeAll` | 8 / 64 | 1.00 / 1.01 / 1.02 · 1.03 / 1.00 / 1.02 | **0.96–1.05, REJECTED** · **0.98–1.03, REJECTED** |
| es-toolkit `omit` | 12 | 11.20 / 10.78 / 12.00 | **10.95–11.71** |
| es-toolkit `omit` | 48 | 11.87 / 11.62 / 10.44 | **11.32–11.74** |
| zod `cleanEnum` | 16 | 0.98 / 1.11 / 1.01 | **none — DISAGREES** |
| zod `cleanEnum` | 256 | 1.02 / 1.01 / 1.05 | **0.98–1.07, REJECTED** |

**What to keep.** Radash's rewrite improves both measured halves. Remeda's
rewrite makes the small whole call slower (0.13x), improves the larger call
(1.48–1.59x), and establishes no read benefit. `omit` improves reads at n=12 and n=48,
but makes the whole call slower (0.17–0.51x); keep it only when the caller's
measured reads repay that cost. Zod's whole call clears the broad-warning bar
at 16 members and fails it at 256, although its agreement there sits above
1.0. Zod's small read cell does not replicate; its larger read cell
establishes no benefit.

The object rewrites define own data properties, so they keep own `__proto__`
keys without calling inherited setters. Remeda copies enumerable symbols and
values; `omit` snapshots values before filtering, including getters of omitted
keys, and accepts numeric and symbol keys. A clean checker result alone does
not establish any of these behaviours.

The three object examples come from the `kernel: "own-properties"` rows in
[`bench/example.jl`](../bench/example.jl): both sizes, both halves, three
accepted sweeps per cell, and all twelve cells replicate. Four rows over the
load gate stay in the file, are excluded, and have replacement sweeps. The
tier diagnostics in `bench/tiers.jl` report tier mismatches for some cells, so
a ratio is not proof of an isolated storage-layout effect.

The microbenchmark is no caller-level forecast. Object spread costs 186–200x
at n=500 in its kernel; radash's complete call moves 1.18–3.54x, because the
code around the copy still allocates, recurses and branches.

## Reproduce the radash fix

From a jitmax clone after the
[development setup](../README.md#development-and-licence):

```sh
node bin/jitmax.ts examples/radash-assign.before.ts
node examples/config-check.ts
node bin/jitmax.ts examples/radash-assign.after.ts
```

The first command exits `1` and reports `accumulating-spread` on the reducer's
copy of `acc`. The last exits `0` with `every annotated function is clean.`
The caller check, `config-check.ts`, merges service defaults with nested
overrides through both versions, exits `0` and prints:

```text
PASS nested service options; inputs unchanged
PASS empty overrides; inputs unchanged
PASS false, zero, empty string and null overrides; inputs unchanged
PASS own JSON keys at both levels; inputs unchanged
```

Both versions must match an explicit expected object, not just each other. The
last case checks an own `__proto__` key on the result and on the nested
options. This covers these inputs, not every radash input or prototype.

## Megamorphic detections without a measured fix

Both megamorphic rules locate real sites in real libraries. Neither finding
comes with a verified rewrite or proves how many maps a workload sends through
the site.

- **Zod `prefixIssues`** reports `megamorphic-elements` on its issue array:
  12 declared property sets. The report names the array at
  `packages/zod/src/v4/core/util.ts:842:64` and its first property read,
  `(iss as any).path`, at `util.ts:844:5`, at revision
  `5e608851fbc7659855e096239e36b9147af8a187` of `colinhacks/zod`. Builder
  tracing stops in the cyclic issue flow and says so, so the report does not
  name the code that creates the issues.
- **date-fns `parse`** reaches `Parser.run` and reports
  `megamorphic-dispatch` on `this.parse` at `src/parse/_lib/Parser.ts:16:20`:
  at least 31 parser implementations reach it. `related:` names the parser
  classes, such as `src/parse/_lib/parsers/EraParser.ts:6:1`; `-v` lists them
  all. This is from the `pkgs/core` package root at revision
  `a0a39220522ed1228445792c768ed887709aea5f` of `date-fns/date-fns`.

To reproduce, check out those revisions and install each repository's
dependencies; date-fns needs its workspace installed so its inherited
`@date-fns/dev/config/tsconfig` resolves. Put `/** @jitmax */` on Zod's
`prefixIssues` and on date-fns's `parse`. Copy the
[megamorphic preset](megamorphic/jitmax.toml) as `jitmax.toml` into the Zod
repository root and into date-fns's `pkgs/core`, then run from each:

```sh
bunx github:kronael/jitmax packages/zod/src/v4/core/util.ts   # in zod
bunx github:kronael/jitmax src/parse/index.ts                 # in date-fns/pkgs/core
```

Each prints `rules from jitmax.toml, found from the working directory` and
exits `1` with its megamorphic finding. The preset switches the other six
rules off, and the report counts what they would have found.

## The survey

Twelve libraries were cloned shallow and annotated by `examples/annotate.js`:
every function, not nested inside another, whose body loops. radash's eight
were marked by hand. **850 annotated functions, 844 findings, every one an
error.** No library produced nothing.

Every survey count comes from one run with the checker at commit `75a1568`. A
count is distinct source lines per rule: a line reached from 28 annotated
functions is one finding, so the counts measure work, not call-graph fan-in.
The report's own header counts line and column, so it can print more. Calls
into the platform — Node's API, V8's builtins and anything reached off
`globalThis` — are counted for the run and never listed.

| Library | annotated | findings | what fired |
|---|---|---|---|
| es-toolkit 1.50.0 | 286 | 171 | 119 `interface-dispatch`, 42 `closed-world`, 5 `delete-property`, 3 `chained-allocation`, 2 `accumulating-spread` |
| ramda 0.32.0 | 100 | 100 | 73 `closed-world`, 26 `interface-dispatch`, 1 `delete-property` (`_dissoc`) |
| immutable 5.1.9 | 89 | 92 | 79 `closed-world`, 9 `interface-dispatch`, 2 `megamorphic-dispatch`, 1 each `chained-allocation` and `delete-property` |
| remeda 2.0.0 | 79 | 66 | 63 `closed-world`, 2 `delete-property`, 1 `accumulating-spread` |
| zod 4.4.3 (`v4/core`) | 78 | 125 | 80 `interface-dispatch`, 24 `closed-world`, 15 `delete-property`, 5 `chained-allocation`, 1 `megamorphic-elements` |
| just 1.22.4 | 61 | 20 | 18 `closed-world`, 1 each `chained-allocation` and `delete-property` |
| luxon 3.7.2 | 52 | 17 | 6 `interface-dispatch`, 5 `closed-world`, 3 each `chained-allocation` and `delete-property` |
| decimal.js 10.6.0 | 36 | 131 | 82 `closed-world`, 49 `interface-dispatch` |
| date-fns 4.4.0 (`core`) | 28 | 13 | 5 `closed-world`, 4 `interface-dispatch`, 1 each `megamorphic-dispatch`, `chained-allocation`, `delete-property` and `accumulating-spread` |
| dinero.js 2.0.2 | 20 | 87 | 85 `closed-world`, 1 `chained-allocation`, 1 `accumulating-spread` |
| big.js 7.0.1 | 13 | 15 | 15 `closed-world` |
| radash 12.1.1 | 8 | 7 | 6 `interface-dispatch`, 1 `accumulating-spread` |

**The two coverage rules are 790 of the 844 findings**, 94%: 491
`closed-world` against 299 `interface-dispatch`. The other six rules make the
remaining 54.

**`megamorphic-dispatch` fires three times**, each where five or more
implementations reach a call the walk could not follow. immutable's
`Seq.js:65` and `:83` call `this.__iterateUncached()` and
`this.__iteratorUncached()`, which ten `Seq` subclasses reach; date-fns's
`parse` calls `this.parse()`, which 31 parser classes reach. Both are dispatch
tables written on purpose: the rule found where these libraries chose
polymorphism, not a mistake.

**`megamorphic-elements` fires at one site in 850 functions**: zod's
`prefixIssues`, whose `issues` parameter unions twelve issue types and which
reads `.path` off every element through an `as any`. A cast does not change
the object, and V8 loads from its map either way.

### Two applications

Two large programs, run the same way:

| Program | annotated | findings | what fired |
|---|---|---|---|
| TypeScript 5.9.3 (`src/compiler`) | 465 | 4327 | 4048 `interface-dispatch`, 246 `closed-world`, 16 `megamorphic-dispatch`, 11 `megamorphic-elements`, 4 `chained-allocation`, 1 each `delete-property` and `accumulating-spread` |
| typescript-eslint 8.67.0 | 311 | 935 | 882 `closed-world`, 44 `interface-dispatch`, 6 `chained-allocation`, 2 `delete-property`, 1 `megamorphic-dispatch` |

Read those `closed-world` totals as a limit of this run before reading them as
anything about either codebase: neither checkout had `node_modules`
installed, so every call into a missing package is an unresolvable callee,
reported at each call site. They are kept out of the library table for that
reason; mixed in, they would move the coverage rules' share from 94% to 98%.
In the compiler, `interface-dispatch` is the larger half: TypeScript
dispatches almost everything through `Node`, `Symbol` and `Type` interfaces
whose implementations are all in the checkout.

Both megamorphic rules fire more often here than in all twelve libraries
together:

- **typescript-eslint:** `packages/eslint-plugin/src/rules/no-misused-promises.ts:543`
  calls `tsNode.name.getText()`, and `name` reaches that call as six distinct
  property sets: a TypeScript declaration name is not one node type.
- **The compiler:** `megamorphic-elements` fires at 11 sites. The widest is
  `checker.ts:44260`, where `checkUnusedIdentifiers` reads `node.kind` off
  every element of a `PotentiallyUnusedIdentifier[]`, a union of 20 distinct
  property sets at one load site. A union member is not a V8 map (`TC-2`), but
  20 against a budget of four is the widest gap in the survey.
- **`delete`:** `typescript-estree/src/ast-converter.ts:48` deletes `range` and
  `loc` from every node of the converted AST when the parser is asked not to
  emit them. Each such node can move to dictionary mode, and every later read
  of it pays.

### Eight more codebases

Eight more codebases were run the same way, to test whether any rule has no
instance in real code:

| Codebase | annotated | findings | what fired besides `closed-world` |
|---|---|---|---|
| svelte (`packages/svelte/src`) | 504 | 401 | 65 `interface-dispatch`, 13 `delete-property`, 12 `chained-allocation`, 2 `accumulating-spread` |
| vue (`packages/*/src`) | 409 | 1754 | 543 `interface-dispatch`, 13 `delete-property`, 10 `megamorphic-dispatch`, 7 `megamorphic-elements`, 5 `chained-allocation`, 4 `accumulating-spread` |
| typebox | 199 | 53 | **30 `accumulating-spread`**, 16 `interface-dispatch`, 3 `delete-property` |
| mobx | 49 | 64 | 32 `interface-dispatch`, 2 `delete-property` |
| valibot | 87 | 107 | 60 `interface-dispatch`, 9 `chained-allocation`, 1 each `megamorphic-dispatch` and `delete-property` |
| rxjs | 60 | 105 | 33 `interface-dispatch` |
| immer | 10 | 37 | 13 `interface-dispatch`, 2 `delete-property` |
| ts-pattern | 9 | 22 | nothing |

**Vue and the TypeScript compiler each fire seven of the eight rules**; no
codebase fires `allocating-select`. Eight of vue's ten `megamorphic-dispatch`
sites come from declared property sets: `vnode.type`, with nine property sets,
is seven of them, at `.hydrate()`, `.process()`, `.move()`, `.remove()` and
`.toLowerCase()`, and a `.replace()` in `compiler-core`'s `codegen.ts` is the
eighth. The other two are `watch.ts:161` and `:163`, which call `.some()` and
`.map()` on a `source` that seven allocation sites reach.

**`megamorphic-elements` fires at 19 lines in 2953 annotated functions**: 11 in
the TypeScript compiler, 7 in vue and one in zod. That is the rule's whole
footprint on 22 codebases.

**TypeBox has 30 distinct `accumulating-spread` sites**, more than the other
twenty-one codebases together, which have 13. `FromObject` in
`value/create/from_object.ts` is six lines and is the whole rule:
`required.reduce((result, key) => ({ ...result, [key]: … }), {})`.

**`allocating-select` fires at no site across 2953 annotated functions.** It
sees an allocation only in a callee whose body is in the program, so a
packaged `Decimal.min` declared in a `.d.ts` can never trigger it. Removing the
rule leaves all 22 outputs byte-identical.
