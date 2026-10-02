# How jitmax is built

Usage is in the [README](README.md#quick-start). This file explains how one run
works inside.

One pass over a TypeScript program: load the project's own compiler, read the
config, find the marked functions, walk what they call, run eight detectors
over every body the walk reaches, and print. There is no cache, no daemon and
no incremental mode.

```
bin/jitmax.ts        argv, then the pipeline below, then the exit code
  lib/ts.ts          loads the project's own TypeScript, finds tsconfig.json
                     and jitmax.toml, builds the Program
  lib/config.ts      the TOML [rules] table and [profile] min_self_pct
  lib/profile.ts     a --cpu-prof profile, read for which functions were hot
  lib/scan.ts        the marks, the recursive walk, the coverage counters
    lib/flow.ts      what reaches a receiver, by dataflow
  lib/rules/         one file per rule: its detector, its EVIDENCE, its name
  lib/report.ts      findings to text, and the suppression line
```

## The pipeline

**Load the project's TypeScript.** `lib/ts.ts` resolves `typescript` from the
working directory first and falls back to this package's own. Run jitmax from
the target project's root to parse with its installed compiler; a source path
does not change which compiler is used. It needs
the 5.x API, `ts.sys` and `ts.createProgram`, which TypeScript 7, the native
rewrite, does not have. `load()` checks for `ts.sys` on whatever it resolved
and fails with exit `2`, naming the version it found. It checks the capability,
not the version string, because `sys` is what every later step reads. Under
Bun the check matters most: Bun's resolver can return the latest `typescript`
even where no `node_modules/typescript` exists.

**Read the config.** With no `.toml` argument, `lib/ts.ts` finds `jitmax.toml`
from the working directory upward, with the same lookup it uses for
`tsconfig.json`; a `.toml` on the command line wins. A found config changes
which rules fire, so the run prints which file it used. `lib/config.ts` parses
the `[rules]` and `[profile]` tables and rejects any other table, unknown key or
unknown rule name with exit `2`.

**Find the marks.** A mark is `/** @jitmax */` on a function, or a frame from a
CPU profile at or above `[profile] min_self_pct` of the project's sampled self
time. Nothing downstream tells the two apart: the walk, the rules and the exit
code treat a profiled mark exactly as an annotated one.

**Walk.** From each mark, `lib/scan.ts` follows every call whose callee has a
body in the program, to a fixpoint, recording every edge it takes. A visited
set stops cycles. Each annotation has a hard cap of 200 function bodies;
hitting it prints `WALK TRUNCATED` and makes the run exit 1. A `new` is a call:
the constructor is a body like any other and runs per call, as does an
instance field. A `new` also admits the class's static field initializers,
each as an edge that runs once, when the class is defined. A body that only
such once-edges reach is marked `once`: its findings print `warn` and name the
initializer instead of failing the run. A closure a once body builds runs
whenever it is called, and a body a per-call path also reaches keeps its
error. A callee that resolves to a declaration with no body is a
`closed-world` finding, and a call the walk cannot bind to one implementation
is an `interface-dispatch` finding: the walk reports where it stopped instead
of letting the site vanish.

**Count what reaches a receiver.** `lib/flow.ts` traces the possible origins of a
receiver through assignments and calls, instead of counting every class that
could structurally fit its interface. TypeScript is
structural, so dozens of shapes in a checkout can satisfy a two-method
interface without ever reaching the call. From the call site the walk goes
back: a receiver that is a parameter leads to every visible call site of its
function; an argument is a local, a field or another parameter, and each is
followed to an allocation — an object literal, a `new`, a factory return — to a
fixpoint. That is 0-CFA: a flow analysis that gives each variable one set of
possible origins for the whole program, without tracking the path that reached
it. The results are static possibilities, not a runtime map count: a branch
can exclude an origin from a particular call, and merging and analysis limits
can omit others.

**Locate sources.** After the scan, the megamorphic rules query
`Flow.sources` through the same walkers, with the same cache and budgets.
Classes point to their declarations; literal and array origins keep
representative nodes. A cyclic, unknown or exhausted query stays labelled as
partial. No second flow analysis runs for diagnostic locations.

**Detect.** Every rule is one file in `lib/rules/`, holding its detector, its
`EVIDENCE` and its name. `lib/rules/index.ts` is the one register every rule is
read from — the documentation's rule count is checked against it — and
`lib/rules/shared.ts` holds what more than one rule needs.
`accumulating-spread` and `chained-allocation` match inside a single body. The
megamorphic rules ask `lib/flow.ts` what reaches a value across calls,
`allocating-select` reads the body of the callee it sees, and
`delete-property` follows the deleted object through arguments and returns.

**Report.** `lib/report.ts` prints one finding per site, with its next step,
the note under it, the sweep behind the rule where it has one, and every
defect code the rule carries; what each code means is printed once, after the
findings. It also prints what the run could not check: calls into the
platform, calls lowered to inline code, and how many findings a config
suppressed and from which rules. Related locations show five per finding, or
all with `--verbose`; that is a display limit, separate from the flow walk's
analysis limits.

## Which calls are not gaps

jitmax does not count a call to a builtin that the pinned V8's call reducer can
lower to inline code as a coverage gap. That is a policy, not proof that V8
inlines a given call: reduction depends on runtime feedback. `make builtins`
derives the names from `js-call-reducer.cc` into `lib/builtins.ts`. Node's own modules and anything reached off `globalThis` are the
platform: no install gives the walk a body to read, so they are counted for
the run and never named.

## Profile mode

Every function at or above `[profile] min_self_pct` of the project's sampled
self time is marked, and the report says what marked it. The project's share
leaves out frames in dependencies, Node's internals and the engine:

```
  src/hash.ts:8  compress() — 58.6% of samples, run.cpuprofile
```

A frame's position is a position in the file V8 **ran**, which is not the file
you wrote once anything transforms it; one `enum` is enough, because type
stripping cannot run one. So each position is mapped back through the source
map that the profiled file's `sourceMappingURL` comment names, inline or on
disk, before it is matched, and the finding names the line you wrote. A file
with no map is matched at the positions V8 reported.

When a hot frame matches no function, nothing is guessed. The run prints how
many frames matched, names the ones that did not with their file and line,
says a transform is the likelier cause than a stale profile where no map
covered them, and exits
`1`, because unchecked measured time is not a clean run. A frame named
`<anonymous>` at a file's `:1:1` is that module's top-level code: no function
holds it, so move that work into a function to have it checked.

There is no static hotness estimate: an annotation selects a function by your
judgement, a profile by sampled self time. `min_self_pct` defaults to 1. It
is a selection threshold, not a measured boundary between hot and cold code,
and every run prints the value it used. To change it, save this as
`profile.toml`:

```toml
[profile]
min_self_pct = 2
```

Then name it beside the profile:
`bunx github:kronael/jitmax profile.toml run.cpuprofile src`. A config with
`[profile]` exits `2` on a run given no `.cpuprofile`, so keep it out of the
`jitmax.toml` that annotation runs find. A named `.toml` replaces the found
one, so copy any `[rules]` you need into it.

## How it runs

Bun runs the checker, but the rules and their evidence concern V8. They do not
predict performance under Bun's JavaScriptCore engine.

`bunx github:kronael/jitmax` installs from the repository. The linked
executable, `bin/cli.js`, selects Bun through its shebang, and Bun can run the
TypeScript under `node_modules`, so an unbuilt Git install needs neither
`dist/` nor permission to run `prepare`. Bun's
[shebang rules](https://bun.sh/docs/pm/bunx#shebangs) and
[lifecycle policy](https://bun.sh/docs/pm/lifecycle) explain the runtime and
script handling.

The shim uses `dist/bin/jitmax.js` when an installed copy contains it, and
`bin/jitmax.ts` otherwise; a checkout always runs the source. npm's `prepare`
builds `dist/` for compiled packages. Node can run such a package through
`node bin/cli.js`, but it cannot strip types under `node_modules`. In a clone,
`node bin/jitmax.ts` needs Node `>=22.18` and no build step.

Git source archives and packages carry six guides: the README, this file, the
rules, the limits, the examples and the benchmarks. `.gitattributes` excludes
all other Markdown and the internal `.claude`, `.diary` and `.ship`
directories, and `package.json` lists the same guides. Runtime sources, the
rule preset and the licences ship; Git archives also keep the examples and the
raw evidence. [Git export rules](https://git-scm.com/docs/git-archive#ATTRIBUTES)
affect archives, not full clones or installers that clone directly.

## The derived artifacts

Two generators write three committed outputs. `make build` runs both, `make
numbers` and `make builtins` one each, and no other target writes them:

- `lib/numbers.ts` and the generated block in `bench/README.md`, from the `.jl`
  sweeps, by `lib/derive.ts` (`make numbers`). One query per published number.
- `lib/builtins.ts`, from the pinned `v8src/` checkout, by
  `lib/derive-builtins.ts` (`make builtins`).

`make` never runs `build`. Regenerating right before the drift checks would
compare fresh output with fresh output, and a stale committed artifact could
never fail. `EVIDENCE` interpolates the derived strings, the documentation
quotes them, and `make test` fails when a quoted number and its data disagree.

## Development

Run these in a full Git clone after the
[development setup](README.md#development-and-licence). Node `>=22.18` runs
the tests and benchmarks; Bun is needed only for the Bun launcher.

```sh
make          # lint, test, check
make verify   # all, v8-check, reality
make lint     # tsc --noEmit
make test     # the unit tests — test/README.md
make check    # the checker against demo/, where findings are the expected outcome
make example  # the checker on examples/, then unmeasured end-to-end cells
make numbers  # re-derive every published number from the .jl sweeps
make build    # numbers + builtins
make reality  # the checker against a radash checkout, composition and total
make demo     # re-record demo/demo.gif — a real asciinema run, not a mock-up
make meme     # re-render the launch loop from demo/meme/
```

`make verify` also needs the [pinned V8 source](bench/README.md#what-v8s-source-says)
and a radash checkout at the revision CI uses; `.github/workflows/ci.yml` has
the checkout steps. A missing checkout fails verification, and neither is
needed for ordinary scans. A full clone also holds the contributor rules in
`CLAUDE.md`, the issue queue in `BUGS.md` and the test guide in
`test/README.md`; none of them ships in an install.
