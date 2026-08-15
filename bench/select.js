// Workload for allocating-select: keeping a running minimum of boxed values.
//
//   compare — if (v.lt(b.lo)) b.lo = v     compares, and stores only on a new
//                                          minimum, which after the first item
//                                          almost never happens
//   select  — b.lo = Box.min(b.lo, v)      a fresh Box on every item, including
//                                          every pass where the incumbent wins
//
// The mode decides whether that new Box escapes, which is the whole question of
// whether TurboFan can delete the allocation:
//
//   heap   — the minimum lives in a long-lived object, so it escapes
//   local  — the minimum is a function local the caller never sees
//   number — the same two loops on plain numbers: `Math.min` against `<`. This
//            is the cell that says where the rule must stay quiet.
//
// Both variants scan the same partition of the same values and return the same
// sum of minima; the checksum is compared inside every pair.
//
//   node bench/select.js <compare|select> <n> <heap|local|number> <reps> <seed>

import { args, emit, lcg } from './kernel.js';

const { variant, n, mode, reps, seed } = args();

const rand = lcg(seed);

// A boxed number with a comparison and an allocating selector: decimal.js,
// Big.js, Temporal and every other immutable value type have this pair.
class Box {
  constructor(v) {
    this.v = v;
  }
  lt(o) {
    return this.v < o.v;
  }
  static min(a, b) {
    return new Box(a.v <= b.v ? a.v : b.v);
  }
}

const BUCKETS = 32;
const MASK = BUCKETS - 1;

// Rising values, the shape of anything keyed by time: within a bucket the first
// item is the minimum and nothing later displaces it.
const items = new Array(n);
for (let i = 0; i < n; i++) items[i] = new Box(i + rand() * 10);

function scanHeap() {
  const buckets = new Array(BUCKETS);
  for (let b = 0; b < BUCKETS; b++) buckets[b] = { lo: items[b] };
  if (variant === 'select') {
    for (let i = 0; i < n; i++) {
      const b = buckets[i & MASK];
      b.lo = Box.min(b.lo, items[i]);
    }
  } else {
    for (let i = 0; i < n; i++) {
      const b = buckets[i & MASK];
      const it = items[i];
      if (it.lt(b.lo)) b.lo = it;
    }
  }
  let t = 0;
  for (let b = 0; b < BUCKETS; b++) t += buckets[b].lo.v;
  return t;
}

function minOf(b) {
  let lo = items[b];
  if (variant === 'select') {
    for (let i = b; i < n; i += BUCKETS) lo = Box.min(lo, items[i]);
  } else {
    for (let i = b; i < n; i += BUCKETS) {
      const it = items[i];
      if (it.lt(lo)) lo = it;
    }
  }
  return lo.v;
}

function scanLocal() {
  let t = 0;
  for (let b = 0; b < BUCKETS; b++) t += minOf(b);
  return t;
}

// The same two loops with nothing boxed. Math.min on numbers allocates nothing
// and TurboFan lowers it to a machine instruction, so the branch has nothing
// left to save.
function scanNumber() {
  const buckets = new Array(BUCKETS);
  for (let b = 0; b < BUCKETS; b++) buckets[b] = { lo: items[b].v };
  if (variant === 'select') {
    for (let i = 0; i < n; i++) {
      const b = buckets[i & MASK];
      b.lo = Math.min(b.lo, items[i].v);
    }
  } else {
    for (let i = 0; i < n; i++) {
      const b = buckets[i & MASK];
      const v = items[i].v;
      if (v < b.lo) b.lo = v;
    }
  }
  let t = 0;
  for (let b = 0; b < BUCKETS; b++) t += buckets[b].lo;
  return t;
}

const run = mode === 'heap' ? scanHeap : mode === 'local' ? scanLocal : scanNumber;

let sink = 0;
for (let w = 0; w < 3; w++) sink += run();
const t0 = process.hrtime.bigint();
for (let i = 0; i < reps; i++) sink += run();
const t1 = process.hrtime.bigint();

emit({ t0, t1, reps, n, checksum: run(), sink });
