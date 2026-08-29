// Prose in the tag is prose. Any token starting with a dash used to become a
// disable key, so `--` produced the key `-`, which resolveDisabled rejects, and
// a note written in the annotation crashed the tool with exit 2.
/** @jitmax -- benchmarked 2026-01, keep an eye on it */
export function go(rows: number[]): number {
  return rows.length;
}
