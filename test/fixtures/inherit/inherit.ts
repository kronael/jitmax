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

// Not a literal array: `[1, 2, 3]` bounds the chain to three elements, below
// the smallest n bench/chained.jl covers, and the rule is right to stay quiet
// on it.
declare const source: number[];

class WithField {
  rows = source.map((r) => r * 2).filter((r) => r > 2);
}

/** @jitmax */
export function fromBase(o: Record<string, number>): Base {
  return new Child(o);
}

/** @jitmax */
export function fromField(): WithField {
  return new WithField();
}
