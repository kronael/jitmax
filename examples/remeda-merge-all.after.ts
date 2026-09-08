// remeda 2.0.0 — https://github.com/remeda/remeda — MIT
// Copyright (c) 2018 remeda

/** @jitmax */
export function mergeAll(objects: readonly object[]): object {
  let out = {};

  for (const item of objects) {
    Object.defineProperties(out, Object.getOwnPropertyDescriptors({ ...item }));
  }

  return out;
}
