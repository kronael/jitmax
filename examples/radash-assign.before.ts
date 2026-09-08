// radash 12.1.1 — https://github.com/rayepps/radash — MIT
// Copyright (c) 2022 Ray Epps
// Vendored verbatim from src/object.ts and src/typed.ts at commit 4cab190.
// Measurements and caller inputs: examples/README.md and examples/workloads.ts.

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
      return {
        ...acc,
        [key]: (() => {
          if (isObject(initial[key])) return assign(initial[key], value)
          // if (isArray(value)) return value.map(x => assign)
          return value
        })()
      }
    },
    {} as X
  )
}
