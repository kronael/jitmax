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
//   node bench/spread-object.ts <assign|spread|assign-copy> <n> <mode> <reps> <seed>

import { args, emit, lcg } from './kernel.ts';

const { variant, n, mode, reps, seed } = args();

const rand = lcg(seed);

const keys = Array.from({ length: n }, (_, i) => `k${i}`);
const values = Array.from({ length: n }, () => Math.floor(rand() * 1000));

function build(): Record<string, number> {
  let acc: Record<string, number> = {};
  if (variant === 'spread') {
    for (let i = 0; i < n; i++) acc = { ...acc, [keys[i]]: values[i] };
  } else if (variant === 'assign-copy') {
    for (let i = 0; i < n; i++) acc = Object.assign({}, acc, { [keys[i]]: values[i] });
  } else {
    for (let i = 0; i < n; i++) acc[keys[i]] = values[i];
  }
  return acc;
}

const total = (o: Record<string, number>): number => {
  let t = 0;
  for (const k in o) t += o[k];
  return t;
};

const warmups = 3;
let sink = 0;
let t0: bigint;
let t1: bigint;

if (mode === 'excl') {
  const acc = build();
  for (let w = 0; w < warmups; w++) sink += total(acc);
  t0 = process.hrtime.bigint();
  for (let i = 0; i < reps; i++) sink += total(acc);
  t1 = process.hrtime.bigint();
} else {
  for (let w = 0; w < warmups; w++) sink += total(build());
  t0 = process.hrtime.bigint();
  for (let i = 0; i < reps; i++) sink += total(build());
  t1 = process.hrtime.bigint();
}

emit({ t0, t1, reps, n, checksum: total(build()), sink, warmups });
