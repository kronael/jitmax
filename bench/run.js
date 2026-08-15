// The 24-cell object-shape sweep behind megamorphic-elements.
//   node bench/run.js
// Writes bench/shapes-calibrated.jl.
//
// This file used to carry its own copy of the protocol, with the single cold
// calibration probe that BUGS TC-5 showed inflates ratios toward shipping a
// rule. It now runs on bench/driver.js like every other sweep, so there is one
// protocol and one place to fix it. The two earlier sweeps stay on disk under
// their own names: they were measured by the old method and are not comparable
// cell-for-cell with this one.

import fs from 'node:fs';
import path from 'node:path';
import { cellOrVoid, workload } from './driver.js';

const script = workload('shapes.js');
const SIZES = { L1: 256, L2: 16384, L3: 262144 }; // n rows; payload = 16n bytes
// Appended synchronously, one row per cell. The sweep body blocks the
// event loop in execFileSync, so a stream's async open never fires and
// every row would sit in memory until the run ends — losing the whole
// sweep if it is interrupted.
const outPath = path.join(import.meta.dirname, 'shapes-calibrated.jl');

for (const mode of ['excl', 'incl']) {
  for (const [size, n] of Object.entries(SIZES)) {
    for (const shapes of [2, 3, 4, 5]) {
      const r = cellOrVoid({ script, baseline: '1', variant: String(shapes), n, mode });
      // `shapes` and `size` are the names this sweep has always published, and
      // bench/meme.js reads them.
      const row = { ...r, shapes, size };
      fs.appendFileSync(outPath, JSON.stringify(row) + '\n');
      if (r.void) {
        process.stdout.write(`${mode} ${size.padEnd(3)} ${shapes} shapes: VOID  ${r.error}\n`);
        continue;
      }
      const rej = r.lo <= 1 && r.hi >= 1 ? ' REJ' : '';
      process.stdout.write(
        `${mode} ${size.padEnd(3)} ${shapes} shapes: ` +
          `${r.ratio.toFixed(2)}x  CI ${r.lo.toFixed(2)}-${r.hi.toFixed(2)}${rej}\n`
      );
    }
  }
}
