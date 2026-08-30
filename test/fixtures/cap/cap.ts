// The caller cap. `paramFlow` reads at most 64 call sites of a function, and
// stopping there silently let 64 `go(new A())` hide the 65th `go(new B())`:
// the walk reported ONE implementation, scan.ts followed A as the only body
// that runs, and the run called itself checked (BUGS TC-112).
interface P { m(): number }
class A implements P { m(): number { return 1; } }
class B implements P { m(): number { return 2; } }

/** @jitmax */
export function go(p: P): number {
  return p.m();
}

export function drive(): number {
  let t = 0;
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new A());
  t += go(new B());
  return t;
}
