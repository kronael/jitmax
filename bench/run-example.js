// The end-to-end examples: does doing what turbocharge says make a real
// program faster?
//   node bench/run-example.js
// APPENDS to bench/example.jl. Nothing is overwritten.
//
// The ratio is `before / after`, so a cell above 1.0 is the shipped function
// costing that much more than the fixed one — the same orientation every rule
// benchmark in this repo uses, where the number is what the pattern costs.
//
// Three whole sweeps per cell, per SPEC §4 rule 13, and all three are printed.
// A cell whose interval spans 1.0 is rejected and says REJ; a cell whose three
// sweeps have no value in common says DISAGREES. Both are published exactly as
// they come out, because an example that shows nothing is the more useful half
// of this exercise: these ratios are what a caller gets, and they are far below
// the microbenchmark ratios the rules cite.

import fs from 'node:fs';
import path from 'node:path';
import { replicate, replicates, workload } from './driver.js';

const script = workload('example.js');
// Appended synchronously, one row per sweep — see run-delete.js and TC-6.
const outPath = path.join(import.meta.dirname, 'example.jl');

const CELLS = [
  { example: 'radash-assign', sizes: [16, 128] },
  { example: 'remeda-merge-all', sizes: [8, 64] },
  { example: 'estoolkit-omit', sizes: [12, 48] },
];

for (const { example, sizes } of CELLS) {
  for (const mode of ['excl', 'incl']) {
    for (const n of sizes) {
      const label = `${mode.padEnd(4)} n=${String(n).padEnd(4)} ${example}`;
      const opts = {
        script,
        baseline: `${example}/after`,
        variant: `${example}/before`,
        n,
        mode,
      };
      const runs = replicate(opts, (r) => {
        fs.appendFileSync(
          outPath,
          JSON.stringify({ ...r, example, baseline: `${example}/after` }) + '\n'
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
