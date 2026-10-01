// The builders that reach an array count as shapes whatever its element type
// says: `Row` is one interface, and five literals with five key sets reach
// `sumRows` through its one visible caller.
interface Row {
  x: number;
}

/** @jitmax */
export function sumRows(rows: Row[]): number {
  let s = 0;
  for (const r of rows) s += r.x;
  return s;
}
const r1 = { x: 1, a: 1 };
const r2 = { x: 2, b: 2 };
const r3 = { x: 3, c: 3 };
const r4 = { x: 4, d: 4 };
const r5 = { x: 5, e: 5 };
export const rowTotal = sumRows([r1, r2, r3, r4, r5]);

// Five classes that agree on their property names are one property set, the
// count every source keeps: nothing static separates them from one class used
// five times.
abstract class Same {
  abstract kind(): number;
}
class S1 extends Same { a = 1; kind() { return this.a; } }
class S2 extends Same { a = 2; kind() { return this.a + 1; } }
class S3 extends Same { a = 3; kind() { return this.a + 2; } }
class S4 extends Same { a = 4; kind() { return this.a + 3; } }
class S5 extends Same { a = 5; kind() { return this.a + 4; } }

/** @jitmax */
export function sumSame(rows: Same[]): number {
  let s = 0;
  for (const r of rows) s += r.kind();
  return s;
}
export const same: Same[] = [new S1(), new S2(), new S3(), new S4(), new S5()];
