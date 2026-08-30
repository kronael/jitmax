// A callee with no body the walk can follow, and a receiver the dataflow walk
// CAN count. `pickOne` is a conditional initializer, so `targetsOf` finds a
// variable and no function; `run` is a method on five classes reached through a
// bodyless declaration. The maps decide the inline cache either way, so the
// count is taken at both and five of them is megamorphic-dispatch's claim, not
// a note about unreadable code (BUGS TC-98).
import { P1, P2, P3, P4, P5 } from './dep.d.ts';

class A { run(): number { return 1; } }
class B { run(): number { return 2; } }
class C { run(): number { return 3; } }
class D { run(): number { return 4; } }
class E { run(): number { return 5; } }
interface Runner { run(): number }
function left(): number { return 1; }
function right(): number { return 2; }
declare const flag: boolean;
const pickOne = flag ? left : right;
function pool(): Runner[] {
  return [new A(), new B(), new C(), new D(), new E()];
}

function ports(): Array<P1 | P2 | P3 | P4 | P5> {
  return [new P1(), new P2(), new P3(), new P4(), new P5()];
}

/** @jitmax */
export function drive(): number {
  let t = pickOne();
  for (const r of pool()) t += r.run();
  for (const p of ports()) t += p.emit();
  return t;
}
