// The annotation sits on the overload SIGNATURE, which is where JSDoc for an
// overload set conventionally goes. The signature has no body, so the walk had
// nothing to walk and the run printed "every annotated function is clean" at
// exit 0 over this implementation (BUGS TC-124). The mark binds to the
// implementation now, and the spread below is found.

/** @jitmax */
export function grow(rows: number[]): number[];
export function grow(rows: number[]): number[] {
  let acc: number[] = [];
  for (const r of rows) acc = [...acc, r];
  return acc;
}
