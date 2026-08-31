// Old published cell against its three replications.
//   node bench/tc11-report.ts
// Reads the .jl files themselves, so it says what is on disk rather than
// what a run printed once: rows carrying `protocol: "replicated"` are the
// re-measurement, rows without it are what was published before TC-11.

import fs from 'node:fs';
import path from 'node:path';
import { replicates } from './driver.ts';

// A row as it comes back off a .jl line: the fields this report reads.
interface JlRow {
  protocol?: string;
  variant: string;
  mode: string;
  n: number;
  replicate?: number;
  void?: boolean;
  error?: string;
  ratio: number;
  lo: number;
  hi: number;
  repsBase: number;
  repsTest: number;
  msBase?: number;
  msTest?: number;
}

const FILES = [
  'shapes-calibrated.jl',
  'spread.jl',
  'spread-object.jl',
  'strings.jl',
  'addprop.jl',
  'dispatch.jl',
];

const key = (r: JlRow) => `${r.variant}|${r.mode}|${r.n}`;
const ci = (r: JlRow) => `${r.ratio.toFixed(2)}x (${r.lo.toFixed(2)}-${r.hi.toFixed(2)})`;

for (const file of FILES) {
  const rows = fs
    .readFileSync(path.join(import.meta.dirname, file), 'utf8')
    .trim()
    .split('\n')
    .map((l): JlRow => JSON.parse(l));

  const groups = new Map<string, JlRow[]>();
  for (const r of rows) {
    if (r.protocol !== 'replicated') continue;
    const g = groups.get(key(r)) ?? [];
    g.push(r);
    groups.set(key(r), g);
  }
  if (groups.size === 0) continue;

  process.stdout.write(`\n### ${file}\n`);
  for (const [k, runs] of groups) {
    const old = rows.filter((r) => r.protocol !== 'replicated' && key(r) === k);
    const ok = replicates(runs);
    process.stdout.write(`\n${k}  ${ok ? 'REPLICATES' : 'DISAGREES'}\n`);
    for (const o of old) {
      process.stdout.write(
        o.void
          ? `  was   VOID  ${o.error}\n`
          : `  was   ${ci(o).padEnd(24)} reps ${o.repsBase}/${o.repsTest}\n`
      );
    }
    for (const r of runs) {
      process.stdout.write(
        r.void
          ? `  #${r.replicate}    VOID  ${r.error}\n`
          : `  #${r.replicate}    ${ci(r).padEnd(24)} reps ${r.repsBase}/${r.repsTest}` +
              `  region ${r.msBase}/${r.msTest} ms\n`
      );
    }
    if (!runs.some((r) => r.void)) {
      const lo = Math.min(...runs.map((r) => r.ratio));
      const hi = Math.max(...runs.map((r) => r.ratio));
      process.stdout.write(`  spread ${lo.toFixed(2)}-${hi.toFixed(2)}x across three sweeps\n`);
    }
  }
}
