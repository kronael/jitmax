# jitmax

jitmax is a static checker for speed-sensitive TypeScript on V8 — numba's
`@njit`, for V8. Mark a hot function `/** @jitmax */`; jitmax reads it and
every function it calls whose source it can see, and reports the patterns that
measurably push V8 off its fast path, plus the calls it could not check. You
get one error per finding, with its file and line, the next step and the
benchmark behind the rule, and an exit code a CI gate can read. It never runs,
compiles or rewrites your code:

```sh
bunx github:kronael/jitmax src
```

![jitmax reporting one line in a function radash ships](demo/demo.gif)

A real run against radash's `assign`, vendored unchanged into `examples/`.

## Aim

V8 is the JavaScript engine in Node, Chrome and Deno. It makes a hot function
fast by compiling each property read for the object shapes it has seen there.
Each read keeps up to four shapes; send a fifth through it and V8 falls back
to a slow generic lookup. Deleting a property an object has moves it to
slower storage. The code still returns the same values, only slower, and
nothing warns you.

- **For:** anyone with a TypeScript function on V8 whose speed matters.
- **Promise:** every rule that claims a slowdown carries a benchmark run in
  this repository, with its raw timings in `bench/`, and cites the V8 source
  line where one shows the mechanism. A rule stays silent on the specific
  cases its own benchmark refuted that it can recognise in source, and a test
  fails if it fires there. It cannot see input sizes, so it can still fire
  where a rewrite would not pay off for your data. Code the walk could not
  check is reported, never passed as clean.
- **Not a profiler, not a cost estimate:** jitmax reads source and never runs
  your program. A finding is a measured candidate, not a cost in your
  workload, and a printed fix can be slower: es-toolkit's `omit` rewrite
  improves reads at n=12 and n=48, but makes the whole call slower. Profile
  and benchmark your caller before you keep a change. Bun runs the checker,
  but every rule is about V8, not Bun's JavaScriptCore.

## Quick start

You need [Bun](https://bun.sh/docs/installation) and TypeScript 5.x in the
project you check. jitmax parses with your project's own compiler, and
`bun add typescript` installs 7.x, which lacks the 5.x compiler API:

```sh
bun add --dev typescript@^5.9    # or: npm install --save-dev typescript@^5.9
```

A compiler without that API stops the run at exit `2`, naming the version
found. Install the project's other dependencies too: an import that does not
resolve reads as `any`, and the run reports it as a coverage gap.

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
not what imports it, so its callers read as `no visible caller`.

## Read a finding

Give the elements five shapes and the first rule fires. Save this as
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
      rows has 5 distinct property sets in its element type; this is a
      candidate for megamorphic load feedback, not an observed runtime map
      count
      related: shapes.ts:11:34 read: row.x
      sources: No builder located for this value. Source tracing is partial:
               no visible caller of total — its arguments come from outside
               this program.
      next: inspect where these elements are built, not just this parameter.
            If semantics allow, use consistent own properties and insertion
            order; benchmark the full caller including construction
      note: type assertions do not change runtime shapes. Adding a missing
            property can change key enumeration and presence checks. Library
            callers may need an upstream change; no automatic rewrite is
            established here
      measured in bench/shape-sets.jl and bench/shapes-calibrated.jl
      known defects: TC-2, TC-9
```

A legend of the defect codes and a footer follow. `shapes.ts:9  total()` is
the annotated function the walk started from; the finding can sit in any
function it calls. `next:` is what to look at or try, and `note:` is what that
change can break besides speed.
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
| What does a printed fix gain on real library code? | [examples/README.md](examples/README.md) |
| How was each number measured, and how do I re-run it? | [bench/README.md](bench/README.md) |
| How is jitmax built? | [ARCHITECTURE.md](ARCHITECTURE.md) |

The project page is [krons.fiu.wtf/pub/jitmax](https://krons.fiu.wtf/pub/jitmax/).

## Development and licence

Development needs a full Git clone, Node `>=22.18`, npm and Make:

```sh
npm ci --ignore-scripts
make          # lint, test, demo checks
make verify   # also the pinned V8 citations and the radash reality run
```

To run a clone instead of the GitHub install, use
`bun /path/to/jitmax/bin/cli.js` in place of `bunx github:kronael/jitmax`; it
needs the clone's dependencies and no build.
[Development](ARCHITECTURE.md#development) lists every target.

GPL-2.0-only; see [LICENSE](LICENSE). The radash, remeda, es-toolkit and zod
functions in `examples/` keep their MIT licences, copyright lines, versions and
commits; [examples/LICENSE-MIT](examples/LICENSE-MIT) carries the permission
notices. V8 is a trademark of Google LLC; this project is not affiliated with,
endorsed by, or sponsored by Google.

Status: v0.16.0, single machine, eight rules.
`bunx github:kronael/jitmax` runs the `main` branch, which can be ahead of the
newest tag.
