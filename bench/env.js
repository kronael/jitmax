// Protocol rule 9: publish the environment with the numbers. A row used to
// carry rep counts and timings and nothing about the machine that produced
// them, and the one sweep this project knows was polluted — run at load 12 —
// is recorded nowhere but a sentence in a report. Every row written from here
// on carries what it ran on and what the machine was doing at the time.

import fs from 'node:fs';
import os from 'node:os';

// The pin the driver applies to every observation. Read here as well as in
// driver.js so the row says what actually happened rather than what was
// intended.
export const PIN_AVAILABLE = fs.existsSync('/usr/bin/taskset');

export const CORES = os.availableParallelism();

// The load a sweep refuses to start above, DERIVED rather than chosen: the
// driver pins every observation to core 1, so the other CORES-1 cores are what
// absorbs everything else on the machine. A one-minute load average above that
// means some other runnable process is contending for the pinned core. On a
// single-core machine the gate cannot hold and says so instead of pretending.
//
// It is a model, not a measurement, and the model is stated so it can be
// argued with — which is the whole reason the number is here and in CLAUDE.md
// rather than buried in an `if`. `--max-load` overrides it, and whatever value
// was in force is written into every row.
export const MAX_LOAD = CORES - 1;

export const load1 = () => +os.loadavg()[0].toFixed(2);

// The environment as it travels in a row. Small on purpose — a row already
// carries forty timings — but every field is one a reader would otherwise have
// to take on trust.
//
// `flags` is the V8 flags the MEASURED children run with, which is the empty
// list: the tier diagnostic's --trace-opt runs in its own process precisely
// because protocol rule 8 keeps it out of this one.
export function environment(maxLoad) {
  return {
    node: process.versions.node,
    v8: process.versions.v8,
    flags: '',
    pin: PIN_AVAILABLE ? 'taskset -c 1' : 'none',
    cores: CORES,
    cpu: os.cpus()[0]?.model ?? 'unknown',
    load1: load1(),
    maxLoad,
  };
}

// Refuse to start above the gate, and say what was seen rather than only that
// something was wrong. `waitFor` seconds of polling is the difference between a
// sweep that dies at 3am and one that starts when the machine is free; a sweep
// that waited is still a sweep that started at a recorded load.
export function gate({ maxLoad, waitFor, log }) {
  if (CORES < 2) {
    throw new Error(
      `load gate: ${CORES} core means the pinned core IS the machine — pass --max-load explicitly`
    );
  }
  const deadline = Date.now() + waitFor * 1000;
  let seen = load1();
  if (seen <= maxLoad) return seen;
  log(
    `load ${seen} is above the gate ${maxLoad} (${CORES} cores, one of them pinned)` +
      (waitFor > 0 ? ` — waiting up to ${waitFor}s for it to fall` : '')
  );
  while (waitFor > 0 && Date.now() < deadline) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15000);
    seen = load1();
    const left = Math.round((deadline - Date.now()) / 1000);
    log(`  load ${seen}${seen <= maxLoad ? ' — starting' : `, ${left}s left`}`);
    if (seen <= maxLoad) return seen;
  }
  throw new Error(
    `load gate: ${seen} > ${maxLoad} after waiting ${waitFor}s. These are timings and ` +
      `nothing else may run on the machine. Free it, or pass --max-load to state a ` +
      `different number and have it recorded in every row.`
  );
}
