// Which tier was the code in when it was measured?
//
// Nobody had checked, and the assumption sits under every published number.
// V8 runs a function in Ignition, then Sparkplug, then — when a budget scaled by
// bytecode size runs out — Maglev or TurboFan. A workload here calls its kernel
// a handful of times before the timed region opens (three flat passes in the
// older workloads), and a cell sized at two repetitions calls it about five
// times in the whole process. Five calls is two orders of magnitude short of
// `invocation_count_for_turbofan`. What saves the measurement is OSR — the inner
// loop is hot even when the function is cold — and "probably OSR" is not this
// project's standard.
//
// This is a DIAGNOSTIC and never an evidence run. Protocol rule 8 keeps
// --trace-opt, --trace-deopt and %GetOptimizationStatus out of a measured
// process; that is exactly why this runs in its own, with its own flags, and
// why nothing it times is ever published. It reads the WORKLOADS UNMODIFIED, at
// the same variant / n / mode / reps a published cell ran at, so what it reports
// is the tiering of the code that was actually measured rather than of a replica
// of it.
//
//   node bench/tiers.ts <sweep>            every published cell shape of a sweep
//   node bench/tiers.ts all                every sweep
//   node bench/tiers.ts --cell spread.ts spread 10000 incl 2
//
// What it can see, and what it cannot: --trace-opt traces the OPTIMIZING tiers.
// Sparkplug is not traced, so a function this reports as `none` ran in Ignition,
// in Sparkplug, or in both, and the diagnostic cannot say which. That does not
// touch the question it exists to answer — whether the two sides of a pair were
// optimized alike — because both sides are read the same way.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// A file URL, because --import takes a module specifier and a bare absolute
// path is not one on every platform.
const MARKER = pathToFileURL(path.join(import.meta.dirname, 'region-marker.ts')).href;

// One optimization event as `parse` replays it: what happened, in which phase.
interface TierEvent {
  kind: 'mark' | 'install' | 'deopt';
  tier?: string;
  osr?: boolean;
  reason?: string;
  phase: string;
}

interface Deopt {
  fn: string;
  kind: string;
  reason: string;
  phase: string;
}

interface Trace {
  events: Map<string, TierEvent[]>;
  deopts: Deopt[];
  unknown: string[];
}

// What `tiersOf` reports for one side, and what `tiersOrError` degrades to:
// the error travels in `tiers` where the tokens would have been.
interface Tiers {
  tiers: Record<string, string>;
  unstable: string[];
  deopts?: Deopt[];
  unknown?: string[];
}

interface CellShape {
  script: string;
  variant: string;
  n: number;
  mode: string;
  reps: number;
  seed?: number;
}

// A published row as this diagnostic reads it back off a .jl line: only the
// fields the lookup and the probe need, none guaranteed by the parse.
interface PublishedRow {
  variant?: string;
  baseline?: string | null;
  mode?: string;
  n?: number;
  family?: string;
  k?: number;
  shapes?: number;
  example?: string;
  kernel?: string;
  void?: boolean;
  repsBase?: number;
  repsTest?: number;
  ratio?: number;
}

// The tiers, shortened for a row. TURBOFAN_JS is what recent V8 calls the
// JavaScript TurboFan pipeline; TURBOFAN is what older builds print.
const SHORT: Record<string, string | undefined> = {
  TURBOFAN: 'TF',
  TURBOFAN_JS: 'TF',
  MAGLEV: 'MGLV',
  SPARKPLUG: 'SP',
};

// V8 prints unnamed functions as `<JSFunction (sfi = 0x…)>`, and a workload has
// more than one: the module top-level code — which is where every timed region
// in this project lives, so it is the single most interesting function here —
// plus whatever arrow callbacks the setup used. They are numbered by SFI in the
// order V8 first touched them, which is deterministic for one code path, so the
// two traces of a side and the two sides of a pair line up. Which number is the
// top-level is not claimed: it is the one that OSRs around the timed loop, and
// the trace shows that without needing a label.
const namer = () => {
  const anon = new Map<string, string>();
  return (line: string): string | null => {
    const m = /<JSFunction ([^(]*)\(sfi ?= ?(0x[0-9a-f]+)\)>/.exec(line);
    if (!m) return null;
    const name = m[1].trim();
    if (name !== '') return name;
    if (!anon.has(m[2])) anon.set(m[2], `(anon ${anon.size + 1})`);
    return anon.get(m[2])!;
  };
};

const tier = (line: string): string => {
  const m = /\(target ([A-Z_]+)\)/.exec(line) ?? /optimization to ([A-Z_]+)/.exec(line);
  return m ? (SHORT[m[1]] ?? m[1]) : '?';
};

// Everything before the region opens is warmup; everything between the two
// markers happened WHILE the stopwatch was running, which is the finding a
// reader wants. `after` is the checksum pass the workloads run last.
export function parse(out: string): Trace {
  const events = new Map<string, TierEvent[]>();
  const deopts: Deopt[] = [];
  const unknown: string[] = [];
  let phase = 'warm';
  const fn = namer();
  const at = (name: string, e: Omit<TierEvent, 'phase'>) => {
    if (!events.has(name)) events.set(name, []);
    events.get(name)!.push({ ...e, phase });
  };

  for (const line of out.split('\n')) {
    if (line === '[[region begin]]') {
      phase = 'region';
      continue;
    }
    if (line === '[[region end]]') {
      phase = 'after';
      continue;
    }
    if (line[0] !== '[') continue;

    const name = fn(line);
    if (line.startsWith('[marking ')) {
      if (name) at(name, { kind: 'mark', tier: tier(line) });
    } else if (line.startsWith('[completed optimizing ')) {
      // Installation, not the decision to compile: the decision is deterministic
      // and the landing is a race, and only the landing changes what runs.
      if (name) at(name, { kind: 'install', tier: tier(line), osr: line.includes(' OSR') });
    } else if (line.startsWith('[bailout ') || line.startsWith('[deoptimizing ')) {
      const d = {
        fn: name ?? '(anonymous)',
        kind: /kind: ([a-z-]+)/.exec(line)?.[1] ?? '?',
        reason: /reason: ([^)\]]+)[)\]]/.exec(line)?.[1]?.trim() ?? '?',
        phase,
      };
      deopts.push(d);
      if (name) at(name, { kind: 'deopt', reason: d.reason });
    } else if (
      !line.startsWith('[compiling ') &&
      !line.startsWith('[completed compiling ') &&
      !line.startsWith('[aborted ') &&
      !line.startsWith('[not ') &&
      !line.startsWith('[found ') &&
      !line.startsWith('[discarded') &&
      !line.startsWith('[deopt') &&
      !line.startsWith('[evicting') &&
      !line.startsWith('[resetting') &&
      !line.startsWith('[failed')
    ) {
      unknown.push(line.slice(0, 120));
    }
  }
  return { events, deopts, unknown };
}

// One function's story in one token: WHAT WAS RUNNING WHEN THE STOPWATCH
// STARTED, and what changed while it ran.
//
//   TF/osr           TurboFan, entered through OSR, already installed when the
//                    region opened, and nothing changed inside it
//   none             not optimized at the start of the region — Ignition or
//                    Sparkplug, and --trace-opt cannot say which
//   marked           V8 had decided to optimize it and the compile had not
//                    landed by the time the region opened
//   none[+TF/osr]    it tiered up WHILE the stopwatch was running, so part of
//                    the region was measured at a lower tier
//   TF[-deopt +TF]   optimized at the start, deoptimized inside the region, and
//                    re-optimized inside it
//
// The state at region start is what it is because of the events BEFORE the
// region, in order — not because of the last event in the process. Reading the
// last one instead reported a function that was optimized throughout as if the
// region had run cold, whenever a post-region deopt-and-recompile followed; the
// first run of this diagnostic called six shapes cells a mismatch for that
// reason alone.
export function summarize({ events }: { events: Trace['events'] }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, evs] of events) {
    let state = 'none';
    let marked = false;
    const during: string[] = [];
    for (const e of evs) {
      if (e.phase === 'after') continue;
      if (e.phase === 'warm') {
        if (e.kind === 'mark') marked = true;
        else if (e.kind === 'install') state = `${e.tier}${e.osr ? '/osr' : ''}`;
        else if (e.kind === 'deopt') state = 'none';
        continue;
      }
      if (e.kind === 'install') during.push(`+${e.tier}${e.osr ? '/osr' : ''}`);
      else if (e.kind === 'deopt') during.push('-deopt');
    }
    if (state === 'none' && marked) state = 'marked';
    out[name] = during.length ? `${state}[${during.join(' ')}]` : state;
  }
  return out;
}

function traceOnce({ script, variant, n, mode, reps, seed }: CellShape): Trace {
  const args = [
    '--trace-opt',
    '--trace-deopt',
    // --import, not --require: --require cannot load ESM, which is what kept
    // the marker CommonJS. Node has had --import since 20.6 and this repo
    // requires >= 22.18, so the marker is TypeScript like everything else
    // here. The tier tokens `make tiers` produces were captured under both and
    // compared before this changed.
    '--import',
    MARKER,
    script,
    String(variant),
    String(n),
    String(mode),
    String(reps),
    String(seed),
  ];
  // stderr is folded in because V8 has moved trace output between the two
  // streams before, and a diagnostic that silently reads an empty stream would
  // report every function as untiered.
  const out = execFileSync(process.execPath, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 256 * 1024 * 1024,
  });
  return parse(out);
}

// Every side is traced TWICE and the two are compared, for the same reason the
// measurement replicates a cell (protocol rule 13): one observation cannot see
// what varies between two. Where the runs disagree the row carries both tokens
// joined by `|` and the name is listed in `tierUnstable`, rather than the
// diagnostic picking one and calling it the answer.
export function tiersOf({ script, variant, n, mode, reps, seed = 1 }: CellShape): Tiers {
  const a = traceOnce({ script, variant, n, mode, reps, seed });
  const b = traceOnce({ script, variant, n, mode, reps, seed });
  const sa = summarize(a);
  const sb = summarize(b);
  const tiers: Record<string, string> = {};
  const unstable: string[] = [];
  for (const name of new Set([...Object.keys(sa), ...Object.keys(sb)]).values()) {
    const x = sa[name] ?? 'none';
    const y = sb[name] ?? 'none';
    tiers[name] = x === y ? x : `${x}|${y}`;
    if (x !== y) unstable.push(name);
  }
  return {
    tiers,
    unstable,
    deopts: a.deopts,
    unknown: [...a.unknown, ...b.unknown],
  };
}

// Never let a failed diagnostic void a measurement, and never let it pass
// quietly either: the error goes in the row where the tiers would have been.
export function tiersOrError(opts: CellShape): Tiers {
  try {
    return tiersOf(opts);
  } catch (err) {
    return {
      tiers: { error: err instanceof Error ? err.message.slice(0, 200) : String(err) },
      unstable: [],
    };
  }
}

// The two sides of a pair, and the functions where they disagree. A ratio
// between a TurboFan side and a side that never left the interpreter is partly
// a measurement of tiering rather than of the pattern under test, and this is
// the field that says so without anyone having to re-derive it.
export function tierPair(
  { script, baseline, variant, n, mode, repsBase, repsTest, seed = 1 }:
    { script: string; baseline: string; variant: string; n: number; mode: string;
      repsBase: number; repsTest: number; seed?: number }
) {
  const b = tiersOrError({ script, variant: baseline, n, mode, reps: repsBase, seed });
  const t = tiersOrError({ script, variant, n, mode, reps: repsTest, seed });
  // A name whose token was not stable across the two traces of its OWN side
  // cannot be said to differ from the other side, so it is reported as unstable
  // and not as a mismatch. Calling a race a finding is how a diagnostic starts
  // producing rules of its own.
  const shaky = new Set([...b.unstable, ...t.unstable]);

  // A mismatch is a function BOTH sides have, at different tiers. That is the
  // question — one side optimized and the other not, over the same work.
  //
  // A function only one side has is a different thing entirely and is reported
  // as `tierOnly` instead. Every workload names its per-variant builder after
  // the variant (`joined` against `plus`, `BUILD.y.y` against `BUILD.z.z`), so
  // comparing the two sides by name flags all of them, and the first run of this
  // diagnostic did: 27 of 41 cells, every one of them a naming artifact. The
  // asymmetry is still worth seeing — a builder that never leaves the
  // interpreter on one side is real — so it is printed, not dropped.
  const shared = Object.keys(b.tiers).filter((k) => k in t.tiers);
  const mismatch = shared.filter((k) => !shaky.has(k) && b.tiers[k] !== t.tiers[k]).sort();
  const only: Record<string, string> = {};
  for (const [side, mine, theirs] of [['base', b.tiers, t.tiers], ['test', t.tiers, b.tiers]] as
    ['base' | 'test', Record<string, string>, Record<string, string>][]) {
    for (const k of Object.keys(mine)) if (!(k in theirs)) only[`${side}:${k}`] = mine[k];
  }

  return {
    tierBase: b.tiers,
    tierTest: t.tiers,
    ...(mismatch.length ? { tierMismatch: mismatch } : {}),
    ...(Object.keys(only).length ? { tierOnly: only } : {}),
    ...(shaky.size ? { tierUnstable: [...shaky].sort() } : {}),
    ...(b.deopts?.length ? { deoptBase: b.deopts } : {}),
    ...(t.deopts?.length ? { deoptTest: t.deopts } : {}),
  };
}

// ---- standalone: every published cell's shape ------------------------------
//
// The reps come from the PUBLISHED ROW rather than from a fresh calibration, so
// each probe reproduces the cell as it was measured — including the cells the
// calibration sized at two repetitions, which are the ones the question is
// about. Rows are appended to bench/tiers.jl, because a table printed to a
// terminal is not evidence.

const TIERS_JL = path.join(import.meta.dirname, 'tiers.jl');

const cellKey = (r: PublishedRow) =>
  JSON.stringify([r.variant, r.baseline ?? null, r.mode, r.n, r.family ?? null, r.k ?? null,
    r.shapes ?? null, r.example ?? null, r.kernel ?? null]);

// The last published row for each cell of a sweep: last because a file holds
// every sweep ever appended to it and the most recent is the one whose reps
// describe how the cell runs today.
function published(file: string): Map<string, PublishedRow> {
  const p = path.join(import.meta.dirname, file);
  const by = new Map<string, PublishedRow>();
  if (!fs.existsSync(p)) return by;
  for (const l of fs.readFileSync(p, 'utf8').split('\n')) {
    if (!l) continue;
    const r: PublishedRow = JSON.parse(l);
    if (r.void || r.repsBase === undefined) continue;
    by.set(cellKey(r), r);
  }
  return by;
}

async function main() {
  const { BENCHMARKS, plan, label } = await import('./sweeps.ts');
  const args = process.argv.slice(2);

  if (args[0] === '--cell') {
    const [, script, variant, n, mode, reps] = args;
    const r = tiersOf({ script, variant, n: Number(n), mode, reps: Number(reps) });
    process.stdout.write(JSON.stringify(r, null, 1) + '\n');
    return;
  }

  const names = args[0] === 'all' || args.length === 0
    ? Object.keys(BENCHMARKS).filter((k) => k !== 'tc11')
    : args;

  for (const name of names) {
    const bench = BENCHMARKS[name];
    if (!bench) {
      process.stderr.write(`unknown sweep ${name}\n`);
      process.exit(2);
    }
    process.stdout.write(`\n${name}: ${bench.what}\n`);
    const files = new Map<string, Map<string, PublishedRow>>();
    for (const { script, out: file, opts, extra } of plan(bench)) {
      const base = path.basename(file);
      if (!files.has(base)) files.set(base, published(base));
      // Only some sweeps record the baseline in their rows, so the lookup falls
      // back to the key without it rather than reporting the cell as unpublished.
      const rows = files.get(base)!;
      const row = rows.get(cellKey({ ...opts, ...extra, baseline: opts.baseline }))
        ?? rows.get(cellKey({ ...opts, ...extra, baseline: null }));
      if (!row) {
        process.stdout.write(`  ${label(opts)}  no published row\n`);
        continue;
      }
      const t = tierPair({ script, ...opts, repsBase: row.repsBase!, repsTest: row.repsTest! });
      const rec = { sweep: name, ...opts, ...extra, baseline: opts.baseline,
        repsBase: row.repsBase, repsTest: row.repsTest, ratio: row.ratio, ...t };
      fs.appendFileSync(TIERS_JL, JSON.stringify(rec) + '\n');
      const show = (m: Record<string, string>) => Object.entries(m).map(([k, v]) => `${k}=${v}`).join(' ');
      process.stdout.write(
        `  ${label(opts)} reps ${row.repsBase}/${row.repsTest}\n` +
        `      base ${show(t.tierBase)}\n` +
        `      test ${show(t.tierTest)}\n` +
        (t.tierMismatch ? `      MISMATCH ${t.tierMismatch.join(', ')}\n` : '') +
        (t.tierOnly ? `      one-sided ${show(t.tierOnly)}\n` : '') +
        (t.tierUnstable ? `      unstable ${t.tierUnstable.join(', ')}\n` : '')
      );
    }
  }
}

if (process.argv[1] === import.meta.filename) await main();
