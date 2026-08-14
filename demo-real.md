# Running turbocharge on somebody else's code

Target: [radash](https://github.com/rayepps/radash), a TypeScript utility
library of about 2,400 lines. Chosen because it is real, popular, generic, and
made almost entirely of array and object pipelines — the shape every rule here
claims to be about.

Eight functions were annotated, picked the way a user would pick them: the ones
that loop over a collection. `group`, `counting`, `objectify`, `select`, `sort`
in `src/array.ts`; `assign`, `mapValues`, `invert` in `src/object.ts`. No
function was chosen to make a rule fire, and none was chosen to keep one quiet.

## First run: eight findings, eight of them noise

```
turbocharge — 8 annotated functions, 8 findings

  tmp/demo-real/src/array.ts:9  group()
    boxed-elements
      array is readonly T[]; its elements cannot stay unboxed
```

Every finding was `boxed-elements`, and every one was wrong for the same reason:
`T` is an unresolved type parameter. The rule asked "is this element type one of
the representations V8 keeps unboxed?", got "it is a type variable", and read
that as *no*. On a generic library that fires on every annotated function.

The correct answer is that a type parameter says nothing about representation.
Absence of evidence is not evidence. Same for `any`, which arrived one fix
later through `Record<string, any>` in `assign`.

## Second run: one finding, still wrong

With type parameters silenced, `assign` still reported a call it claimed it
could not read:

```
    closed-world
      calls (() => {
          if (isObject(initial[key])) return assign(initial[key], value)
          return value
        }), which we have no body for
```

That is an immediately-invoked function. Its body is in the argument list. It
has no symbol for the checker to resolve, so it fell through to the
unreadable-callee branch — a defect introduced by the fix that stopped
unresolvable calls from vanishing silently.

## Third run: silent

```
turbocharge — 8 annotated functions, 0 findings

  every annotated function is clean.
```

Correct, and incomplete. Silence is the right output for seven of these
functions. It is the wrong output for the eighth.

## What it missed

`src/object.ts:274` accumulates with an object spread inside a reduce:

```ts
export const assign = <X extends Record<string | number | symbol, any>>(
  initial: X,
  override: X
): X => {
  return Object.entries(initial).reduce((acc, [key, value]) => {
    return {
      ...acc,
      [key]: /* … */
    }
  }, {} as X)
}
```

This is the quadratic accumulator the project already measured, in object form.
Every pass copies every key already in the accumulator. `accumulating-spread`
detects `[...acc, v]` and does not detect `{ ...acc, [k]: v }`, so it walked
past it.

The array form measured 177x at n=1,000. The object form got its own sweep
rather than an assumption, and needed it: on **reads** the spread-built object
is 30-50x *faster* than the one built by assignment, because assigning keys one
at a time drives the object into dictionary mode. With construction counted it
is **196.60x at n=500 (CI 175-222)**. At n=2,000 the harness refused the cell —
a single build takes 435 ms, so even one repetition overshoots the 120 ms timed
region by more than 2x, and the guard voids it rather than publish it.

## Fourth run

```
turbocharge — 8 annotated functions, 1 finding

  tmp/demo-real/src/object.ts:274  assign()
    accumulating-spread
      tmp/demo-real/src/object.ts:280
      acc is rebuilt from a copy of itself; every pass copies everything it
      already holds
      measured array spread 156-177x at n=1000 and 1877-2348x at n=10000 across
      two sweeps; acc.concat(v) 779x at n=1000 (CI 733-821); object spread
      197-210x at n=500; Object.assign({}, acc, …) 815x at n=500 (CI 769-874)
      fix: mutate acc in place — push, or assign the key — instead of
      rebuilding it
```

One finding, in the one function that has the defect, with a measurement behind
it. That is the output this tool is supposed to produce.

## What the demo was worth

Three false-positive classes and one false negative, none of which the unit
tests caught, all of which appeared within minutes of pointing the tool at code
nobody wrote for it:

| Defect | Cause | Status |
|---|---|---|
| Fires on every generic function | an unresolved type parameter read as "not fast" | fixed |
| Fires on `any` | the same, through `Record<string, any>` | fixed |
| Reports an IIFE as unreadable | no symbol to resolve, body inline | fixed |
| Misses `{ ...acc }` in a reduce | rule only matches array spread | fixed |

The demo directory is not committed. Reproduce with:

```sh
git clone --depth 1 https://github.com/rayepps/radash tmp/demo-real
# annotate the eight functions listed above
node bin/turbocharge.ts tmp/demo-real/src
```
