// The benchmark behind the object form of accumulating-spread.
//   node bench/run-spread-object.js
// Writes bench/spread-object.jsonl.

import fs from 'node:fs';
import path from 'node:path';
import { cellOrVoid, workload } from './driver.js';

const script = workload('spread-object.js');
const outPath = path.join(import.meta.dirname, 'spread-object.jsonl');

// Both variants are measured against the same assign baseline: whether the copy
// is written as a spread or as Object.assign, the claim under test is the same.
for (const variant of ['spread', 'assign-copy']) {
  for (const mode of ['excl', 'incl']) {
    for (const n of [500, 2000]) {
      const r = cellOrVoid({ script, baseline: 'assign', variant, n, mode });
      fs.appendFileSync(outPath, JSON.stringify(r) + '\n');
      if (r.void) {
        process.stdout.write(
          `${r.mode} n=${String(r.n).padEnd(5)} ${variant}: VOID  ${r.error}\n`
        );
        continue;
      }
      const rej = r.lo <= 1 && r.hi >= 1 ? ' REJ' : '';
      process.stdout.write(
        `${r.mode} n=${String(r.n).padEnd(5)} ${r.variant}/assign: ` +
          `${r.ratio.toFixed(2)}x  CI ${r.lo.toFixed(2)}-${r.hi.toFixed(2)}${rej}\n`
      );
    }
  }
}
