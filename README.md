# jitmax

Mark a TypeScript function `/** @jitmax */` to find possible performance problems
in its body and the callees jitmax can follow. Findings name the source, a next
step, and the benchmark behind the rule. They do not measure your workload.

![jitmax finding one line in a function radash ships](demo/demo.gif)

## Quick start

Use Bun and TypeScript `>=5.0.0` with the 5.x compiler API. jitmax loads your
project's TypeScript first, then its own installed copy. Run it from the GitHub
repository with `bunx`; it needs no npm publication or build step.

The public repository currently exposes no Git refs and its download returns
404. [TC-133](BUGS.md) tracks that access blocker. The commands below need a
reachable repository before they can run.

In your TypeScript project, mark a function you need fast:

```ts
/** @jitmax */
export function total(rows: { value: number }[]): number {
  return rows.reduce((sum, row) => sum + row.value, 0);
}
```

Run from your TypeScript project's root:

```sh
bunx github:kronael/jitmax --help
bunx github:kronael/jitmax src/hot.ts
bunx github:kronael/jitmax --verbose src/hot.ts
```

Paths choose files, not compiler options. jitmax finds `tsconfig.json` from the
working directory upward. With no paths, it uses that config's file list;
with neither paths nor a config, it scans sources under the working directory.

With an existing checkout, run `bun /path/to/jitmax/bin/cli.js src/hot.ts` after installing its dependencies.

## Read a finding

Findings name exact positions, including inside callees of the marked function.
Excerpt from `node bin/jitmax.ts demo`:

```text
  demo/lib.ts:46  fiveShapes()
    error  megamorphic-elements
      demo/lib.ts:46:28
      rows has 5 distinct property sets in its element type; this is a
      candidate for megamorphic load feedback, not an observed runtime map
      count
      related: demo/lib.ts:48:30 read: r.x
      sources: No builder located for this value. Source tracing is partial:
               no visible caller of fiveShapes — its arguments come from
               outside this program.
      next: inspect where these elements are built, not just this parameter.
            If semantics allow, use consistent own properties and insertion
            order; benchmark the full caller including construction
```

`next:` gives an investigation or conditional rewrite; `note:` states its limits.
For deletion, the note says the rebuild helps at the smaller of n=12 and n=48 and not at the larger,
where filling it key by key normalizes it too.

`related:` links representative builders, implementations, allocations or key
observers. The default shows five locations; `-v` or `--verbose` shows all retained
locations without deepening analysis or changing findings, suppression or exits.
These locations are not every allocation or proof of runtime reachability.

Profile the caller, preserve its behavior, and benchmark the full operation
before keeping a rewrite. A clean result does not prove that a rewrite is safe
or faster. Read the [rule advice](docs/rules.md) and [known limits](docs/limits.md).

## Select rules or hot functions

To focus on megamorphic reads and calls, save the supplied
[preset](examples/megamorphic.toml) as `megamorphic.toml` in your project:

```sh
bunx github:kronael/jitmax megamorphic.toml src/hot.ts
```

It disables the other six rules. Coverage notices still apply.
For your own settings, save a TOML file such as `rules.toml`:

```toml
[rules]
"megamorphic-elements" = false
"TC-9" = false
```

```sh
bunx github:kronael/jitmax rules.toml src
```

A rule name disables that rule; a defect code disables every rule carrying it.
For one function and its callees, use `/** @jitmax -megamorphic-elements -TC-9 */`.
The report counts suppressions; see [configuration](docs/rules.md#turning-a-rule-off).

A CPU profile can select hot functions without annotations:

```sh
node --cpu-prof --cpu-prof-name=run.cpuprofile your-workload.js
bunx github:kronael/jitmax run.cpuprofile src
```

The default selects functions with at least 1% sampled self time. Set
`[profile] min_self_pct` in a TOML file passed alongside the profile to change it.
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

```sh
make          # lint, test, demo checks
make verify   # also check pinned V8 citations and the Radash checkout
```

`make build` regenerates derived artifacts; normal checks do not run it.
[Tests](test/README.md) describe their coverage and how to run one test.

GPL-2.0-only; see [LICENSE](LICENSE). The vendored radash, remeda, es-toolkit
and zod functions in `examples/` retain their MIT licences, copyright lines,
versions and commits. [examples/LICENSE-MIT](examples/LICENSE-MIT) carries their
permission notices. V8 is a trademark of Google LLC; this project is not
affiliated with, endorsed by, or sponsored by Google.

Status: v0.14.1, single machine, eight rules.

Read [architecture](ARCHITECTURE.md) for internals, [benchmarks](bench/README.md)
for measurements and reruns, [examples](examples/README.md) for real library
trials and rewrites, and [BUGS.md](BUGS.md) for the open issues.
