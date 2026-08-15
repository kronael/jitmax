// remeda 2.0.0 — https://github.com/remeda/remeda — MIT
// Copyright (c) 2018 remeda
// examples/remeda-merge-all.before.ts with turbocharge's fix applied, and
// nothing else.
//
// The finding's fix is "mutate acc in place — push, or assign the key —
// instead of rebuilding it". `Object.assign(out, item)` assigns exactly the
// keys `{ ...item }` would have spread, own and enumerable, string and symbol,
// so the result is the same object with the same insertion order. The project's
// own evidence names this form as the fix rather than the defect: bench
// /spread-object.jl measures `Object.assign(acc, …)` mutating in place as the
// baseline that `{ ...acc }` is 188-203x slower than at n=500.
//
// `let` is left as `let` so the diff is one line.

/** @turbocharge */
export function mergeAll(objects: readonly object[]): object {
  let out = {};

  for (const item of objects) {
    Object.assign(out, item);
  }

  return out;
}
