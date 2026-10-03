# jitmax

jitmax checks TypeScript for patterns that can slow V8. Mark a function with
`/** @jitmax */`. It checks that function and the functions it calls, then
reports source locations and next steps.

## Quick start

Use [Bun](https://bun.sh/docs/installation) and TypeScript 5.x or 6.x.
If your project needs a supported compiler, run `bun add --dev typescript@^6`.
No config is needed.

Save this as `hot.ts` in your project root:

```ts
/** @jitmax */
export function sum(values: number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}
```

Run from your project root:

```sh
bunx github:kronael/jitmax#v0.17.3 hot.ts
```

This example reports no findings and exits `0`. Now mark your own function
and replace `hot.ts` with its source file or directory.

[Usage](docs/usage.md) · [Rules](docs/rules.md) · [Limits](docs/limits.md) ·
[Development](ARCHITECTURE.md#development)

[GPL-2.0-only](LICENSE).

Version: v0.17.3.
