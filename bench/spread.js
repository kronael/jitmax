// Workload for accumulating-spread. Three variants build the identical array:
//   push    — acc.push(v)          O(n)
//   spread  — acc = [...acc, v]    O(n squared), because every pass copies
//                                  everything already in acc
//   concat  — acc = acc.concat(v)  O(n squared), the same copy written as a
//                                  call, with the accumulator as the receiver
// The checksum is compared inside every pair, so a variant that builds a
// different array is a failed run rather than a fast one.
//   node bench/spread.js <push|spread|concat> <n> <mode> <reps> <seed>

import { args, emit, lcg } from './kernel.js';

const { variant, n, mode, reps, seed } = args();

const rand = lcg(seed);

const source = Array.from({ length: n }, () => Math.floor(rand() * 1000));

function build() {
  let acc = [];
  if (variant === 'spread') {
    for (const v of source) acc = [...acc, v];
  } else if (variant === 'concat') {
    // concat flattens array arguments; source holds numbers, so each pass
    // appends exactly one element and the result matches push element for
    // element. The pair's checksum comparison is what enforces that.
    for (const v of source) acc = acc.concat(v);
  } else {
    for (const v of source) acc.push(v);
  }
  return acc;
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
// verdicts in round 2, and that is now rule 11 of the protocol.
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

emit({ t0, t1, reps, n, checksum: sum(build()), sink });
