// The module does not exist, so `Row` reads as `any`: `objectShapes` counts
// nothing, every type-based rule goes quiet, and the run used to print "every
// annotated function is clean" and exit 0. That is the clean-run-that-checked-
// nothing this project throws on in five other places (BUGS TC-51).
import type { Row } from 'no-such-package-anywhere';

/** @jitmax */
export function total(rows: Row[]): number {
  let s = 0;
  for (const r of rows) s += r.x + r.y;
  return s;
}
