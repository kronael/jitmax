// The allocation is the concise body of an arrow: there is no `return`
// statement to find, so `allocating-select` never counted it and stayed silent
// on the exact shape bench/select.jl measured.
class Money {
  constructor(readonly v: number) {}
}

const lower = (a: Money, b: Money): Money => (a.v < b.v ? a : new Money(b.v));

/** @jitmax */
export function lowest(rows: Money[]): Money {
  let best = new Money(Infinity);
  for (const r of rows) best = lower(best, r);
  return best;
}
