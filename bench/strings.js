// Workload for string building. Four variants build the IDENTICAL string:
//   joined  — parts.push(x) once per pass, then parts.join('') at the end.
//             The baseline: one array, one flat string, O(n).
//   plus    — s = s + x        the syntax the accumulating-spread rule's
//             quadratic array case wears, applied to a string
//   pluseq  — s += x           the same thing the way people write it
//   concat  — s = s.concat(x)  String.prototype.concat — the form
//             accumulating-spread matches BY NAME, with no type behind it
// If V8 copied the accumulator on every pass, as it does for [...acc, v], these
// three would be quadratic and the ratio against `joined` would grow with n.
// The three sizes are the test: a constant ratio is a constant factor, a ratio
// that grows an order of magnitude with n is the copy.
//
// Three modes, because a cons-string moves the cost around rather than removing
// it and one mode cannot see that:
//   build — construction only, consumed by .length, which is O(1) on a
//           cons-string and does NOT flatten it. What appending costs.
//   incl  — construction and then a full scan, which forces the flatten on
//           first access. What appending costs plus what reading it back costs.
//   excl  — repeated scans of a string built once. The warmup already flattened
//           it, so this asks whether the FINISHED value reads differently
//           depending on how it was built. It cannot see the flatten itself:
//           a string flattens once, so paying for it needs a fresh string,
//           and a fresh string is construction. That is `incl` minus `build`.
//
// The checksum is compared inside every pair, so a variant that builds a
// different string is a failed run rather than a fast one.
//   node bench/strings.js <joined|plus|pluseq|concat> <n> <mode> <reps> <seed>

import { args, emit, lcg } from './kernel.js';

const { variant, n, mode, reps, seed } = args();

const rand = lcg(seed);

// Six characters per chunk, so n also sizes the working set: 6 KB, 60 KB and
// 600 KB span L1 to L3, which is §4 rule 12.
const CHUNK = 6;
const source = Array.from({ length: n }, () =>
  String(Math.floor(rand() * 1e6)).padStart(CHUNK, '0')
);

// One function per variant, and the variant is resolved ONCE below. A `switch`
// on the variant inside the timed region put a string comparison in every rep
// and TurboFan miscompiled it — a rule of the repo, and why this is a table.
const BUILD = {
  joined: () => {
    const parts = [];
    for (const v of source) parts.push(v);
    return parts.join('');
  },

  plus: () => {
    let out = '';
    for (const v of source) out = out + v;
    return out;
  },

  pluseq: () => {
    let out = '';
    for (const v of source) out += v;
    return out;
  },

  concat: () => {
    let out = '';
    for (const v of source) out = out.concat(v);
    return out;
  },
};

const build = BUILD[variant];
if (!build) throw new Error(`unknown variant ${variant}`);

// Walking every character is the read that matches summing an array, and it is
// what drags a cons-string into a flat representation.
const hash = (str) => {
  let t = 0;
  for (let i = 0; i < str.length; i++) t = (t * 31 + str.charCodeAt(i)) % 1000000007;
  return t;
};

let sink = 0;
let t0;
let t1;

if (mode === 'excl') {
  const acc = build();
  for (let w = 0; w < 3; w++) sink += hash(acc);
  t0 = process.hrtime.bigint();
  for (let i = 0; i < reps; i++) sink += hash(acc);
  t1 = process.hrtime.bigint();
} else if (mode === 'build') {
  for (let w = 0; w < 3; w++) sink += build().length;
  t0 = process.hrtime.bigint();
  for (let i = 0; i < reps; i++) sink += build().length;
  t1 = process.hrtime.bigint();
} else {
  for (let w = 0; w < 3; w++) sink += hash(build());
  t0 = process.hrtime.bigint();
  for (let i = 0; i < reps; i++) sink += hash(build());
  t1 = process.hrtime.bigint();
}

emit({ t0, t1, reps, n, checksum: hash(build()), sink });
