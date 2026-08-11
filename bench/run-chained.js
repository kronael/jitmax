// The benchmark behind the chained-allocation rule.
//   node bench/run-chained.js
// Writes bench/chained.jsonl (aggregate + raw per-pair observations).

import fs from 'node:fs';
import path from 'node:path';
import { cellOrVoid, workload } from './driver.js';

const script = workload('chained.js');
// Appended synchronously, one row per cell. The sweep body blocks the
// event loop in execFileSync, so a stream's async open never fires and
// every row would sit in memory until the run ends — losing the whole
// sweep if it is interrupted.
const outPath = path.join(import.meta.dirname, 'chained.jsonl');

for (const mode of ['excl', 'incl']) {
  for (const n of [1000, 100000]) {
    const r = cellOrVoid({ script, baseline: 'fused', variant: 'chained', n, mode });
    fs.appendFileSync(outPath, JSON.stringify(r) + '\n');
    if (r.void) {
      process.stdout.write(`${r.mode} n=${String(r.n).padEnd(6)} VOID  ${r.error}\n`);
      continue;
    }
    const rej = r.lo <= 1 && r.hi >= 1 ? ' REJ' : '';
    process.stdout.write(
      `${r.mode} n=${String(r.n).padEnd(6)} ${r.variant}: ` +
        `${r.ratio.toFixed(2)}x  CI ${r.lo.toFixed(2)}-${r.hi.toFixed(2)}${rej}\n`
    );
  }
}
