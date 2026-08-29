// One disabled line, reached from three annotated functions. It is ONE
// suppressed finding, not three: the suppression line is counted per site like
// the findings above it, and counting it per mark left the call-graph fan-in
// that BUGS TC-62 removed from every other count (BUGS TC-62).
function shared(rows: number[]): number[] {
  return rows.map((r) => r * 2).filter((r) => r > 4);
}

/** @jitmax -chained-allocation */
export function a(rows: number[]): number {
  return shared(rows).length;
}

/** @jitmax -chained-allocation */
export function b(rows: number[]): number {
  return shared(rows).length + 1;
}

/** @jitmax -chained-allocation */
export function c(rows: number[]): number {
  return shared(rows).length + 2;
}
