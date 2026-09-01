// remeda 2.0.0 — https://github.com/remeda/remeda — MIT
// Copyright (c) 2018 remeda
// examples/remeda-merge-all.before.ts with jitmax's fix applied, and
// nothing else.
//
// The finding's fix is "assign the key on out instead of rebuilding it".
// `Object.assign(out, item)` assigns exactly the keys
// `{ ...item }` would have spread, own and enumerable, string and symbol,
// so the result is the same object with the same insertion order. The project's
// own evidence names this form as the fix rather than the defect: bench
// /spread-object.jl measures `Object.assign(acc, …)` mutating in place as the
// baseline that `{ ...acc }` is 186-200x slower than at n=500.
//
// `let` is left as `let` so the diff is one line.
//
// WHAT IT WAS WORTH, and this is the result of the whole exercise. Building is
// faster: 1.36-1.38x at n=8 and 18.78-20.87x at n=64. That second cell first
// read 17.34x, 19.34x and 20.10x with no value common to all three intervals,
// which protocol rule 13 refuses; it was re-swept whole and the fresh triple
// does agree. Six sweeps scattered over one range with only the second three
// sharing a value is a cell whose spread outruns its intervals, so
// examples/README.md still lists it as one rule 13 caught rather than as a
// promotion. READING the result is 8x SLOWER, 0.11-0.12x at both sizes and in
// all six sweeps.
//
// The reason is in this file. `%DebugPrint` on the object this version returns
// says `[DictionaryProperties]`; on the object the shipped version returns it
// says `[FastProperties]`. Adding keys one at a time normalizes the object, and
// every later property load on it pays dictionary cost — which is the same
// mechanism `delete-property` fires on, arrived at through the fix for a
// different rule. `accumulating-spread` fixed a quadratic build and said
// nothing about the read it left behind — until this pair. The rule's object
// form now prints that clause, and cites this measurement in it (BUGS TC-16).

/** @jitmax */
export function mergeAll(objects: readonly object[]): object {
  let out = {};

  for (const item of objects) {
    Object.assign(out, item);
  }

  return out;
}
