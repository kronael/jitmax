// typescript-eslint 8.67.0 — https://github.com/typescript-eslint/typescript-eslint — MIT
// Copyright (c) 2019 typescript-eslint and other contributors
// Vendored verbatim from packages/eslint-plugin/src/util/misc.ts at commit 56c9ed9.
// The finding and the annotation that clears it: examples/README.md.

/** @jitmax */
export function findLastIndex<T>(
  members: T[],
  predicate: (member: T) => boolean | null | undefined,
): number {
  let idx = members.length - 1;

  while (idx >= 0) {
    const valid = predicate(members[idx]);
    if (valid) {
      return idx;
    }
    idx--;
  }

  return -1;
}
