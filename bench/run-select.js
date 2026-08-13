// The benchmark behind allocating-select.
//   node bench/run-select.js
// Writes bench/select.jsonl.

import fs from 'node:fs';
import path from 'node:path';
import { cellOrVoid, workload } from './driver.js';

const script = workload('select.js');
const outPath = path.join(import.meta.dirname, 'select.jsonl');

for (const mode of ['heap', 'local', 'number']) {
  for (const n of [10000, 100000]) {
    const r = cellOrVoid({ script, baseline: 'compare', variant: 'select', n, mode });
    fs.appendFileSync(outPath, JSON.stringify(r) + '\n');
    if (r.void) {
      process.stdout.write(`${r.mode} n=${String(r.n).padEnd(7)} VOID  ${r.error}\n`);
      continue;
    }
    const rej = r.lo <= 1 && r.hi >= 1 ? ' REJ' : '';
    process.stdout.write(
      `${r.mode} n=${String(r.n).padEnd(7)} select/compare: ` +
        `${r.ratio.toFixed(2)}x  CI ${r.lo.toFixed(2)}-${r.hi.toFixed(2)}${rej}\n`
    );
  }
}
