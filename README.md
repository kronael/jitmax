# jitmax

jitmax is a command-line checker for TypeScript source. Mark the function you
need fast with `/** @jitmax */`, and jitmax checks it, and every callee whose
source it can read, for patterns that can make V8 run it slower. It reads
source and never times your program, so whether the code is fast enough stays
your call.

A **JIT** is a just-in-time compiler: the part of a JavaScript engine that
compiles your code while the program is already running, from what it has seen
run so far. **V8** is the JavaScript engine in Chrome, Node and Deno, and it
contains several JIT compilers. Every rule and every number here is about V8.
Bun runs the checker, but Bun's own engine is JavaScriptCore, and nothing
measured here says anything about that one.

Six rules report a pattern whose slowdown a benchmark in this repository
measured. Five of them also cite the mechanism in V8's source;
`accumulating-spread` needs no engine to explain it. The other two,
`closed-world` and `interface-dispatch`, report calls the checker could not
follow, and they are most of what a first run prints. They do not claim that
the call is slow. A rule whose benchmark refused it is recorded as refused
rather than quietly dropped.

## The idea

V8 watches your code run. It notices what shape of data goes through each line,
then compiles a version of that line which assumes the shape holds. The
assumption is a bet, and it usually pays: that is most of why JavaScript is fast
at all.

One line can keep four shapes in its head. Send a fifth through and the bet is
off — the line goes **megamorphic**, which is the engine's word for a code
location that has seen more object shapes than it will cache, so V8 stops
specialising it and looks the property up instead. Your code still returns
exactly what it returned before. There is no error, no warning, no log line. The
function simply costs more than it did last week, and the profiler points at a
line that looks completely ordinary.

The shape V8 keeps per object is a **hidden class**; V8's own source calls the
same thing a **map**. Objects built the same way — by the same constructor or
the same literal, with the same property names added in the same order — share
one. These docs use both names, and `docs/rules.md` keeps the longer
definition.

A handful of other patterns do the same kind of damage. Delete a property an
object has — by name, not by array index — and V8 moves that object to a slower
kind of storage and leaves it there. Rebuild an array from a copy of itself
inside a loop and every pass copies everything the last pass built. None of it
looks wrong on screen, which is why it survives review.

jitmax finds the source patterns that can cause that. It cannot tell you whether
they cost anything in your program; only a profile and a benchmark of your own
caller can.

![jitmax reporting one line in a function radash ships](demo/demo.gif)

The recording is a real run of the commands it types, against a function radash
ships, vendored into `examples/` unchanged. `make demo` re-records it. The rule
in that recording is `accumulating-spread`, which is the one rule here that is
not a claim about V8 at all: rebuilding an accumulator from a copy of itself is
more work in any engine, and the finding says so in its own words rather than
borrowing an engine's.

## Quick start

[Install Bun](https://bun.sh/docs/installation), then check `bun --version`.

**jitmax needs TypeScript 5.x.** It parses with the compiler your project
builds with and needs the 5.x compiler API. If your project does not already
depend on TypeScript 5.x, add it; `bun add typescript` installs 7.x today, whose
API has no `sys` host:

```sh
bun add --dev typescript@^5.9    # or: npm install --save-dev typescript@^5.9
```

If the compiler jitmax resolves has no `sys` host, the scan stops at exit `2`
and says what it found and what it needs:

```text
jitmax: jitmax needs TypeScript >=5.0.0 <6, and the "typescript" package
resolved here is 7.0.2, which has no "sys" host. Install a supported version
in this project:
  npm install --save-dev typescript@^5.9
```


Install your project's other dependencies with its usual package manager too: an
unresolved import makes the types it supplies read as `any`, and the report says
so rather than calling the run clean.

Save this as `hot.ts` in your TypeScript project's root:

```ts
/** @jitmax */
export function total(rows: { value: number }[]): number {
  return rows.reduce((sum, row) => sum + row.value, 0);
}
```

Run from that project's root:

```sh
bunx github:kronael/jitmax --help
bunx github:kronael/jitmax hot.ts
```

Help exits `0`. The sample reports `every annotated function is clean.` and
exits `0`. Mark your own hot function next and pass its source directory, such
as `src`. A single file brings in the files it imports but not the files that
import it, so a caller in the next file reads as `no visible caller`. Add
`--verbose` to show every retained source location when a finding has more than
five. The GitHub command runs the repository's current `main` branch, not a
release tag; [the status line](#development-and-licence) says how the two differ.

Paths choose files, not compiler options. jitmax finds `tsconfig.json` from the
working directory upward and never from the path argument. With no paths it uses
that config's file list; with neither paths nor a config it scans sources under
the working directory. It reads only a file named `tsconfig.json`, follows its
`extends`, and does not build its project `references`, so run it where a
`tsconfig.json` holds or extends the options your code compiles with.

### Use an existing checkout

Replace the quoted paths with your real paths; Windows paths can use `C:/...`:

```sh
cd "/path/to/jitmax"
bun install --ignore-scripts
cd "/path/to/your-project"
bun "/path/to/jitmax/bin/cli.js" hot.ts
```

This runs source without a build. Anywhere below, `bunx github:kronael/jitmax`
and `bun "/path/to/jitmax/bin/cli.js"` are interchangeable.

## Read a finding

Add a fifth shape to that array's element type and the first rule fires. Save
this as `shapes.ts` beside `hot.ts`:

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

`bunx github:kronael/jitmax shapes.ts` prints this and exits `1`:

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

  known defects cited above:
    TC-2  a TypeScript union member is not a V8 map
    TC-9  rules fire outside the conditions their own evidence establishes

  Static findings are candidates, not measured costs in this workload.
  Profile and benchmark the caller before keeping a change.
  Rule evidence and limits: docs/rules.md; measurements: bench/README.md.
```

A finding is fifteen to twenty lines because every line answers a different
question:

- The first indented line is the annotated function the walk started from. **The
  walk** is jitmax following calls out of that function into every callee whose
  source is in your program, to a cap of 200 bodies per annotation — so the
  finding under it is often in a different file.
- The line below it leads with the exact position, then `error` or `warn`,
  then the rule.
- The message says what the rule saw, in the rule's own hedged words.
- A `warn` finding adds a `once:` line naming the static field initializer
  that is the only path to it; it does not fail the run.
- `related:` links representative builders, implementations, allocations or key
  observers. Five by default, all of them with `--verbose`. They are not every
  allocation and not proof that the value reaches the site at runtime.
- `sources:` says where the source query gave up — an unknown input, a cycle or
  its budget.
- `next:` is an investigation or a conditional rewrite, never an automatic one.
- `note:` states the limits of that rewrite: what it changes besides speed, and
  where the measurement declined to support it.
- `measured in` names the raw timing files behind the rule, which live in
  `bench/` in a clone of jitmax and not in your project. `bench/README.md`
  explains every number in them.
- `known defects:` are the rule's own recorded defects. The legend after the
  findings says what each code means.

No finding prints a ratio, because a ratio is a property of the input and the
annotation does not carry the size of your data. Where the docs do print one:

**`n`** is the size the benchmark ran at — keys, items or inputs, depending on
the sweep. **Every ratio is before time divided by after time**, so above 1.0
the change was faster, below 1.0 it was slower, and 1.0 is no change. A pattern
that costs nothing at `n=8` can cost a great deal at `n=10000`, and a rewrite
can go the other way: es-toolkit's `omit` improves reads at n=12 and n=48, and
makes the whole call slower at both, 0.17-0.51x.

A clean result does not prove that a rewrite is safe or faster, and it does not
prove the function is fast. Read the [rule reference](docs/rules.md) and the
[known limits](docs/limits.md) before acting on a finding.

## Select rules or hot functions

To report only megamorphic reads and calls, save the supplied
[preset](examples/megamorphic/jitmax.toml) as `jitmax.toml` in your project:

```sh
bunx github:kronael/jitmax jitmax.toml hot.ts
```

It switches the other six rules off. Coverage notices still apply. For your own
settings, see [turning a rule off](docs/rules.md#turning-a-rule-off): `false`
disables a rule by name, or every rule carrying a defect code. For one function
and the callees it reaches, write `/** @jitmax -megamorphic-elements -TC-9 */`.
The report counts what it suppressed and names the rules those findings came from.

A CPU profile can select hot functions with no annotations at all. Replace
`your-workload.js` with your application's JavaScript entry point and `src` with
its source directory. Recording a profile needs Node:

```sh
node --cpu-prof --cpu-prof-name=run.cpuprofile your-workload.js
bunx github:kronael/jitmax run.cpuprofile src
```

If a build step writes that JavaScript from TypeScript, have it emit source
maps — `sourceMap: true` for `tsc` — so jitmax can map each frame back to your
source. The default selects functions with at least 1% of your project's
sampled self time; time in dependencies, Node's internals and the engine is
left out. `[profile] min_self_pct` changes it. [Profile
mapping](ARCHITECTURE.md#profile-mode-in-detail) covers source maps and
unmatched frames. Pass at most one `.toml` and one `.cpuprofile`, in any order.

## Rules and exit codes

Eight rules ship: megamorphic reads and calls, repeated copying, allocation
chains, selection candidates and property deletion, plus two coverage rules.
[The rule reference](docs/rules.md) states each trigger, its evidence and its
limits.

Exit `0` means at least one function was checked with no errors and no reported
coverage gaps — a `warn` finding can still print. A finding reached only
through a static field initializer prints `warn` with a `once:` line naming
the initializer, because that code runs when its class is defined and not on
each call, and does not fail the run; every other finding is an error. Exit `1`
means an error, incomplete coverage, or no selected functions. Coverage gaps
include truncated walks, unresolved modules, unmatched hot frames, bodyless
annotations and calls through `any` receivers. Exit `2` means the tool failed,
including invalid input, config or source syntax. `--help` and `-h` exit `0`
without loading the project. Suppressing a rule never clears a coverage gap.
The two coverage rules are different: switch off `closed-world` or
`interface-dispatch` and the calls they report stay unchecked, but the run can
exit `0`.
Semantic TypeScript errors belong to your own compiler check.

## Development and licence

Work inside a full Git clone. Development needs Node `>=22.18`, npm and Make.
Install dependencies with `npm ci --ignore-scripts`, then run:

```sh
make          # lint, test, demo checks
make verify   # also check pinned V8 citations and the Radash checkout
```

`make build` regenerates the evidence artifacts; running jitmax does not need
it. See [development](ARCHITECTURE.md#development) for verification
prerequisites.

GPL-2.0-only; see [LICENSE](LICENSE). The vendored radash, remeda, es-toolkit
and zod functions in `examples/` retain their MIT licences, copyright lines,
versions and commits. [examples/LICENSE-MIT](examples/LICENSE-MIT) carries their
permission notices. V8 is a trademark of Google LLC; this project is not
affiliated with, endorsed by, or sponsored by Google.

Status: v0.16.0, single machine, eight rules.

That version is `package.json` and the newest tag. `bunx github:kronael/jitmax`
installs the repository's `main` branch, which is ahead of it, and the finding
layout differs between the two: `main` leads a finding with its location, as
shown above, and the tag leads with `error`. Tagging is the owner's call.

Read [architecture](ARCHITECTURE.md) for internals and
[benchmarks](bench/README.md) for measurements and reruns. See
[examples](examples/README.md) for real library trials and rewrites, and
[limits](docs/limits.md) for known gaps. The project page is at
[krons.fiu.wtf/pub/jitmax](https://krons.fiu.wtf/pub/jitmax/).
