// pixi's container hierarchy, cut down (BUGS TC-156). Four subclasses with four
// property sets are what this program builds; `__tests__/Dummy.ts` declares a
// fifth that only a test constructs, and it is not a shape production code
// sends to `sumKinds`.
export abstract class Base {
  abstract kind(): number;
}
export class P1 extends Base { a = 1; kind() { return this.a; } }
export class P2 extends Base { b = 2; kind() { return this.b; } }
export class P3 extends Base { c = 3; kind() { return this.c; } }
export class P4 extends Base { d = 4; kind() { return this.d; } }

export const built: Base[] = [new P1(), new P2(), new P3(), new P4()];

/** @jitmax */
export function sumKinds(rows: Base[]): number {
  let s = 0;
  for (const r of rows) s += r.kind();
  return s;
}
