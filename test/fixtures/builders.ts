type Row = { value: number; a: number } | { value: number; b: number } |
  { value: number; c: number } | { value: number; d: number } | { value: number; e: number };

function makeRows(): Row[] {
  return [{ value: 1, a: 1 }, { value: 2, b: 2 }, { value: 3, c: 3 },
    { value: 4, d: 4 }, { value: 5, e: 5 }];
}

/** @jitmax */
function readRows(rows: Row[]): number {
  let sum = 0;
  for (const row of rows) sum += row.value;
  return sum;
}

readRows(makeRows());
