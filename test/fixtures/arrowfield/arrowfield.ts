// arktype's `traverseApply: TraverseApply = (data, ctx) => {…}`, cut down: an
// annotated arrow function held in a class field (BUGS TC-160). It printed as
// `<anonymous>()`, and its `this` — the instance, as in any arrow in a field
// initializer — read as "`this` outside any method", so the call through the
// field below it was dispatch nothing could resolve. The accumulating spread
// is in the one implementation, so a finding there proves the walk read it.
interface Op {
  run(xs: number[]): number[];
}

class Copy implements Op {
  run(xs: number[]): number[] {
    let acc: number[] = [];
    for (const x of xs) acc = [...acc, x];
    return acc;
  }
}

export class Union {
  op: Op = new Copy();
  /** @jitmax */
  apply = (xs: number[]): number[] => this.op.run(xs);
}

export const union = new Union();
