# What the fix is worth on somebody else's code

Start with the [README setup](../README.md#quick-start) for Bun, the TypeScript
5.x requirement and the existing-checkout route. Detection trials and measured
speedups are separate results below.

`BUGS.md` references point to the internal issue history in the full Git clone.
The installed guides retain each trial's result and limits without that queue.

Four functions, vendored verbatim from published libraries, with the fix
jitmax printed on each and nothing else. `diff` a `.before.ts` against its
`.after.ts` — [radash-assign.before.ts](radash-assign.before.ts) against
[radash-assign.after.ts](radash-assign.after.ts), for one — and the fix is the
entire change.

| function | library | rules it triggers |
|---|---|---|
| `assign()` | radash 12.1.1, `src/object.ts` and `src/typed.ts` @ 4cab190 — https://github.com/rayepps/radash | `accumulating-spread` |
| `mergeAll()` | remeda 2.0.0, `packages/remeda/src/mergeAll.ts` @ 72ca45e — https://github.com/remeda/remeda | `accumulating-spread` |
| `omit()` | es-toolkit 1.50.0, `src/object/omit.ts` @ bec4905 — https://github.com/toss/es-toolkit | `delete-property` |
| `cleanEnum()` | zod 4.4.3, `packages/zod/src/v4/core/util.ts` @ 5e60885 — https://github.com/colinhacks/zod | `chained-allocation` |

All four are MIT. Each `.before.ts` header carries its upstream copyright line,
version and commit, and `examples/LICENSE-MIT` reproduces the permission notice
that must travel with them. The point of the whole exercise is that the code
measured here is somebody else's.

## Successful megamorphic detections: validation and timestamp imports

**PASS for locating candidates in real libraries; no verified speedup.** The
2026-09-07 trial exercised Zod validation and date-fns timestamp parsing, then
ran jitmax on their source. The two megamorphic rules are the main focus of
these user trials. The configuration merge below exercises a different rule.

- Zod `prefixIssues` reported `megamorphic-elements` on its issue array,
  counting 12 declared property sets. The caller accepted a valid record and
  checked every error path for a record with invalid name, email, age, score,
  quota, role, date and active fields. The report points to
  `packages/zod/src/v4/core/util.ts:842` at revision
  `5e608851fbc7659855e096239e36b9147af8a187` of `colinhacks/zod`.
- date-fns `parse` reached `Parser.run` and reported `megamorphic-dispatch`
  on `this.parse`, counting at least 31 parser implementations. The caller
  checked timestamp imports with positive, negative and zero offsets, including
  a leap-day rollover, against explicit UTC timestamps. The report points to
  `src/parse/_lib/Parser.ts:16`, from the `pkgs/core` package root at revision
  `a0a39220522ed1228445792c768ed887709aea5f` of `date-fns/date-fns`.

Save the [megamorphic preset](megamorphic/jitmax.toml) as `jitmax.toml` in the
directory you will run from. It disables the other six
rules through the normal configuration interface. Suppressed findings remain
counted in the report; unresolved calls can still make coverage incomplete.

To reproduce the detections, check out the revisions above and install each
library's dependencies with its package manager. Put `/** @jitmax */` on Zod's
`prefixIssues` and date-fns's `parse`. Save the preset in the Zod repository
root and run there. If the GitHub command fails in your environment, replace
its prefix with the README's checkout route:

```sh
bunx github:kronael/jitmax jitmax.toml packages/zod/src/v4/core/util.ts
```

Install date-fns's workspace dependencies so its inherited
`@date-fns/dev/config/tsconfig` resolves. A missing inherited config stops jitmax
before analysis. Save another copy of the preset in date-fns's `pkgs/core`
directory, then run there:

```sh
bunx github:kronael/jitmax jitmax.toml src/parse/index.ts
```

Both runs exit 1 with a megamorphic finding. These source snapshots also appear
in the survey below; the trial repeats detection on real caller tasks. It does
not establish runtime map counts, whether the sites dominate those tasks, or
whether changing them improves performance. Node v22.23.2 ran both callers;
date-fns needed `--experimental-transform-types`, and Bun bundled the Zod caller
for Node.

The diagnostic workflow also passes: Zod's report names the collection at
`util.ts:842:64` and its first property read, `(iss as any).path`, at
`util.ts:844:5`. date-fns names the call at `Parser.ts:16:20`. Both distinguish
static counts from runtime evidence and retain their coverage notices.

**PASS for locating date-fns implementation sources.** Related locations include
`src/parse/_lib/parsers/EraParser.ts:6:1` and `YearParser.ts:19:1`.
The default report shows five source locations and states how many it omits;
add `--verbose` to see all available parser sources. These are class definitions,
not every allocation or proof of runtime reachability.

**Builder tracing remains partial for Zod.** The bounded source query finds no
issue builder through the cyclic flow and prints that reason. It still locates
the property read. This is not a builder-location success.

My user assessment: the locations and named parser classes give me somewhere
to investigate. The advice identifies a builder or call-site change and says
when a library caller needs upstream help. Zod's report does not name the issue
creators I would need to edit. Neither report provides a verified caller-level
rewrite or proves that my data sees the reported number of shapes. These are
detection and diagnostic successes, not successful performance fixes.
TC-19 and TC-33 record those limits.

## Successful checkout trial: merging service configuration

**PASS for the tested ordinary configuration inputs.** On 2026-09-07, the
local checkout identified repeated copying in radash's real `assign` function.
The mutation shown in `radash-assign.after.ts` cleared the finding and preserved
the expected merged values and both inputs. This replays an existing library
example with a caller's task: combine service defaults with nested overrides.
It is not a new library discovery or a new speed measurement.

This reproduction needs the jitmax checkout and its
[development dependencies](../README.md#development-and-licence). Run there;
the Node commands exercise the recorded caller and checker source directly:

```sh
node bin/jitmax.ts examples/radash-assign.before.ts
node examples/config-check.ts
node bin/jitmax.ts examples/radash-assign.after.ts
```

The first command exits 1 and reports `accumulating-spread` on the reducer's
copy of `acc`. The last exits 0 and reports `every annotated function is clean.`
The caller check exits 0 and prints:

```text
PASS nested service options; inputs unchanged
PASS empty overrides; inputs unchanged
PASS false, zero, empty string and null overrides; inputs unchanged
PASS own JSON keys at both levels; inputs unchanged
```

The nested case keeps the default port and retry delay, changes retry attempts
and log level, and replaces the hosts array. Both implementations must match an
explicit expected object; matching each other alone does not pass the check.
Run `node examples/config-check.ts` again after changing either implementation.

**PASS for own JSON keys at both levels.** The caller also checks an own
`__proto__` key on the result and on nested retry options. The rewrite defines
own data properties without invoking inherited setters. This covers the
recorded inputs, not every possible radash input or prototype.

**Public installation works.** Re-run 2026-10-01 on Bun 1.3.14 in a scratch
project: `bunx github:kronael/jitmax --help` exits `0`, and the README's sample
`hot.ts` exits `0` with `every annotated function is clean.` The checkout
command above works as well. A project resolving `typescript@7.0.2` stops at
exit `2` instead, which is why the quick start pins 5.x first.

My user assessment: the file, line and explanation of repeated copying help me
locate the work. The fix text asks me to choose between faster merging and
faster reads without measuring my caller. The footer identifies findings as
static candidates and directs me to profile and benchmark. `--help` exits 0
and explains annotations, configuration, profiles and exit codes. These are
observations and opinions from using the commands, not a claim about speed.

## Measured library examples

**Three of the eight rules have measured end-to-end rewrites**:
`accumulating-spread` (radash `assign`, remeda
`mergeAll`), `delete-property` (es-toolkit `omit`) and `chained-allocation`
(zod `cleanEnum`). `megamorphic-elements`, `megamorphic-dispatch`,
`allocating-select`, `closed-world` and `interface-dispatch` do not, and the
last section of this file distinguishes those gaps from detection successes.

Every measured cost in `docs/rules.md` comes from a microbenchmark, and a
microbenchmark cannot say what a program gets. So: take a function a library ships, apply the
fix jitmax printed on it and nothing else, and time the whole call the way a
caller makes it. `make example` prints the findings, then runs the sweep.

The measured functions come from the survey. Eleven libraries were cloned shallow and
annotated by `examples/annotate.js` — every function not nested inside another
whose body loops — and these are the findings that came back. radash is the
twelfth, marked by hand a round earlier, and it took fixing three classes of
false positive to get that run from eight findings to one. The
ratio is before/after, so above 1.0 the shipped code costs that much more and
**below 1.0 the fix made it slower**. Three whole sweeps per cell, per the
[acceptance rules](../bench/README.md#how-a-cell-is-measured), all three printed.
**Agreement** is the range every sweep's 95% interval contains — the overlap of
the three, not a new interval from pooled runs — so a sweep's own ratio can sit
outside it. `n` counts the keys in each radash config object and each
es-toolkit record, the objects remeda merges, and the zod enum's members.

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
cost is actually paid — by the caller, not inside the function:

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
but makes the whole call slower (0.17–0.51x). Keep it only when the caller's
measured reads repay that cost. Zod's small read cell does not replicate;
its larger read cell establishes no benefit.

The object rewrites define own data properties, preserving own `__proto__`
keys without invoking inherited setters. Remeda copies enumerable symbols and
values; `omit` snapshots values before filtering, including getters of omitted
keys, and accepts numeric and symbol keys. A clean checker result alone
does not establish any of these behaviors.

Measured on 2026-09-08: the three object examples, two sizes and both halves,
three accepted sweeps per cell. Each sweep has twenty process pairs. The
`kernel: "own-properties"` rows in [`bench/example.jl`](../bench/example.jl)
identify this code.
Four rows exceeded the load limit; they remain in the file, are excluded from
these results, and have replacement sweeps. All twelve accepted cells replicate.
Zod's code and measurements are unchanged. Node, V8, flags, seeds, affinity and
load readings accompany every row. Separate tier diagnostics are in
`bench/tiers.jl`; they do not contribute timings.
Those probes report tier mismatches for some cells, so a ratio is not proof
of an isolated storage-layout effect. The results apply to the recorded engine
and workload, not every caller.

The microbenchmark is not a caller-level forecast. Object spread costs
186–200x at n=500 in that kernel; radash's complete call moves 1.18–3.54x.
The code around the copying still allocates, recurses and branches.

**The whole survey, so the four examples are not four picks out of a hat.**
Twelve libraries, 850 annotated functions, **844 findings, every one an
error.** No library produced nothing.

Every survey count in this file comes from one run on 2026-10-01, with the
checker at commit `75a1568`, and counts distinct source lines per rule; the
report's own header counts line and column, so it can print more. A finding is
one per SITE: a line reached from 28 annotated functions is one finding, so the
counts measure the work rather than the call-graph fan-in (`BUGS.md` TC-62). Calls into the platform — Node's own API, V8's builtins
and anything reached off `globalThis` — are counted for the run and never
listed (TC-55, TC-110), and every call the walk cannot follow is reported rather
than falling through both branches and vanishing (TC-45).

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

Three things in that table are about the tool rather than the libraries.

**The two escape rules are 790 of the 844 findings** — 94%. Both warned
rather than erring until 2026-08-31, so none of it failed a run; all of it does
now, and `[rules]` is where a reader who disagrees says so. They were one rule
until 2026-08-29
and the split is what the ratio between them is for: 491 `closed-world`, a
callee the program sees only as a declaration, against 299 `interface-dispatch`,
a body that IS here at a site the walk cannot bind to one implementation. The
platform is in neither — Node's own API, V8's builtins and anything reached off
`globalThis` are counted for the run and never listed, because "inline what you
need from `path.join`" is advice nobody can take (`BUGS.md` TC-55, TC-69,
TC-51, TC-110). The other six rules make the remaining 54 findings; three of
them are `megamorphic-dispatch`, which carries TC-33 like the escape rules.

**`megamorphic-dispatch` fires three times** in these 850 annotated functions,
all three through the escape route added in TC-110 — five or more implementations
reaching one receiver at a call the walk could not follow. immutable's
`Seq.js:65` and `:83` call `this.__iterateUncached()` and
`this.__iteratorUncached()`, and ten `Seq` subclasses reach that `this`;
date-fns's `parse` calls `this.parse()` on a `this` that 31 parser classes reach
— `EraParser`, `YearParser`, `LocalWeekYearParser` and the rest. Both are
dispatch tables written on purpose, which is the honest reading: the rule found
the two places these libraries chose polymorphism, not a mistake. It fired NOT
AT ALL before that route existed, which is the more useful fact about it: the sharpest cliff this project measured, 12.9-22.7x, is
not a shape utility libraries write on purpose. The applications below have
more.

**`megamorphic-elements` fires at exactly one site in 850 functions** — zod's
`prefixIssues`, whose `issues` parameter unions twelve issue types and which
reads `.path` off every element through an `as any`. It used to print as ten
findings, which was the same line reported from ten annotated roots that reach
it; one site is what the flagship rule is worth across twelve libraries, and the
ten was the fan-in flattering it.

## Two applications

A utility library is a pipeline. Two programs that are neither small nor fast
were run exactly the same way — cloned shallow, annotated by
`examples/annotate.js`, nothing picked by hand:

| Program | annotated | findings | what fired |
|---|---|---|---|
| TypeScript 5.9.3 (`src/compiler`) | 465 | 4327 | 4048 `interface-dispatch`, 246 `closed-world`, 16 `megamorphic-dispatch`, 11 `megamorphic-elements`, 4 `chained-allocation`, 1 each `delete-property` and `accumulating-spread` |
| typescript-eslint 8.67.0 | 311 | 935 | 882 `closed-world`, 44 `interface-dispatch`, 6 `chained-allocation`, 2 `delete-property`, 1 `megamorphic-dispatch` |

Read those `closed-world` totals as a defect in this tool before reading them
as anything about either codebase. Neither checkout had `node_modules` installed, so every call into a
missing package is an unresolvable callee, reported at each call site.
`BUGS.md` TC-51. The two rows are kept out
of the table above for the same reason: mixed in they would move
the two escape rules' share from 94% to 98% and teach a reader nothing. In the
compiler, `interface-dispatch` is by far the larger
half: TypeScript dispatches almost everything through `Node`, `Symbol` and
`Type` interfaces whose implementations are all in the checkout.

Under the flood, both megamorphic rules fire more often than in all twelve
libraries together.

**`megamorphic-dispatch` fires once in typescript-eslint.**
`packages/eslint-plugin/src/rules/no-misused-promises.ts:543` calls
`tsNode.name.getText()`, and `name` reaches that call as six distinct property
sets — a TypeScript declaration name is not one node type. Six is past the four
maps V8 caches for the site.

**`megamorphic-elements` fires at 11 sites in the compiler**, against one in
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

## A wider net, and the one thing it settled

Twelve libraries and two applications left one rule with no instance of the
shape its own benchmark measured. Eight more codebases were run the same way,
so that the absence would mean something:

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
codebase fires `allocating-select`. Vue is a framework, not a pipeline, and
both megamorphic rules find shapes in it that no utility library has. Eight of
its ten `megamorphic-dispatch` sites are the rule counting
declared property sets — `vnode.type` is nine of them, at `.hydrate()`,
`.process()`, `.move()`, `.remove()` and `.toLowerCase()`. The other two are the
escape route added in TC-110: `watch.ts:161` and `:163` call `.some()` and
`.map()` on a `source` that seven allocation sites reach.

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

**What the rule is worth, counted per site: 19 lines in 2953 annotated
functions** — 11 in the TypeScript compiler, 7 in vue, one in zod. It counts an
intersection as an object type, which is what a branded type is, so five
branded types behind one receiver are five shapes (`BUGS.md` TC-95). That is
the flagship rule's whole footprint on 22 real codebases. `BUGS.md` TC-64
reaches the same place from 30 other corpora and a different annotation rule.

**TypeBox has 30 distinct accumulating-spread sites, more than every other
codebase here put together** — 13 across the other twenty-one. Each site counts
once, however many annotated functions reach it. `FromObject` in
`value/create/from_object.ts` is six lines and is the whole rule:
`required.reduce((result, key) => ({ ...result, [key]: … }), {})`.

**`allocating-select` fires at no site across 2953 annotated functions.** It
sees an allocation only in a callee whose body is in the program, so a packaged
`Decimal.min` declared in a `.d.ts` can never trigger it, and removing the rule
leaves all 22 outputs byte-identical. Whether a rule that never fires on real
code should ship is an open owner decision, `BUGS.md` TC-148.

## Which rules have measured end-to-end rewrites

The measured pairs in `examples/` apply the printed fix to a vendored library
function. A detection trial also exercises a caller, but it does not establish
that a rewrite preserves behavior or improves performance.

| Rule | End to end |
|---|---|
| `accumulating-spread` | radash `assign` improves both measured halves; remeda `mergeAll` has a slower small build, a faster large build, and no established read benefit |
| `delete-property` | es-toolkit `omit` improves reads at n=12 and n=48, but makes the whole call slower |
| `chained-allocation` | zod `cleanEnum` — **1.10-1.12x** at 16 members clears the broad-warning bar; **rejected under [rule 6](../bench/README.md#how-a-cell-is-measured) at 256** (1.03-1.10x — lower bound under 1.05x, point estimate under 1.10x), published above |
| `allocating-select` | **no finding in 2953 annotated functions**, so no instance of the measured shape. The benchmark measured a *choice* between two values where the incumbent almost always wins, and the fix, "compare first and assign only when x really changes", saves an allocation exactly on the passes that change nothing. `BUGS.md` TC-18 |
| `megamorphic-elements` | **Detection success on Zod validation; no measured rewrite.** The reported function receives issues built elsewhere, and the advice does not identify their creators. `BUGS.md` TC-19 |
| `megamorphic-dispatch` | **Detection success on date-fns timestamp parsing; no measured rewrite.** The report locates the parser dispatch, but gives the caller no direct replacement. `BUGS.md` TC-33 |
| `closed-world`, `interface-dispatch` | make no speed claim; they report what was not checked |
