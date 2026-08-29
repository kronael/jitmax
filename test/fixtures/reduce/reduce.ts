// The accumulator of a reduce is re-run per element, so a copy of it per pass
// is the same quadratic build the spread forms make. `reduceRight` was named
// nowhere, and the assigning form was invisible because `reduce` was missing
// from the set of methods whose callback counts as a loop body.
declare const xs: number[];

interface Res {
  reduce(f: (acc: number[], x: number) => number[], seed: number[]): number[];
}

/** @jitmax */
export function assigning(): number[] {
  return xs.reduce((acc: number[], x) => {
    acc = [...acc, x];
    return acc;
  }, []);
}

/** @jitmax */
export function rightward(): number[] {
  return xs.reduceRight((acc: number[], x) => [...acc, x], []);
}

/** @jitmax */
export function runsOnce(r: Res, seed: number[]): number[] {
  return r.reduce((acc, x) => [...acc, x], seed);
}
