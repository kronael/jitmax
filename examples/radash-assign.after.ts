// radash 12.1.1 — https://github.com/rayepps/radash — MIT
// Copyright (c) 2022 Ray Epps
// examples/radash-assign.before.ts with jitmax's fix applied, and nothing
// else. `diff` the two files: the reduce body stops returning a fresh object
// built from a copy of `acc` and assigns the key on `acc` instead, which is
// what the finding's `fix:` line asks for word for word.
//
// The fix line warns that filling an object key by key can normalize it and
// cost the caller's reads (BUGS TC-16). Here it did not: the reads got FASTER,
// 1.57-2.06x over the two sizes. Both halves of that clause are in this
// directory, which is why it is a condition to check and not a rule to apply.
//
// Everything else is left as radash ships it, including the IIFE, the commented
// -out line, and the outer `{ ...initial, ...override }` — that one is a single
// copy outside any loop, so the rule did not report it and improving it here
// would make the comparison a different question.
//
// WHAT IT WAS WORTH. The whole call is 3.22-4.65x faster over the two sizes,
// three sweeps each — the low end on a 16-key config and the high end on a
// 128-key one; examples/README.md prints every sweep and every agreement. The
// caller's reads on the merged object are 1.57-2.06x faster — a second, smaller
// win the rule never claims: `%HaveSameMap` says two results of the shipped
// version do NOT share a map, and two results of this one do, so the shipped
// version leaves the caller's load site polymorphic.
//
// Against the 186-200x that `accumulating-spread` cites for an object spread at
// n=500. The rule is about one line; the function around it allocates, recurses
// and branches, and that is the whole gap.

const isObject = (value: any): value is object => {
  return !!value && value.constructor === Object
}

/** @jitmax */
export const assign = <X extends Record<string | symbol | number, any>>(
  initial: X,
  override: X
): X => {
  if (!initial || !override) return initial ?? override ?? {}

  return Object.entries({ ...initial, ...override }).reduce(
    (acc, [key, value]) => {
      acc[key as keyof X] = (() => {
        if (isObject(initial[key])) return assign(initial[key], value)
        // if (isArray(value)) return value.map(x => assign)
        return value
      })()
      return acc
    },
    {} as X
  )
}
