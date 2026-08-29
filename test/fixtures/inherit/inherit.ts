// An implicit constructor is not an empty one. `Child` declares none, so `new
// Child(o)` runs `Base`'s constructor and every field initializer — and the
// walk used to treat a class with no constructor member as nothing to follow,
// so the `delete` in the base passed as a clean run.
class Base {
  constructor(o: Record<string, number>) {
    delete o.k;
  }
}

class Child extends Base {}

class WithField {
  rows = [1, 2, 3].map((r) => r * 2).filter((r) => r > 2);
}

/** @jitmax */
export function fromBase(o: Record<string, number>): Base {
  return new Child(o);
}

/** @jitmax */
export function fromField(): WithField {
  return new WithField();
}
