// A bound only binds what comes AFTER it. `.slice()` at the end of a chain
// slices the RESULT; the stage before it still allocated one element per
// element of the source, which is the allocation this rule exists for.
declare const xs: number[];

/** @jitmax */
export function sliceLast(): number[] {
  return xs.map((x) => x * 2).slice(0, 10);
}

/** @jitmax */
export function sliceFirst(): number[] {
  return xs.slice(0, 10).map((x) => x * 2).filter((x) => x > 2);
}

/** @jitmax */
export function literalSource(): number[] {
  return [1, 2, 3].map((x) => x * 2).filter((x) => x > 2);
}
