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
//
// WHAT IT WAS WORTH, and this is the result of the whole exercise. Building is
// faster: 1.31-1.36x at n=8, and at n=64 three sweeps read 17.34x, 19.34x and
// 20.10x with no value common to all three intervals, so under SPEC §4 rule 13
// that cell is not a number. READING the result is 8x SLOWER, 0.11-0.12x at
// both sizes and in all six sweeps.
//
// The reason is in this file. `%DebugPrint` on the object this version returns
// says `[DictionaryProperties]`; on the object the shipped version returns it
// says `[FastProperties]`. Adding keys one at a time normalizes the object, and
// every later property load on it pays dictionary cost — which is the same
// mechanism `delete-property` fires on, arrived at through the fix for a
// different rule. `accumulating-spread` fixes a quadratic build and says
// nothing about the read it leaves behind.

/** @turbocharge */
export function mergeAll(objects: readonly object[]): object {
  let out = {};

  for (const item of objects) {
    Object.assign(out, item);
  }

  return out;
}
