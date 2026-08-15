// The megamorphic-dispatch sweep: `x.step()` where x is one of K shapes.
//   node bench/run-dispatch.js
// Appends to bench/dispatch.jl (aggregate + raw per-pair observations).
//
// K = 1 is the baseline of every family and every K from 2 to 6 is reported
// against it, so the cliff — if there is one — has to show up as a step
// between two adjacent cells rather than as one large number with nothing
// either side of it. That is the shape of the evidence `megamorphic-elements`
// already has at a load site, and this asks the same question at a call site.
//
// cls and lit get three working sets and both modes (SPEC §4 rules 11 and 12).
// tgt and shr are controls that split one effect into its two halves — the
// receiver's map and the call target — and they run reads-only at L1 and L2,
// which is where the effect is if it exists at all.

import fs from 'node:fs';
import path from 'node:path';
import { cellOrVoid, workload } from './driver.js';

const script = workload('dispatch.js');
// Appended synchronously, one row per cell. The sweep body blocks the event
// loop in execFileSync, so a stream's async open never fires and every row
// would sit in memory until the run ends — losing the whole sweep if it is
// interrupted.
const outPath = path.join(import.meta.dirname, 'dispatch.jl');

const SIZES = { L1: 256, L2: 16384, L3: 262144 };
const SMALL = { L1: 256, L2: 16384 };

const FAMILIES = [
  { family: 'cls', baseline: 'cls1', sizes: SIZES, modes: ['excl', 'incl'] },
  { family: 'lit', baseline: 'lit1', sizes: SIZES, modes: ['excl', 'incl'] },
  { family: 'tgt', baseline: 'lit1', sizes: SMALL, modes: ['excl'] },
  { family: 'shr', baseline: 'lit1', sizes: SMALL, modes: ['excl'] },
];

for (const { family, baseline, sizes, modes } of FAMILIES) {
  for (const mode of modes) {
    for (const [size, n] of Object.entries(sizes)) {
      for (const k of [2, 3, 4, 5, 6]) {
        const variant = `${family}${k}`;
        const r = cellOrVoid({ script, baseline, variant, n, mode });
        fs.appendFileSync(
          outPath,
          JSON.stringify({ ...r, baseline, family, k, size, kernel: 'dispatch-table' }) + '\n'
        );
        const label = `${mode.padEnd(4)} ${size.padEnd(2)} n=${String(n).padEnd(6)} ${variant}/${baseline}`;
        if (r.void) {
          process.stdout.write(`${label.padEnd(32)}: VOID  ${r.error}\n`);
          continue;
        }
        const rej = r.lo <= 1 && r.hi >= 1 ? ' REJ' : '';
        // The rep count is published with every cell, not just the region:
        // BUGS TC-11 is a cell that met the 120 ms target on a handful of very
        // slow reps and was then decided by one GC pause.
        process.stdout.write(
          `${label.padEnd(32)}: ${r.ratio.toFixed(2)}x  CI ${r.lo.toFixed(2)}-${r.hi.toFixed(2)}` +
            `${rej}  reps ${r.repsBase}/${r.repsTest}\n`
        );
      }
    }
  }
}
