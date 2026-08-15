// Turn a sweep's raw cells into the ranges a rule may quote, so the EVIDENCE
// strings and the published table are derived from the data instead of read
// off a log by hand.
//   node bench/summarize.js shapes-calibrated.jl

import fs from 'node:fs';
import path from 'node:path';

const file = process.argv[2];
if (!file) throw new Error('usage: node bench/summarize.js <file.jl>');

const rows = fs
  .readFileSync(path.join(import.meta.dirname, file), 'utf8')
  .trim()
  .split('\n')
  .map(JSON.parse);

const voids = rows.filter((r) => r.void);
if (voids.length > 0) {
  process.stdout.write(`VOID cells: ${voids.length}\n`);
  for (const v of voids) process.stdout.write(`  ${v.mode} n=${v.n} ${v.variant}: ${v.error}\n`);
}

const live = rows.filter((r) => !r.void);
const key = (r) => `${r.mode} ${r.shapes ?? r.variant}`;
const groups = new Map();
for (const r of live) {
  const g = groups.get(key(r)) ?? [];
  g.push(r);
  groups.set(key(r), g);
}

for (const [k, g] of groups) {
  const ratios = g.map((r) => r.ratio);
  const rejected = g.filter((r) => r.lo <= 1 && r.hi >= 1).length;
  const lo = Math.min(...ratios);
  const hi = Math.max(...ratios);
  // A cell whose interval spans 1.0 is not a small effect, it is no effect
  // this harness resolved. Quoting its point estimate is the mistake this
  // whole file exists to prevent.
  process.stdout.write(
    `${k.padEnd(12)} ${lo.toFixed(2)}-${hi.toFixed(2)}x  ` +
      `across ${g.length} cells, ${rejected} rejected\n`
  );
}
