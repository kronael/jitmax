// Re-measures exactly the cells BUGS TC-11's audit flagged — the published
// cells that ran on a handful of repetitions, always at the largest n of their
// sweep — and it runs each of them three times.
//   node bench/run-tc11.js
// APPENDS to each sweep's own .jl. Nothing is overwritten: the old rows are
// the record of what was published and they stay, distinguished by the
// `protocol: 'replicated'` and `replicate` fields the new rows carry.
//
// The point is not a longer region. A cell that fits two passes in 120 ms was
// measured for 120 ms, and no threshold on the rep count would be anything but
// a constant nobody measured. The point is that the bootstrap interval is over
// the pairs of ONE sweep and cannot see what varies BETWEEN sweeps — which is
// how three near-identical `addprop` constructions came out at 1.64x, 0.91x and
// 0.89x with intervals that exclude each other. Three sweeps per cell, and the
// spread across them is published next to the interval within one.

import fs from 'node:fs';
import path from 'node:path';
import { replicate, replicates, workload } from './driver.js';

const KERNEL = { kernel: 'dispatch-table' };

// Every group names the file it appends to and the extra fields that file's
// rows have always carried, so a new row is readable by whatever already reads
// the old ones (bench/meme.js reads `shapes` and `size`).
const GROUPS = [
  {
    file: 'shapes-calibrated.jl',
    script: 'shapes.js',
    cells: [2, 3, 4, 5].map((shapes) => ({
      opts: { baseline: '1', variant: String(shapes), n: 262144, mode: 'incl' },
      extra: { shapes, size: 'L3' },
    })),
  },
  {
    file: 'spread.jl',
    script: 'spread.js',
    cells: [{ opts: { baseline: 'push', variant: 'spread', n: 10000, mode: 'incl' }, extra: {} }],
  },
  {
    file: 'spread-object.jl',
    script: 'spread-object.js',
    cells: ['spread', 'assign-copy'].map((variant) => ({
      opts: { baseline: 'assign', variant, n: 500, mode: 'incl' },
      extra: {},
    })),
  },
  {
    file: 'strings.jl',
    script: 'strings.js',
    cells: ['plus', 'pluseq', 'concat'].flatMap((variant) =>
      ['build', 'excl', 'incl'].map((mode) => ({
        opts: { baseline: 'joined', variant, n: 100000, mode },
        extra: { baseline: 'joined', ...KERNEL },
      }))
    ),
  },
  {
    file: 'addprop.jl',
    script: 'addprop.js',
    cells: [
      ...['added', 'added2', 'diverge'].flatMap((variant) =>
        ['build', 'incl'].map((mode) => ({
          opts: { baseline: 'literal', variant, n: 262144, mode },
          extra: { baseline: 'literal', ...KERNEL },
        }))
      ),
      // The one flagged cell that is not at the largest n of its sweep: the
      // dictionary-mode variant is slow enough to reach the region in six
      // passes where its own baseline took seventy-eight.
      {
        opts: { baseline: 'lit16', variant: 'keyed16', n: 8192, mode: 'incl' },
        extra: { baseline: 'lit16', ...KERNEL },
      },
    ],
  },
  {
    file: 'dispatch.jl',
    script: 'dispatch.js',
    cells: [
      ...[2, 3, 4, 5, 6].map((k) => ({
        opts: { baseline: 'cls1', variant: `cls${k}`, n: 262144, mode: 'incl' },
        extra: { baseline: 'cls1', family: 'cls', k, size: 'L3', ...KERNEL },
      })),
      ...[2, 3, 4, 5, 6].map((k) => ({
        opts: { baseline: 'lit1', variant: `lit${k}`, n: 262144, mode: 'incl' },
        extra: { baseline: 'lit1', family: 'lit', k, size: 'L3', ...KERNEL },
      })),
    ],
  },
];

for (const group of GROUPS) {
  const script = workload(group.script);
  const outPath = path.join(import.meta.dirname, group.file);
  for (const { opts, extra } of group.cells) {
    const label = `${group.file} ${opts.mode.padEnd(5)} n=${String(opts.n).padEnd(6)} ${opts.variant}/${opts.baseline}`;
    const runs = replicate({ script, ...opts }, (r) => {
      fs.appendFileSync(outPath, JSON.stringify({ ...r, ...extra }) + '\n');
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
    const ok = replicates(runs);
    const shown = runs.map((r) => (r.void ? 'VOID' : `${r.ratio.toFixed(2)}x`)).join(' ');
    process.stdout.write(`${label} => ${ok ? 'REPLICATES' : 'DISAGREES'}  ${shown}\n\n`);
  }
}
