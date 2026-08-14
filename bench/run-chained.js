// The benchmark behind the chained-allocation rule.
//   node bench/run-chained.js
// Appends to bench/chained.jsonl (aggregate + raw per-pair observations).

import fs from 'node:fs';
import path from 'node:path';
import { cellOrVoid, workload } from './driver.js';

const script = workload('chained.js');
// Appended synchronously, one row per cell. The sweep body blocks the
// event loop in execFileSync, so a stream's async open never fires and
// every row would sit in memory until the run ends — losing the whole
// sweep if it is interrupted.
const outPath = path.join(import.meta.dirname, 'chained.jsonl');

// Each row is a chained form and the fused single pass it is measured against.
// The map/filter row keeps the sizes the 0.2 sweep used, so re-running it
// replicates the shipped cell rather than replacing it. The new forms are swept
// an order of magnitude apart at sizes where the region guard can be met.
const CELLS = [
  { baseline: 'fused', variant: 'chained', sizes: [1000, 100000] },
  { baseline: 'scanned', variant: 'splitjoin', sizes: [1000, 10000] },
  { baseline: 'packed', variant: 'splitjoin', sizes: [1000, 10000] },
  { baseline: 'walked', variant: 'entriesmap', sizes: [1000, 10000] },
  { baseline: 'walked', variant: 'keysmap', sizes: [1000, 10000] },
  { baseline: 'sorted', variant: 'chainedsort', sizes: [1000, 10000] },
];

for (const { baseline, variant, sizes } of CELLS) {
  for (const mode of ['excl', 'incl']) {
    for (const n of sizes) {
      const r = cellOrVoid({ script, baseline, variant, n, mode });
      // The rows this sweep appends carry `kernel`. The rows before them that
      // do not are from the switch-dispatched kernel TurboFan miscompiled, and
      // they are void: a mis-dispatch inside the timed loop would corrupt the
      // timing while the final checksum still matched, so those numbers cannot
      // be trusted even where they look reasonable.
      fs.appendFileSync(
        outPath,
        JSON.stringify({ ...r, baseline, kernel: 'dispatch-table' }) + '\n'
      );
      if (r.void) {
        process.stdout.write(
          `${r.mode} n=${String(r.n).padEnd(6)} ${variant}: VOID  ${r.error}\n`
        );
        continue;
      }
      const rej = r.lo <= 1 && r.hi >= 1 ? ' REJ' : '';
      process.stdout.write(
        `${r.mode} n=${String(r.n).padEnd(6)} ${r.variant}: ` +
          `${r.ratio.toFixed(2)}x  CI ${r.lo.toFixed(2)}-${r.hi.toFixed(2)}${rej}\n`
      );
    }
  }
}
