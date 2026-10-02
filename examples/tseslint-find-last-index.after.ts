// typescript-eslint 8.67.0 — https://github.com/typescript-eslint/typescript-eslint — MIT
// Copyright (c) 2019 typescript-eslint and other contributors

/** @jitmax -closed-world */
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
