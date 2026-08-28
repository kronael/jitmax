// One bad line, reached from three annotated functions. It is one finding, not
// three: counting it per reaching caller reports the call-graph fan-in and not
// the work — agent-twitter-client showed 118 errors over 12 distinct lines
// (BUGS TC-62).
function shared(rows: number[]): number[] {
  return rows.map((r) => r * 2).filter((r) => r > 4);
}

/** @jitmax */
export function a(rows: number[]): number {
  return shared(rows).length;
}

/** @jitmax */
export function b(rows: number[]): number {
  return shared(rows)[0] ?? 0;
}

/** @jitmax */
export function c(rows: number[]): number {
  return shared(rows).length + 1;
}
