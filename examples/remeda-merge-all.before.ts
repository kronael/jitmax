// remeda 2.0.0 — https://github.com/remeda/remeda — MIT
// Copyright (c) 2018 remeda
// Vendored verbatim from packages/remeda/src/mergeAll.ts at commit 72ca45e,
// implementation signature only — the two overload declarations above it are
// types and carry no code.
//
// THE FINDING. remeda was cloned shallow, annotated by the rule in
// examples/annotate.js — every function not nested in another function whose
// body contains a loop or an array-iteration call — and turbocharge was run
// over the result. 85 functions, 65 findings, 61 of them `closed-world` at a
// builtin. This is one of the other four:
//
//     tmp/lib-remeda/packages/remeda/src/mergeAll.ts:60  mergeAll()
//       accumulating-spread
//         tmp/lib-remeda/packages/remeda/src/mergeAll.ts:64
//         out is rebuilt from a copy of itself; every pass copies everything
//         it already holds
//         fix: mutate acc in place — push, or assign the key — instead of
//         rebuilding it
//
// THE INPUT: `mergeAll(objects)` over a list of partial configuration objects,
// which is what the function is for — remeda's own example is
// `mergeAll([{ a: 1, b: 1 }, { b: 2, c: 3 }, { d: 10 }])`. n is the number of
// objects: 8 is an ordinary plugin/defaults list and 64 a large one. Each
// object after the first contributes three keys of its own and overwrites one
// shared key, so `out` grows the way it grows in real use rather than staying
// four keys wide. Built in examples/workloads.ts.
//
// The after half is examples/remeda-merge-all.after.ts and the diff is one
// line.

/** @turbocharge */
export function mergeAll(objects: readonly object[]): object {
  let out = {};

  for (const item of objects) {
    out = { ...out, ...item };
  }

  return out;
}
