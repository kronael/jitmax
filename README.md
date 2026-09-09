# jitmax

Mark a TypeScript function `/** @jitmax */` to find possible performance problems
in its body and the callees jitmax can follow. Findings name the source, a next
step, and the benchmark behind the rule. They do not measure your workload.

![jitmax finding one line in a function radash ships](demo/demo.gif)

## Quick start

[Install Bun](https://bun.sh/docs/installation), then check `bun --version`.
Use TypeScript `>=5.0.0 <6`; jitmax needs the 5.x compiler API. It loads your
project's TypeScript first, then its own installed copy. Install your project's
dependencies with its usual package manager before scanning it.
The `bunx` repository command needs no npm publication, release tag or build.
Bun runs the checker; findings concern V8, not Bun's JavaScriptCore engine.

The public repository currently exposes no Git refs and its download returns
404. Until it has an accessible Git ref, use the
[existing-checkout route](#use-an-existing-checkout) below.
Every `bunx github:kronael/jitmax` command in these docs needs that access.

Save this as `hot.ts` in your TypeScript project's root:

```ts
/** @jitmax */
export function total(rows: { value: number }[]): number {
  return rows.reduce((sum, row) => sum + row.value, 0);
}
```

Run from your TypeScript project's root:

```sh
bunx github:kronael/jitmax --help
bunx github:kronael/jitmax hot.ts
```

Help exits `0`. The sample reports `every annotated function is clean.` and
exits `0`. Add `/** @jitmax */` to your own hot function and pass its file next.
Add `--verbose` to show all retained source locations when it finds a candidate.

Paths choose files, not compiler options. jitmax finds `tsconfig.json` from the
working directory upward. With no paths, it uses that config's file list;
with neither paths nor a config, it scans sources under the working directory.

### Use an existing checkout

Replace the quoted paths with your real paths; Windows paths can use `C:/...`:

```sh
cd "/path/to/jitmax"
bun install --ignore-scripts
cd "/path/to/your-project"
bun "/path/to/jitmax/bin/cli.js" hot.ts
```

This runs source without a build. For every command below, you can replace
`bunx github:kronael/jitmax` with `bun "/path/to/jitmax/bin/cli.js"`.

## Read a finding

Findings name exact positions, including inside callees of the marked function.
Excerpt from `bun bin/cli.js demo`, run inside the jitmax checkout:

```text
  demo/lib.ts:46  fiveShapes()
    error  megamorphic-elements
      demo/lib.ts:46:28
      related: demo/lib.ts:48:30 read: r.x
      next: inspect where these elements are built, not just this parameter.
```

`next:` gives an investigation or conditional rewrite; `note:` states its limits.
For deletion, the note says the own-property rebuild improves reads at n=12 and n=48,
but makes the whole call slower. Measure construction and reads together.

`related:` links representative builders, implementations, allocations or key
observers. The default shows five locations; `-v` or `--verbose` shows all retained
locations without deepening analysis or changing findings, suppression or exits.
These locations are not every allocation or proof of runtime reachability.
Profile the caller, preserve its behavior, and benchmark the full operation
before keeping a rewrite. A clean result does not prove that a rewrite is safe
or faster. Read the [rule advice](docs/rules.md) and [known limits](docs/limits.md).

## Select rules or hot functions

To focus on megamorphic reads and calls, save the supplied
[preset](examples/megamorphic/jitmax.toml) as `jitmax.toml` in your project:

```sh
bunx github:kronael/jitmax jitmax.toml hot.ts
```

It disables the other six rules. Coverage notices still apply. For custom TOML
settings, see [configuration](docs/rules.md#turning-a-rule-off).
A `false` setting disables its named rule or every rule carrying its defect code.
For one function and its callees, use `/** @jitmax -megamorphic-elements -TC-9 */`.
The report counts suppressions.
A CPU profile can select hot functions without annotations. Replace
`your-workload.js` with your application's JavaScript entry point and `src`
with its source directory. Recording the profile requires Node:

```sh
node --cpu-prof --cpu-prof-name=run.cpuprofile your-workload.js
bunx github:kronael/jitmax run.cpuprofile src
```

The default selects functions with at least 1% sampled self time; `[profile] min_self_pct` changes it.
[Profile mapping](ARCHITECTURE.md#profile-mode-in-detail) describes source maps
and unmatched frames. Pass at most one `.toml` and one `.cpuprofile`, in any order.

## Rules and exit codes

Eight rules ship: megamorphic reads and calls, repeated copying, allocation
chains, selection candidates and property deletion, plus two coverage rules.
[The rule reference](docs/rules.md) states each trigger, its evidence and its limits.

Exit `0` means at least one function was checked with no remaining findings or
reported coverage gaps. Exit `1` means findings, incomplete coverage, or no
selected functions. Coverage gaps include truncated walks, unresolved modules,
unmatched hot frames, bodyless annotations and calls through `any` receivers.
Exit `2` means the tool failed, including invalid input, config or source syntax.
`--help` and `-h` exit `0` without loading the project. Suppression does not
clear coverage gaps. Semantic TypeScript errors belong to your compiler check.

## Development and licence

Work inside the jitmax checkout. Development needs Node `>=22.18`, npm and
Make. Install dependencies with `npm ci --ignore-scripts`, then run:

```sh
make          # lint, test, demo checks
make verify   # also check pinned V8 citations and the Radash checkout
```

`make build` regenerates evidence artifacts; it is not required to run jitmax.
See [development](ARCHITECTURE.md#development) for verification prerequisites; use a full Git clone for development.

GPL-2.0-only; see [LICENSE](LICENSE). The vendored radash, remeda, es-toolkit
and zod functions in `examples/` retain their MIT licences, copyright lines,
versions and commits. [examples/LICENSE-MIT](examples/LICENSE-MIT) carries their
permission notices. V8 is a trademark of Google LLC; this project is not
affiliated with, endorsed by, or sponsored by Google.

Status: v0.15.0, single machine, eight rules.

Read [architecture](ARCHITECTURE.md) for internals and [benchmarks](bench/README.md) for measurements and reruns.
See [examples](examples/README.md) for real library trials and rewrites, and [limits](docs/limits.md) for known gaps.
