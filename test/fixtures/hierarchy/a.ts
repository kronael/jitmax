// TC-104's repro, the half that was silent: six classes with a virtual call in
// a loop, and an array in the same file holding one of each. The element type
// is not a union, so the rule counted zero shapes and the classes passed.
abstract class Base {
  abstract kind(): number;
}
class K1 extends Base { a = 1; kind() { return this.a; } }
class K2 extends Base { b = 2; kind() { return this.b; } }
class K3 extends Base { c = 3; kind() { return this.c; } }
class K4 extends Base { d = 4; kind() { return this.d; } }
class K5 extends Base { e = 5; kind() { return this.e; } }
class K6 extends Base { f = 6; kind() { return this.f; } }

/** @jitmax */
export function sumClasses(rows: Base[]): number {
  let s = 0;
  for (const r of rows) s += r.kind();
  return s;
}
export const all: Base[] = [new K1(), new K2(), new K3(), new K4(), new K5(), new K6()];

// Where the walk sees every origin it knows better than the hierarchy: one
// subclass reaches this array, whatever the program builds elsewhere.
/** @jitmax */
export function sumOne(rows: Base[]): number {
  let s = 0;
  for (const r of rows) s += r.kind();
  return s;
}
export const one = sumOne([new K1(), new K1()]);

/** @jitmax */
export function sumBuilt(rows: Base[]): number {
  let s = 0;
  for (const r of rows) s += r.kind();
  return s;
}
export const built = sumBuilt([new K1(), new K2(), new K3(), new K4(), new K5(), new K6()]);

/** @jitmax */
export function sumDeclared(rows: (K1 | K2 | K3 | K4 | K5 | K6)[]): number {
  let s = 0;
  for (const r of rows) s += r.kind();
  return s;
}
