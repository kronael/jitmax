import type { Row } from './missing-row.ts';

/** @jitmax */
export function total(rows: Row[]): number {
  let s = 0;
  for (const r of rows) s += r.x + r.y;
  return s;
}
