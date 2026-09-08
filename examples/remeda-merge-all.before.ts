// remeda 2.0.0 — https://github.com/remeda/remeda — MIT
// Copyright (c) 2018 remeda
// Vendored verbatim from packages/remeda/src/mergeAll.ts at commit 72ca45e,
// implementation signature only — the two overload declarations above it are
// types and carry no code.
// Measurements and caller inputs: examples/README.md and examples/workloads.ts.

/** @jitmax */
export function mergeAll(objects: readonly object[]): object {
  let out = {};

  for (const item of objects) {
    out = { ...out, ...item };
  }

  return out;
}
