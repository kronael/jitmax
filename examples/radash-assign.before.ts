// radash 12.1.1 — https://github.com/rayepps/radash — MIT
// Copyright (c) 2022 Ray Epps
// Vendored verbatim from src/object.ts and src/typed.ts at commit 4cab190.
//
// THE FINDING. `node bin/jitmax.ts tmp/demo-real/src` over a radash
// checkout with its collection functions annotated, printed unprompted:
//
//     tmp/demo-real/src/object.ts:274  assign()
//       accumulating-spread
//         tmp/demo-real/src/object.ts:280
//         acc is rebuilt from a copy of itself; every pass copies everything
//         it already holds
//         fix: assign the key on acc instead of rebuilding it — but that
//         fills the result key by key, which normalizes it: its reads
//         measured 0.11-0.12x of the spread-built object's (remeda mergeAll)
//
// The second half of that line is what this example and the remeda one bought
// (BUGS TC-16): the rule used to print "mutate acc in place" with no condition
// on it, and on remeda's `mergeAll` the condition is the whole result.
//
// THE INPUT, which is where a comparison like this is usually cheated: the
// caller is `assign(defaults, options)`, the shape radash's own doc comment
// describes — two configuration objects of the same n keys, numbers, plus one
// nested section, which is the branch that makes `assign` recursive. n = 16 is
// an ordinary options bag and n = 128 a large one. Built in
// examples/workloads.ts, which also holds the read a caller performs on the
// result.
//
// The after half is examples/radash-assign.after.ts, and `diff` between the
// two files is the whole change: `...acc` becomes an assignment to `acc`. The
// outer `{ ...initial, ...override }` is one copy outside any loop, so it is
// not what the rule reported and it is untouched.

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
