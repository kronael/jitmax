// closed-world fires here, and that is the rule working as measured rather
// than a bug. Its sweep measures a readable callee padded past V8's inlining
// budget; its trigger is a callee with no readable body, at any size. The two
// are different programs (BUGS TC-33), and this fixture is the size end of
// that gap.
import { inc } from './dep.d.ts';

/** @jitmax */
export function total(rows: number[]): number {
  let s = 0;
  for (const r of rows) s += inc(r);
  return s;
}
