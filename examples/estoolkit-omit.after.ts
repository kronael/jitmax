// es-toolkit 1.50.0 — https://github.com/toss/es-toolkit — MIT
// Copyright (c) 2024 Viva Republica, Inc
// examples/estoolkit-omit.before.ts with turbocharge's fix applied, and nothing
// else.
//
// The finding offers two fixes and only one of them is available here. "Assign
// undefined" leaves the key present — `'password' in result` stays true and
// `Object.keys` still lists it — so it does not compute what `omit` computes,
// and the driver's per-pair checksum would throw rather than report a speedup.
// That is the honest half of this example: the cheap fix is not a fix for this
// function. What is left is "build the object without the property".
//
// The membership test is a linear scan over `keys`, not a Set, on purpose. A
// Set would take the loop from O(n·k) to O(n+k), and that is an improvement
// turbocharge did not ask for; with the two keys a caller actually passes it
// would also be invisible. The rule of this comparison is that the after half
// contains the fix and nothing besides.
//
// One behavioural difference, stated rather than hidden: `{ ...obj }` copies
// own enumerable SYMBOL keys and `Object.keys` does not. The input has none,
// and examples/workloads.ts checksums over `Reflect.ownKeys` so that a dropped
// symbol would void the cell instead of reading as a speedup.

/** @turbocharge */
export function omit<T extends Record<string, any>, K extends keyof T>(obj: T, keys: readonly K[]): Omit<T, K> {
  const result: Record<string, any> = {};

  for (const key of Object.keys(obj)) {
    let omitted = false;
    for (let i = 0; i < keys.length; i++) {
      if (keys[i] === key) {
        omitted = true;
        break;
      }
    }
    if (!omitted) {
      result[key] = obj[key];
    }
  }

  return result as Omit<T, K>;
}
