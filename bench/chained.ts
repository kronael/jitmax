// Workload for chained-allocation. Six pairings, each measuring a chain
// against a fused single pass that builds the IDENTICAL result:
//   fused   / chained     — xs.map(f).filter(g)
//   scanned / splitjoin   — s.split(',').map(f).join(',')
//   packed  / splitjoin   — the same chain against a weaker fusion
//   walked  / entriesmap  — Object.entries(o).map(f)
//   walked  / keysmap     — Object.keys(o).map(f)
//   sorted  / chainedsort — xs.map(f).sort(c)
// The split chain gets two baselines because there is no way to drop split's
// array without hand-scanning the string, and that scan is a cost of its own.
// `scanned` removes both arrays and builds the result string by appending;
// `packed` keeps join and one array and removes only split's. If neither wins,
// the rewrite the rule would ask for is not an improvement and the rule has no
// business naming these methods.
// The sort pairing is the control. `.sort()` sorts in place and hands back the
// SAME array reference, so xs.map(f).sort(c) allocates exactly one array — the
// same count as the fused loop that pushes and then sorts. If the rule fired
// there it would be claiming an allocation that does not exist, and this pair
// is what says so.
// The checksum is compared inside every pair, so a variant that builds a
// different value is a failed run rather than a fast one.
//   node bench/chained.ts <variant> <n> <mode> <reps> <seed>

import { args, emit, lcg } from './kernel.ts';

const { variant, n, mode, reps, seed } = args();

const FAMILY: Record<string, string | undefined> = {
  fused: 'mapfilter',
  chained: 'mapfilter',
  scanned: 'splitjoin',
  packed: 'splitjoin',
  splitjoin: 'splitjoin',
  walked: 'object',
  entriesmap: 'object',
  keysmap: 'object',
  sorted: 'sort',
  chainedsort: 'sort',
};
const family = FAMILY[variant];
if (!family) throw new Error(`unknown variant ${variant}`);

const rand = lcg(seed);

const nums = () => Array.from({ length: n }, () => Math.floor(rand() * 1000));

// One source per family, built from the same seed on both sides of a pair.
// The declared type is the union over the families; each builder below reads
// it through the member its FAMILY row guarantees, asserted inline because a
// closure cannot see the narrowing and a local copy would put a load in the
// timed region.
let source: number[] | string | Record<string, number>;
if (family === 'splitjoin') {
  source = nums().join(',');
} else if (family === 'object') {
  // Non-index string keys, so entries, keys and for-in all walk them in
  // insertion order and the three builds agree element for element.
  source = {};
  for (let i = 0; i < n; i++) source[`k${i}`] = Math.floor(rand() * 1000);
} else {
  source = nums();
}

const COMMA = 44;

// One function per variant, and the variant is resolved ONCE below. An earlier
// version of this file dispatched on `switch (variant)` inside build(), which
// put a string comparison per rep inside the timed region — and TurboFan
// miscompiled that switch, taking `default` on a value the very next line
// reported as strictly equal to its own case label. It failed on roughly one
// run in four above ~150 reps and never with --no-opt or --no-turbofan.
// Hoisting the lookup out of the timed loop is the right benchmark design on
// its own; that it also steps around the miscompile is the smaller reason.
const BUILD: Record<string, (() => number[] | string) | undefined> = {
  chained: () => (source as number[]).map((v) => v * 3 + 1).filter((v) => v % 2 === 0),

  fused: () => {
    const out: number[] = [];
    for (const v of source as number[]) {
      const w = v * 3 + 1;
      if (w % 2 === 0) out.push(w);
    }
    return out;
  },

  splitjoin: () =>
    (source as string)
      .split(',')
      .map((t) => String(Number(t) * 3 + 1))
      .join(','),

  // One pass over the string. Neither the split array nor the map array
  // exists; the result string is appended to directly.
  scanned: () => {
    let out = '';
    let start = 0;
    for (let i = 0; i <= (source as string).length; i++) {
      if (i === (source as string).length || (source as string).charCodeAt(i) === COMMA) {
        if (start > 0) out += ',';
        out += String(Number((source as string).slice(start, i)) * 3 + 1);
        start = i + 1;
      }
    }
    return out;
  },

  // One pass, one array: split's array never exists, and join still builds the
  // result in one go.
  packed: () => {
    const parts: string[] = [];
    let start = 0;
    for (let i = 0; i <= (source as string).length; i++) {
      if (i === (source as string).length || (source as string).charCodeAt(i) === COMMA) {
        parts.push(String(Number((source as string).slice(start, i)) * 3 + 1));
        start = i + 1;
      }
    }
    return parts.join(',');
  },

  entriesmap: () => Object.entries(source as Record<string, number>).map(([, v]) => v * 3 + 1),

  keysmap: () => Object.keys(source).map((k) => (source as Record<string, number>)[k] * 3 + 1),

  walked: () => {
    const out: number[] = [];
    for (const k in source as Record<string, number>) out.push((source as Record<string, number>)[k] * 3 + 1);
    return out;
  },

  chainedsort: () => (source as number[]).map((v) => v * 3 + 1).sort((a, b) => a - b),

  sorted: () => {
    const out: number[] = [];
    for (const v of source as number[]) out.push(v * 3 + 1);
    out.sort((a, b) => a - b);
    return out;
  },
};

const build = BUILD[variant];
if (!build) throw new Error(`unknown variant ${variant}`);

const sum = (a: number[]): number => {
  let t = 0;
  for (const v of a) t += v;
  return t;
};

// The splitjoin family ends on a string. Walking every character is the read
// that matches sum over an array, and it also forces the appended result out of
// its cons-string representation before the timed region.
const hash = (str: string): number => {
  let t = 0;
  for (let i = 0; i < str.length; i++) t = (t * 31 + str.charCodeAt(i)) % 1000000007;
  return t;
};

const read = (family === 'splitjoin' ? hash : sum) as (v: string | number[]) => number;

const warmups = 3;
let sink = 0;
let t0: bigint;
let t1: bigint;

// 'excl' times the read over a value built once; 'incl' times construction as
// well. Every rule benchmark runs both halves — measuring one half reversed two
// verdicts in round 2, and that is now rule 11 of the protocol.
if (mode === 'excl') {
  const acc = build();
  for (let w = 0; w < warmups; w++) sink += read(acc);
  t0 = process.hrtime.bigint();
  for (let i = 0; i < reps; i++) sink += read(acc);
  t1 = process.hrtime.bigint();
} else {
  for (let w = 0; w < warmups; w++) sink += read(build());
  t0 = process.hrtime.bigint();
  for (let i = 0; i < reps; i++) sink += read(build());
  t1 = process.hrtime.bigint();
}

emit({ t0, t1, reps, n, checksum: read(build()), sink, warmups });
