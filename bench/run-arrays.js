// The sweep `boxed-elements` has been citing since it shipped, and which was
// never written. `bench-arrays.md round 2, suite A` promised raw observations
// in a `bench/results.jsonl` that does not exist, from kernels
// (`bench/arrays_kind.js`, `bench/arrays_obj.js`) that do not exist either
// (BUGS TC-14). This runner produces the file.
//   node bench/run-arrays.js
// APPENDS to bench/arrays.jl. Nothing is overwritten.
//
// Every cell is run three times, whole, per SPEC §4 rule 13 — which this rule
// needs more than any other: its published range, 1.45-1.89x, sits inside the
// 1.0-1.7x band SPEC §11 says a single sweep on this harness cannot resolve.
//
//   boxed/double      the claim. PACKED_ELEMENTS against PACKED_DOUBLE_ELEMENTS,
//                     same values, same kernel.
//   unionnum/double   the TRIGGER. The rule fires on the declared type; V8 picks
//                     the elements kind from the values stored, so a
//                     `(number | string)[]` holding only numbers is the same
//                     array as `number[]`. Verified with
//                     `node --allow-natives-syntax bench/arrays.js unionnum 8
//                     kinds 1 1`, which reports PACKED_DOUBLE for both.
//   holey/double      control, published refuted at 0.94-1.09x.
//   f64/double        control, published refuted on reads and ~3x faster to
//                     construct — the one case where measuring only one half
//                     buried a real result.
//
// Both halves and three sizes for the two cells a rule stands on; two sizes for
// the controls, which are re-measurements of published refutations rather than
// the question.

import fs from 'node:fs';
import path from 'node:path';
import { replicate, replicates, workload } from './driver.js';

const script = workload('arrays.js');
// Appended synchronously, one row per sweep — see run-delete.js and TC-6.
const outPath = path.join(import.meta.dirname, 'arrays.jl');

const WIDE = [256, 16384, 262144];
const ENDS = [256, 262144];

const CELLS = [
  { variant: 'boxed', sizes: WIDE },
  { variant: 'unionnum', sizes: WIDE },
  { variant: 'holey', sizes: ENDS },
  { variant: 'f64', sizes: ENDS },
];

for (const { variant, sizes } of CELLS) {
  for (const mode of ['excl', 'incl']) {
    for (const n of sizes) {
      const label = `${mode.padEnd(4)} n=${String(n).padEnd(6)} ${variant}/double`;
      const runs = replicate({ script, baseline: 'double', variant, n, mode }, (r) => {
        fs.appendFileSync(
          outPath,
          JSON.stringify({ ...r, baseline: 'double', kernel: 'dispatch-table' }) + '\n'
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
