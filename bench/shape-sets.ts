// The shape sweep the RULE detects, as opposed to the one `bench/shapes.ts`
// measures. `shapes.js` varies key ORDER: five builders, same three keys, five
// V8 maps — and one TypeScript type, because key order is not part of a type.
// So `megamorphic-elements`, which counts union members, is silent on the exact
// program that sweep prices (BUGS TC-42).
//
// Here the five shapes differ by their key SET, which is what a five-member
// union of object types compiles to and the only thing the rule can see. `x`
// and `y` are first in every builder, so the loaded fields sit at the same
// offset in all five maps and object size is constant: shape COUNT is again the
// only thing that varies, and the map identity is now reachable from the type.
//
//   node bench/shape-sets.ts <shapes> <n> <excl|incl> <reps> <seed>
'use strict';

import { args, emit, mulberry32 as rng } from './kernel.ts';

const { variant, n, mode, reps, seed } = args();
const shapes = Number(variant);

type Row = { x: number; y: number; z?: number; a?: number; b?: number; c?: number; d?: number };

const BUILD: ((x: number, y: number, z: number) => Row)[] = [
  (x, y, z) => ({ x, y, z }),
  (x, y, z) => ({ x, y, a: z }),
  (x, y, z) => ({ x, y, b: z }),
  (x, y, z) => ({ x, y, c: z }),
  (x, y, z) => ({ x, y, d: z }),
];

function build(): Row[] {
  const r = rng(seed);
  const rows: Row[] = new Array(n);
  for (let i = 0; i < n; i++) {
    // x and y come off the stream first, so every variant sees identical
    // values at identical indices and the checksums must match.
    const x = r();
    const y = r();
    rows[i] = BUILD[i % shapes](x, y, r());
  }
  return rows;
}

function sweep(rows: Row[]): number {
  let s = 0;
  for (let i = 0; i < rows.length; i++) s += rows[i].x + rows[i].y;
  return s;
}

let sink = 0;
let t0: bigint, t1: bigint;
if (mode === 'excl') {
  const rows = build();
  for (let w = 0; w < 3; w++) sink += sweep(rows);
  t0 = process.hrtime.bigint();
  for (let i = 0; i < reps; i++) sink += sweep(rows);
  t1 = process.hrtime.bigint();
} else {
  for (let w = 0; w < 3; w++) sink += sweep(build());
  t0 = process.hrtime.bigint();
  for (let i = 0; i < reps; i++) sink += sweep(build());
  t1 = process.hrtime.bigint();
}

emit({ t0, t1, reps, n, checksum: sweep(build()), sink });
