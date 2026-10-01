// One static initializer beside per-call paths. A body a per-call path reaches
// keeps its error whatever else reaches it, within one annotated function and
// across two; an instance field runs on every `new`, as a constructor does; and
// a closure a static initializer builds once runs on every call to it, as
// pixi's `CanvasTextMetrics.graphemeSegmenter` does. Only `Kinds.table` is
// code that runs once (BUGS TC-107).
declare const kinds: string[];
declare const cells: number[];

function kindNames(): string[] {
  return kinds.map((k) => k.toLowerCase()).filter((k) => k !== 'none');
}

class Kinds {
  static names = kindNames();
  static table = (() => cells.map((c) => c * 2).filter((c) => c > 1))();
  static scale = (() => (xs: number[]) => xs.map((x) => x * 2).filter((x) => x > 3))();
  doubled = cells.map((c) => c * 2).filter((c) => c > 2);
}

/** @jitmax */
export function viaStatic(n: number): number {
  return new Kinds().doubled.length + n;
}

/** @jitmax */
export function both(n: number): number {
  return new Kinds().doubled.length + kindNames().length + n;
}
