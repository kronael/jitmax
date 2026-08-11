// One variant, one process. Never two variants in one process: an in-process
// A/B shares inline caches, and that contamination is what invalidated round 1.
//   node bench/shapes.js <shapes> <n> <excl|incl> <reps> <seed>
'use strict';

const [shapes, n, mode, reps, seed] = [
  +process.argv[2], +process.argv[3], process.argv[4], +process.argv[5], +process.argv[6],
];

function rng(a) {
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Five key orders. Same three fields, same object size, five distinct maps —
// so the only thing that varies across variants is shape count.
const BUILD = [
  (x, y, z) => ({ x, y, z }),
  (x, y, z) => ({ x, z, y }),
  (x, y, z) => ({ y, x, z }),
  (x, y, z) => ({ y, z, x }),
  (x, y, z) => ({ z, x, y }),
];

function build() {
  const r = rng(seed);
  const rows = new Array(n);
  for (let i = 0; i < n; i++) {
    // x and y come off the stream first, so every variant sees identical
    // values at identical indices and the checksums must match.
    const x = r();
    const y = r();
    rows[i] = BUILD[i % shapes](x, y, r());
  }
  return rows;
}

function sweep(rows) {
  let s = 0;
  for (let i = 0; i < rows.length; i++) s += rows[i].x + rows[i].y;
  return s;
}

let sink = 0;
let t0, t1;
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

// One untimed verification pass produces the compared checksum; sink is printed
// so the timed loop cannot be eliminated as dead.
process.stdout.write(
  JSON.stringify({
    ns_per_op: Number(t1 - t0) / (reps * n),
    checksum: sweep(build()).toFixed(6),
    sink: sink > 0,
  })
);
