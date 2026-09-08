// What a sweep already has, so one that died at cell 60 of 80 does not start
// again at 1.
//
// It lives beside bench/run.ts rather than inside it because run.ts is a
// script — importing it starts a sweep — and the rule that decides "this cell
// is finished" is the one part of the runner a test has to be able to ask
// about without measuring anything. bench/sweeps.ts was split out of the same
// file for the same reason (BUGS TC-99).

import fs from 'node:fs';
import { RUNNER } from './driver.ts';
import { exceedsGate, frozen } from './env.ts';

// A row as `key` and `done` see it: parsed back off a .jl line, every field
// the runner may have written, nothing guaranteed.
export type JlRow = Record<string, unknown>;

// The identity of a cell inside its `.jl`. Resume compares this, so it has to
// name every field two different cells of the same sweep can differ by.
export const key = (r: JlRow): string =>
  JSON.stringify([r.variant, r.baseline ?? null, r.mode, r.n, r.family ?? null, r.k ?? null,
    r.shapes ?? null, r.example ?? null, r.kernel ?? null]);

// How many runs of each cell this protocol has already written into a file.
// Rows from earlier protocols are not counted: they are the record of what was
// published, and re-measuring them is the point of the exercise.
//
// A row counts when the machine was inside the gate as the row was written.
// Counting every row instead made a cell that recorded three runs, two of them
// over the gate, finished as far as resume was concerned — it could never
// re-measure itself however often the sweep was re-run, and the only way to
// fix one bad cell was to set the whole file aside and sweep all twelve again,
// discarding nine cells of good measurement with the one bad one (BUGS TC-91).
// The gate is checked before a cell and not during it (BUGS TC-74), so a row
// CAN be written over it; counting only in-gate rows is what makes that damage
// self-healing instead of permanent.
//
// Only the MEANINGFUL pair discounts a row: `runnable` against
// `env.maxRunnable`, the count of runnable threads outside the harness. The
// pair the first runner recorded — a one-minute load average dominated by the
// sweep's own children — cannot say whether anything was behind the harness at
// all (TC-25, TC-46), so a row carrying only that one is not evidence of
// contamination and is not re-measured on the strength of it.
export function done(file: string): Map<string, number> {
  const counts = new Map<string, number>();
  if (!fs.existsSync(file)) return counts;
  for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!l) continue;
    const r: JlRow = JSON.parse(l);
    if (r.runner !== RUNNER) continue;
    // A frozen reading is not a run. Such a row claims to say what the machine
    // was doing and answers with one number stamped across an evening, so its
    // cell has never been measured under this protocol — yet counting it made
    // six select.jl cells permanently unmeasurable: three frozen rows each, and
    // the runner skipping them however often the sweep was re-run (TC-134). A
    // row with NO reading is a different case and stays counted, above.
    if (frozen(r as { env?: { load1?: unknown } })) continue;
    const limit = (r.env as { maxRunnable?: number } | undefined)?.maxRunnable;
    const seen = r.runnable as number | undefined;
    if (exceedsGate(seen, limit)) continue;
    const k = key(r);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}
