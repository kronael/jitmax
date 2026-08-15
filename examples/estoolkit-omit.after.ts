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
// function. What is left is "build the object without it", and the finding now
// says where that branch stops paying — 12 keys and not 48 — because of what
// was measured here (BUGS TC-16).
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
//
// WHAT IT WAS WORTH. The whole call is 1.64-1.79x faster on a 12-key record and
// 3.24-3.36x on a 48-key one. The caller's reads on the result are 10.95-11.86x
// faster at 12 keys — the rule's 12.6-17.1x, landing almost intact in a real
// function, because this is exactly the load the rule is about.
//
// At 48 keys that read advantage is GONE: 0.94-1.02x, an interval spanning 1.0
// in all three sweeps, so the cell is rejected. `%HasFastProperties` says why —
// false on both sides. Building a 46-key object one key at a time normalizes it
// too, so the fix stops fixing the read somewhere between 12 keys and 48. The
// rule still cannot see the width — it says it instead.

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
