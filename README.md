# jitmax

jitmax is a static checker for speed-sensitive TypeScript on V8 — numba's
`@njit`, for V8. Mark a hot function `/** @jitmax */`; jitmax reads it and
every function it calls whose source it can see, and reports the patterns that
measurably push V8 off its fast path, plus the calls it could not check. You
get findings with file and line, the next step, and an exit code a CI gate
can read. Slowdown rules cite their benchmark; coverage rules report unchecked
calls without claiming they are slow. It never runs,
compiles or rewrites your code:

```sh
bunx github:kronael/jitmax src
```

![jitmax reporting one line in a function radash ships](demo/demo.gif)

A real run against radash's `assign`, vendored unchanged into `examples/`.

## Quick start

You need [Bun](https://bun.sh/docs/installation) and TypeScript 5.x or 6.x in
the project you check. jitmax parses with your project's own compiler, so a
project on either keeps it. `bun add typescript` installs 7.x, which lacks the
compiler API jitmax reads; a project without TypeScript, or on 7.x, adds 6.x:

```sh
bun add --dev typescript@^6    # or: npm install --save-dev typescript@^6
```

A compiler without that API stops the run at exit `2`, naming the version
found. Install the project's other dependencies too: an unresolved import in a file
the walk checks reads as `any`, and the run reports it as a coverage gap.

Save this as `hot.ts` in the project root, and run from there:

```ts
/** @jitmax */
export function total(rows: { value: number }[]): number {
  return rows.reduce((sum, row) => sum + row.value, 0);
}
```

```sh
bunx github:kronael/jitmax hot.ts
```

It reports `every annotated function is clean.` and exits `0`. Now mark your
own hot function and pass its source directory, such as `src`. `--help` lists
every argument.

Paths choose files and nothing else: compiler options come from the
`tsconfig.json` found from the working directory upward. With no path, jitmax
checks that config's file list. A single file brings in what it imports but
not the files that import it, so callers in those files are invisible; pass the
source directory when you need them.

## Aim

- **For:** anyone whose speed-sensitive TypeScript runs on V8, the engine in
  Node, Chrome and Deno. Bun runs the checker, but every rule is about V8, not
  Bun's JavaScriptCore. [The rule terms](docs/rules.md#terms) explain, in
  plain words, how V8 makes code fast and what slows it down.
- **Promise:** every rule that claims a slowdown carries a benchmark run in
  this repository, with its raw timings in `bench/`. Rules about a V8
  mechanism also cite V8's source; `accumulating-spread` measures copying cost
  that applies on any engine. A rule stays silent on the specific
  cases its own benchmark refuted that it can recognise in source, and a test
  fails if it fires there. A call into your own or a dependency's code that
  the walk cannot follow is reported and fails the run. Calls into Node and V8
  builtins are counted, not checked; "clean" means no enabled rule fired and
  no tracked gap remains.
- **Not a profiler, not a cost estimate:** a finding is a measured candidate,
  not a cost in your workload. Most input sizes are only known at runtime,
  so a rule can fire where a rewrite does not pay off for your data. A printed fix can make the
  call slower: es-toolkit's `omit` fix improves reads at n=12 and n=48, but
  slows the call, and [the examples](examples/README.md#what-each-fix-is-worth)
  measure four fixes. Profile and benchmark your caller before you keep a
  change.

## Read a finding

This example triggers `megamorphic-elements`. Save this as
`shapes.ts`:

```ts
type Row =
  | { kind: 'a'; x: number }
  | { kind: 'b'; x: number; y: number }
  | { kind: 'c'; x: number; z: number }
  | { kind: 'd'; x: number; w: number }
  | { kind: 'e'; x: number; v: number };

/** @jitmax */
export function total(rows: Row[]): number {
  let sum = 0;
  for (const row of rows) sum += row.x;
  return sum;
}
```

`bunx github:kronael/jitmax shapes.ts` exits `1` and prints:

```text
jitmax — 1 annotated function, 1 error

  shapes.ts:9  total()
    shapes.ts:9:23  error  megamorphic-elements
      rows has 5 distinct property sets in its element type; candidate for
      megamorphic load feedback, not an observed runtime map count
      next: inspect the element builders. If semantics allow, use consistent
            own properties and insertion order
      note: type assertions do not change runtime shapes. Adding a missing
            property can change key enumeration and presence checks. Library
            callers may need an upstream change; no automatic rewrite is
            established here
      related: shapes.ts:11:34 read: row.x
      sources: No builder located for this value. Source tracing is partial:
               no visible caller of total — its arguments come from outside
               this program.

  Static findings are candidates, not measured costs in this workload.
  Profile and benchmark the caller before keeping a change.
  Related locations are representative; static counts are not runtime counts.
  Evidence, known defects and all related locations: -v.
  Rule limits: docs/rules.md; benchmarks: bench/README.md (jitmax package).
```

`shapes.ts:9  total()` is the annotated function the walk started from; the
finding can sit in any function it calls. `next:` is what to look at or try,
and `note:` is what that change can break besides speed. Run with `-v` for
benchmark paths, known defects and every related source location.
[Reading a finding](docs/rules.md#reading-a-finding) explains every line.

## Choose rules and functions

jitmax reads `jitmax.toml` from the working directory upward, as it does
`tsconfig.json`, and prints `rules from <path>, found from the working
directory` when it uses one. A `.toml` named on the command line wins.

To report only megamorphic reads and calls, copy the
[megamorphic preset](examples/megamorphic/jitmax.toml) to your project root as
`jitmax.toml`, then run as before:

```sh
bunx github:kronael/jitmax src
```

The preset also switches off `closed-world` and `interface-dispatch`, so the
unchecked calls those two rules report do not fail the run.

In its `[rules]` table, `false` switches a rule off. To switch a rule off for
one function and everything it calls, name it on the annotation:
`/** @jitmax -megamorphic-elements */`. The report counts every suppressed
finding. See [turning a rule off](docs/rules.md#turning-a-rule-off).

To select functions by CPU time instead of annotations, record a profile with
Node and pass it:

```sh
node --cpu-prof --cpu-prof-name=run.cpuprofile your-workload.js
bunx github:kronael/jitmax run.cpuprofile src
```

Every function with at least 1% of your project's sampled self time is
checked. If a build step compiles your TypeScript, it must emit source maps
(`sourceMap: true` for `tsc`). [Profile mode](ARCHITECTURE.md#profile-mode)
explains the matching and the threshold.

## Rules and exit codes

Eight rules ship. The first six report a pattern a benchmark here measured as
slower. The last two report calls the walk could not check, and make no speed
claim.

| Rule | Reports |
|---|---|
| `megamorphic-elements` | a property read off array elements that five or more property sets reach |
| `megamorphic-dispatch` | a method call that five or more property sets or implementations reach |
| `delete-property` | `delete` on an object, which can move it to slower dictionary storage |
| `allocating-select` | a loop that replaces a stored object through a call that allocates a new one |
| `chained-allocation` | two chained array stages, such as `.map().filter()` or `Object.entries(o).map()`, which build an array per stage |
| `accumulating-spread` | `[...acc, v]` and its object and `concat` forms in a loop: a full copy per pass, quadratic when the accumulator grows |
| `closed-world` | a call into code with no readable body, such as a `.d.ts` or a callback parameter |
| `interface-dispatch` | a call the walk cannot bind to one implementation |

[The rule reference](docs/rules.md) gives each rule's trigger, cost, silent case
and fix. The exit code says how the run went:

- `0`: at least one function was checked, with no errors and no coverage
  gaps. A `warn` can still print: a finding reached only through a static
  field initializer, which runs once, when its class is defined. Switching
  off `closed-world` or `interface-dispatch` leaves the calls they report
  unchecked, and the run can still exit `0`.
- `1`: an error, a coverage gap, or no function selected. The gaps are a
  truncated walk, an unresolved module, an unmatched profile frame, an
  annotation on a function with no body, and a call through an `any`
  receiver. Suppressing a rule never clears a gap.
- `2`: the tool failed — invalid arguments, configuration or source syntax, or
  an unsupported TypeScript. `--help` exits `0` without loading the project.

Type errors are your compiler's job; jitmax does not report them.

## Where to read next

| Question | File |
|---|---|
| What does each rule detect and cost, and where is it silent? | [docs/rules.md](docs/rules.md) |
| Where is jitmax blind or wrong? | [docs/limits.md](docs/limits.md) |
| What does each rule find in real library code, and what does a fix gain? | [examples/README.md](examples/README.md) |
| How was each number measured, and how do I re-run it? | [bench/README.md](bench/README.md) |
| How is jitmax built? | [ARCHITECTURE.md](ARCHITECTURE.md) |

The project page is [krons.fiu.wtf/pub/jitmax](https://krons.fiu.wtf/pub/jitmax/).

## Development and licence

Development needs a full Git clone, Node `>=22.18`, npm and Make:

```sh
npm ci --ignore-scripts
make          # lint, test, demo checks
```

`make verify` adds the V8 citation check and the radash reality run, which need
two pinned checkouts:

```sh
git clone --filter=blob:none --sparse https://github.com/v8/v8 v8src
git -C v8src sparse-checkout set src include
git -C v8src checkout c635f0d160b6e988b5ea5a907511a2929beb5d5e
git clone --filter=blob:none https://github.com/rayepps/radash tmp/demo-real
git -C tmp/demo-real checkout 4cab1900d08e0997abc4f17aec3cbfe18958d766
make verify
```

To run a clone instead of the GitHub install, use
`bun /path/to/jitmax/bin/cli.js` in place of `bunx github:kronael/jitmax`; it
needs the clone's dependencies and no build.
[Development](ARCHITECTURE.md#development) lists the main development commands.

GPL-2.0-only; see [LICENSE](LICENSE). The radash, remeda, es-toolkit, zod,
typescript-eslint and Vue functions in `examples/` keep their MIT licences,
copyright lines, versions and commits; [examples/LICENSE-MIT](examples/LICENSE-MIT) carries the permission
notices. V8 is a trademark of Google LLC; this project is not affiliated with,
endorsed by, or sponsored by Google.

Status: v0.17.1, single machine, eight rules.
`bunx github:kronael/jitmax` runs the `main` branch, which can be ahead of the
newest tag.
