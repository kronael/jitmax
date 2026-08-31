// One variant, one process. Never two variants in one process: an in-process
// A/B shares inline caches, and that contamination is what invalidated round 1.
//   node bench/shapes.ts <shapes> <n> <excl|incl> <reps> <seed>
'use strict';

import { args, emit, mulberry32 as rng } from './kernel.ts';

const { variant, n, mode, reps, seed } = args();
const shapes = Number(variant);

// Five key orders. Same three fields, same object size, five distinct maps —
// so the only thing that varies across variants is shape count.
type Row = { x: number; y: number; z: number };

const BUILD: ((x: number, y: number, z: number) => Row)[] = [
  (x, y, z) => ({ x, y, z }),
  (x, y, z) => ({ x, z, y }),
  (x, y, z) => ({ y, x, z }),
  (x, y, z) => ({ y, z, x }),
  (x, y, z) => ({ z, x, y }),
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
