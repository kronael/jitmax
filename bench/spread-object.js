// Workload for the object form of accumulating spread. Same mechanism as the
// array form, different constant, so it needs its own measurement before any
// rule may fire on it.
//
//   assign       — acc[k] = v                              O(n)
//   spread       — acc = { ...acc, [k]: v }                O(n squared), every
//                                                          pass copies the keys
//                                                          already there
//   assign-copy  — acc = Object.assign({}, acc, {[k]: v})  O(n squared), the
//                                                          same copy written as
//                                                          a call
//
// All three build the identical object; the checksum is the sum of its values
// and is compared inside every pair.
//
//   node bench/spread-object.js <assign|spread|assign-copy> <n> <mode> <reps> <seed>

const [variant, n, mode, reps, seed] = [
  process.argv[2],
  Number(process.argv[3]),
  process.argv[4],
  Number(process.argv[5]),
  Number(process.argv[6]),
];

let s = seed;
const rand = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

const keys = Array.from({ length: n }, (_, i) => `k${i}`);
const values = Array.from({ length: n }, () => Math.floor(rand() * 1000));

function build() {
  let acc = {};
  if (variant === 'spread') {
    for (let i = 0; i < n; i++) acc = { ...acc, [keys[i]]: values[i] };
  } else if (variant === 'assign-copy') {
    for (let i = 0; i < n; i++) acc = Object.assign({}, acc, { [keys[i]]: values[i] });
  } else {
    for (let i = 0; i < n; i++) acc[keys[i]] = values[i];
  }
  return acc;
}

const total = (o) => {
  let t = 0;
  for (const k in o) t += o[k];
  return t;
};

let sink = 0;
let t0;
let t1;

if (mode === 'excl') {
  const acc = build();
  for (let w = 0; w < 3; w++) sink += total(acc);
  t0 = process.hrtime.bigint();
  for (let i = 0; i < reps; i++) sink += total(acc);
  t1 = process.hrtime.bigint();
} else {
  for (let w = 0; w < 3; w++) sink += total(build());
  t0 = process.hrtime.bigint();
  for (let i = 0; i < reps; i++) sink += total(build());
  t1 = process.hrtime.bigint();
}

process.stdout.write(
  JSON.stringify({
    ns_per_op: Number(t1 - t0) / (reps * n),
    checksum: total(build()).toFixed(6),
    sink: sink > 0,
  })
);
