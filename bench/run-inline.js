// The benchmark behind closed-world.
//   node bench/run-inline.js
// Writes bench/inline.jsonl.
//
// closed-world reports calls the checker cannot see into. It has never carried
// a performance number, because "we could not read this" is a coverage fact,
// not a cost. What CAN be measured is the mechanism a call boundary controls:
// whether V8 inlines the callee. This sweep prices exactly that, and nothing
// else — both variants run identical arithmetic and differ only in whether the
// callee's bytecode fits the inlining budget.
//
// Read the result as an upper bound on what one unchecked call can cost you,
// not as a claim about any particular unchecked call.

import fs from 'node:fs';
import path from 'node:path';
import { cellOrVoid, workload } from './driver.js';

const script = workload('inline.js');
const outPath = path.join(import.meta.dirname, 'inline.jsonl');

// One mode only: there is nothing to construct in this kernel, so an
// 'incl' cell would be the same measurement under a different name.
for (const n of [1000, 100000]) {
  const r = cellOrVoid({ script, baseline: 'small', variant: 'large', n, mode: 'excl' });
  fs.appendFileSync(outPath, JSON.stringify(r) + '\n');
  if (r.void) {
    process.stdout.write(`n=${String(n).padEnd(6)} VOID  ${r.error}\n`);
    continue;
  }
  const rej = r.lo <= 1 && r.hi >= 1 ? ' REJ' : '';
  process.stdout.write(
    `n=${String(n).padEnd(6)} large/small: ` +
      `${r.ratio.toFixed(2)}x  CI ${r.lo.toFixed(2)}-${r.hi.toFixed(2)}${rej}\n`
  );
}
