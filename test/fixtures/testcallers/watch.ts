// vue's `watch`, cut down (BUGS TC-150). Only `watch.spec.ts` calls
// `anyActive`, with five literals of five shapes; nothing in the program runs
// that test, so nothing visible reaches the receiver. `anyBuilt` is the same
// call with the same five shapes built here, and still fires.
export interface Source {
  some(f: (x: number) => boolean): boolean;
}

/** @jitmax */
export function anyActive(source: Source): boolean {
  return source.some((x) => x > 0);
}

/** @jitmax */
export function anyBuilt(source: Source): boolean {
  return source.some((x) => x > 0);
}

const yes = (): boolean => true;
export const built = [
  anyBuilt({ some: yes, a: 1 }),
  anyBuilt({ some: yes, b: 1 }),
  anyBuilt({ some: yes, c: 1 }),
  anyBuilt({ some: yes, d: 1 }),
  anyBuilt({ some: yes, e: 1 }),
];

// The builder half of BUGS TC-156: five row shapes reach `sumRows`, every one
// of them from the test file.
export interface Row {
  x: number;
}

/** @jitmax */
export function sumRows(rows: Row[]): number {
  let s = 0;
  for (const r of rows) s += r.x;
  return s;
}

// A class this program declares is built when a test builds it, as code
// outside the program would: pixi constructs none of its own filters. `F5` is
// built only in `watch.spec.ts`, and is the fifth shape `applyAll` receives.
export abstract class Filter {
  abstract apply(): number;
}
export class F1 extends Filter { a = 1; apply() { return this.a; } }
export class F2 extends Filter { b = 2; apply() { return this.b; } }
export class F3 extends Filter { c = 3; apply() { return this.c; } }
export class F4 extends Filter { d = 4; apply() { return this.d; } }
export class F5 extends Filter { e = 5; apply() { return this.e; } }
export const filters: Filter[] = [new F1(), new F2(), new F3(), new F4()];

/** @jitmax */
export function applyAll(rows: Filter[]): number {
  let s = 0;
  for (const f of rows) s += f.apply();
  return s;
}
