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
// A function of the core count, not a constant, because a published row
// carries the core count of the machine that wrote it: judging that row means
// asking what the gate WOULD have been there, and a second spelling of
// `cores - 1` in the file that judges is a model with two homes.
export const gateFor = (cores: number): number => cores - 1;
export const MAX_RUNNABLE = gateFor(CORES);

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

// The other half of rule 9, and the ONE place a row's machine state is
// assembled: the reading is taken HERE, as the row is written, and the
// sweep-wide `Environment` beside it may carry no reading at all.
//
// Eighteen rows of bench/select.jl carry `load1: 0.97` inside `env` — one
// observation, stamped identically onto three replicates of each of six cells
// written across an evening — and `lib/derive.ts` has to judge them against a
// number that was already false when the second row was written (TC-24,
// TC-47). The type has excluded a reading since; a type is not present at 2am
// when someone adds a field to the sweep record, so the value is checked too,
// and a run that would write such a row dies rather than writing it.
//
// `runnableStart` is not a reading and passes: it is what the gate let the
// sweep BEGIN at, which is a fact about the sweep and true for its whole life.
// Does a row carry the reading rule 9 asks for, taken as that row was written?
// `reading()` above is the writer's half of the contract; this is the reader's.
// A citation whose sweep has been re-measured asks it, so the rows it publishes
// are rows whose machine state a reader can check. It is NOT the global
// admissibility rule: 689 rows across ten sweeps predate the field entirely and
// withdrawing them is a re-measurement, not a query (BUGS TC-136).
export const hasReading = (r: { load1?: unknown; runnable?: unknown }): boolean =>
  typeof r.load1 === 'number' && typeof r.runnable === 'number';

// The other shape a reading comes in, and the one rule 9 forbids: ONE
// observation stamped into the sweep record and copied onto every row of an
// evening's work. `reading()` above refuses to write another; this recognises
// the ones already written. Eighteen rows of select.jl are the whole of it.
//
// Resume asks this rather than `hasReading`, and the difference matters. A row
// with no reading at all is a row from before the mechanism — not evidence of
// anything, and deliberately still counted as a run. A row with a FROZEN
// reading claims to answer the question and does not, so its cell has never
// been measured under this protocol and resume must not call it finished. It
// did: six select.jl cells were unmeasurable however often the sweep was re-run
// (BUGS TC-24, TC-47, TC-134).
export const frozen = (r: { env?: { load1?: unknown } }): boolean =>
  typeof r.env?.load1 === 'number';

export function reading<E extends Environment>(
  env: E
): { load1: number; runnable: number; env: E } {
  for (const field of ['load1', 'runnable'] as const) {
    if (field in env) {
      throw new Error(
        `bench/env.ts: the sweep environment carries ${field}, which is a reading of the ` +
          'machine and belongs on the row that was written while it held. A frozen reading ' +
          'is worse than none — see BUGS TC-24, TC-47.'
      );
    }
  }
  return { load1: load1(), runnable: runnable(), env };
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
