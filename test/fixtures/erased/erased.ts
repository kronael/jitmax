// `p.paint!()` loads `paint` off p's map exactly as `p.paint()` does — the `!`
// is erased before V8 sees anything. lib/flow.ts stripped only parentheses from
// the callee while lib/scan.ts unwrapped it fully, so the two walks named
// different receivers and one token turned a five-map call site into a
// monomorphic one that was followed (BUGS TC-113).
interface Painter { paint(): number }
class A implements Painter { paint(): number { return 1; } }
class B implements Painter { paint(): number { return 2; } }
class C implements Painter { paint(): number { return 3; } }
class D implements Painter { paint(): number { return 4; } }
class E implements Painter { paint(): number { return 5; } }

function pool(): Painter[] {
  return [new A(), new B(), new C(), new D(), new E()];
}

/** @jitmax */
export function run(): number {
  let t = 0;
  for (const p of pool()) t += p.paint!();
  return t;
}
