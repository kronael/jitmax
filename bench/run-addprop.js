// Does adding a property after construction cost anything? The claim is the
// most repeated one in V8 folklore and this project had never tested it.
//   node bench/run-addprop.js
// Appends to bench/addprop.jl (aggregate + raw per-pair observations).
//
// Every variant is paired against the rewrite a rule would demand: the same
// properties, with the same values, written in one object literal. The driver
// compares checksums inside every pair, so a variant that builds a different
// object is a failed run rather than a fast one.
//
// The cells are chosen to separate four things the folklore rolls into one:
//   added / added2   one final map, reached by one or two transitions — the
//                    case most real code is in, and the one most likely to
//                    refute the claim
//   diverge          two paths, two final maps, one load site
//   optmissing       `y?: number` written as two literals
//   optadded         the same two shapes reached by assignment
//   late             the property arrives after the site is already hot,
//                    measured against BOTH the literal (total cost) and the
//                    identical finished objects the site never saw grow
//                    (the stale-map effect on its own)
//   keyed12/16       V8's fast_properties_soft_limit is 12 and only a KEYED
//                    store consults it: 15 keyed adds stay fast, 16 go to
//                    dictionary mode
//   named16          the same field count reached by named stores, which never
//                    normalize — the control that isolates dictionary mode
//                    from the field count

import fs from 'node:fs';
import path from 'node:path';
import { cellOrVoid, workload } from './driver.js';

const script = workload('addprop.js');
// Appended synchronously, one row per cell. The sweep body blocks the event
// loop in execFileSync, so a stream's async open never fires and every row
// would sit in memory until the run ends — losing the whole sweep if it is
// interrupted.
const outPath = path.join(import.meta.dirname, 'addprop.jl');

// Three sizes span L1 to RAM for the three-field families (SPEC §4 rule 12).
// The many-field families stop at 8192 because a seventeen-field object is
// three times the size and the point there is a threshold, not bandwidth.
const WIDE = [256, 16384, 262144];
const NARROW = [256, 16384];
const MANY = [256, 8192];

const CELLS = [
  { baseline: 'literal', variant: 'added', sizes: WIDE, modes: ['build', 'excl', 'incl'] },
  { baseline: 'literal', variant: 'added2', sizes: WIDE, modes: ['build', 'excl', 'incl'] },
  { baseline: 'literal', variant: 'diverge', sizes: WIDE, modes: ['build', 'excl', 'incl'] },
  { baseline: 'optbase', variant: 'optmissing', sizes: NARROW, modes: ['excl', 'incl'] },
  { baseline: 'optbase', variant: 'optadded', sizes: NARROW, modes: ['excl', 'incl'] },
  // late is excl-only: the timing point is a mutation that happens once, so
  // rebuilding it every rep would measure the warm phase instead.
  { baseline: 'latebase', variant: 'late', sizes: WIDE, modes: ['excl'] },
  { baseline: 'latefresh', variant: 'late', sizes: WIDE, modes: ['excl'] },
  { baseline: 'lit12', variant: 'keyed12', sizes: MANY, modes: ['excl', 'incl'] },
  { baseline: 'lit16', variant: 'named16', sizes: MANY, modes: ['excl', 'incl'] },
  { baseline: 'lit16', variant: 'keyed16', sizes: MANY, modes: ['excl', 'incl'] },
];

for (const { baseline, variant, sizes, modes } of CELLS) {
  for (const mode of modes) {
    for (const n of sizes) {
      const r = cellOrVoid({ script, baseline, variant, n, mode });
      fs.appendFileSync(
        outPath,
        JSON.stringify({ ...r, baseline, kernel: 'dispatch-table' }) + '\n'
      );
      const label = `${mode.padEnd(5)} n=${String(n).padEnd(6)} ${variant}/${baseline}`;
      if (r.void) {
        process.stdout.write(`${label.padEnd(38)}: VOID  ${r.error}\n`);
        continue;
      }
      const rej = r.lo <= 1 && r.hi >= 1 ? ' REJ' : '';
      process.stdout.write(
        `${label.padEnd(38)}: ${r.ratio.toFixed(2)}x  CI ${r.lo.toFixed(2)}-${r.hi.toFixed(2)}${rej}\n`
      );
    }
  }
}
