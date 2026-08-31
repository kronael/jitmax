// Protocol rule 9: publish the environment with the numbers. A row used to
// carry rep counts and timings and nothing about the machine that produced
// them, and the one sweep this project knows was polluted — run at load 12 —
// is recorded nowhere but a sentence in a report. Every row written from here
// on carries what it ran on and what the machine was doing at the time.

import fs from 'node:fs';
import os from 'node:os';
import { PIN_LABEL } from './driver.ts';

export const CORES = os.availableParallelism();

// The gate a sweep refuses to run above, DERIVED rather than chosen: the
// driver pins every observation to core 1, so the other CORES-1 cores are what
// absorbs everything else on the machine — and more runnable threads than that
// means the scheduler has to put something on the pinned core. On a
// single-core machine the gate cannot hold and says so instead of pretending.
//
// What is counted is runnable threads OUTSIDE this harness, right now. The
// gate's first observable was the one-minute load average, and that number is
// dominated by the sweep's own previous minute: the driver runs one pinned
// child at a time, each contributing about 1.0, so a sweep on an otherwise
// idle two-core machine read ~1.5 against a gate of 1 and tripped over itself
// — and when it did not trip, the reading could not say whether anything
// behind the harness was real (TC-25). 601 published rows were written above
// that gate; `make test` holds the register (TC-46). The instantaneous count
// has neither defect: it is only ever read while the harness's children are
// dead — the driver spawns them synchronously — so subtracting this process
// subtracts the whole harness.
//
// It is a model, not a measurement, and the model is stated so it can be
// argued with — here and in CLAUDE.md rather than buried in an `if`. What it
// cannot see is a tenant that is asleep at every sample and wakes inside the
// next cell; the per-row `runnable`, read as each row is written, is where
// that tenant shows up after the fact. `--max-load` overrides the gate and
// whatever value was in force is written into every row.
export const MAX_RUNNABLE = CORES - 1;

export const load1 = (): number => +os.loadavg()[0].toFixed(2);

const sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// One reading: the fourth field of /proc/loadavg is `running/total` scheduling
// entities at this instant, and the reader is running while it reads, so one —
// this process, which is the whole harness whenever this is called — is
// subtracted.
function runnableNow(): number {
  let text: string;
  try {
    text = fs.readFileSync('/proc/loadavg', 'utf8');
  } catch {
    throw new Error(
      'load gate: no /proc/loadavg on this system, so the gate cannot count ' +
        'runnable threads — the protocol has only been argued for Linux'
    );
  }
  const m = / (\d+)\/\d+ /.exec(text);
  if (!m) throw new Error(`load gate: cannot read a runnable count out of "${text.trim()}"`);
  return Math.max(0, Number(m[1]) - 1);
}

// The gate's observable, and the per-row record of it: runnable threads
// outside the harness. Median of five samples 100ms apart, because a single
// instant can catch a kworker mid-wake — and a gate that trips on a blip is a
// sweep that dies at 3am for nothing, while a register that trips on one is a
// failing build nobody contended for.
export function runnable(): number {
  const seen: number[] = [];
  for (let i = 0; i < 5; i++) {
    if (i > 0) sleep(100);
    seen.push(runnableNow());
  }
  return seen.sort((a, b) => a - b)[2];
}

// The environment as it travels in a row. Small on purpose — a row already
// carries forty timings — but every field is one a reader would otherwise have
// to take on trust.
//
// `flags` is the V8 flags the MEASURED children run with, which is the empty
// list: the tier diagnostic's --trace-opt runs in its own processes, after the
// sweep, precisely because protocol rule 8 keeps it out of this one.
//
// What is NOT here is `load1` or `runnable`. A sweep runs for hours and the
// load it started at stops being true within minutes: ten rows were written
// claiming 0.91 while the machine climbed to 4.55, and a recorded environment
// that is false is worse than none. The runner stamps both onto each row as it
// writes it, and `runnableStart` is what the gate let the sweep begin at.
export interface Environment {
  node: string;
  v8: string;
  flags: string;
  pin: string;
  cores: number;
  cpu: string;
  maxRunnable: number;
}

export function environment(maxRunnable: number): Environment {
  return {
    node: process.versions.node,
    v8: process.versions.v8,
    flags: '',
    pin: PIN_LABEL,
    cores: CORES,
    cpu: os.cpus()[0]?.model ?? 'unknown',
    maxRunnable,
  };
}

// Refuse to run above the gate, and say what was seen rather than only that
// something was wrong. `waitFor` seconds of polling is the difference between a
// sweep that dies at 3am and one that starts when the machine is free; a sweep
// that waited is still a sweep that started at a recorded count.
export function gate(
  { maxRunnable, waitFor, log }: { maxRunnable: number; waitFor: number; log: (m: string) => void }
): number {
  if (CORES < 2) {
    throw new Error(
      `load gate: ${CORES} core means the pinned core IS the machine — pass --max-load explicitly`
    );
  }
  const deadline = Date.now() + waitFor * 1000;
  let seen = runnable();
  if (seen <= maxRunnable) return seen;
  log(
    `${seen} runnable outside the harness, above the gate ${maxRunnable} ` +
      `(${CORES} cores, one of them pinned)` +
      (waitFor > 0 ? ` — waiting up to ${waitFor}s for it to fall` : '')
  );
  while (waitFor > 0 && Date.now() < deadline) {
    sleep(15000);
    seen = runnable();
    const left = Math.round((deadline - Date.now()) / 1000);
    log(`  ${seen} runnable${seen <= maxRunnable ? ' — starting' : `, ${left}s left`}`);
    if (seen <= maxRunnable) return seen;
  }
  throw new Error(
    `load gate: ${seen} runnable outside the harness > ${maxRunnable} after waiting ` +
      `${waitFor}s. These are timings and nothing else may run on the machine. Free it, ` +
      `or pass --max-load to state a different number and have it recorded in every row.`
  );
}
