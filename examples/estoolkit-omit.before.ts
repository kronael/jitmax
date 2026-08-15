// es-toolkit 1.50.0 — https://github.com/toss/es-toolkit — MIT
// Copyright (c) 2024 Viva Republica, Inc
// Vendored verbatim from src/object/omit.ts at commit bec4905.
//
// THE FINDING. es-toolkit was cloned shallow, annotated by the rule in
// examples/annotate.js — every function not nested in another function whose
// body contains a loop or an array-iteration call — and turbocharge was run
// over the result. 286 functions, 288 findings, 267 of them `closed-world` at a
// builtin. Twelve were this one, in twelve different functions; `omit` is the
// one a caller reaches for by name:
//
//     tmp/lib-estoolkit/src/object/omit.ts:18  omit()
//       delete-property
//         tmp/lib-estoolkit/src/object/omit.ts:23
//         delete result[key] puts its object in dictionary mode
//         fix: assign undefined, or build the object without the property
//
// The cost this rule reports is paid by the CALLER, not inside `omit`: once the
// returned object is in dictionary mode, every property load on it costs
// 12.6-17.1x (bench/delete.jl). So the workload has to read the result, and it
// does — see examples/workloads.ts.
//
// THE INPUT: `omit(user, ['password', 'token'])`, the canonical use — strip two
// secrets off a record before it leaves the process. n is the number of keys on
// the record: 12 is a user row and 48 a fat one. Two keys are always the ones
// omitted, because that is what callers pass; the caller then reads four named
// fields off the result.
//
// The after half is examples/estoolkit-omit.after.ts.

/** @turbocharge */
export function omit<T extends Record<string, any>, K extends keyof T>(obj: T, keys: readonly K[]): Omit<T, K> {
  const result = { ...obj };

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    delete result[key];
  }

  return result as Omit<T, K>;
}
