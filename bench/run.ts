// The runner. `bench/sweeps.ts` says which cells exist, `bench/driver.ts` says
// how a cell is measured, and this file is everything around the measurement:
// which cells to run, whether the machine is quiet enough to run them, what the
// row records about the run, and what a reader watching a four-hour sweep sees.
//
//   node bench/run.ts <sweep> [selection] [options]
//   node bench/run.ts --all                     every sweep, in order, with a manifest
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
//   --max-load=<x>      the gate: runnable threads outside the harness, default
//                       `nproc - 1`. See bench/env.ts.
//   --wait-load=<sec>   poll instead of refusing, up to <sec>
//   --force             re-measure cells this protocol has already written
//   --scratch           append to bench/scratch.jl instead of the sweep's file
//
// The tier diagnostic (bench/tiers.ts) is NOT here. It used to run per row, on
// by default, spawning unpinned --trace-opt children in the middle of the sweep
// protocol rule 8 says must carry no tracing (TC-46). It runs after a sweep,
// via `make tiers`, in its own processes, and appends to bench/tiers.jl.
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
import { cellOrVoid, replicate, replicates, spans1, RUNNER } from './driver.ts';
import type { CellResult, Replicated } from './driver.ts';
// `ALL` — the sweeps `--all` runs — is declared in sweeps.ts beside the table
// it selects from, so a test can hold the two to each other. See the note there.
import { ALL, BENCHMARKS, plan, label } from './sweeps.ts';
import type { Bench } from './sweeps.ts';
import { environment, gate, reading, MAX_RUNNABLE, CORES } from './env.ts';
import type { Environment } from './env.ts';

// The environment as the runner stamps it into rows: bench/env.ts's record
// plus what the gate let this sweep begin at.
type RunEnv = Environment & { runnableStart: number };

// A row as `key` and `done` see it: parsed back off a .jl line, every field
// the runner may have written, nothing guaranteed.
type JlRow = Record<string, unknown>;

const MANIFEST = path.join(import.meta.dirname, 'manifest.jsonl');
const SCRATCH = path.join(import.meta.dirname, 'scratch.jl');

function parseArgs(argv: string[]): { flags: Map<string, string>; rest: string[] } {
  const flags = new Map<string, string>();
  const rest: string[] = [];
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

const num = (name: string, fallback: number): number => {
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

function die(msg: string): never {
  process.stderr.write(`${msg}\n`);
  process.exit(2);
}

const out = (s: string) => process.stdout.write(s);

const hms = (ms: number): string => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
    : `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
};

// A void cell is recorded and printed, never silently dropped: a cell that
// misses its timed region is a different measurement, not a slow one.
const line = (r: CellResult | Replicated) =>
  r.void
    ? `VOID  ${r.error}`
    : `${r.ratio.toFixed(2)}x  CI ${r.lo.toFixed(2)}-${r.hi.toFixed(2)}` +
      `${spans1(r) ? ' REJ' : ''}  ` +
      `reps ${r.repsBase}/${r.repsTest}  region ${r.msBase}/${r.msTest} ms`;

// The identity of a cell inside its `.jl`. Resume compares this, so it has to
// name every field two different cells of the same sweep can differ by.
const key = (r: JlRow) =>
  JSON.stringify([r.variant, r.baseline ?? null, r.mode, r.n, r.family ?? null, r.k ?? null,
    r.shapes ?? null, r.example ?? null]);

// What this protocol has already written into a file, so a sweep that died at
// cell 60 of 80 does not start again at 1. Rows from earlier protocols are not
// counted: they are the record of what was published and re-measuring them is
// the point of the exercise.
function done(file: string): Map<string, number> {
  const counts = new Map<string, number>();
  if (!fs.existsSync(file)) return counts;
  for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!l) continue;
    const r: JlRow = JSON.parse(l);
    if (r.runner !== RUNNER) continue;
    // Rows within their own gate only. Counting every row made a cell that
    // recorded three runs, two of them over the gate, finished as far as resume
    // is concerned — so it could never re-measure itself, and the only way to
    // fix one bad cell was to set the whole file aside and sweep every cell
    // again (BUGS TC-91). The gate is checked before a cell and not during it
    // (BUGS TC-74), so a row CAN be written over it; this is what makes that
    // damage self-healing instead of permanent.
    const limit = r.env as { maxRunnable?: number } | undefined;
    const seen = r.runnable as number | undefined;
    if (limit?.maxRunnable !== undefined && seen !== undefined && seen > limit.maxRunnable) continue;
    const k = key(r);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

// Where a cell's rows go. One function, because `--plan` printing one
// destination while the run writes to another is how a row measured to test an
// argument parser reached a published sweep (TC-20): the plan is what a reader
// checks before spending four hours, and it has to be checkable.
const destination = (dest: string): string => (flags.has('scratch') ? SCRATCH : dest);

function selected(bench: Bench) {
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
function sweep(name: string, env: RunEnv) {
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
  const force = flags.has('force');

  out(`${name}: ${bench.what}\n`);
  out(`  ${cells.length} cells x ${times} run${times > 1 ? 's' : ''}, ` +
    `node ${env.node} / v8 ${env.v8}, pin ${env.pin}, ` +
    `${env.runnableStart} runnable at start (gate ${env.maxRunnable})\n`);

  const started = Date.now();
  let ran = 0;
  let measured = 0;
  let skipped = 0;
  let voids = 0;
  const seen = new Map<string, Map<string, number>>();

  for (const [i, { script, out: dest, opts, extra }] of cells.entries()) {
    const file = destination(dest);
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
      gate({ maxRunnable: env.maxRunnable, waitFor: num('wait-load', 0),
        log: (m) => out(`      ${m}\n`) });
    } catch (err) {
      out(`\n${name}: stopped at cell ${i + 1} of ${cells.length}\n` +
        `  ${err instanceof Error ? err.message : String(err)}\n` +
        `  ${ran} rows written. Re-run the same command to continue from here.\n`);
      break;
    }

    const write = (r: CellResult | Replicated) => {
      // `load1` and `runnable` are read HERE, as the row is written, because
      // that is what "what the machine was doing" means for a sweep that runs
      // for hours. `runnable` is the gate's own observable — the harness's
      // children are all dead at this instant, so the count is other tenants
      // and nothing else — which makes the row itself say whether the gate it
      // ran under was still holding when it was written. A row over it is
      // still written (the measurement happened, and rule 10 reports failures
      // in the same format as wins); test/check.test.ts holds the register
      // that fails the build on any such row nobody has accounted for (TC-46).
      // bench/env.ts assembles the pair, and refuses to assemble it out of a
      // sweep record that already carries a reading of its own (TC-24, TC-47).
      const now = reading(env);
      const seen = now.runnable;
      fs.appendFileSync(file, JSON.stringify({ ...r, ...extra, baseline: opts.baseline,
        runner: RUNNER, ...now }) + '\n');
      if (seen > env.maxRunnable) {
        out(`      OVER GATE: ${seen} runnable outside the harness against ` +
          `${env.maxRunnable} — recorded in the row, and make test will name it\n`);
      }
      if (r.void) voids++;
      ran++;
    };

    // The pair counter overwrites itself on a terminal and is silent in a log:
    // a sweep is usually run under `tee`, and twenty `\r`-joined counters per
    // cell would be one unreadable line per cell in the file.
    const report = (e: { event: string; repsBase?: number; repsTest?: number; done?: number; of?: number }) => {
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
    // says the sweeps cannot all be describing the same quantity. The gate runs
    // again between the sweeps — the check before the cell covered the first
    // one, and covering all three with it is what let 601 rows past (TC-46).
    let runs: Replicated[];
    try {
      runs = replicate({ script, ...opts }, (r) => {
        write(r);
        out(`      #${r.replicate}: ${line(r)}\n`);
      }, need, report, () =>
        gate({ maxRunnable: env.maxRunnable, waitFor: num('wait-load', 0),
          log: (m) => out(`      ${m}\n`) }));
    } catch (err) {
      out(`\n${name}: stopped inside ${label(opts)} (cell ${i + 1} of ${cells.length})\n` +
        `  ${err instanceof Error ? err.message : String(err)}\n` +
        `  ${ran} rows written. Re-run the same command to continue from here.\n`);
      break;
    }
    measured++;
    const shown = runs.map((r) => (r.void ? 'VOID' : `${r.ratio.toFixed(2)}x`)).join(' ');
    out(`      => ${replicates(runs) ? 'REPLICATES' : 'DISAGREES'}  ${shown}\n\n`);
  }

  const seconds = Math.round((Date.now() - started) / 1000);
  out(`${name}: ${ran} rows, ${skipped} skipped, ${voids} void, ${hms(Date.now() - started)}\n\n`);
  return { sweep: name, started: new Date(started).toISOString(), seconds, cells: cells.length,
    rows: ran, skipped, voids, replicate: times, env,
    selection: [...flags].map(([k, v]) => (v === '' ? `--${k}` : `--${k}=${v}`)).join(' ') };
}

const usage = () =>
  `usage: node bench/run.ts <${Object.keys(BENCHMARKS).join('|')}> [--only=..] [--variant=..]\n` +
  `       [--mode=..] [--n=..] [--replicate=k] [--plan] [--force]\n` +
  `       [--max-load=x] [--wait-load=sec]\n` +
  `       node bench/run.ts --all\n`;

const names = flags.has('all') ? ALL : rest;
if (!names.length) die(usage());

// `--plan` prints the cells and measures nothing. A sweep runs for hours, so
// this is how a change to bench/sweeps.ts is checked before it is trusted — and
// what it prints is where the rows would land, through the same `destination`
// the run uses. It printed the sweep's own file whatever the flags said, so the
// one command that answers "where will this write?" answered it wrong for the
// flag that exists to move the answer (TC-20).
if (flags.has('plan')) {
  for (const name of names) {
    const bench = BENCHMARKS[name] ?? die(`unknown benchmark ${name}\n${usage()}`);
    for (const { script, out: dest, opts, extra } of selected(bench)) {
      out(`${name} ${label(opts)} ${path.basename(script)} -> ` +
        `${path.basename(destination(dest))} ${JSON.stringify(extra)}\n`);
    }
  }
  process.exit(0);
}

// Rule 9, and the guard that makes it worth recording: these are timings, and
// a sweep that starts on a busy machine is measuring the other processes too.
// The gate is derived from the core count and stated in bench/env.ts so it can
// be argued with; whatever value was in force goes into every row.
const maxRunnable = num('max-load', MAX_RUNNABLE);
let startedAt;
try {
  startedAt = gate({ maxRunnable, waitFor: num('wait-load', 0), log: (m) => out(`${m}\n`) });
} catch (err) {
  die(err instanceof Error ? err.message : String(err));
}
const env = { ...environment(maxRunnable), runnableStart: startedAt };
out(`${CORES} cores, ${startedAt} runnable outside the harness at start, gate ${maxRunnable}\n\n`);

// Rule 9 again, at the level of a release: one artifact that says what ran,
// when, on what, and how long. Appended, like every other file this writes.
const manifest = [];
for (const name of names) manifest.push(sweep(name, env));
if (flags.has('all')) {
  for (const m of manifest) fs.appendFileSync(MANIFEST, JSON.stringify(m) + '\n');
  const total = manifest.reduce((a, m) => a + m.seconds, 0);
  out(`manifest: ${manifest.length} sweeps, ${hms(total * 1000)} -> ${path.basename(MANIFEST)}\n`);
}
