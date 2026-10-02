# Limits

Where jitmax is blind or wrong, and what its measurements cannot support. Each
rule's own misses are in [the rule reference](rules.md); this file covers the
tool as a whole.

## What the walk sees

- **The walk stops at 200 function bodies per annotation.** A visited set stops
  cycles; the cap stops everything else. A walk that hits it prints
  `WALK TRUNCATED` and exits `1`, and is never reported as clean.
- **Compiler options come from the working directory, never from the path
  argument.** `jitmax ../other/src` compiles `../other` under this directory's
  `tsconfig.json`, so that project's path aliases do not resolve, and the
  report names the config that sits over those files. jitmax reads only a file
  named `tsconfig.json`, follows its `extends`, and does not build project
  `references`. Run it where a `tsconfig.json` holds or extends the options
  your code compiles with.
- **Exit `1` means a finding or incomplete coverage.** An import that does not
  resolve reads as `any` and is a coverage gap, so a project with unresolved
  imports exits `1` whatever its code looks like. Install its dependencies
  first; the report says which of the two it found.
- **A pattern split across functions goes unreported.** The walk reads every
  callee with source, but `accumulating-spread` needs the loop and the copy in
  one body: `acc = append(acc, x)` in a loop, with
  `append = (a, x) => [...a, x]` beside it, is not reported.
  `chained-allocation` misses stages split across local bindings, such as
  `const doubled = xs.map(f); const kept = doubled.filter(g)`. The other rules
  follow values across calls: the megamorphic rules trace what reaches a
  receiver, `allocating-select` reads the callee's returned allocation, and
  `delete-property` follows the deleted object through arguments and returns.
- **A call the walk cannot bind is reported, not checked.** `closed-world` and
  `interface-dispatch` mark code nobody checked; read them as unchecked, not as
  slow. Without `node_modules`, each missing package is an unresolved module,
  a coverage gap. A call to a function imported from it is a `closed-world`
  finding; a method called on a value from it is a call through an `any`
  receiver, another gap. Switching a rule off clears neither gap.
- **Related locations are representative, not complete.** Source tracing shares
  the bounded receiver-flow analysis: it merges literals with the same keys,
  can stop on unknown inputs, cycles or its budget, and says when it does. A
  location does not prove that its value reaches the site at run time. `-v`
  shows every location the query kept, not allocations it never found.

## What a finding cannot know

- **The shape, never the n.** A rule sees a pattern, not how much data passes
  through it, and the annotation cannot say. A helper that only ever sees eight
  items fires like one that sees a million (`TC-9`).
- **Called often is not CPU-bound.** A finding in a function that mostly waits
  on I/O may matter little, and a call count alone does not show what a call
  costs. A CPU profile selects functions by sampled self time instead; profile
  representative inputs before you change code.
- **A TypeScript type is not a V8 map** (`TC-2`). `megamorphic-elements` counts
  the property-name sets it can see: union members, the classes and literals
  the walk traces, and, where tracing is incomplete, the classes a type admits
  through `extends`. `megamorphic-dispatch` also counts traced class
  implementations, which separates classes with identical fields. Five aliases of one type are one set. The same keys added
  in another order make another map, and no rule can see that. To check a
  megamorphic finding against real maps, compare objects with
  `%HaveSameMap(a, b)` under `node --allow-natives-syntax`.
- **A rewrite can be slower.** Rebuilding without a key, merging into an owned
  object and giving objects one shape all change construction cost. Two of the
  four measured library rewrites made the whole call slower at some size
  ([examples](../examples/README.md)). Changing the shape of objects a library
  returns also changes what its users see through `Object.keys`, `in` and
  equality checks.
- **"Assign undefined" is not always safe.** A `delete-property` finding drops
  that advice where the walk sees the object reach an observer of key
  presence. An observer the walk does not reach, such as a dependency without
  source or a database `SET` clause built from the object's keys, is
  invisible to it.
- **Optimization state is not a speed signal.** V8 can report a function as
  optimized while a megamorphic site inside it runs slowly. Only timed
  workloads measure speed. No check or evidence run reads optimization status;
  only the diagnostic `bench/optsize.ts` does, to ask which tier a function
  reached.

## What the measurements cannot support

Every ratio comes from a microbenchmark on one machine, Node v22.23.2 with V8
12.4. It shows that a pattern can cost that much, not that it does in your
workload. [How a cell is measured](../bench/README.md#how-a-cell-is-measured)
defines cells, sweeps and the tests below.

- **No cell that failed replication is inside a published range.** Every cell
  runs three times, and one whose three intervals share no value is withdrawn
  where the number is made; the generated table names it beside the number it
  left, in [the numbers table](../bench/README.md#derived-numbers-and-the-rows-they-are).
  A withdrawn triple is still printed, as a refutation, so no range reads
  tighter than its measurement was.
- **605 published rows were measured under a load gate they exceeded.** The
  load gate is the runner's refusal to measure while other threads compete for
  the CPU. Those rows stay in the raw files and are not withdrawn, so a
  published range can include them; the end-to-end object examples use only
  rows within the gate. `test/check.test.ts` registers the count per file, and
  a new row over the gate fails `make test`.
- **One of V8's two optimizing compilers was off.** V8 runs a function up four
  tiers: Ignition interprets it, Sparkplug compiles it quickly without
  optimizing, Maglev optimizes moderately, and TurboFan optimizes hard. This
  Node reports `--maglev` as `default: --no-maglev`, so no number here was
  measured with Maglev. A tier that compiles faster and optimizes less could
  move a ratio.
