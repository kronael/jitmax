// es-toolkit 1.50.0 — https://github.com/toss/es-toolkit — MIT
// Copyright (c) 2024 Viva Republica, Inc
// Vendored verbatim from src/object/omit.ts at commit bec4905.
// Input: omit two keys from a record, then read four retained fields.
// Measurements and limits: examples/README.md.

/** @jitmax */
export function omit<T extends Record<string, any>, K extends keyof T>(obj: T, keys: readonly K[]): Omit<T, K> {
  const result = { ...obj };

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    delete result[key];
  }

  return result as Omit<T, K>;
}
