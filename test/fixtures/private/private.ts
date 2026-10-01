// TC-159's repro and its public twin, one class each. A function held in a
// `#private` field was dispatch nothing could resolve, while the same field
// spelled without `#` was followed — and followed into its initializer alone,
// so a stub a constructor replaces read as the one implementation. Each field
// below is held three ways: an initializer, an initializer the constructor
// replaces, and a constructor write with no initializer. The accumulating
// spread inside a body is how a test sees that the walk read it.
type Collect = (xs: number[]) => number[];

const spread: Collect = (xs) => {
  let acc: number[] = [];
  for (const x of xs) acc = [...acc, x];
  return acc;
};

export class Priv {
  #init: Collect = (xs) => {
    let acc: number[] = [];
    for (const x of xs) acc = [...acc, x];
    return acc;
  };
  #both: Collect = (xs) => xs;
  #late?: Collect;
  constructor(copy: boolean) {
    if (copy) this.#both = spread;
    this.#late = (xs) => {
      let acc: number[] = [];
      for (const x of xs) acc = [...acc, x];
      return acc;
    };
  }
  /** @jitmax */
  privInit(xs: number[]): number[] {
    return this.#init(xs);
  }
  /** @jitmax */
  privBoth(xs: number[]): number[] {
    return this.#both(xs);
  }
  /** @jitmax */
  privLate(xs: number[]): number[] | undefined {
    return this.#late?.(xs);
  }
}

export class Pub {
  init: Collect = (xs) => {
    let acc: number[] = [];
    for (const x of xs) acc = [...acc, x];
    return acc;
  };
  both: Collect = (xs) => xs;
  late?: Collect;
  constructor(copy: boolean) {
    if (copy) this.both = spread;
    this.late = (xs) => {
      let acc: number[] = [];
      for (const x of xs) acc = [...acc, x];
      return acc;
    };
  }
  /** @jitmax */
  pubInit(xs: number[]): number[] {
    return this.init(xs);
  }
  /** @jitmax */
  pubBoth(xs: number[]): number[] {
    return this.both(xs);
  }
  /** @jitmax */
  pubLate(xs: number[]): number[] | undefined {
    return this.late?.(xs);
  }
}

export const built = [new Priv(true), new Pub(true)];
