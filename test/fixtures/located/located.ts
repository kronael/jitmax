// arktype's `stringifyPath`, cut down: a callee that is an option or a default
// (BUGS TC-158). The default is a body the walk locates; the option comes from
// a caller nobody can see. `closed-world` said the located body was readable
// and not walked, which is interface-dispatch's case, and did not walk it. The
// accumulating spread inside is how a test sees that the walk now reads it.
export interface Opts {
  copy?: (xs: number[]) => number[];
}

function spread(xs: number[]): number[] {
  let acc: number[] = [];
  for (const x of xs) acc = [...acc, x];
  return acc;
}

/** @jitmax */
export function copyAll(xs: number[], opts?: Opts): number[] {
  const copy = opts?.copy ?? spread;
  return copy(xs);
}
