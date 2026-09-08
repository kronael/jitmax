// radash 12.1.1 — https://github.com/rayepps/radash — MIT
// Copyright (c) 2022 Ray Epps

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
      Object.defineProperty(acc, key, {
        value: (() => {
          if (isObject(initial[key])) return assign(initial[key], value)
          return value
        })(),
        enumerable: true, writable: true, configurable: true,
      })
      return acc
    },
    {} as X
  )
}
