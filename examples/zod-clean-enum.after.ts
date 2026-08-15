// zod 4.4.3 — https://github.com/colinhacks/zod — MIT
// Copyright (c) 2020 Colin McDonnell
// examples/zod-clean-enum.before.ts with turbocharge's fix applied, and nothing
// else. `diff` the two files: the `.filter().map()` pair becomes one loop that
// tests and pushes, which is what the finding's `fix:` line asks for — "do the
// stages in one pass, or one loop".
//
// `Object.entries(obj)` STAYS. The finding named the two stages it named, and
// walking the object with `for…in` instead is a second change nobody asked for
// — this project's own sweep is split on it: fusing `Object.entries(o).map(f)`
// into a for-in walk is worth 3.59x, and fusing `Object.keys(o).map(f)` the
// same way is a PESSIMIZATION at 0.94x. An after half that took the extra step
// would be measuring a rewrite the tool never printed.
//
// The comment inside the predicate moves with the predicate. It is zod's, and
// it still describes the line under it.
//
// WHAT IT WAS WORTH: see README's end-to-end table. The rule cites 7.89x for
// map-then-filter at n=1000 in a microbenchmark; what a caller of this function
// gets is in `bench/example.jl`, at the two enum sizes a caller actually has.

export type EnumValue = string | number; // | bigint | boolean | symbol;

/** @turbocharge */
export function cleanEnum(obj: Record<string, EnumValue>): EnumValue[] {
  const out: EnumValue[] = [];
  for (const el of Object.entries(obj)) {
    // return true if NaN, meaning it's not a number, thus a string key
    if (Number.isNaN(Number.parseInt(el[0], 10))) {
      out.push(el[1]);
    }
  }
  return out;
}
