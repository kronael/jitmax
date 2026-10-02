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
| `findLastIndex()` | typescript-eslint 8.67.0, `packages/eslint-plugin/src/util/misc.ts` @ 56c9ed9 — https://github.com/typescript-eslint/typescript-eslint | `closed-world` |
| `stringifyStyle()` | Vue 3.5.41, `packages/shared/src/normalizeProp.ts` and `src/general.ts` @ e2bede9 — https://github.com/vuejs/core | `interface-dispatch` |

All six are MIT. Each `.before.ts` header carries its upstream copyright line,
version and commit, and [LICENSE-MIT](LICENSE-MIT) reproduces the permission
notice that travels with them. All six come from the survey below. From a
checkout, `node bin/jitmax.ts examples` reports every `.before.ts` and nothing
on any `.after.ts`.

All eight rules have a real upstream detection documented here. A vendored
pair is a local change the checker accepts; a measured rewrite also carries
caller-level timings. A detection alone establishes neither.

| rule | upstream function | example status |
|---|---|---|
| `accumulating-spread` | radash `assign`, remeda `mergeAll` | vendored pairs, measured rewrites |
| `delete-property` | es-toolkit `omit` | vendored pair, measured rewrite |
| `chained-allocation` | Zod `cleanEnum` | vendored pair, measured rewrite |
| `closed-world` | typescript-eslint `findLastIndex` | vendored annotation pair, no speed claim |
| `interface-dispatch` | Vue `stringifyStyle` | vendored annotation pair, no speed claim |
| `megamorphic-elements` | Zod `prefixIssues` | detection, no verified rewrite |
| `megamorphic-dispatch` | date-fns `parse` | detection, no verified rewrite |
| `allocating-select` | Babylon.js `updateSceneBounds` | detection, no verified rewrite |

## What each fix is worth

The first four examples carry a rewrite, measured below: `accumulating-spread`,
`delete-property` and `chained-allocation`. The last two carry the fix the
coverage rules print, an annotation, and make no speed claim: [the coverage
rules](#the-coverage-rules-the-finding-and-the-annotation-that-clears-it) shows
each. The megamorphic rules and `allocating-select` have real detections,
below, and no measured rewrite.

Each cell runs the function over a batch of inputs through one caller, and
follows [the protocol](../bench/README.md#how-a-cell-is-measured): three whole
sweeps of twenty process pairs, all three printed. **Agreement** is the range
every sweep's 95% interval contains, so a sweep's own ratio can sit outside
it. A ratio is before time over after time: above 1.0 the shipped code costs
that much more, and **below 1.0 the fix made it slower**. `n` counts the keys
in each radash config object and each es-toolkit record, the objects remeda
merges, and the zod enum's members.

**Calls plus one read pass over each batch of results:**

| Function, and the finding | n | three sweeps | agreement | verdict |
|---|---|---|---|---|
| radash `assign` — `accumulating-spread` | 16 | 1.27 / 1.26 / 1.18 | **1.20–1.27** | faster |
| radash `assign` | 128 | 3.54 / 3.35 / 3.44 | **3.23–3.53** | faster |
| remeda `mergeAll` — `accumulating-spread` | 8 | 0.13 / 0.13 / 0.13 | **0.12–0.14** | **slower** |
| remeda `mergeAll` | 64 | 1.52 / 1.51 / 1.54 | **1.48–1.59** | faster |
| es-toolkit `omit` — `delete-property` | 12 | 0.17 / 0.17 / 0.18 | **0.17–0.18** | **slower** |
| es-toolkit `omit` | 48 | 0.51 / 0.50 / 0.50 | **0.49–0.52** | **slower** |
| zod `cleanEnum` — `chained-allocation` | 16 | 1.05 / 1.20 / 1.14 | **1.10–1.12** | faster |
| zod `cleanEnum` | 256 | 1.03 / 1.06 / 1.08 | **1.03–1.10** | **rejected**, under [rule 6](../bench/README.md#how-a-cell-is-measured)'s broad-warning bar |

**Repeated reads of results built before timing**, which is where
`delete-property`'s cost is paid — by the caller, not inside the function:

| Function | n | three sweeps | agreement |
|---|---|---|---|
| radash `assign` | 16 / 128 | 1.96 / 1.99 / 1.81 · 1.77 / 1.71 / 1.62 | **1.88–2.01** · **1.66–1.70** |
| remeda `mergeAll` | 8 / 64 | 1.00 / 1.01 / 1.02 · 1.03 / 1.00 / 1.02 | **0.96–1.05, REJECTED** · **0.98–1.03, REJECTED** |
| es-toolkit `omit` | 12 | 11.20 / 10.78 / 12.00 | **10.95–11.71** |
| es-toolkit `omit` | 48 | 11.87 / 11.62 / 10.44 | **11.32–11.74** |
| zod `cleanEnum` | 16 | 0.98 / 1.11 / 1.01 | **none — DISAGREES** |
| zod `cleanEnum` | 256 | 1.02 / 1.01 / 1.05 | **0.98–1.07, REJECTED** |

The two tables are separate workloads, not parts to add up: the first already
includes one read pass per batch. How often your caller reads a result, and
which properties, can change the outcome, so benchmark its complete workload
before you keep a rewrite. `omit` shows why: its fix improves reads at n=12
and n=48, but makes calls plus one read pass slower, so it pays only where the
caller's extra reads repay the slower build.

The object rewrites define own data properties, so they keep own `__proto__`
keys without calling inherited setters. Remeda copies enumerable symbols and
values; `omit` snapshots values before filtering, including getters of omitted
keys, and accepts numeric and symbol keys. A clean checker result alone does
not establish any of these behaviours.

The three object examples come from the `kernel: "own-properties"` rows in
[`bench/example.jl`](../bench/example.jl): both sizes, both halves, three
valid sweeps per cell after the load gate, and all twelve cells replicate. Four rows over the
load gate stay in the file, are excluded, and have replacement sweeps. The
tier diagnostics in `bench/tiers.jl` report tier mismatches for some cells, so
a ratio is not proof of an isolated storage-layout effect.

The microbenchmark is no caller-level forecast. Object spread costs 186–200x
at n=500 in its kernel; radash's calls plus one read pass move 1.18–3.54x,
because the code around the copy still allocates, recurses and branches.

`make example` checks the four examples, then measures only the cells
`bench/example.jl` lacks. To measure all sixteen again without touching the
published rows, run `node bench/run.ts example --force --scratch` on an idle
machine; [re-run any claim](../bench/README.md#re-run-any-claim) lists the
options.

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

No `.before.ts` and `.after.ts` pair exists for either rule. Zod builds its
issues across its check functions; `prefixIssues` receives those objects.
date-fns has thirty-one parser classes, so a guard with dedicated call sites
would need a caller-specific design. Class instances keep different maps
even when their own properties match, because their prototypes differ.

Three more builder candidates have no verified local rewrite:
[css-what `parseSelector`](https://github.com/fb55/css-what/blob/8f424938010e7ac1e414a9109c5abf08ff4117dd/src/parse.ts)
fills the `Selector[][]` returned by the public `parse` API;
[Kordoc `buildOutline`](https://github.com/chrisryugj/kordoc/blob/467e4cddc104748ca163d94eace6d2259f35a3e9/src/hwpx/outline.ts)
returns its exported `OutlineNode` union;
[SVG-to-SwiftUI `pathValueCandidates`](https://github.com/bring-shrubbery/SVG-to-SwiftUI/blob/b362050966ebf4990199c82eeebce5d1389e1fcf/packages/svg-to-swiftui-core/src/renderTree/generateSwiftUI.ts)
collects existing animation values built elsewhere. Giving these objects
uniform properties needs checks of their callers and builders. None carries
a vendored pair, a semantics check or a measured rewrite here.

## An allocating-select detection

`allocating-select` fires on **Babylon.js** `updateSceneBounds` and
`_updateWorldScaleMatrix`, which grow a bounding box over every shadow-casting
mesh with `bounds.min = Vector3.Minimize(bounds.min, localBounds.min)` and the
`Maximize` line under it:
`packages/dev/core/src/Rendering/IBLShadows/iblShadowsRenderPipeline.pure.ts:748:13`
and `:749:13`, and
`packages/dev/core/src/FrameGraph/Tasks/Rendering/iblShadows/iblShadowsVoxelizationTask.ts:251:13`
and `:252:13`, at revision `02b5a5e79b0140f79dc75f703e82cb79d8b5fa4c` of
`BabylonJS/Babylon.js` (9.29.0). `related:` names the allocation each call
returns, `new Vector3()` at `packages/dev/core/src/Maths/math.vector.pure.ts:3132:21`
and `:3146:21` — a local the selector fills and returns. Babylon has the
in-place form, `minimizeInPlace`, which fits a bound the function owns. The
function is a method on a render pipeline, so there is no vendored pair and
no measured rewrite.

To reproduce, check out that revision. Babylon's root `tsconfig.json` sets
`ignoreDeprecations: "6.0"`, which TypeScript 5.9 rejects, so run from a
directory holding a `tsconfig.json` that maps `core/*` to
`packages/dev/core/src/*`, with `examples/annotate.js` run over the two
directories first:

```sh
bunx github:kronael/jitmax \
  <babylon>/packages/dev/core/src/Rendering/IBLShadows/iblShadowsRenderPipeline.pure.ts \
  <babylon>/packages/dev/core/src/FrameGraph/Tasks/Rendering/iblShadows/iblShadowsVoxelizationTask.ts
```

It exits `1` with the four findings among the coverage findings of two
functions whose walk the body limit truncates.

## The coverage rules: the finding and the annotation that clears it

`closed-world` and `interface-dispatch` make no speed claim. Each reports a
call the walk could not check, and the fix each prints is a decision: read the
code the walk could not, then record that on the annotation. Two vendored
functions show what that looks like.

**typescript-eslint `findLastIndex`** calls the `predicate` its caller passes.
No caller is in the program, so the callback has no body the walk can read:

```sh
node bin/jitmax.ts examples/tseslint-find-last-index.before.ts
```

```text
jitmax — 1 annotated function, 1 error

  examples/tseslint-find-last-index.before.ts:7  findLastIndex()
    examples/tseslint-find-last-index.before.ts:14:19  error  closed-world
      predicate: no readable implementation
      next: resolve predicate to its TypeScript implementation, or review the
            dependency separately and add -closed-world to this root's @jitmax
            annotation
      sources: No receiver source located. Source tracing is partial: no
               visible caller of findLastIndex — its arguments come from
               outside this program.

  note (closed-world): missing source does not prove V8 failed to inline. A
                       .d.ts has no implementation to check

  Static findings are candidates, not measured costs in this workload.
  Profile and benchmark the caller before keeping a change.
  Evidence, known defects and all related locations: -v.
  Rule limits: docs/rules.md; benchmarks: bench/README.md (jitmax package).
```

The after half is the same function under `/** @jitmax -closed-world */`. The
callback is reviewed where it is written, and the annotation records that. The
run prints `1 finding suppressed (closed-world)` and exits 0.

**Vue `stringifyStyle`** calls `hyphenate`, which Vue builds through
`cacheStringFunction`, a memoiser whose `fn` is whichever of four string
helpers it was given. The walk reaches `fn(str)` and finds all four:

```sh
node bin/jitmax.ts examples/vue-stringify-style.before.ts
```

```text
jitmax — 1 annotated function, 1 error
  1 call into the platform, not listed: the body is native
  1 interface call resolved to the one implementation this program builds, and
  followed — sound only for a closed program

  examples/vue-stringify-style.before.ts:48  stringifyStyle()
    examples/vue-stringify-style.before.ts:17:33  error  interface-dispatch
      calls fn; 4 implementations reach this call; their bodies are not
      followed
      next: review the implementations of fn, then record the review with
            -interface-dispatch on this root's @jitmax annotation
      related: examples/vue-stringify-style.before.ts:23:3 function
      related: examples/vue-stringify-style.before.ts:30:3 function
      2 more related source locations omitted; use -v to show all

  note (interface-dispatch): annotating a target checks its body but does not
                             clear this call-site error. Keep the abstraction;
                             a type assertion does not select a runtime
                             implementation

  Static findings are candidates, not measured costs in this workload.
  Profile and benchmark the caller before keeping a change.
  Related locations are representative; static counts are not runtime counts.
  Evidence, known defects and all related locations: -v.
  Rule limits: docs/rules.md; benchmarks: bench/README.md (jitmax package).
```

The after half reviews the implementations and checks the one used here.
`/** @jitmax */` on the `hyphenate` implementation, the one `stringifyStyle`
reaches, checks its body as a root of its own. `-interface-dispatch` on
`stringifyStyle` records
that the four were reviewed and clears the call-site error. The run reports 2
annotated functions, `1 finding suppressed (interface-dispatch)`, and exits 0.

Neither annotation changes what the function computes. `make test` holds both
halves of each pair to the same results, and holds the suppressed finding in
place under the annotation.

## The survey

The checker, at commit `0dc6b83`, ran on 22 open-source codebases: twelve
libraries, two applications and eight other codebases, each cloned shallow.
`examples/annotate.js` marked every function, not nested inside another, whose
body holds a loop or an array-iteration call; radash was marked by hand. That
is 2953 annotated functions in all.

A count is distinct source lines per rule, across errors and warnings. A
line reached from 28 annotated functions is one finding, so the counts
measure work, not call-graph fan-in.
The report's own header counts line and column, so it can print more. Calls
into the platform — Node's API, V8's builtins and anything reached off
`globalThis` — are counted for the run and never listed.

The 22 runs report 8625 findings. The two coverage rules make 8425 of them;
in the twelve libraries, they make 786 of the 840 findings. The two
applications had no `node_modules` installed, so each call to a function
from a missing package is a `closed-world` finding there; read their totals
as a limit of this run. The megamorphic rules fire on real code,
`megamorphic-elements` at 19 lines in the
TypeScript compiler, vue and zod, but no megamorphic finding has a measured
rewrite. Some mark polymorphism a library chose on purpose, such as date-fns's
parsers and immutable's `Seq` subclasses: a finding there locates
polymorphism, not a mistake. `allocating-select` fired nowhere. It sees an
allocation only in a callee whose body is in the program, so a packaged
`Decimal.min` declared in a `.d.ts` can never trigger it.

The walk stops at its body limit in 98 TypeScript roots, 80 TypeBox roots,
three Vue roots and one Svelte root. Their counts, and the aggregate, are
lower bounds. Missing modules and unresolved calls also limit what these
runs can check; the tables count the findings the checker could report.

### Libraries

| Library | annotated | findings | what fired |
|---|---|---|---|
| es-toolkit 1.50.0 | 286 | 168 | 126 `closed-world`, 32 `interface-dispatch`, 5 `delete-property`, 3 `chained-allocation`, 2 `accumulating-spread` |
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
| radash 12.1.1 | 8 | 6 | 5 `closed-world`, 1 `accumulating-spread` |

### Applications

| Program | annotated | findings | what fired |
|---|---|---|---|
| TypeScript 5.9.3 (`src/compiler`) | 465 | 4308 | 4029 `interface-dispatch`, 246 `closed-world`, 16 `megamorphic-dispatch`, 11 `megamorphic-elements`, 4 `chained-allocation`, 1 each `delete-property` and `accumulating-spread` |
| typescript-eslint 8.67.0 | 311 | 936 | 883 `closed-world`, 44 `interface-dispatch`, 6 `chained-allocation`, 2 `delete-property`, 1 `megamorphic-dispatch` |

### Other codebases

| Codebase | annotated | findings | what fired besides `closed-world` |
|---|---|---|---|
| svelte (`packages/svelte/src`) | 504 | 403 | 63 `interface-dispatch`, 13 `delete-property`, 12 `chained-allocation`, 2 `accumulating-spread` |
| vue (`packages/*/src`) | 409 | 1750 | 523 `interface-dispatch`, 13 `delete-property`, 7 `megamorphic-elements`, 5 `chained-allocation`, 4 `accumulating-spread` |
| typebox | 199 | 53 | 30 `accumulating-spread`, 16 `interface-dispatch`, 3 `delete-property` |
| mobx | 49 | 64 | 32 `interface-dispatch`, 2 `delete-property` |
| valibot | 87 | 106 | 58 `interface-dispatch`, 9 `chained-allocation`, 1 each `megamorphic-dispatch` and `delete-property` |
| rxjs | 60 | 105 | 32 `interface-dispatch` |
| immer | 10 | 38 | 14 `interface-dispatch`, 2 `delete-property` |
| ts-pattern | 9 | 22 | nothing |
