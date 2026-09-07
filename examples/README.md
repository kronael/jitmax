# What the fix is worth on somebody else's code

Four functions, vendored verbatim from published libraries, with the fix
jitmax printed on each and nothing else. `diff` a `.before.ts` against its
`.after.ts` and the fix is the entire change.

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

Use `megamorphic.toml` to focus on these rules. It disables the other six
rules through the normal configuration interface. Suppressed findings remain
counted in the report; unresolved calls can still make coverage incomplete.

To reproduce the detections, put `/** @jitmax */` on Zod's `prefixIssues` and
date-fns's `parse`. Run from the Zod repository root:

```sh
node /path/to/jitmax/bin/jitmax.ts /path/to/jitmax/examples/megamorphic.toml packages/zod/src/v4/core/util.ts
```

Run from date-fns's `pkgs/core` directory:

```sh
node /path/to/jitmax/bin/jitmax.ts /path/to/jitmax/examples/megamorphic.toml src/parse/index.ts
```

Both runs exit 1 with a megamorphic finding. These source snapshots also appear
in the survey below; the trial repeats detection on real caller tasks. It does
not establish runtime map counts, whether the sites dominate those tasks, or
whether changing them improves performance. Node v22.23.2 ran both callers;
date-fns needed `--experimental-transform-types`, and Bun bundled the Zod caller
for Node.

My user assessment: naming the source location and, for dispatch, concrete
parser classes gives me somewhere to investigate. But "four or fewer" and
"one construction path" give me no change I can make through the libraries'
public APIs. Zod's report does not name the issue creators I would need to edit.
Neither report offers a caller-level rewrite or proves that my data sees the
reported number of shapes. I count these as detection successes only, not
successful performance fixes. TC-19 and TC-33 record those limits.

## Successful checkout trial: merging service configuration

**PASS for the tested ordinary configuration inputs.** On 2026-09-07, the
local checkout identified repeated copying in radash's real `assign` function.
The mutation shown in `radash-assign.after.ts` cleared the finding and preserved
the expected merged values and both inputs. This replays an existing library
example with a caller's task: combine service defaults with nested overrides.
It is not a new library discovery or a new speed measurement.

Run from the jitmax checkout with its dependencies installed:

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
```

The nested case keeps the default port and retry delay, changes retry attempts
and log level, and replaces the hosts array. Both implementations must match an
explicit expected object; matching each other alone does not pass the check.
Run `node examples/config-check.ts` again after changing either implementation.

**FAIL for arbitrary JSON keys.** With an own `__proto__` key from `JSON.parse`,
the mutation drops that key and changes the returned object's prototype.
The checker still calls that function clean. The reproduction is in
`BUGS.md` TC-137. The success above covers only the inputs in `config-check.ts`;
it does not establish that the rewrite preserves radash's full contract.

**Public installation failed.** The README's `bunx github:kronael/jitmax`
command exited 1 with a GitHub archive 404. The checkout command above works;
the public route remains blocked by TC-133. The trial ran on Node v22.23.2.

My user assessment: the file, line and explanation of repeated copying helped
me locate the work. The fix text then asked me to choose between faster merging
and faster reads without measuring my caller. Its note printed benchmark
ratios, followed by a footer saying no cost is printed beside a finding. I
found that confusing. `--help` also exited 2 with only a usage line, so I needed
the README to learn how to mark a function. These are my observations and
opinions from using the public commands, not a review of the checker internals.

## Measured library examples

**Three of the eight rules have measured end-to-end rewrites**:
`accumulating-spread` (radash `assign`, remeda
`mergeAll`), `delete-property` (es-toolkit `omit`) and `chained-allocation`
(zod `cleanEnum`). `megamorphic-elements`, `megamorphic-dispatch`,
`allocating-select`, `closed-world` and `interface-dispatch` do not, and the
last section of this file distinguishes those gaps from detection successes.

Every rule's cost in `docs/rules.md` is a microbenchmark, and a microbenchmark
cannot say what a program gets. So: take a function a library ships, apply the
fix jitmax printed on it and nothing else, and time the whole call the way a
caller makes it. `make example` prints the findings, then runs the sweep.

The measured functions come from the survey. Eleven libraries were cloned shallow and
annotated by `examples/annotate.js` — every function not nested inside another
whose body loops — and these are the findings that came back. radash is the
twelfth, marked by hand a round earlier, and it took fixing three classes of
false positive to get that run from eight findings to one. The
ratio is before/after, so above 1.0 the shipped code costs that much more and
**below 1.0 the fix made it slower**. Three whole sweeps per cell, per the
measurement protocol's rule 13 in `CLAUDE.md`, all three printed.

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
  cannot see the width — so the `fix:` line says it, in the sizes the cells were
  swept at: *"the rebuild helps at the smaller of n=12 and n=48 and not at the
  larger, where filling it key by key normalizes it too"*.
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
Twelve libraries, 850 annotated functions, 1546 findings — **53 of them errors,
at 53 distinct source lines.** No library produced nothing.

Re-measured 2026-08-30, and the counting changed with it. A finding is one per
SITE: a line reached from 28 annotated functions used to be 28 findings, so
every count in this section used to be the call-graph fan-in rather than the
work (`BUGS.md` TC-62). Calls into the platform — Node's own API, V8's builtins
and anything reached off `globalThis` — are counted for the run and never
listed (TC-55, TC-110), and every call the walk cannot follow is reported rather
than falling through both branches and vanishing (TC-45).

| Library | annotated | findings | what fired |
|---|---|---|---|
| es-toolkit 1.50.0 | 286 | 202 | 189 `closed-world`, 7 `delete-property`, 3 `chained-allocation`, 2 `accumulating-spread`, 1 `interface-dispatch` |
| ramda 0.32.0 | 100 | 176 | 175 `closed-world`, 1 `delete-property` (`_dissoc`) |
| immutable 5.1.9 | 89 | 268 | 264 `closed-world`, 2 `megamorphic-dispatch`, 1 each `chained-allocation` and `delete-property` |
| remeda 2.0.0 | 79 | 81 | 78 `closed-world`, 2 `delete-property`, 1 `accumulating-spread` |
| zod 4.4.3 (`v4/core`) | 78 | 134 | 59 `interface-dispatch`, 54 `closed-world`, 15 `delete-property`, 5 `chained-allocation`, 1 `megamorphic-elements` |
| just 1.22.4 | 61 | 72 | 70 `closed-world`, 1 each `chained-allocation` and `delete-property` |
| luxon 3.7.2 | 52 | 112 | 106 `closed-world`, 3 each `chained-allocation` and `delete-property` |
| decimal.js 10.6.0 | 36 | 260 | 260 `closed-world` |
| date-fns 4.4.0 (`core`) | 28 | 24 | 17 `closed-world`, 3 `interface-dispatch`, 1 each `megamorphic-dispatch`, `chained-allocation`, `delete-property` and `accumulating-spread` |
| dinero.js 2.0.2 | 20 | 143 | 141 `closed-world`, 1 `chained-allocation`, 1 `accumulating-spread` |
| big.js 7.0.1 | 13 | 64 | 64 `closed-world` |
| radash 12.1.1 | 8 | 10 | 9 `closed-world`, 1 `accumulating-spread` |

Three things in that table are about the tool rather than the libraries.

**The two escape rules are 1490 of the 1546 findings** — 96%. Both warned
rather than erring until 2026-08-31, so none of it failed a run; all of it does
now, and `[rules]` is where a reader who disagrees says so. They were one rule
until 2026-08-29
and the split is what the ratio between them is for: 1427 `closed-world`, a
callee whose body is nowhere in the checkout, against 63 `interface-dispatch`,
a body that IS here at a site the walk cannot bind to one implementation. The
platform is in neither — Node's own API, V8's builtins and anything reached off
`globalThis` are counted for the run and never listed, because "inline what you
need from `path.join`" is advice nobody can take (`BUGS.md` TC-55, TC-69,
TC-51, TC-110). The 53 findings from the other six rules are the ones no rule
carries TC-33 for.

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

## Two applications, and the rules twelve libraries could not reach

A utility library is a pipeline. Two programs that are neither small nor fast
were run exactly the same way — cloned shallow, annotated by
`examples/annotate.js`, nothing picked by hand:

| Program | annotated | findings | what fired |
|---|---|---|---|
| TypeScript 5.9.3 (`src/compiler`) | 465 | 5879 | 4831 `interface-dispatch`, 1010 `closed-world`, 20 `megamorphic-elements`, 12 `allocating-select`, 4 `chained-allocation`, 1 each `delete-property` and `accumulating-spread` |
| typescript-eslint 8.67.0 | 311 | 2882 | 2863 `closed-world`, 9 `interface-dispatch`, 7 `chained-allocation`, 2 `delete-property`, 1 `megamorphic-dispatch` |

Read those `closed-world` totals as a defect in this tool before reading them
as anything about either codebase. Neither checkout had `node_modules` installed, so every call into a
missing package is an unresolvable callee, reported once per annotated caller
that reaches it. `BUGS.md` TC-51. The two rows are kept out
of the table above for the same reason: mixed in they would move
the two escape rules' share from 96% to 99% and teach a reader nothing. The
compiler is also the one codebase where `interface-dispatch` is the larger
half: TypeScript dispatches almost everything through `Node`, `Symbol` and
`Type` interfaces whose implementations are all in the checkout.

Under the flood are the two rules twelve libraries never exercised.

**`megamorphic-dispatch` fired, for the first time on code this project did not
write.** `packages/eslint-plugin/src/rules/no-misused-promises.ts:543` calls
`tsNode.name.getText()`, and `name` reaches that call as six distinct property
sets — a TypeScript declaration name is not one node type. Six is past the four
maps V8 caches for the site.

**`megamorphic-elements` fires at 20 sites in the compiler**, against one in
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
| svelte (`packages/svelte/src`) | 504 | 2760 | 16 `allocating-select`, 13 `delete-property`, 12 `chained-allocation`, 9 `interface-dispatch`, 2 `accumulating-spread` |
| vue (`packages/*/src`) | 409 | 2237 | 277 `interface-dispatch`, 13 `delete-property`, 10 `megamorphic-dispatch`, 8 `megamorphic-elements`, 5 `chained-allocation`, 4 `accumulating-spread`, 1 `allocating-select` |
| typebox | 199 | 57 | **30 `accumulating-spread`**, 7 `interface-dispatch`, 3 `delete-property` |
| mobx | 49 | 83 | 28 `interface-dispatch`, 2 `delete-property` |
| valibot | 87 | 133 | 9 `chained-allocation`, 1 each `interface-dispatch`, `megamorphic-dispatch` and `delete-property` |
| rxjs | 60 | 248 | 25 `interface-dispatch` |
| immer | 10 | 60 | 12 `interface-dispatch`, 2 `delete-property` |
| ts-pattern | 9 | 26 | nothing |

**Vue is the only codebase that fires all eight rules.** A framework is not a
pipeline, and both megamorphic rules find shapes in it that no utility library
has. Eight of its ten `megamorphic-dispatch` sites are the rule counting
declared property sets — `vnode.type` is nine of them, at `.hydrate()`,
`.process()`, `.remove()` and `.toLowerCase()`. The other two are the escape
route added in TC-110: `watch.ts:161` calls `.some()` and `.map()` on a `source`
that seven allocation sites reach.

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

**What the rule is worth, counted per site: 29 lines in 2953 annotated
functions** — 20 in the TypeScript compiler, 8 in vue, one in zod. It was eight
until the rule was taught to count an intersection as an object type, which is
what a branded type is, and five branded types behind one receiver had counted
as zero shapes (`BUGS.md` TC-95). That is
the flagship rule's whole footprint on 22 real codebases. `BUGS.md` TC-64
reaches the same place from 30 other corpora and a different annotation rule.

**TypeBox has 30 distinct accumulating-spread sites, more than every other
codebase here put together** — 13 across the other twenty-one. It used to print as 119, which was those sites
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

## Which rules have measured end-to-end rewrites

The measured pairs in `examples/` apply the printed fix to a vendored library
function. A detection trial also exercises a caller, but it does not establish
that a rewrite preserves behavior or improves performance.

| Rule | End to end |
|---|---|
| `accumulating-spread` | radash `assign`, remeda `mergeAll` — **3.22-4.65x**, and a read cost the fix line now carries |
| `delete-property` | es-toolkit `omit` — **1.62-3.32x**, and a width past which it stops |
| `chained-allocation` | zod `cleanEnum` — **1.10-1.12x** at 16 members clears the broad-warning bar; **rejected under rule 6 at 256** (1.03-1.10x — lower bound under 1.05x, point estimate under 1.10x), published above |
| `allocating-select` | **no instance of the measured shape in 2953 functions.** Its six findings are all `x = advance(x, step)` — `date = addMinutes(date, step)` in four date-fns functions, `sink = lazy(sink)` in es-toolkit's `pipe`. The benchmark measured a *choice* between two values where the incumbent almost always wins, and the fix, "compare first and assign only when x really changes", saves an allocation exactly on the passes that change nothing. A cursor changes on every pass. `BUGS.md` TC-18 |
| `megamorphic-elements` | **Detection success on Zod validation; no measured rewrite.** The reported function receives issues built elsewhere, and the advice does not identify their creators. `BUGS.md` TC-19 |
| `megamorphic-dispatch` | **Detection success on date-fns timestamp parsing; no measured rewrite.** The report locates the parser dispatch, but gives the caller no direct replacement. `BUGS.md` TC-33 |
| `closed-world`, `interface-dispatch` | make no speed claim; they report what was not checked |
