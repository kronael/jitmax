# Honest limits

For installation and commands, use the [README quick start](../README.md#quick-start).
Public GitHub downloads currently return 404; TC-133 tracks that blocker.
The README gives an existing-checkout route. Bun runs the checker, but the
findings and measurements below concern V8, not JavaScriptCore.

Where jitmax does not work, where its numbers do not apply, and what its own
measurements could not answer. Nothing here is a roadmap item. Every entry is a
statement about the tool as it ships today.

- **Builder locations are representative, not complete.** The source query
  shares the bounded receiver-flow analysis. It coalesces same-key literals
  and array origins, and can stop on unknown inputs, cycles or its budget.
  A source location does not prove that its value reaches a site at runtime.
  `--verbose` reveals all locations the query retained, not hidden allocations
  or paths the query could not follow. Zod's `prefixIssues` trial locates the
  read but no builder through its cyclic issue flow.

- These ratios come from a microbenchmark, a small speed test, on one machine
  (Node v22.23.2, V8 12.4). They show that a pattern *can* cost that much. They
  do not say it costs that much in your workload.
- **Two cells failed replication, and neither is inside a range this project
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
- **601 published rows were measured under a load gate that could not see a
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
- The `tsconfig.json` is found from the WORKING DIRECTORY and never from the
  path argument. A path chooses the file list and nothing else, so
  `jitmax ../other/src` compiles `../other` under this directory's options and
  every path alias in it goes unresolved. The unresolved block says so and
  names the config that sits over the files instead (`BUGS.md` TC-76).
- A call through a parameter or an interface method is NOT listed in the
  coverage line: it resolves to a declaration that is neither followable nor a
  declaration file, and falls through both branches (`BUGS.md` TC-31). Read the
  coverage line as "the calls it could name", not "everything it could not see".
- Rules fire outside the conditions their own evidence establishes. That is
  `BUGS.md` TC-9, it is printed under every finding of the rules that carry it,
  and `docs/rules.md` says which clause each rule's silence rests on.
