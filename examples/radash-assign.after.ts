// radash 12.1.1 — https://github.com/rayepps/radash — MIT
// Copyright (c) 2022 Ray Epps
// examples/radash-assign.before.ts with turbocharge's fix applied, and nothing
// else. `diff` the two files: the reduce body stops returning a fresh object
// built from a copy of `acc` and assigns the key on `acc` instead, which is
// what the finding's `fix:` line asks for word for word.
//
// Everything else is left as radash ships it, including the IIFE, the commented
// -out line, and the outer `{ ...initial, ...override }` — that one is a single
// copy outside any loop, so the rule did not report it and improving it here
// would make the comparison a different question.

const isObject = (value: any): value is object => {
  return !!value && value.constructor === Object
}

/** @turbocharge */
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
