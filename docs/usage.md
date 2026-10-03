# Usage

Start with the [quick start](../README.md#quick-start). All rules run by default.
A config file is optional.

## Choose files

Run from the project root:

```sh
bunx github:kronael/jitmax#v0.17.3 src          # a directory
bunx github:kronael/jitmax#v0.17.3 src/hot.ts   # one file
bunx github:kronael/jitmax#v0.17.3              # the tsconfig file list
```

Paths choose files. Compiler options come from the `tsconfig.json` found from
the working directory upward. jitmax follows `extends` but does not build
project `references`. Without paths or a config, it scans the working directory.

A file brings in its imports, but not files that import it. Pass the source
directory when the checker needs to see callers in other files.

jitmax uses your project's TypeScript 5.x or 6.x. TypeScript 7 lacks the
compiler API the checker needs and stops the run at exit `2`. To install a
supported compiler, use `bun add --dev typescript@^6` or
`npm install --save-dev typescript@^6`. Install other dependencies before scanning.

The compiler's configuration rules still apply. TypeScript 6 can reject
options it deprecates. Without `tsconfig.json`, its defaults can also leave
Node globals untyped. See [compiler limits](limits.md#what-the-walk-sees).

## Configure rules

To switch off one rule, save `jitmax.toml` in your project root:

```toml
[rules]
chained-allocation = false
```

Run the same command as before. jitmax searches from the working directory
upward and prints the config path it uses. List only the rules you want to
switch off. `false` suppresses a rule. `true` adds no suppression.

To use another config for one run, pass its path:

```sh
bunx github:kronael/jitmax#v0.17.3 review.toml src
```

The named config replaces the discovered config. jitmax does not merge them.
Unknown tables, rule names and invalid values stop the run at exit `2`.

To switch off a rule for one function and the functions it calls, name it on the annotation:

```ts
/** @jitmax -chained-allocation */
```

The report counts suppressed findings. Suppression hides the finding. It does
not fix the pattern. An annotation cannot re-enable a rule disabled by config.
A [known defect code](rules.md#known-defects), such as `TC-9`, selects every
rule that carries that code. Use the same `false` or `-` syntax.

For only megamorphic reads and calls, copy the
[megamorphic preset](../examples/megamorphic/jitmax.toml) as `jitmax.toml`.
The preset also disables `closed-world` and `interface-dispatch`. Those calls
remain unchecked and can pass at exit `0`. Other tracked gaps, such as
unresolved imports or a truncated walk, still fail the run.

## Select functions from a CPU profile

Record your workload with Node:

```sh
node --cpu-prof --cpu-prof-name=run.cpuprofile your-workload.js
bunx github:kronael/jitmax#v0.17.3 run.cpuprofile src
```

The profile selects functions with at least 1% of the project's sampled self
time. Self time counts samples inside the function, without called functions.
Dependency, Node and engine time do not contribute to that threshold.

If a build transforms your TypeScript, emit source maps. For `tsc`, set
`sourceMap: true`. An unmatched hot frame reports incomplete coverage and
exits `1`. [Profile matching](../ARCHITECTURE.md#profile-mode) explains the details.

To change the threshold, save a separate `profile.toml`:

```toml
[profile]
min_self_pct = 2
```

```sh
bunx github:kronael/jitmax#v0.17.3 profile.toml run.cpuprofile src
```

The threshold must be greater than 0 and at most 100. A config that sets it
requires a `.cpuprofile` argument. Copy any needed `[rules]` into the named
config, since it replaces `jitmax.toml`.

## Read the output

Each finding names the selected function, the source position and the rule.
The finding can occur in any function it calls. `next:` gives the next step. `note:`
names risks to the program's behaviour. `related:` points to reads, builders
or implementations. `sources:` names missing origins.

```sh
bunx github:kronael/jitmax#v0.17.3 -v src
```

`-v` adds benchmark paths, known defects and all related locations the analysis
kept. Locations and counts describe static possibilities, not runtime events.
[Reading a finding](rules.md#reading-a-finding) explains the full report.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | At least one function checked, no enabled errors and no tracked coverage gaps. A `warn` can still print. |
| `1` | An error, incomplete coverage or no function selected. |
| `2` | Invalid arguments, config, CPU profile, source syntax or unsupported TypeScript. |

A finding reached only through a static field initializer prints `warn` because
that code runs once when the class is defined. Findings on per-call paths are
errors. See [severity](rules.md#severity).

Coverage gaps include a truncated walk, unresolved imports in checked code,
unmatched hot frames, annotations without a body and calls through an `any`
receiver. Switching off a rule does not clear those gaps.

`--help` exits `0` without loading the project. jitmax checks source syntax
and compiler options. Use your compiler for type errors.
