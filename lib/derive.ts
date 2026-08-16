// Every ratio this project publishes, and the query over the sweep data that
// produces it. Run it to regenerate `lib/numbers.ts`:
//
//   make numbers
//
// A number used to be typed out three times — in `EVIDENCE`, in a table, and in
// README prose — and the three drifted apart twice in one day. Now there is one
// place a number comes from: the `.jl` file it was measured into. `EVIDENCE`
// interpolates the generated strings, README quotes them, and `make test` fails
// when a quoted string is no longer what its rows say.
//
// What stays hand-written: `EVIDENCE.silent`. That clause is an argument about
// where a rule must not fire, not a measurement, and the numbers inside it are
// there to carry the argument.
//
// A citation names its rows exactly. Where a file holds more than one sweep of
// the same cell — every runner appends, so it usually does — the discriminator
// is part of the query and is stated in `cells`, because "which rows" is the
// half of a published number that is easiest to get wrong.

import fs from 'node:fs';
import path from 'node:path';

export interface Row {
  runner?: string;
  variant: string;
  mode: string;
  n: number;
  ratio?: number;
  lo?: number;
  hi?: number;
  baseline?: string;
  example?: string;
  family?: string;
  k?: number;
  size?: string;
  shapes?: number;
  kernel?: string;
  protocol?: string;
  replicate?: number;
  void?: boolean;
}

interface Citation {
  file: string;
  // Which rows, in words. This is the provenance a reader checks.
  cells: string;
  pick: (r: Row) => boolean;
  // range  min..max of the ratio, the form a replicated or swept claim takes
  // points every matching ratio, ascending — "1877x and 2348x"
  // cispan the lowest lower bound to the highest upper bound across every
  //        matching sweep. Rule 13 is that one sweep cannot see what varies
  //        between two, so a replicated cell has no single interval to quote and
  //        quoting one of the three would be picking the flattering one.
  // count  how many distinct cells (variant, baseline, mode, n) matched
  //
  // `point` and `ci` were the singular forms of `range` and `cispan`, and every
  // published cell is now measured three times over, so both of them asked the
  // data for something it no longer has. They did not need replacing — `range`
  // and `cispan` render a single row identically — they needed deleting, and a
  // citation that still wants ONE number out of three sweeps is a citation
  // picking the flattering one.
  agg: 'range' | 'points' | 'cispan' | 'count';
  // Decimal places. The default scales with magnitude; an override is here
  // where the published string does not.
  dp?: number;
  // Quoted verbatim in README as well as in EVIDENCE.
  readme?: boolean;
  // This citation is ABOUT a superseded sweep and must keep reading it even
  // after its file is re-measured — `spread.array.n10000.earlier` exists to
  // show what the replication withdrew. A citation that is merely waiting for
  // its sweep does NOT set this: `REMEASURED` decides that one.
  history?: true;
}

// Rows the current runner wrote. CLAUDE.md: a superseded sweep is history,
// never a source for a published number — so a citation reads this protocol's
// rows unless it says otherwise, and one whose cells have not been re-measured
// fails loudly at `no rows match` rather than quietly averaging two protocols
// together. `bench/run.js` owns this string; it is repeated rather than
// imported because that file is an ESM script with a `process.exit` in it.
const RUNNER = 'r2';
const current = (r: Row): boolean => r.runner === RUNNER;

// The sweeps that have been re-measured under it, whole. A file moves in here
// when every cell `bench/sweeps.js` declares for it has three sweeps under the
// current runner — not when the first cell lands, because a range derived from
// the four cells that finished is a range that silently changed what it is
// about. Until then its citations read the older rows and say so.
//
// One list rather than a flag on each of forty citations: a sweep is finished
// or it is not, and forty places to remember is forty places to forget.
const REMEASURED = new Set(['inline.jl', 'select.jl', 'spread-object.jl', 'spread.jl', 'delete.jl']);

// Does this citation read rows the current runner did not write? Either because
// its sweep is still on the old protocol, or because the citation is ABOUT a
// superseded sweep.
const readsHistory = (c: Citation): boolean => Boolean(c.history) || !REMEASURED.has(c.file);

const fresh = (r: Row): boolean => r.replicate === undefined;
const replicated = (r: Row): boolean => r.protocol === 'replicated';

export const CITATIONS: Record<string, Citation> = {
  // megamorphic-elements
  'elem.reads': {
    file: 'shapes-calibrated.jl',
    cells: 'five shapes, reads only, L1 through RAM',
    pick: (r) => r.mode === 'excl' && r.shapes === 5 && fresh(r),
    agg: 'range',
    dp: 1,
  },
  'elem.constr.l1l2': {
    file: 'shapes-calibrated.jl',
    cells: 'construction counted, L1 and L2, two to five shapes',
    pick: (r) => r.mode === 'incl' && (r.size === 'L1' || r.size === 'L2') && fresh(r),
    agg: 'range',
  },
  'elem.constr.l3': {
    file: 'shapes-calibrated.jl',
    cells: 'construction counted at RAM size, the four replicated cells only',
    pick: (r) => r.mode === 'incl' && r.size === 'L3' && replicated(r),
    agg: 'range',
  },
  'elem.cells': {
    file: 'shapes-calibrated.jl',
    cells: 'the whole sweep',
    pick: () => true,
    agg: 'count',
  },

  // megamorphic-dispatch
  'disp.proto.reads': {
    file: 'dispatch.jl',
    cells: 'a method on a prototype, five and six shapes, reads only',
    pick: (r) => r.family === 'cls' && r.mode === 'excl' && (r.k ?? 0) >= 5 && fresh(r),
    agg: 'range',
    dp: 1,
    readme: true,
  },
  'disp.proto.four': {
    file: 'dispatch.jl',
    cells: 'a method on a prototype, four shapes, reads only at L1',
    pick: (r) => r.family === 'cls' && r.mode === 'excl' && r.size === 'L1' && r.k === 4,
    agg: 'range',
  },
  'disp.proto.five': {
    file: 'dispatch.jl',
    cells: 'a method on a prototype, five shapes, reads only at L1',
    pick: (r) => r.family === 'cls' && r.mode === 'excl' && r.size === 'L1' && r.k === 5,
    agg: 'range',
    // Two places against the 1.56x it is quoted next to: the pair is the step.
    dp: 2,
  },
  'disp.shared.reads': {
    file: 'dispatch.jl',
    cells: 'one shared function held as an own property, five and six shapes, reads only',
    pick: (r) => r.family === 'shr' && r.mode === 'excl' && (r.k ?? 0) >= 5,
    agg: 'range',
    dp: 1,
  },
  'disp.constr.l1l2': {
    file: 'dispatch.jl',
    cells: 'five shapes with construction counted, prototype and own-property, L1 and L2',
    pick: (r) =>
      (r.family === 'cls' || r.family === 'lit') &&
      r.mode === 'incl' &&
      r.k === 5 &&
      (r.size === 'L1' || r.size === 'L2') &&
      fresh(r),
    agg: 'range',
    dp: 1,
  },
  'disp.constr.l3.five': {
    file: 'dispatch.jl',
    cells: 'a method on a prototype at RAM size, five and six shapes, the replicated cells',
    pick: (r) =>
      r.family === 'cls' && r.mode === 'incl' && r.size === 'L3' && (r.k ?? 0) >= 5 && replicated(r),
    agg: 'range',
  },
  'disp.constr.l3.four': {
    file: 'dispatch.jl',
    cells: 'the same cells at two to four shapes',
    pick: (r) =>
      r.family === 'cls' && r.mode === 'incl' && r.size === 'L3' && (r.k ?? 0) <= 4 && replicated(r),
    agg: 'range',
  },
  'disp.cells': {
    file: 'dispatch.jl',
    cells: 'the whole sweep',
    pick: () => true,
    agg: 'count',
  },

  // accumulating-spread
  'spread.array.n1000': {
    file: 'spread.jl',
    cells: 'array spread against push at n=1000, construction counted, both sweeps',
    pick: (r) => r.variant === 'spread' && r.mode === 'incl' && r.n === 1000,
    agg: 'range',
  },
  'spread.array.n10000': {
    file: 'spread.jl',
    cells: 'the same at n=10000, the three replications',
    pick: (r) => r.variant === 'spread' && r.mode === 'incl' && r.n === 10000 && replicated(r),
    agg: 'range',
  },
  'spread.array.n10000.earlier': {
    file: 'spread.jl',
    cells: 'the two sweeps of that cell that predate the replication',
    pick: (r) => r.variant === 'spread' && r.mode === 'incl' && r.n === 10000 && !replicated(r),
    agg: 'points',
    history: true,
  },
  'spread.concat': {
    file: 'spread.jl',
    cells: 'acc.concat(v) against push at n=1000, construction counted',
    pick: (r) => r.variant === 'concat' && r.mode === 'incl' && r.n === 1000,
    agg: 'range',
  },
  'spread.concat.ci': {
    file: 'spread.jl',
    cells: 'every interval measured for that cell',
    pick: (r) => r.variant === 'concat' && r.mode === 'incl' && r.n === 1000,
    agg: 'cispan',
  },
  // The read half of both spread forms, which is what the `fix:` line costs a
  // caller (BUGS TC-16). An array pushed to reads like an array spread into; an
  // object filled key by key does not.
  'spread.array.reads': {
    file: 'spread.jl',
    cells: 'the finished array read back, spread against push, both sizes and both sweeps',
    pick: (r) => r.variant === 'spread' && r.mode === 'excl',
    agg: 'range',
  },
  'spread.object.reads': {
    file: 'spread-object.jl',
    cells: 'the finished object read back, spread against keyed assignment, n=500',
    pick: (r) => r.variant === 'spread' && r.mode === 'excl' && r.n === 500,
    agg: 'range',
  },
  'spread.object': {
    file: 'spread-object.jl',
    cells: 'object spread against keyed assignment at n=500, the three replications',
    pick: (r) => r.variant === 'spread' && r.mode === 'incl' && r.n === 500 && replicated(r),
    agg: 'range',
    readme: true,
  },
  'spread.assign': {
    file: 'spread-object.jl',
    cells: 'Object.assign({}, acc, …) at n=500, the three replications',
    pick: (r) => r.variant === 'assign-copy' && r.mode === 'incl' && r.n === 500 && replicated(r),
    agg: 'range',
  },

  // allocating-select
  'select.heap': {
    file: 'select.jl',
    cells: 'the chosen value stored where it outlives the loop, both sizes',
    pick: (r) => r.mode === 'heap',
    agg: 'range',
  },
  'select.heap.ci10k': {
    file: 'select.jl',
    cells: 'the intervals at n=10000, across the first sweep and the three replications',
    pick: (r) => r.mode === 'heap' && r.n === 10000,
    agg: 'cispan',
  },
  'select.heap.ci100k': {
    file: 'select.jl',
    cells: 'the intervals at n=100000, across the first sweep and the three replications',
    pick: (r) => r.mode === 'heap' && r.n === 100000,
    agg: 'cispan',
  },
  'select.cells': {
    file: 'select.jl',
    cells: 'the whole sweep',
    pick: () => true,
    agg: 'count',
  },

  // chained-allocation. The 0.3 sweep carries `kernel`; the rows before it are
  // from the switch-dispatched kernel TurboFan miscompiled and are void.
  'chained.mapfilter': {
    file: 'chained.jl',
    cells: 'xs.map(f).filter(g) against one fused pass at n=1000, construction counted',
    pick: (r) =>
      r.variant === 'chained' &&
      r.baseline === 'fused' &&
      r.mode === 'incl' &&
      r.n === 1000 &&
      r.kernel === 'dispatch-table',
    agg: 'range',
  },
  'chained.mapfilter.ci': {
    file: 'chained.jl',
    cells: 'every interval measured for that cell',
    pick: (r) =>
      r.variant === 'chained' &&
      r.baseline === 'fused' &&
      r.mode === 'incl' &&
      r.n === 1000 &&
      r.kernel === 'dispatch-table',
    agg: 'cispan',
  },
  'chained.entries.n1000': {
    file: 'chained.jl',
    cells: 'Object.entries(o).map(f) against a for-in walk at n=1000, construction counted',
    pick: (r) =>
      r.variant === 'entriesmap' && r.mode === 'incl' && r.n === 1000 && r.kernel === 'dispatch-table',
    agg: 'range',
  },
  'chained.entries.n1000.ci': {
    file: 'chained.jl',
    cells: 'every interval measured for that cell',
    pick: (r) =>
      r.variant === 'entriesmap' && r.mode === 'incl' && r.n === 1000 && r.kernel === 'dispatch-table',
    agg: 'cispan',
  },
  'chained.entries.n10000': {
    file: 'chained.jl',
    cells: 'the same at n=10000',
    pick: (r) =>
      r.variant === 'entriesmap' &&
      r.mode === 'incl' &&
      r.n === 10000 &&
      r.kernel === 'dispatch-table',
    agg: 'range',
  },
  'chained.entries.n10000.ci': {
    file: 'chained.jl',
    cells: 'every interval measured for that cell',
    pick: (r) =>
      r.variant === 'entriesmap' &&
      r.mode === 'incl' &&
      r.n === 10000 &&
      r.kernel === 'dispatch-table',
    agg: 'cispan',
  },
  'chained.cells': {
    file: 'chained.jl',
    cells: 'the 0.3 sweep, which is every row the dispatch-table kernel wrote',
    pick: (r) => r.kernel === 'dispatch-table',
    agg: 'count',
  },

  // closed-world
  'inline.reads': {
    file: 'inline.jl',
    cells: 'a callee past the inlining budget against the same callee under it',
    pick: () => true,
    agg: 'range',
    readme: true,
  },
  'inline.ci100k': {
    file: 'inline.jl',
    cells: 'the interval at n=100000',
    pick: (r) => r.n === 100000,
    agg: 'cispan',
  },
  'inline.ci1000': {
    file: 'inline.jl',
    cells: 'the interval at n=1000',
    pick: (r) => r.n === 1000,
    agg: 'cispan',
  },
  'inline.cells': {
    file: 'inline.jl',
    cells: 'the whole sweep',
    pick: () => true,
    agg: 'count',
  },

  // delete-property
  'delete.rows': {
    file: 'delete.jl',
    cells: 'one delete per object, reads only, at n=16384 and n=262144',
    pick: (r) =>
      r.variant === 'rowdel' &&
      r.baseline === 'rowbase' &&
      r.mode === 'excl' &&
      (r.n === 16384 || r.n === 262144),
    agg: 'range',
    dp: 1,
    readme: true,
  },
  'delete.vs.undefined': {
    file: 'delete.jl',
    cells: 'the same delete against assigning undefined instead, n=16384',
    pick: (r) =>
      r.variant === 'rowdel' && r.baseline === 'rowundef' && r.mode === 'excl' && r.n === 16384,
    agg: 'range',
    dp: 1,
  },
  'delete.single': {
    file: 'delete.jl',
    cells: 'one object with one delete, reads only, every size and every sweep',
    pick: (r) => r.variant === 'shdel' && r.mode === 'excl',
    agg: 'range',
    dp: 1,
    readme: true,
  },
  'delete.rows.constr': {
    file: 'delete.jl',
    cells: 'one delete per object with construction counted, n=256',
    pick: (r) =>
      r.variant === 'rowdel' && r.baseline === 'rowbase' && r.mode === 'incl' && r.n === 256,
    agg: 'range',
    dp: 1,
  },
  'delete.single.constr': {
    file: 'delete.jl',
    cells: 'the single object with construction counted, every size',
    pick: (r) => r.variant === 'shdel' && r.mode === 'incl',
    agg: 'range',
    dp: 1,
  },
  'delete.cells': {
    file: 'delete.jl',
    cells: 'the whole sweep',
    pick: () => true,
    agg: 'count',
  },

  // The end-to-end examples, where a printed `fix:` line was applied to
  // somebody else's function and the whole call was timed. This one is here
  // because a rule QUOTES it: the object form of accumulating-spread's fix
  // makes the caller's reads slower, and the fix line has to say so (TC-16).
  'ex.mergeall.reads': {
    file: 'example.jl',
    cells: "remeda mergeAll — the caller's reads on the result, both sizes, all six sweeps",
    pick: (r) => r.example === 'remeda-merge-all' && r.mode === 'excl',
    agg: 'range',
  },
};

export function rows(root: string, file: string): Row[] {
  const p = path.join(root, 'bench', file);
  const text = fs.readFileSync(p, 'utf8').trim();
  return text.split('\n').map((line) => JSON.parse(line) as Row);
}

// Two decimals below ten, one below a hundred, none above: the precision the
// published strings carry, which is the precision the harness can defend.
const places = (v: number): number => (v < 10 ? 2 : v < 100 ? 1 : 0);

function render(key: string, c: Citation, matched: Row[]): string {
  const live = matched.filter((r) => !r.void && r.ratio !== undefined);
  if (c.agg === 'count') {
    // How many distinct CELLS, not how many rows: a cell measured three times is
    // one cell. The baseline is part of a cell's identity only where the sweep
    // recorded it — `chained` and `delete` pair one variant against several
    // baselines and would collapse without it — and only where EVERY matched row
    // has it. The runner started recording it in sweeps that never did, and
    // without this the same six select cells counted as twelve: six spelled with
    // a baseline and six spelled without.
    const everywhere = matched.every((r) => r.baseline !== undefined);
    const cells = new Set(
      matched.map((r) => `${r.variant}|${everywhere ? r.baseline : ''}|${r.mode}|${r.n}`)
    );
    return String(cells.size);
  }
  if (live.length === 0) throw new Error(`${key}: no rows match — the citation is stale`);
  const fmt = (v: number, ref: number): string => v.toFixed(c.dp ?? places(ref));
  if (c.agg === 'cispan') {
    const hi = Math.max(...live.map((r) => r.hi!));
    return `${fmt(Math.min(...live.map((r) => r.lo!)), hi)}-${fmt(hi, hi)}`;
  }
  const ratios = live.map((r) => r.ratio!).sort((a, b) => a - b);
  const top = ratios[ratios.length - 1]!;
  if (c.agg === 'points') return ratios.map((v) => `${fmt(v, top)}x`).join(' and ');
  const lo = fmt(ratios[0]!, top);
  const hi = fmt(top, top);
  return lo === hi ? `${lo}x` : `${lo}-${hi}x`;
}

export function derive(root: string): Record<string, string> {
  const cache = new Map<string, Row[]>();
  const out: Record<string, string> = {};
  for (const [key, c] of Object.entries(CITATIONS)) {
    let all = cache.get(c.file);
    if (!all) {
      all = rows(root, c.file);
      cache.set(c.file, all);
    }
    // Never both. A range that spans two protocols is a range whose ends were
    // measured under different rules, and the file gives no sign of it.
    const want = !readsHistory(c);
    out[key] = render(key, c, all.filter((r) => current(r) === want && c.pick(r)));
  }
  return out;
}

const HEADER = `// GENERATED by \`make numbers\` from the .jl sweeps. Do not edit by hand:
// lib/derive.ts holds the query behind every string here, and \`make test\`
// fails when this file and the data disagree.
`;

// The provenance a reader checks, with the protocol on the end of it. Written
// here rather than typed into each `cells` string: which protocol a number came
// from is derived from the same flag that decides which rows it reads, so the
// two cannot drift, and a citation that gets re-measured stops claiming to be
// old the moment its flag comes off.
const provenance = (c: Citation): string =>
  `${c.cells}${readsHistory(c) ? ` — the older sweep, not re-measured under ${RUNNER}` : ''}`;

export function generate(root: string): string {
  const values = derive(root);
  const lines = Object.entries(CITATIONS).map(([key, c]) => {
    return `  // ${c.file}: ${provenance(c)}\n  '${key}': '${values[key]}',`;
  });
  return `${HEADER}\nexport const N: Record<string, string> = {\n${lines.join('\n')}\n};\n`;
}

// README carries the same numbers, so README gets them from here too. The block
// between these markers is written by `make numbers` and asserted by `make
// test`; the prose around it quotes the same strings, and the test checks the
// ones it quotes.
const BEGIN = '<!-- generated: numbers -->';
const END = '<!-- /generated -->';

export function markdown(root: string): string {
  const values = derive(root);
  const lines = Object.entries(CITATIONS).map(
    ([key, c]) => `| \`${values[key]}\` | \`bench/${c.file}\` — ${provenance(c)} |`
  );
  return [
    BEGIN,
    '',
    '| Number | The rows it is |',
    '|---|---|',
    ...lines,
    '',
    END,
  ].join('\n');
}

// README's prose with the generated block cut out of it. The prose quotes some
// of these numbers in sentences, and a check that the block contains them would
// only ever be checking the block against itself.
export function withoutBlock(text: string): string {
  const from = text.indexOf(BEGIN);
  const to = text.indexOf(END);
  if (from === -1 || to === -1) throw new Error('README.md has lost its generated-numbers markers');
  return text.slice(0, from) + text.slice(to + END.length);
}

export function spliceReadme(text: string, block: string): string {
  const from = text.indexOf(BEGIN);
  const to = text.indexOf(END);
  if (from === -1 || to === -1) throw new Error('README.md has lost its generated-numbers markers');
  return text.slice(0, from) + block + text.slice(to + END.length);
}

if (process.argv[2] === '--write') {
  const root = path.join(import.meta.dirname, '..');
  fs.writeFileSync(path.join(root, 'lib', 'numbers.ts'), generate(root));
  const readmePath = path.join(root, 'README.md');
  fs.writeFileSync(
    readmePath,
    spliceReadme(fs.readFileSync(readmePath, 'utf8'), markdown(root))
  );
  process.stdout.write(
    `numbers: ${Object.keys(CITATIONS).length} citations -> lib/numbers.ts, README.md\n`
  );
}
