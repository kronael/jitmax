// TC-104's repro, the half that always reported: six object types in a union,
// one property read. Counting the classes must not cost the union its answer.
type A = { kind: number; a: number };
type B = { kind: number; b: number };
type C = { kind: number; c: number };
type D = { kind: number; d: number };
type E = { kind: number; e: number };
type F = { kind: number; f: number };
type U = A | B | C | D | E | F;

/** @jitmax */
export function sumUnion(rows: U[]): number {
  let s = 0;
  for (const r of rows) s += (r as A).kind;
  return s;
}
