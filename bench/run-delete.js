// The measurement `delete-property` should have shipped with. Its 28-67x came
// from an ad-hoc probe in `options.md` with no pairing, no interval, no rep
// count and no data file (BUGS TC-15); this runner produces all four.
//   node bench/run-delete.js
// APPENDS to bench/delete.jl. Nothing is overwritten.
//
// Every cell is run three times, whole, per SPEC §4 rule 13: the bootstrap
// interval resamples the twenty pairs of ONE sweep and is blind to anything
// that varies between two sweeps. Agreement is a ratio common to all three
// intervals; where there is none the cell is withdrawn as unreplicable and the
// three numbers are printed anyway.
//
// The cells are chosen to separate the two populations the old probe measured
// and could not reconcile:
//
//   rowdel/rowbase    n objects, one delete each. The probe read 28-67x.
//   shdel/shbase      ONE object, one delete, the same kernel over an array of
//                     n references to it. The probe read 0x, with the
//                     dictionary object up to 10% FASTER — and the rule fires
//                     on this case regardless, which is TC-9.
//   rowundef/rowbase  the rule's own named fix (`o.tmp = undefined`) against
//                     never building the property. A control: if this is not
//                     ~1.0x the rule is recommending a cost.
//   rowdel/rowundef   the delete against that fix, which is the comparison a
//                     developer following the finding actually faces.
//
// Three sizes span L1 to RAM (SPEC §4 rule 12), and both halves — reads only
// and with construction — because measuring one half has reversed a verdict
// twice.

import fs from 'node:fs';
import path from 'node:path';
import { replicate, replicates, workload } from './driver.js';

const script = workload('delete.js');
// Appended synchronously, one row per sweep. The run blocks the event loop in
// execFileSync, so a stream's async open never fires and every row would sit in
// memory until the end — losing the whole run if it is interrupted (TC-6).
const outPath = path.join(import.meta.dirname, 'delete.jl');

const WIDE = [256, 16384, 262144];
const MID = [16384];

const CELLS = [
  { baseline: 'rowbase', variant: 'rowdel', sizes: WIDE },
  { baseline: 'shbase', variant: 'shdel', sizes: WIDE },
  { baseline: 'rowbase', variant: 'rowundef', sizes: MID },
  { baseline: 'rowundef', variant: 'rowdel', sizes: MID },
];

for (const { baseline, variant, sizes } of CELLS) {
  for (const mode of ['excl', 'incl']) {
    for (const n of sizes) {
      const label = `${mode.padEnd(4)} n=${String(n).padEnd(6)} ${variant}/${baseline}`;
      const runs = replicate({ script, baseline, variant, n, mode }, (r) => {
        fs.appendFileSync(
          outPath,
          JSON.stringify({ ...r, baseline, kernel: 'dispatch-table' }) + '\n'
        );
        if (r.void) {
          process.stdout.write(`${label} #${r.replicate}: VOID  ${r.error}\n`);
          return;
        }
        const rej = r.lo <= 1 && r.hi >= 1 ? ' REJ' : '';
        process.stdout.write(
          `${label} #${r.replicate}: ${r.ratio.toFixed(2)}x  ` +
            `CI ${r.lo.toFixed(2)}-${r.hi.toFixed(2)}${rej}  ` +
            `reps ${r.repsBase}/${r.repsTest}  region ${r.msBase}/${r.msTest} ms\n`
        );
      });
      const shown = runs.map((r) => (r.void ? 'VOID' : `${r.ratio.toFixed(2)}x`)).join(' ');
      process.stdout.write(
        `${label} => ${replicates(runs) ? 'REPLICATES' : 'DISAGREES'}  ${shown}\n\n`
      );
    }
  }
}
