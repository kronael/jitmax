// The preamble every workload shares. A workload is a kernel plus the three
// things bench/driver.ts requires of it, and those three are here rather than
// copied thirteen times:
//
//   args()   the argv contract the driver spawns against —
//            <script> <variant> <n> <mode> <reps> <seed>
//   the PRNG both sides of a pair draw their values from, seeded by the driver,
//   so identical indices carry identical values and the compared checksum is a
//   real test rather than a formality
//   emit()   the { ns_per_op, checksum, sink } the driver parses back
//
// What is NOT here, and must not move here: the timed region. Each workload
// keeps its own, because what counts as construction and what counts as a read
// is the question that workload exists to ask, and a shared timing harness
// would answer it for all of them at once.

export function args(): { variant: string; n: number; mode: string; reps: number; seed: number } {
  const [variant, n, mode, reps, seed] = process.argv.slice(2);
  return { variant, n: Number(n), mode, reps: Number(reps), seed: Number(seed) };
}

// The LCG glibc ships. Cheap enough that filling an array with it is not the
// measurement, and reproducible from an integer seed.
export function lcg(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

// mulberry32. Better distributed than the LCG in the low bits, which matters
// where the value decides an object's shape rather than just its contents.
export function mulberry32(a: number): () => number {
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One untimed verification pass produces the compared checksum; `sink` is
// printed so the timed loop cannot be eliminated as dead.
export function emit({ t0, t1, reps, n, checksum, sink }:
  { t0: bigint; t1: bigint; reps: number; n: number; checksum: number; sink: number }): void {
  process.stdout.write(
    JSON.stringify({
      ns_per_op: Number(t1 - t0) / (reps * n),
      checksum: checksum.toFixed(6),
      sink: sink > 0,
    })
  );
}
