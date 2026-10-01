# Honest limits

For installation and commands, use the [README quick start](../README.md#quick-start).
Bun runs the checker, but the findings and measurements below concern V8, not
Bun's JavaScriptCore engine.

Where jitmax does not work, where its numbers do not apply, and what its own
measurements could not answer. Nothing here is a roadmap item. Every entry is a
statement about the tool as it ships today.

References to `BUGS.md` name the internal issue history in a full Git clone.
That queue is not installed. The limits here and the report's defect legend
explain the caveats without it.

## The three that bite first

- **Every rule matches inside one body.** The walk widens *where* the rules are
  applied — it visits every callee whose source the program has — and it does
  not widen what any single rule can see. So `acc = append(acc, x)` in a loop,
  with `append = (a, x) => [...a, x]` next to it, is a loop in one body and a
  copy in another, and no rule here joins them, even though the walk reads both
  files. Hoisting the measured pattern into a helper silences the tool.
  `chained-allocation` also misses stages split across local bindings, such as
  `const doubled = xs.map(f); const kept = doubled.filter(g)`. Both gaps are
  `BUGS.md` TC-43.

- **The `tsconfig.json` is found from the WORKING DIRECTORY and never from the
  path argument.** A path chooses the file list and nothing else, so
  `jitmax ../other/src` compiles `../other` under this directory's options and
  every path alias in it goes unresolved. The unresolved block says so and names
  the config that sits over the files instead (`BUGS.md` TC-76).

- **The walk stops at 200 function bodies per annotation.** A visited set stops
  cycles; the cap stops everything else. When the walk hits it, the run prints
  `WALK TRUNCATED` and exits `1`, and is not reported as clean in the text or in
  the exit code.

## What three engineers found cold

Three engineers were handed a codebase, the tool and its README, and nothing
else — no issue queue, no notes. They were told to make the code faster and to
report what happened. The corpora were `date-fns` core, `dinero.js`, and one
application backend, Immich. **All three finished, and none of them would put
jitmax in CI as a gate.** Their verdict was to keep it as a manual check per
release. One wrote that it is "honest about its own limits more than any perf
tool I've read docs for". The sharpest reason for refusing the gate came from
the `date-fns` user: two of their three findings needed a human to know the
input size before deciding they mattered, and both ended as permanent
suppression comments rather than code changes, so a gate forcing that trade on
every bounded helper "will get spammed with permanent suppressions or silenced
entirely inside a month".

`date-fns` found a real defect and shipped a real fix:
`setDefaultOptions/index.ts:68` deletes a property from the process-wide default
options object that roughly fifteen hot functions read on every call, which is
exactly the shape `delete-property` is for. The same user's summary of the two
findings they dismissed is the limit, in one line: **"the tool gives you the
shape, never the n."** A rule knows the pattern. It does not know how many
elements go through it, and the annotation cannot say.

The Immich trial is a safety limit, not a coverage one. Immich's
`removeUndefinedKeys` in `utils/database.ts:127` exists to OMIT keys from a
Kysely `SET` clause, and `delete-property`'s printed fix is to assign
`undefined` instead. The user's judgement: applying the generic fix here "risks
writing NULL to columns that should be left untouched." A second site in the
same trial deletes `mediaTags` entries deliberately so later lookups do not find
a stale value. An absent key and a key holding `undefined` are different to a
great deal of ordinary JavaScript: `JSON.stringify` omits `undefined`, spread
copies the key, and `'k' in obj` and `Object.keys` both see it. The rule is
about V8. It is not always correct about the program.

That trial also never obtained a gate-able run at all. Immich's `tsconfig.json`
maps `"src/*": ["./src/*"]` and 487 of its 554 files import that way, so the
walk stopped at the first hop across almost the whole codebase (`BUGS.md`
TC-32). Its four findings were correct pattern matches on code that is not
CPU-bound — an object built once and sent to Postgres, `mediaTags` from an
`exiftool` subprocess, a `.filter().map()` over a handful of faces per photo.
The user annotated honestly, and the annotated function really is the per-photo
job; it is still dominated by I/O. Hotness in calls per second does not imply
the CPU is where the time goes, and an annotation cannot express the difference.

Two more problems from those first thirty minutes stand. The vendored corpora in
`tmp/` ship pre-annotated from this project's own survey, so a user who copies
one and marks the function they care about gets a report about twenty functions
they did not choose. And exit `1` conflates "found something" with "could not
check everything", so a repository with unresolved imports can never pass a
naive gate whatever its code looks like.

## What the rules miss

- **Builder locations are representative, not complete.** The source query
  shares the bounded receiver-flow analysis. It coalesces same-key literals and
  array origins, and can stop on unknown inputs, cycles or its budget. A source
  location does not prove that its value reaches a site at runtime. `--verbose`
  reveals all locations the query retained, not hidden allocations or paths the
  query could not follow. Zod's `prefixIssues` trial locates the read but no
  builder through its cyclic issue flow.

- **A TypeScript union member is not a V8 map**, the engine's internal record of
  an object's property names and the order they were added.
  `megamorphic-elements` estimates the map count from the declared type, so it
  can report a problem even if no load site ever sees five maps. What it does not
  do is count NAMES: five aliases of one type, and five discriminated-union
  variants over one key set, are one map each — V8's own `%HaveSameMap` says so
  — so the rule counts distinct property-name sets, which no rename can change.
  `BUGS.md` TC-2 and TC-42.

- `megamorphic-elements` requires a READ off an element, and is narrowed to a
  read on purpose: V8 charges the same four-map budget at a store and at `in`,
  but the sweep behind the rule measures `s += r.x + r.y`, so firing on
  `r.x = v` would quote a read's number for a write. `in` is the remaining gap.
  `BUGS.md` TC-8.

- `megamorphic-dispatch` fires on the fifth object type. That is right for a
  method on a class: four types cost 1.41-1.65x and the fifth costs 12.9-22.7x,
  the sharpest step measured here. It is late for an object that carries its own
  function in a field. There the cost starts at the *second* one — 3.5-15.8x,
  flat from two targets to six, no threshold at all — and no declared type tells
  the two apart. The rule misses that case rather than guessing at it, which is
  a miss and not a refutation: it is in the rule's `unreported` clause, never in
  its `silent` one.

- **The same rule's benchmark measures a program the rule is silent on.**
  `bench/shapes.ts` varies key ORDER — five builders, one key set, five V8 maps,
  and exactly one TypeScript type. `bench/shape-sets.ts` varies the key SET, at
  the same three sizes and in both modes, and that is where 3.4-11.3x comes
  from. The key-order sweep is still on disk and still quoted, in the rule's
  `unreported` clause: it costs 4.4-11.5x and nothing static can find it.

- **One measured effect ships no rule, because nothing static can find it.** A
  boxed array costs 1.39-1.66x to read, and 1.58-1.69x to build at RAM size, and
  whether an array is boxed depends on what was stored in it, which a type
  annotation does not decide. `make bench-arrays`, `BUGS.md` TC-14. The same
  shape as the 6.17-6.34x dictionary effect in TC-12.

- **A call through a parameter or an interface method is NOT listed in the
  coverage line.** It resolves to a declaration that is neither followable nor a
  declaration file, and falls through both branches (`BUGS.md` TC-31). Read the
  coverage line as "the calls it could name", not "everything it could not see".

- **Rules fire outside the conditions their own evidence establishes.** That is
  `BUGS.md` TC-9, it is printed under every finding of the rules that carry it,
  and `docs/rules.md` says which clause each rule's silence rests on.

- **Never trust V8 optimization state as a speed signal.**
  `%GetOptimizationStatus` reported `optimized=true` throughout a 5x megamorphic
  slowdown. That signal once gated an automated check here, which was wrong, so
  the gate was deleted. Nothing in this project reads it now.

## What the measurements cannot support

Every ratio here comes from a microbenchmark — a small speed test, run on one
machine, Node v22.23.2 with V8 12.4. They show that a pattern *can* cost that
much. They do not say it costs that much in your workload. A **cell** below is
one configuration of one benchmark: one pattern, at one input size, in one mode.
A **sweep** is one whole run of a cell, and reports a range of times rather than
a single number.

- **Two cells failed replication, and neither is inside a range this project
  quotes.** The measurement protocol runs every published cell three separate
  times and only calls the three in agreement when one value sits inside all
  three of their ranges. `closed-world`'s n=100000 cell read 3.21x and 4.68x and
  4.73x with no such value, and `delete-property`'s n=262144 read cell
  disagreed the same way. Both are withdrawn inside `lib/derive.ts`, where the
  number is made, so 4.64-4.95x and 12.3-13.6x rest on the cells that replicate
  and on nothing else. The withdrawn triples are still printed, because a range
  that quietly excluded its worst-behaved cell would read tighter than the
  measurement was — but they are printed as refutations, not folded into a
  range. `BUGS.md` TC-21, TC-37.

- **605 published rows were measured under a load gate they exceeded.** The load
  gate is the runner's refusal to measure while too many other threads are
  competing for the CPU; it now counts runnable threads outside the harness and
  refuses above `nproc - 1`. Most of those rows belong to an older gate that
  read a one-minute load average, which could not tell the harness apart from
  another tenant on the machine. The raw files retain the rows; the per-file
  register is in `test/check.test.ts`. The object examples use only
  `own-properties` rows whose own readings are within the current limit. Four
  rejected rows have replacement sweeps and remain raw records, not evidence for
  those examples. Other legacy measurements retain the limits recorded in
  `BUGS.md` TC-46. A new row measured over the gate fails `make test` until its
  disposition is recorded.

- **One of V8's two optimizing compilers was switched off the whole time.** V8
  runs a function up a ladder of four: Ignition interprets it, Sparkplug
  compiles it quickly without optimizing much, Maglev optimizes it moderately,
  and TurboFan optimizes it hard. This Node reports `--maglev` as
  `default: --no-maglev`, so Maglev is missing from the ladder under every
  number here. A tier that compiles faster and optimizes less is exactly the one
  that could move a ratio, and nothing in this repository has ever run on it.
  `BUGS.md` TC-21.
