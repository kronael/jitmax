// zod 4.4.3 — https://github.com/colinhacks/zod — MIT
// Copyright (c) 2020 Colin McDonnell
// Vendored verbatim from packages/zod/src/v4/core/util.ts at commit 5e60885,
// with the `EnumValue` alias from the same file (line 168) so the function
// typechecks on its own.
//
// THE FINDING. zod was cloned shallow, annotated by the rule in
// examples/annotate.js — every function not nested in another function whose
// body contains a loop or an array-iteration call — and jitmax was run
// over `packages/zod/src/v4/core`. 78 functions, 96 findings, 8 of them
// `chained-allocation`. This is one:
//
//     tmp/lib-zod/packages/zod/src/v4/core/util.ts:930  cleanEnum()
//       chained-allocation
//         tmp/lib-zod/packages/zod/src/v4/core/util.ts:931
//         .filter() then .map() allocates a whole array between the stages
//         fix: do the stages in one pass, or one loop
//
// This is the fourth rule to get an end-to-end example and the first one whose
// finding is about allocation between stages rather than inside one.
//
// THE INPUT: the object a TypeScript numeric `enum` compiles to. `enum Status
// { Draft, Live }` becomes `{ '0': 'Draft', Draft: 0, '1': 'Live', Live: 1 }` —
// every member twice, once forward and once reverse-mapped — which is the
// reason this function exists at all: it drops the reverse half by testing
// whether the key parses as a number. n is the number of enum members: 16 is an
// ordinary status enum and 256 an enum of country or error codes. Built in
// examples/workloads.ts, which also holds what the caller does with the values.
//
// The after half is examples/zod-clean-enum.after.ts and the diff is the fix
// and nothing else.

export type EnumValue = string | number; // | bigint | boolean | symbol;

/** @jitmax */
export function cleanEnum(obj: Record<string, EnumValue>): EnumValue[] {
  return Object.entries(obj)
    .filter(([k, _]) => {
      // return true if NaN, meaning it's not a number, thus a string key
      return Number.isNaN(Number.parseInt(k, 10));
    })
    .map((el) => el[1]);
}
