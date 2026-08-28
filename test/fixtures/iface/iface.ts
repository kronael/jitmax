// A callee reached through an interface-typed value. The body is in this
// checkout; the walk cannot tell which implementation runs here. Telling the
// author to inline it would be telling them to undo the abstraction, which is
// why this is its own cause and not "we have no body" (BUGS TC-69).
export interface Field {
  mul(a: number, b: number): number;
}

export const fp: Field = { mul: (a, b) => a * b };

/** @jitmax */
export function scale(Fp: Field, xs: number[]): number {
  let t = 0;
  for (let i = 0; i < xs.length; i++) t += Fp.mul(xs[i]!, 2);
  return t;
}
