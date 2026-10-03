// Workload behind BUGS TC-52. Writing far past the end of a short array is the
// one elements-kind transition this project has never measured, and it is NOT
// the holey case: holey measured 0.93-1.06x here, which is why `delete a[i]`
// was narrowed out of delete-property and why boxed-elements was withdrawn.
// Past V8's ShouldConvertToSlowElements threshold the backing store stops being
// a contiguous array carrying a hole check and becomes a hash table
// (DICTIONARY_ELEMENTS). Different mechanism, different part of V8.
//
//   packed  n values at indices 0..n-1, pushed
//   holey   the same n values in a `new Array(n)`, which is born holey
//   dict    the same n values at indices 0, STRIDE, 2*STRIDE, … — sparse enough
//           that V8 gives up on a contiguous store
//
// All three store the same values and sum them in the same loop. The index is
// `i * stride`, with stride resolved before timing, so the three read loops are
// the same instructions over three different backing stores — the difference
// measured is the store and not the arithmetic.
//
//   node bench/sparse.ts <packed|holey|dict> <n> <mode> <reps> <seed>

import { args, emit, lcg } from './kernel.ts';

const { variant, n, mode, reps, seed } = args();

const rand = lcg(seed);
const values = Array.from({ length: n }, () => Math.floor(rand() * 1000));

// Far enough past the last written index that V8 refuses a contiguous store:
// kMaxGap is 1024 in src/objects/js-objects.h, and this is four times it.
const STRIDE = 4096;
const stride = variant === 'dict' ? STRIDE : 1;

const BUILD: Record<string, (() => number[]) | undefined> = {
  packed: () => {
    const arr: number[] = [];
    for (let i = 0; i < n; i++) arr.push(values[i]);
    return arr;
  },
  holey: () => {
    const arr: number[] = new Array(n);
    for (let i = 0; i < n; i++) arr[i] = values[i];
    return arr;
  },
  dict: () => {
    const arr: number[] = [];
    for (let i = 0; i < n; i++) arr[i * STRIDE] = values[i];
    return arr;
  },
};
const build = BUILD[variant];
if (!build) throw new Error(`unknown variant ${variant}`);

const read = (arr: number[]): number => {
  let t = 0;
  for (let i = 0; i < n; i++) t += arr[i * stride];
  return t;
};

// 'excl' reads a finished array; 'incl' builds it too. Both halves, always —
// the transition costs something to enter and something to live with, and
// measuring one has reversed a verdict twice in this project.
const sweep = mode === 'incl' ? () => read(build()) : ((arr: number[]) => () => read(arr))(build());

const warmups = 3;
let sink = 0;
for (let w = 0; w < warmups; w++) sink += sweep();
const t0 = process.hrtime.bigint();
for (let i = 0; i < reps; i++) sink += sweep();
const t1 = process.hrtime.bigint();

emit({ t0, t1, reps, n, checksum: sweep(), sink, warmups });
