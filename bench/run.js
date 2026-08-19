// The runner. `bench/sweeps.js` says which cells exist, `bench/driver.js` says
// how a cell is measured, and this file is everything around the measurement:
// which cells to run, whether the machine is quiet enough to run them, what the
// row records about the run, and what a reader watching a four-hour sweep sees.
//
//   node bench/run.js <sweep> [selection] [options]
//   node bench/run.js --all                     every sweep, in order, with a manifest
//
// Selection — composable, and all of them narrow the same cell list:
//   --only=<text>       cells whose printed label contains <text>
//   --variant=<v>       exact variant
//   --mode=<m>          exact mode
//   --n=<n|L1|L2|L3>    exact working-set size, by number or by name
//   --replicate=<k>     run each selected cell k whole times (protocol rule 13)
//   --plan              print the selected cells and measure nothing
//
// Options:
//   --max-load=<x>      the load gate, default `nproc - 1`. See bench/env.js.
//   --wait-load=<sec>   poll instead of refusing, up to <sec>
//   --force             re-measure cells this protocol has already written
//   --no-tiers          skip the tier diagnostic (bench/tiers.js)
//   --scratch           append to bench/scratch.jl instead of the sweep's file
//
// `--scratch` exists because exercising the runner is not measuring: a row
// produced while checking that a flag parses, on whatever the machine was doing
// at the time, must not land in a file lib/derive.ts publishes numbers from.
// One such row reached bench/spread.jl during this runner's own development.
//
// Rows are APPENDED, never overwritten, and appended synchronously one cell at
// a time. The sweep body blocks the event loop inside execFileSync, so a
// stream's async open never fires and every row would sit in memory until the
// run ends — losing the whole sweep if it is interrupted (BUGS TC-6).

import fs from 'node:fs';
import path from 'node:path';
import { cellOrVoid, replicate, replicates } from './driver.js';
import { BENCHMARKS, plan, label } from './sweeps.js';
import { environment, gate, load1, MAX_LOAD, CORES } from './env.js';
import { tierPair } from './tiers.js';

// The marker that says a row came from this runner: it carries the environment,
// the load the sweep started at, and the tier each side reached. `protocol`
// keeps meaning what it has always meant — whether the cell was replicated —
// so the queries in lib/derive.ts that select on it keep selecting the same
// rows. Resume reads this field and nothing else.
const RUNNER = 'r2';

// Every sweep, in the order `--all` runs them. Declared rather than taken from
// Object.keys(BENCHMARKS) so adding a sweep to the table is not silently also a
// change to what a release measures. `tc11` is absent on purpose: it re-runs
// cells of the other sweeps and running it inside `--all` would append a second
// set of replications to rows the same pass had just written.
const ALL = [
  'shapes', 'spread', 'spread-object', 'strings', 'select', 'chained',
  'inline', 'addprop', 'dispatch', 'delete', 'arrays', 'example',
];

const MANIFEST = path.join(import.meta.dirname, 'manifest.jsonl');
const SCRATCH = path.join(import.meta.dirname, 'scratch.jl');

function parseArgs(argv) {
  const flags = new Map();
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      rest.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    if (eq !== -1) {
      flags.set(a.slice(2, eq), a.slice(eq + 1));
      continue;
    }
    // `--only <text>` is how this flag was spelled before, and a sweep command
    // in a diary entry has to keep working.
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--') && a === '--only') {
      flags.set('only', next);
      i++;
    } else {
      flags.set(a.slice(2), '');
    }
  }
  return { flags, rest };
}

const { flags, rest } = parseArgs(process.argv.slice(2));

const num = (name, fallback) => {
  if (!flags.has(name)) return fallback;
  const raw = flags.get(name);
  // `Number('')` is 0, and only `--only` takes its value as the next argument —
  // so `--replicate 3` parsed as an empty value, ran each cell ZERO times, and
  // printed `=> REPLICATES` for a cell that measured nothing.
  if (raw === undefined || raw === '') die(`--${name}=<n> needs a value (use =, not a space)`);
  const v = Number(raw);
  if (!Number.isFinite(v)) die(`--${name} needs a number, got ${raw}`);
  return v;
};

function die(msg) {
  process.stderr.write(`${msg}\n`);
  process.exit(2);
}

const out = (s) => process.stdout.write(s);

const hms = (ms) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
    : `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
};

// A void cell is recorded and printed, never silently dropped: a cell that
// misses its timed region is a different measurement, not a slow one.
const line = (r) =>
  r.void
    ? `VOID  ${r.error}`
    : `${r.ratio.toFixed(2)}x  CI ${r.lo.toFixed(2)}-${r.hi.toFixed(2)}` +
      `${r.lo <= 1 && r.hi >= 1 ? ' REJ' : ''}  ` +
      `reps ${r.repsBase}/${r.repsTest}  region ${r.msBase}/${r.msTest} ms`;

// The identity of a cell inside its `.jl`. Resume compares this, so it has to
// name every field two different cells of the same sweep can differ by.
const key = (r) =>
  JSON.stringify([r.variant, r.baseline ?? null, r.mode, r.n, r.family ?? null, r.k ?? null,
    r.shapes ?? null, r.example ?? null]);

// What this protocol has already written into a file, so a sweep that died at
// cell 60 of 80 does not start again at 1. Rows from earlier protocols are not
// counted: they are the record of what was published and re-measuring them is
// the point of the exercise.
function done(file) {
  const counts = new Map();
  if (!fs.existsSync(file)) return counts;
  for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!l) continue;
    const r = JSON.parse(l);
    if (r.runner !== RUNNER) continue;
    const k = key(r);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

function selected(bench) {
  const only = flags.get('only');
  const variant = flags.get('variant');
  const mode = flags.get('mode');
  const size = flags.get('n');
  return [...plan(bench)].filter(({ opts, extra }) => {
    if (only && !label(opts).includes(only)) return false;
    if (variant && opts.variant !== variant) return false;
    if (mode && opts.mode !== mode) return false;
    if (size && String(opts.n) !== size && extra.size !== size) return false;
    return true;
  });
}

// One sweep, start to finish. Returns the manifest row.
function sweep(name, env) {
  const bench = BENCHMARKS[name];
  if (!bench) die(`unknown benchmark ${name}\n${usage()}`);

  const cells = selected(bench);
  if (!cells.length) die(`selection matched no cell of ${name}`);

  // Protocol rule 13 applies to every published cell, so three is the default
  // for every sweep. It used to be three only where a sweep set
  // `replicated: true` — four of thirteen — so `make bench-dispatch`, the
  // documented way to verify that rule's numbers, ran one sweep per cell, and
  // on a file already holding three it ran none at all.
  const times = num('replicate', 3);
  const tiers = !flags.has('no-tiers');
  const force = flags.has('force');

  out(`${name}: ${bench.what}\n`);
  out(`  ${cells.length} cells x ${times} run${times > 1 ? 's' : ''}, ` +
    `node ${env.node} / v8 ${env.v8}, pin ${env.pin}, load ${env.loadStart} (gate ${env.maxLoad})\n`);

  const started = Date.now();
  let ran = 0;
  let measured = 0;
  let skipped = 0;
  let voids = 0;
  const seen = new Map();

  for (const [i, { script, out: dest, opts, extra }] of cells.entries()) {
    const file = flags.has('scratch') ? SCRATCH : dest;
    const already = seen.get(file) ?? done(file);
    seen.set(file, already);

    const row = { ...opts, ...extra, baseline: opts.baseline };
    const have = already.get(key(row)) ?? 0;
    // `--force` means measure it again, all of it. Subtracting what is already
    // there would ask for zero runs of a cell that already has three, which is
    // the one thing --force exists not to do.
    const need = force ? times : times - have;
    // Estimated from CELLS finished, not rows written: a replicated cell writes
    // three rows and the estimate was three times short.
    const at = `[${i + 1}/${cells.length} ${hms(Date.now() - started)}` +
      `${measured ? ` ~${hms(((Date.now() - started) / measured) * (cells.length - i))} left` : ''}]`;

    if (!force && need <= 0) {
      skipped++;
      out(`${at} ${label(opts)}: have ${have} run${have > 1 ? 's' : ''} under ${RUNNER}, skipping\n`);
      continue;
    }
    out(`${at} ${label(opts)}\n`);

    // The gate again, before every cell. Checking it once at the start of a
    // four-hour sweep does not do what the gate says it does — the machine that
    // was quiet at cell 1 was at load 4.55 by cell 3, and the rows written there
    // recorded the load from cell 1. Stopping here loses nothing: resume picks
    // the sweep up at the cell that did not run.
    try {
      gate({ maxLoad: env.maxLoad, waitFor: num('wait-load', 0), log: (m) => out(`      ${m}\n`) });
    } catch (err) {
      out(`\n${name}: stopped at cell ${i + 1} of ${cells.length}\n` +
        `  ${err instanceof Error ? err.message : String(err)}\n` +
        `  ${ran} rows written. Re-run the same command to continue from here.\n`);
      break;
    }

    const write = (r) => {
      // The environment travels with every row, and the tier of each side sits
      // next to the rep counts that bought it — recorded as a fact, never as a
      // gate. A pair that tiers asymmetrically is a pair whose ratio is partly
      // a measurement of tiering, and the row says so rather than leaving it to
      // be re-derived.
      const t = tiers && !r.void
        ? tierPair({ script, ...opts, repsBase: r.repsBase, repsTest: r.repsTest })
        : {};
      // `load1` is read HERE, as the row is written, because that is what "the
      // load at the time" means for a sweep that runs for hours.
      fs.appendFileSync(file, JSON.stringify({ ...r, ...extra, baseline: opts.baseline,
        runner: RUNNER, load1: load1(), env, ...t }) + '\n');
      if (t.tierMismatch) out(`      TIER MISMATCH on ${t.tierMismatch.join(', ')}\n`);
      if (r.void) voids++;
      ran++;
    };

    // The pair counter overwrites itself on a terminal and is silent in a log:
    // a sweep is usually run under `tee`, and twenty `\r`-joined counters per
    // cell would be one unreadable line per cell in the file.
    const report = (e) => {
      if (e.event === 'calibrated') out(`      reps ${e.repsBase}/${e.repsTest}, 20 pairs\n`);
      else if (!process.stdout.isTTY) return;
      else if (e.event === 'pair') out(`\r      pair ${e.done}/${e.of}   `);
      else if (e.event === 'pairs-done') out('\r                        \r');
    };

    if (times === 1) {
      const r = cellOrVoid({ script, ...opts }, report);
      write(r);
      measured++;
      out(`      ${line(r)}\n`);
      continue;
    }
    // Whole sweeps per published cell (protocol rule 13), each written as it
    // finishes. Agreement is a value common to all the intervals; its absence
    // says the sweeps cannot all be describing the same quantity.
    const runs = replicate({ script, ...opts }, (r) => {
      write(r);
      out(`      #${r.replicate}: ${line(r)}\n`);
    }, need, report);
    measured++;
    const shown = runs.map((r) => (r.void ? 'VOID' : `${r.ratio.toFixed(2)}x`)).join(' ');
    out(`      => ${replicates(runs) ? 'REPLICATES' : 'DISAGREES'}  ${shown}\n\n`);
  }

  const seconds = Math.round((Date.now() - started) / 1000);
  out(`${name}: ${ran} rows, ${skipped} skipped, ${voids} void, ${hms(Date.now() - started)}\n\n`);
  return { sweep: name, started: new Date(started).toISOString(), seconds, cells: cells.length,
    rows: ran, skipped, voids, replicate: times, tiers, env,
    selection: [...flags].map(([k, v]) => (v === '' ? `--${k}` : `--${k}=${v}`)).join(' ') };
}

const usage = () =>
  `usage: node bench/run.js <${Object.keys(BENCHMARKS).join('|')}> [--only=..] [--variant=..]\n` +
  `       [--mode=..] [--n=..] [--replicate=k] [--plan] [--force] [--no-tiers]\n` +
  `       [--max-load=x] [--wait-load=sec]\n` +
  `       node bench/run.js --all\n`;

const names = flags.has('all') ? ALL : rest;
if (!names.length) die(usage());

// `--plan` prints the cells and measures nothing. A sweep runs for hours, so
// this is how a change to bench/sweeps.js is checked before it is trusted.
if (flags.has('plan')) {
  for (const name of names) {
    const bench = BENCHMARKS[name] ?? die(`unknown benchmark ${name}\n${usage()}`);
    for (const { script, out: file, opts, extra } of selected(bench)) {
      out(`${name} ${label(opts)} ${path.basename(script)} -> ${path.basename(file)} ` +
        `${JSON.stringify(extra)}\n`);
    }
  }
  process.exit(0);
}

// Rule 9, and the guard that makes it worth recording: these are timings, and
// a sweep that starts on a busy machine is measuring the other processes too.
// The gate is derived from the core count and stated in bench/env.js so it can
// be argued with; whatever value was in force goes into every row.
const maxLoad = num('max-load', MAX_LOAD);
let startedAt;
try {
  startedAt = gate({ maxLoad, waitFor: num('wait-load', 0), log: (m) => out(`${m}\n`) });
} catch (err) {
  die(err instanceof Error ? err.message : String(err));
}
const env = { ...environment(maxLoad), loadStart: startedAt };
out(`${CORES} cores, load ${startedAt} at start, gate ${maxLoad}\n\n`);

// Rule 9 again, at the level of a release: one artifact that says what ran,
// when, on what, and how long. Appended, like every other file this writes.
const manifest = [];
for (const name of names) manifest.push(sweep(name, env));
if (flags.has('all')) {
  for (const m of manifest) fs.appendFileSync(MANIFEST, JSON.stringify(m) + '\n');
  const total = manifest.reduce((a, m) => a + m.seconds, 0);
  out(`manifest: ${manifest.length} sweeps, ${hms(total * 1000)} -> ${path.basename(MANIFEST)}\n`);
}
