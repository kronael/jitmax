// Does building a string by appending cost what building an array by copying
// costs? `s = s + x` in a loop is the same syntax accumulating-spread measured
// at 156-2348x for arrays, and the rule already matches `.concat()` by name.
//   node bench/run-strings.js
// Appends to bench/strings.jl (aggregate + raw per-pair observations).

import fs from 'node:fs';
import path from 'node:path';
import { cellOrVoid, workload } from './driver.js';

const script = workload('strings.js');
// Appended synchronously, one row per cell. The sweep body blocks the
// event loop in execFileSync, so a stream's async open never fires and
// every row would sit in memory until the run ends — losing the whole
// sweep if it is interrupted.
const outPath = path.join(import.meta.dirname, 'strings.jl');

// All three forms are measured against the same `joined` baseline — an array
// pushed to once per pass and joined at the end — because all three make the
// same claim: the string is rebuilt from a copy of itself every pass. Three
// sizes two orders of magnitude apart, because a quadratic cost is one that
// GROWS with n and a constant factor is one that does not.
const SIZES = [1000, 10000, 100000];

for (const variant of ['plus', 'pluseq', 'concat']) {
  for (const mode of ['build', 'excl', 'incl']) {
    for (const n of SIZES) {
      const r = cellOrVoid({ script, baseline: 'joined', variant, n, mode });
      fs.appendFileSync(
        outPath,
        JSON.stringify({ ...r, baseline: 'joined', kernel: 'dispatch-table' }) + '\n'
      );
      if (r.void) {
        process.stdout.write(
          `${r.mode.padEnd(5)} n=${String(r.n).padEnd(6)} ${variant}: VOID  ${r.error}\n`
        );
        continue;
      }
      const rej = r.lo <= 1 && r.hi >= 1 ? ' REJ' : '';
      process.stdout.write(
        `${r.mode.padEnd(5)} n=${String(r.n).padEnd(6)} ${r.variant.padEnd(6)}: ` +
          `${r.ratio.toFixed(2)}x  CI ${r.lo.toFixed(2)}-${r.hi.toFixed(2)}${rej}\n`
      );
    }
  }
}
