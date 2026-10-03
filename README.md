# jitmax

jitmax checks speed-sensitive TypeScript for patterns that can slow V8, the
JavaScript engine in Node, Chrome and Deno. Mark a function `/** @jitmax */`.
The checker reads that function and the functions it calls. You get source
locations, next steps and calls the checker could not follow.

Run from your project root with [Bun](https://bun.sh/docs/installation) and
TypeScript 5.x or 6.x installed:

```sh
bunx github:kronael/jitmax#v0.17.2 src
```

No config is needed. jitmax reads your project's `tsconfig.json` and uses its
TypeScript compiler. If the project lacks a supported compiler, install one:

```sh
bun add --dev typescript@^6
```

Install the project's other dependencies too. Bun runs the checker. The speed
rules concern V8.

## Quick start

Save this as `shapes.ts` in your project root:

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

```sh
bunx github:kronael/jitmax#v0.17.2 shapes.ts
```

The run exits `1`. Its output starts with:

```text
jitmax — 1 annotated function, 1 error

  shapes.ts:9  total()
    shapes.ts:9:23  error  megamorphic-elements
```

The five row types have different properties. The finding marks the read at
`row.x`. Inspect how those objects are built. If the program allows it, give
them the same properties in the same order. A type assertion does not change
an object's shape.

Now mark your own speed-sensitive function and run the command on its source
directory. Use `-v` to see benchmark evidence and every related location.
Use `--help` to see all arguments.

![jitmax checking radash's assign function](https://github.com/kronael/jitmax/releases/download/v0.17.2/jitmax-demo.gif)

The recording checks radash's `assign`, copied unchanged into `examples/`.

## What a result means

Each slowdown rule cites a benchmark with raw timings. The coverage rules
report unchecked calls without claiming those calls are slow.

Exit `0` means at least one function was checked, with no enabled errors or
tracked coverage gaps. Exit `1` means an error, incomplete coverage or no
selected function. Exit `2` means the tool failed.

jitmax does not run or rewrite your code. A clean run does not guarantee V8
optimization or fast execution. A suggested change can make your caller slower.
Profile and benchmark your workload before keeping a change.

## How to read this

| Need | Guide |
|---|---|
| Choose files, configure rules, use a CPU profile or read exit codes | [Usage](docs/usage.md) |
| Understand a finding, its trigger, evidence and fix | [Rules](docs/rules.md) |
| Know what the checker and measurements miss | [Limits](docs/limits.md) |
| See findings and measured fixes in real libraries | [Examples](examples/README.md) |
| Check or repeat the measurements | [Benchmarks](bench/README.md) |
| Develop jitmax or understand its internals | [Architecture](ARCHITECTURE.md) |

[Project page](https://krons.fiu.wtf/pub/jitmax/).
[GPL-2.0-only](LICENSE). Vendored library examples keep their
[MIT licences and attribution](examples/LICENSE-MIT).
V8 is a Google LLC trademark. Google does not sponsor or endorse jitmax.

Version: v0.17.2.
