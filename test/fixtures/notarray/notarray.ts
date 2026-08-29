// `map` on a Result runs its callback at most once, so the spread inside it is
// not re-run and `accumulating-spread` must stay out: matching the method NAME
// alone made a run-once callback read as a loop.
interface Res {
  map(f: (x: number) => void): void;
}

/** @jitmax */
export function once(r: Res, seed: number[]): number[] {
  let acc = seed;
  r.map((x) => {
    acc = [...acc, x];
  });
  return acc;
}
