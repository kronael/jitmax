// zod 4.4.3 — https://github.com/colinhacks/zod — MIT
// Copyright (c) 2020 Colin McDonnell
// examples/zod-clean-enum.before.ts with jitmax's fix applied, and nothing
// else. `diff` the two files: the `.filter().map()` pair becomes one loop that
// tests and pushes, which is what the finding's `fix:` line asks for — "do the
// stages in one pass, or one loop".
//
// `Object.entries(obj)` STAYS. The finding named the two stages it named, and
// walking the object with `for…in` instead is a second change nobody asked for
// — this project's own sweep is split on it: fusing `Object.entries(o).map(f)`
// into a for-in walk is worth 3.67-3.76x at n=1000, and fusing
// `Object.keys(o).map(f)` the same way is a PESSIMIZATION at 0.84-1.00x. An
// after half that took the extra step would be measuring a rewrite the tool
// never printed.
//
// The comment inside the predicate moves with the predicate. It is zod's, and
// it still describes the line under it.
//
// WHAT IT WAS WORTH: see the end-to-end table in examples/README.md. The rule
// cites 1.44-1.52x for map-then-filter in a microbenchmark — it headlined
// 6.48x and 6.58x and 7.51x until rule 13 withdrew the n=1000 cell those three
// sweeps could not agree on; what a caller of this function gets is in
// `bench/example.jl`, at the two enum sizes a caller actually has.

export type EnumValue = string | number; // | bigint | boolean | symbol;

/** @jitmax */
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
