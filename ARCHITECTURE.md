# How jitmax is built

For installation and commands, start with the [README quick start](README.md#quick-start).
It covers Bun, the TypeScript version constraint and the checkout fallback for
the public GitHub access blocker, TC-133.

One pass over a TypeScript program: load the project's own compiler, find the
marked functions, walk what they call, run eight detectors over every body the
walk reaches, and print. There is no cache, no daemon and no incremental mode.

```
bin/jitmax.ts        argv, then the pipeline below, then the exit code
  lib/ts.ts          loads the project's own TypeScript, builds the Program
  lib/config.ts      the TOML [rules] table and [profile] min_self_pct
  lib/profile.ts     a --cpu-prof profile, read for which functions were hot
  lib/scan.ts        the marks, the recursive walk, the coverage counters
    lib/flow.ts      what reaches a receiver, by dataflow
  lib/rules/         one file per rule: its detector, its EVIDENCE, its name
  lib/report.ts      findings to text, and the suppression line
```

## The pipeline

**Load the project's TypeScript first.** `lib/ts.ts` resolves
`typescript` from the scanned project first and falls back to this package's
own. The tool therefore parses with the same compiler the project builds with,
and reads the same types. It needs the 5.x API: `ts.sys` and
`ts.createProgram`, neither of which exists in TypeScript 7, the native rewrite
(`BUGS.md` TC-130).

**Find the marks.** A mark is `/** @jitmax */` on a function, or a frame from a
CPU profile at or above `[profile] min_self_pct` of the profile's sampled self
time. Nothing downstream can tell the two apart: the walk, the rules and the
exit code treat a profiled mark exactly as an annotated one.

**Walk.** From each mark, `lib/scan.ts` follows every call whose callee has a
body in the program, to a fixpoint. A visited set stops cycles. Each annotation
has a hard cap of 200 function bodies; hitting it prints `WALK TRUNCATED` and
makes the run exit 1. A `new` is a call: the constructor is a body like any
other. A callee that resolves to a declaration with no body is a `closed-world`
finding, and a call the walk cannot bind to one implementation is an
`interface-dispatch` finding — the walk reports where it stopped rather than
letting the site fall through both branches and vanish.

**Count what reaches a receiver.** `lib/flow.ts` answers "what actually reaches
this value", not "what could structurally fit its interface" — TypeScript is
structural, so dozens of shapes in a checkout satisfy a two-method interface
while never going near the call. From the call site it walks BACK: a receiver
that is a parameter leads to every visible call site of its function; an
argument is a local, a field or another parameter, and each is followed to an
allocation — an object literal, a `new`, a factory return — to a fixpoint. That
is ordinary 0-CFA: a flow analysis that gives each variable one set of possible
origins for the whole program, without tracking the path taken to reach it.
These are static possibilities, not a runtime map count: branches can exclude
origins from a particular call, while coalescing and analysis limits can omit
others. Detection uses its existing thresholds; source metadata does not alter them.

**Locate sources.** Each scanned mark holds the program's shared `Flow`.
After scanning finishes, megamorphic rules query `Flow.sources` through the
same `valueOf` and `elementsOf` walkers, with their existing cache and budgets.
Receiver origins also carry their existing source nodes. Classes point to
class declarations; literal and array identities retain representative nodes.
Cyclic, unknown and exhausted queries stay labelled as partial. No second
flow analysis is built for diagnostic locations.

**Detect.** Every rule is one file in `lib/rules/`, holding its detector, its
`EVIDENCE` and its name together. `lib/rules/index.ts` is the ONE register
every rule is read from — the rule count in the documentation is derived from
it — and `lib/rules/shared.ts` is what more than one of them needs. Each rule
matches inside a single body; the walk widens where the rules are applied and
does not widen what one rule can see (`docs/limits.md`).

**Report.** `lib/report.ts` prints one finding per site, its next step and the note
under it, the sweep that priced the rule, and every `known defect` code the
rule carries — what each code says is printed once, after the findings. It also
prints what the run could not check: calls into the platform, calls lowered to
inline code, and how many findings a config suppressed and by what.
Rules attach related source locations through one field. The report shows five
per finding by default and all available locations with `--verbose`. This is a
display limit, separate from the flow walk's analysis limits.

## Which calls are not holes

Calls that TurboFan lowers to inline machine code have no call boundary at all,
so reaching one is not a gap in the promise. That list is derived from the
pinned V8's `js-call-reducer.cc` by `make builtins` into `lib/builtins.ts`, and
never written by hand: a hand-written list here would be this project's own
copy of the mistake it charges the incumbents with (`BUGS.md` TC-126). Node's
own module names and anything reached off `globalThis` are the platform: they
are counted for the run and never named, because "inline what you need from
`path.join`" is advice nobody can take.

## Profile mode, in detail

From your application's root, record a profile and pass it as a suffix-named
positional argument. Replace `your-workload.js` with your JavaScript entry
point and `src` with its source directory. Use the README's checkout command
prefix while the GitHub download is unavailable:

```sh
node --cpu-prof --cpu-prof-name=run.cpuprofile your-workload.js
bunx github:kronael/jitmax run.cpuprofile src
```

Every function at or above `[profile] min_self_pct` of the profile's sampled
self time is marked, and the report says what marked it:

```
  src/hash.ts:8  compress() — 58.6% of samples, run.cpuprofile
```

A frame's position is a position in the file V8 **ran**, which is not the file
you wrote as soon as anything transforms it — one `enum` is enough, because type
stripping cannot run one. So a position is ported back through the source map
beside the profiled file before it is matched, and the finding names the line you
wrote. When the profiled file has no source map, nothing is guessed: the run
prints how many frames matched, names the ones that did not with their file and
line, and says a transform is the likelier cause than a stale profile — and it
exits `1`, because unchecked measured time is not a clean run. `min_self_pct`
defaults to 1 and is a constant nobody has measured, so the TOML owns it and
every run prints the value it used.

To change the threshold, save `profile.toml` in your application's root:

```toml
[profile]
min_self_pct = 2
```

Run `bunx github:kronael/jitmax profile.toml run.cpuprofile src` from there.
Use the README's checkout command prefix while GitHub access is blocked.
The threshold is a percentage of sampled self time, not elapsed duration.

There is no static hotness estimate. An annotation selects a function by the
user's judgment; a profile selects it by sampled self time. The report asks the
user to profile and benchmark the caller before keeping a change.

## How it runs

Bun runs the checker, but the rules and their benchmark evidence concern V8.
They do not predict performance under Bun's JavaScriptCore engine.

`bunx github:kronael/jitmax` installs from the repository. The linked executable,
`bin/cli.js`, requires Bun through its shebang. Bun follows that shebang and can
run the TypeScript under `node_modules`, so an unbuilt Git install needs neither
`dist/` nor permission to run `prepare`. Bun's
[shebang rules](https://bun.sh/docs/pm/bunx#shebangs) and
[lifecycle policy](https://bun.sh/docs/pm/lifecycle) explain the runtime and
script handling. Public repository access is tracked in `BUGS.md` TC-133.

The shim uses `dist/bin/jitmax.js` when an installed copy contains it; otherwise
it uses `bin/jitmax.ts`. A checkout always runs the source. npm's `prepare`
builds `dist/` for compiled packages. Node can run such a package explicitly
through `node bin/cli.js`; it cannot strip types under `node_modules`.
For development, `node bin/jitmax.ts` needs Node `>=22.18` and no build step.

## The derived artifacts

Two committed files are generated, and `make build` is the only thing that
writes them:

- `lib/numbers.ts` and the generated block in `bench/README.md`, from the `.jl`
  sweeps, by `lib/derive.ts` (`make numbers`). One query per published number.
- `lib/builtins.ts`, from the pinned `v8src/` checkout, by
  `lib/derive-builtins.ts` (`make builtins`).

`make` never runs `build`. Regenerating right before the drift assertions would
leave them comparing fresh output against fresh output, and a stale committed
artifact could never fail again. `EVIDENCE` interpolates the derived strings,
the documentation quotes them, and `make test` fails when a quoted number and
its data disagree.

## Development

Run these commands inside the jitmax checkout after the
[development setup](README.md#development-and-licence). Node `>=22.18` runs
the tests and benchmarks; Bun is only required for the Bun launcher workflow.

```sh
make          # lint, test, check
make verify   # all, v8-check, reality
make lint     # tsc --noEmit
make test     # the unit tests — test/README.md
make check    # the checker against demo/, where findings are the expected outcome
make example  # the checker against examples/, then the end-to-end sweep
make numbers  # re-derive every published number from the .jl sweeps
make build    # numbers + builtins
make reality  # the checker against a radash checkout, composition and total
make demo     # re-record demo/demo.gif — a real asciinema run, not a mock-up
make meme     # re-render the launch loop from demo/meme/
```

`make verify` also needs the [pinned V8 source](bench/README.md#what-v8s-source-says)
and a Radash checkout at the revision used by CI. The checkout steps and pin
are in [CLAUDE.md](CLAUDE.md) and [.github/workflows/ci.yml](.github/workflows/ci.yml).
Missing checkouts fail verification; they are not needed for ordinary scans.

`CLAUDE.md` holds the repository's own rules and the measurement protocol in
full. `BUGS.md` holds the open queue, and the entries commissioned adversarial
reviews produced — each reviewer told to argue the tool is worthless, every
finding re-run here before it was written down.
