// The measurement protocol, shared by every workload. CLAUDE.md's numbered
// protocol is the contract; this file implements it, and the rule numbers below
// mark the code that enforces each one. A workload script is only a kernel plus
// a printed { ns_per_op, checksum, sink } — see bench/kernel.js.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Rule 4: twenty measured pairs, declared before the run — 40 processes per
// cell. No opportunistic sampling when a result is close.
const PAIRS = 20;
const BOOT = 2000;
const PIN = fs.existsSync('/usr/bin/taskset') ? ['/usr/bin/taskset', ['-c', '1']] : [null, []];

let s = 12345;
const rand = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

// Rule 1: one fresh OS process per observation, one variant per process. An
// in-process A/B shares inline caches, and that contamination invalidated a
// whole round of this project.
function once(script, variant, n, mode, reps, seed) {
  const args = [script, variant, n, mode, reps, seed].map(String);
  const [bin, pre] = PIN;
  const out = bin
    ? execFileSync(bin, [...pre, process.execPath, ...args], { encoding: 'utf8' })
    : execFileSync(process.execPath, args, { encoding: 'utf8' });
  return JSON.parse(out);
}

const TARGET_NS = 120e6;

// Rule 3. Aim every timed region at ~120 ms so process startup is not the
// measurement.
// Each side is calibrated on its own: accumulating spread is two orders of
// magnitude slower than its baseline, and one shared rep count would either
// run for hours or leave the fast side unmeasurably short.
//
// The probe ITERATES. A single reps=1 probe reads cold cost, which for an
// interpreted-then-optimized kernel can be a thousand times its warm cost, and
// it under-sizes worst for the slowest variant — the exact side a rule wants
// to indict. That bias inflated a measured cell from ~6-11x to 19.73x and is
// why this loop exists (BUGS TC-5).
// Each probe runs at the previous estimate's rep count, so by the third the
// kernel is optimized and the estimate is warm cost. Six run, and the MEDIAN of
// the last three is taken — NOT a "stop once two agree within 20%" test, which
// is what this did first: a memory-bound kernel varies more than 20% run to
// run, so agreement never arrived on the L3 cells for a reason that has nothing
// to do with warmup. A fixed count cannot hang, and the achieved region is
// asserted afterwards, which is the guard that decides whether a cell is
// publishable.
function calibrate(script, variant, n, mode) {
  const estimates = [];
  let reps = 1;
  for (let i = 0; i < 6; i++) {
    const r = once(script, variant, n, mode, reps, 1);
    reps = Math.max(1, Math.round(TARGET_NS / (r.ns_per_op * n)));
    estimates.push(reps);
  }
  const last = estimates.slice(-3).sort((a, b) => a - b);
  return last[1] ?? reps;
}

// A cell whose timed region missed the target is not a slightly noisy result,
// it is a different measurement. Fail loudly instead of publishing it.
//
// A LOW REP COUNT IS NOT A FAILURE HERE, and BUGS TC-11's first diagnosis said
// otherwise. A kernel that fits two passes in 120 ms has been measured for
// 120 ms; the rep count it took is a fact about the kernel, not a defect, and no
// threshold on it would be anything but a constant nobody measured. What the
// low-rep cells actually exposed is a run-to-run component this interval cannot
// see — the bootstrap resamples pairs inside ONE sweep — so the answer is to run
// the cell again and publish the spread across sweeps (rule 13). The
// achieved region is returned and recorded so a reader can see what was bought
// with how many repetitions.
function assertRegion(label, samples, reps, n) {
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const achieved = mean * reps * n;
  if (achieved < TARGET_NS / 2 || achieved > TARGET_NS * 2) {
    throw new Error(
      `${label}: timed region ${(achieved / 1e6).toFixed(1)} ms is outside 60-240 ms ` +
        `(reps=${reps}, n=${n}) — the cell is void, not slow`
    );
  }
  return achieved;
}

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

function bootstrap(base, test) {
  const ratios = [];
  for (let b = 0; b < BOOT; b++) {
    let sb = 0;
    let st = 0;
    for (let i = 0; i < base.length; i++) {
      const k = Math.floor(rand() * base.length);
      sb += base[k];
      st += test[k];
    }
    ratios.push(st / sb);
  }
  ratios.sort((a, b) => a - b);
  return [percentile(ratios, 0.025), percentile(ratios, 0.975)];
}

// `report` is progress, and only progress. A sweep runs for hours and used to
// print one line per cell at the end of it, so the twelve calibration processes
// and the forty measured ones were four silent minutes. It cannot change what
// is measured: it is called between observations, never inside a timed region,
// and never in a measured process.
function cell({ script, baseline, variant, n, mode }, report = () => {}) {
  const repsBase = calibrate(script, baseline, n, mode);
  const repsTest = calibrate(script, variant, n, mode);
  report({ event: 'calibrated', repsBase, repsTest });
  const base = [];
  const test = [];
  for (let p = 0; p < PAIRS; p++) {
    report({ event: 'pair', done: p, of: PAIRS });
    const seed = 1000 + p;
    // Rule 2: AB on half the pairs, BA on the other half, same seed to both.
    // Order is a confound, and round 1 proved it is a large one.
    const first = rand() < 0.5;
    const a = () => once(script, baseline, n, mode, repsBase, seed);
    const b = () => once(script, variant, n, mode, repsTest, seed);
    const [ra, rb] = first ? [a(), b()] : [b(), a()].reverse();
    // Rule 7: the checksum is compared inside every pair, so a variant that
    // computes something else is a failed run rather than a fast one.
    if (ra.checksum !== rb.checksum) {
      throw new Error(`checksum mismatch at ${variant} / n=${n} / ${mode}`);
    }
    base.push(ra.ns_per_op);
    test.push(rb.ns_per_op);
  }
  report({ event: 'pairs-done' });
  const regionBase = assertRegion(`${variant} baseline / n=${n} / ${mode}`, base, repsBase, n);
  const regionTest = assertRegion(`${variant} / n=${n} / ${mode}`, test, repsTest, n);
  const mean = (v) => v.reduce((x, y) => x + y, 0) / v.length;
  const [lo, hi] = bootstrap(base, test);
  // Rule 5. Raw per-pair observations ship with the aggregate. Without them a reader
  // cannot recompute the interval, and "rerunnable" is the whole claim. The
  // achieved region in ms travels with the rep count that bought it: 120 ms
  // reached in two passes and 120 ms reached in three hundred are different
  // measurements, and the file has to say which one this was.
  return {
    variant,
    mode,
    n,
    repsBase,
    repsTest,
    msBase: +(regionBase / 1e6).toFixed(1),
    msTest: +(regionTest / 1e6).toFixed(1),
    ratio: mean(test) / mean(base),
    lo,
    hi,
    base,
    test,
  };
}

// A cell that misses its timed region is void, and a void cell must be
// visible: it is recorded and printed, not silently dropped and not allowed to
// take the surviving cells down with it.
export function cellOrVoid(opts, report) {
  try {
    return cell(opts, report);
  } catch (err) {
    return {
      variant: opts.variant,
      mode: opts.mode,
      n: opts.n,
      void: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// Rule 13. The bootstrap interval is over the 20 pairs of ONE sweep, so
// it sees the noise between two processes and is blind to anything that varies
// between two sweeps — calibration landing on a different rep count, a heap
// that grew differently, a machine that is not the machine it was ten minutes
// ago. Three `addprop` constructions that differ only in which property is
// added measured 1.64x, 0.91x and 0.89x with mutually exclusive intervals: no
// two of them can be true, and every one of them was significant. So a cell is
// run whole, three times, and what the three sweeps do to each other is
// published next to what one sweep says about itself.
// `onRun` receives each sweep as it finishes, because a sweep that is written
// only after all three are done is a sweep that is lost when the run is
// interrupted — the same reason the runners append synchronously (TC-6).
// `between` runs before every sweep after the first, and it exists for rule
// 9's gate: a cell's three whole sweeps are tens of minutes, and a machine the
// gate found quiet before the cell is not thereby quiet at the third sweep —
// the gate used to be checked between cells only, and never inside one
// (TC-46). It is injected by the caller because the driver measures and the
// runner gates. A throw stops HERE, after every finished sweep was handed to
// `onRun` and written, so nothing measured is lost and resume runs the rest.
export function replicate(opts, onRun, times = 3, report, between = () => {}) {
  const runs = [];
  for (let i = 1; i <= times; i++) {
    if (i > 1) between(i);
    const r = { ...cellOrVoid(opts, report), replicate: i, protocol: 'replicated' };
    runs.push(r);
    onRun(r);
  }
  return runs;
}

// Do the sweeps agree? A common value inside every interval is agreement, and
// its absence is not: it says the three sweeps cannot all be describing the same
// quantity. Derived from the intervals the cells already carry — there is no
// threshold here to pick, and picking one is what TC-11's first fix got wrong.
export function replicates(runs) {
  // Rule 13 asks for THREE whole sweeps. Fewer than three is not agreement, it
  // is an absence of the test — and `Math.max()` of an empty list is -Infinity,
  // so without this line an empty cell and a single-sweep cell both answered
  // `true` and passed every gate that reads this.
  if (runs.length < 3) return false;
  if (runs.some((r) => r.void)) return false;
  return Math.max(...runs.map((r) => r.lo)) <= Math.min(...runs.map((r) => r.hi));
}

export const workload = (name) => path.join(import.meta.dirname, name);
