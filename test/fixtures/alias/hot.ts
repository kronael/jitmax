// `@app/row` matches the `paths` entry in the tsconfig beside this file, and
// nothing is behind it. The specifier is bare, so the report used to offer
// `npm install` — one of two causes, and the wrong one (BUGS TC-80).
import type { Row } from '@app/row';

/** @jitmax */
export function total(rows: Row[]): number {
  let s = 0;
  for (const r of rows) s += r.x + r.y;
  return s;
}
