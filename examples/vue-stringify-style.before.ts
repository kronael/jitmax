// Vue 3.5.41 — https://github.com/vuejs/core — MIT
// Copyright (c) 2018-present, Yuxi (Evan) You and Vue contributors
// Vendored verbatim from packages/shared/src/normalizeProp.ts and
// packages/shared/src/general.ts at commit e2bede9: stringifyStyle, the
// hyphenate it calls, and cacheStringFunction with the four string helpers
// built through it.
// The finding and the annotations that clear it: examples/README.md.

export type NormalizedStyle = Record<string, string | number>

export const isString = (val: unknown): val is string => typeof val === 'string'

const cacheStringFunction = <T extends (str: string) => string>(fn: T): T => {
  const cache: Record<string, string> = Object.create(null)
  return ((str: string) => {
    const hit = cache[str]
    return hit || (cache[str] = fn(str))
  }) as T
}

const camelizeRE = /-\w/g
export const camelize: (str: string) => string = cacheStringFunction(
  (str: string): string => {
    return str.replace(camelizeRE, c => c.slice(1).toUpperCase())
  },
)

const hyphenateRE = /\B([A-Z])/g
export const hyphenate: (str: string) => string = cacheStringFunction(
  (str: string) => str.replace(hyphenateRE, '-$1').toLowerCase(),
)

export const capitalize: <T extends string>(str: T) => Capitalize<T> =
  cacheStringFunction(<T extends string>(str: T) => {
    return (str.charAt(0).toUpperCase() + str.slice(1)) as Capitalize<T>
  })

export const toHandlerKey: <T extends string>(
  str: T,
) => T extends '' ? '' : `on${Capitalize<T>}` = cacheStringFunction(
  <T extends string>(str: T) => {
    const s = str ? `on${capitalize(str)}` : ``
    return s as T extends '' ? '' : `on${Capitalize<T>}`
  },
)

/** @jitmax */
export function stringifyStyle(
  styles: NormalizedStyle | string | undefined,
): string {
  if (!styles) return ''
  if (isString(styles)) return styles

  let ret = ''
  for (const key in styles) {
    const value = styles[key]
    if (isString(value) || typeof value === 'number') {
      const normalizedKey = key.startsWith(`--`) ? key : hyphenate(key)
      // only render valid values
      ret += `${normalizedKey}:${value};`
    }
  }
  return ret
}
