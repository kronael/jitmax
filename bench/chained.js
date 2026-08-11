// Workload for chained-allocation. Two variants build the identical array:
//   fused    — one loop that maps and filters in the same pass
//   chained  — xs.map(...).filter(...), which allocates a full intermediate
//              array the filter immediately walks and throws away
// The checksum is compared inside every pair, so a variant that builds a
// different array is a failed run rather than a fast one.
//   node bench/chained.js <fused|chained> <n> <mode> <reps> <seed>

const [variant, n, mode, reps, seed] = [
  process.argv[2],
  Number(process.argv[3]),
  process.argv[4],
  Number(process.argv[5]),
  Number(process.argv[6]),
];

let s = seed;
const rand = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

const source = Array.from({ length: n }, () => Math.floor(rand() * 1000));

function build() {
  if (variant === 'chained') {
    return source.map((v) => v * 3 + 1).filter((v) => v % 2 === 0);
  }
  const out = [];
  for (const v of source) {
    const w = v * 3 + 1;
    if (w % 2 === 0) out.push(w);
  }
  return out;
}

const sum = (a) => {
  let t = 0;
  for (const v of a) t += v;
  return t;
};

let sink = 0;
let t0;
let t1;

// 'excl' times the sum over an array built once; 'incl' times construction as
// well. Every rule benchmark runs both halves — measuring one half reversed two
// verdicts in round 2, and that is now rule 11 in SPEC §4.
if (mode === 'excl') {
  const acc = build();
  for (let w = 0; w < 3; w++) sink += sum(acc);
  t0 = process.hrtime.bigint();
  for (let i = 0; i < reps; i++) sink += sum(acc);
  t1 = process.hrtime.bigint();
} else {
  for (let w = 0; w < 3; w++) sink += sum(build());
  t0 = process.hrtime.bigint();
  for (let i = 0; i < reps; i++) sink += sum(build());
  t1 = process.hrtime.bigint();
}

process.stdout.write(
  JSON.stringify({
    ns_per_op: Number(t1 - t0) / (reps * n),
    checksum: sum(build()).toFixed(6),
    sink: sink > 0,
  })
);
