// A static field initializer runs when its class is defined, not on each `new`.
// arrow's `Vector` builds a lookup table in one at module load, and the walk
// charged it as an error to every annotated function that constructs a vector
// (BUGS TC-107). It is a warning, and the finding names the initializer.
declare const kinds: string[];

class Table {
  static names = (() => kinds.map((k) => k.toLowerCase()).filter((k) => k !== 'none'))();
  width: number;
  constructor(width: number) {
    this.width = width;
  }
}

/** @jitmax */
export function widths(rows: number[]): number {
  let s = 0;
  for (const r of rows) s += new Table(r).width;
  return s;
}
