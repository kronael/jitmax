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
// `EVIDENCE.silent` used to be exempt, on the grounds that it is an argument
// about where a rule must not fire rather than a measurement. It is — but the
// numbers carrying the argument are still measurements, and being the only
// undrived numbers in the repo made them the only ones a re-measurement could
// not move. Five rules' clauses drifted in two days that way (BUGS TC-23,
// TC-26, TC-27, TC-28). The sentences stay hand-written; every number in them
// is interpolated from here like every other, so a re-run moves the argument's
// evidence and leaves its wording alone.
//
// A citation names its rows exactly. Where a file holds more than one sweep of
// the same cell — every runner appends, so it usually does — the discriminator
// is part of the query and is stated in `cells`, because "which rows" is the
// half of a published number that is easiest to get wrong.

import fs from 'node:fs';
import path from 'node:path';

// Protocol rule 13's test, imported rather than re-stated. It has one
// definition, in the file that runs the sweeps, and the gate below is the
// second caller it should always have had (BUGS TC-37).
import { replicates } from '../bench/driver.js';

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
  // One sweep, or several. `accumulating-spread`'s silent clause makes one
  // claim about four forms that live in two files, and quoting two numbers
  // where the clause makes one claim would be a different sentence.
  file: string | string[];
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
  // This citation is ABOUT a cell rule 13 withdrew, and quotes its three
  // disagreeing sweeps as the refutation they are. Without this flag the gate
  // below removes exactly the rows such a citation exists to show. A citation
  // that sets it and finds its cell now REPLICATES fails loudly, for the same
  // reason a stale exception list fails the test suite: the withdrawal has to
  // stop being claimed the moment it stops being true.
  unreplicable?: true;
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
const REMEASURED = new Set([
  'shapes-calibrated.jl',
  'spread.jl',
  'spread-object.jl',
  'select.jl',
  'inline.jl',
  'delete.jl',
  'chained.jl',
  'example.jl',
  'strings.jl',
  'dispatch.jl',
]);

const files = (c: Citation): string[] => (Array.isArray(c.file) ? c.file : [c.file]);

// Does this citation read rows the current runner did not write? Either because
// its sweep is still on the old protocol, or because the citation is ABOUT a
// superseded sweep. A citation over two files needs BOTH re-measured: half a
// claim on new rows and half on old is the mixing this exists to prevent.
const readsHistory = (c: Citation): boolean =>
  Boolean(c.history) || !files(c).every((f) => REMEASURED.has(f));

const fresh = (r: Row): boolean => r.replicate === undefined;
const replicated = (r: Row): boolean => r.protocol === 'replicated';

export const CITATIONS: Record<string, Citation> = {
  // megamorphic-elements
  // `fresh(r)` used to sit in these three picks, to keep the one-sweep rows
  // apart from the handful of cells TC-11 re-ran. Under the current runner
  // EVERY cell is replicated, so `fresh` matches nothing and a pick that still
  // asked for it would fail at `no rows match` — which is what it is for.
  'elem.reads': {
    file: 'shapes-calibrated.jl',
    cells: 'five shapes, reads only, L1 through RAM',
    pick: (r) => r.mode === 'excl' && r.shapes === 5,
    agg: 'range',
    dp: 1,
  },
  'elem.constr.l1l2': {
    file: 'shapes-calibrated.jl',
    cells: 'construction counted, L1 and L2, two to five shapes',
    pick: (r) => r.mode === 'incl' && (r.size === 'L1' || r.size === 'L2'),
    agg: 'range',
  },
  'elem.constr.l3': {
    file: 'shapes-calibrated.jl',
    cells: 'construction counted at RAM size, two to five shapes',
    pick: (r) => r.mode === 'incl' && r.size === 'L3',
    agg: 'range',
  },
  'elem.cells': {
    file: 'shapes-calibrated.jl',
    cells: 'the whole sweep',
    pick: () => true,
    agg: 'count',
  },
  'elem.silent.24': {
    file: 'shapes-calibrated.jl',
    cells: 'two to four shapes, reads only, every size — where the rule stays quiet',
    pick: (r) => r.mode === 'excl' && (r.shapes ?? 0) <= 4,
    agg: 'range',
  },

  // megamorphic-dispatch
  'disp.proto.reads': {
    file: 'dispatch.jl',
    cells: 'a method on a prototype, five and six shapes, reads only',
    // `fresh(r)` sat in this pick and in the two construction ones, to keep the
    // one-sweep rows apart from the cells TC-11 had re-run. Every cell in this
    // file now carries three sweeps under one runner, so the qualifier matched
    // nothing and the citation failed at `no rows match` — which is what it is
    // for. Agreement across the three is the gate's job, not the pick's.
    pick: (r) => r.family === 'cls' && r.mode === 'excl' && (r.k ?? 0) >= 5,
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
      (r.size === 'L1' || r.size === 'L2'),
    agg: 'range',
    dp: 1,
  },
  'disp.constr.l3.five': {
    file: 'dispatch.jl',
    cells: 'a method on a prototype at RAM size, five and six shapes',
    pick: (r) => r.family === 'cls' && r.mode === 'incl' && r.size === 'L3' && (r.k ?? 0) >= 5,
    agg: 'range',
  },
  'disp.constr.l3.four': {
    file: 'dispatch.jl',
    cells: 'the same cells at two to four shapes',
    pick: (r) => r.family === 'cls' && r.mode === 'incl' && r.size === 'L3' && (r.k ?? 0) <= 4,
    agg: 'range',
  },
  'disp.cells': {
    file: 'dispatch.jl',
    cells: 'the whole sweep',
    pick: () => true,
    agg: 'count',
  },
  'disp.silent.proto4': {
    file: 'dispatch.jl',
    cells: 'four shapes on a prototype method, reads only, every size — where the rule is quiet',
    pick: (r) => r.family === 'cls' && r.mode === 'excl' && r.k === 4,
    agg: 'range',
    readme: true,
  },
  'disp.silent.shared4': {
    file: 'dispatch.jl',
    cells: 'four shapes on one shared own-property function, reads only, every size',
    pick: (r) => r.family === 'shr' && r.mode === 'excl' && r.k === 4,
    agg: 'range',
  },
  'disp.silent.own': {
    file: 'dispatch.jl',
    cells: 'every shape carrying its OWN function, reads only, two to six targets, every size',
    pick: (r) => r.family === 'lit' && r.mode === 'excl',
    agg: 'range',
    dp: 1,
    // Quoted in README's defects list, where it was hand-typed as 7.7-11.9x and
    // went on being hand-typed while the sweep moved underneath it.
    readme: true,
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
  // The silent half: a copy no loop re-runs. One claim over four forms that
  // live in two files, so the citation reads both rather than the clause
  // quoting two numbers where it makes one point.
  'spread.silent.reads': {
    file: ['spread.jl', 'spread-object.jl'],
    cells: 'all four accumulating forms with construction excluded, every size',
    pick: (r) => r.mode === 'excl',
    agg: 'range',
  },
  'spread.silent.strings.build': {
    file: 'strings.jl',
    cells: 's = s + x, s += x and s = s.concat(x) against a push-and-join, building only',
    pick: (r) => r.mode === 'build',
    agg: 'range',
  },
  'spread.silent.strings.incl': {
    file: 'strings.jl',
    cells: 'the same three with the read back counted',
    pick: (r) => r.mode === 'incl',
    agg: 'range',
  },
  'spread.silent.strings.incl.ci': {
    file: 'strings.jl',
    cells: 'every interval measured for those nine cells',
    pick: (r) => r.mode === 'incl',
    agg: 'cispan',
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
  'select.silent.number': {
    file: 'select.jl',
    cells: 'the same loop on numbers, both sizes — where the rule stays quiet',
    pick: (r) => r.mode === 'number',
    agg: 'range',
  },
  'select.silent.number.ci': {
    file: 'select.jl',
    cells: 'every interval measured on numbers',
    pick: (r) => r.mode === 'number',
    agg: 'cispan',
  },
  'select.silent.local': {
    file: 'select.jl',
    cells: 'the boxed form kept in a local, where escape analysis could see it, both sizes',
    pick: (r) => r.mode === 'local',
    agg: 'range',
  },

  // chained-allocation. The 0.3 sweep carries `kernel`; the rows before it are
  // from the switch-dispatched kernel TurboFan miscompiled and are void.
  // Both sizes, not the flattering one. This citation named n=1000 alone, and
  // that cell's three sweeps read 7.51 / 6.58 / 6.48 with no common value —
  // rule 13 withdraws it, and what the rule may claim is what is left (TC-37).
  'chained.mapfilter': {
    file: 'chained.jl',
    cells: 'xs.map(f).filter(g) against one fused pass, construction counted, both sizes',
    pick: (r) =>
      r.variant === 'chained' &&
      r.baseline === 'fused' &&
      r.mode === 'incl' &&
      r.kernel === 'dispatch-table',
    agg: 'range',
  },
  'chained.mapfilter.withdrawn': {
    file: 'chained.jl',
    cells: 'the three sweeps of the n=1000 cell this rule used to headline',
    pick: (r) =>
      r.variant === 'chained' &&
      r.baseline === 'fused' &&
      r.mode === 'incl' &&
      r.n === 1000 &&
      r.kernel === 'dispatch-table',
    agg: 'points',
    unreplicable: true,
  },
  'chained.mapfilter.ci': {
    file: 'chained.jl',
    cells: 'every interval measured for the cells that replicate',
    pick: (r) =>
      r.variant === 'chained' &&
      r.baseline === 'fused' &&
      r.mode === 'incl' &&
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
  'chained.silent.reads': {
    file: 'chained.jl',
    cells: 'reading the finished array back, all six chained forms, both sizes',
    pick: (r) => r.mode === 'excl',
    agg: 'range',
  },
  'chained.silent.big': {
    file: 'chained.jl',
    cells: 'map then filter with construction counted at n=100000, where bandwidth dominates',
    pick: (r) => r.variant === 'chained' && r.mode === 'incl' && r.n === 100000,
    agg: 'range',
  },
  'chained.silent.keys': {
    file: 'chained.jl',
    cells: 'Object.keys(o).map(f) against the for-in walk that fuses it, construction counted',
    pick: (r) => r.variant === 'keysmap' && r.mode === 'incl',
    agg: 'range',
  },
  'chained.silent.sort': {
    file: 'chained.jl',
    cells: 'xs.map(f).sort() against the same map, construction counted — .sort() is in place',
    pick: (r) => r.variant === 'chainedsort' && r.mode === 'incl',
    agg: 'range',
  },
  'chained.silent.sort.ci': {
    file: 'chained.jl',
    cells: 'every interval measured for those cells',
    pick: (r) => r.variant === 'chainedsort' && r.mode === 'incl',
    agg: 'cispan',
  },
  'chained.silent.split': {
    file: 'chained.jl',
    cells: 's.split(sep).map(f).join(sep) against two different fusions, construction counted',
    pick: (r) => r.variant === 'splitjoin' && r.mode === 'incl',
    agg: 'range',
  },

  // closed-world
  'inline.reads': {
    file: 'inline.jl',
    cells: 'a callee past the inlining budget against the same callee under it',
    pick: () => true,
    agg: 'range',
    readme: true,
  },
  // `inline.ci100k` stood here and quoted the interval at n=100000. Rule 13
  // withdraws that cell, so what is published about it is the disagreement.
  'inline.withdrawn.100k': {
    file: 'inline.jl',
    cells: 'the three sweeps at n=100000',
    pick: (r) => r.n === 100000,
    agg: 'points',
    unreplicable: true,
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
  'delete.silent.undef.reads': {
    file: 'delete.jl',
    cells: 'assigning undefined instead of deleting, reads only — the fix, not the defect',
    pick: (r) => r.variant === 'rowundef' && r.mode === 'excl',
    agg: 'range',
  },
  'delete.silent.undef.reads.ci': {
    file: 'delete.jl',
    cells: 'every interval measured for that cell',
    pick: (r) => r.variant === 'rowundef' && r.mode === 'excl',
    agg: 'cispan',
  },
  // `delete.silent.undef.build` stood here, for the construction-counted half
  // of the same clause. Its one cell does not replicate; the clause quotes the
  // three sweeps instead of a range they do not agree on.
  'delete.silent.undef.build.withdrawn': {
    file: 'delete.jl',
    cells: 'the three construction-counted sweeps at n=16384',
    pick: (r) => r.variant === 'rowundef' && r.mode === 'incl',
    agg: 'points',
    unreplicable: true,
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

// What makes two rows the same cell. Every discriminator a sweep records, so a
// file that pairs one variant against several baselines does not collapse them
// into one cell and a size-swept file keeps its sizes apart. Undefined fields
// drop out, which is how sweeps that never recorded a baseline compare equal to
// themselves.
const cellKey = (r: Row): string =>
  [r.variant, r.baseline, r.mode, r.n, r.size, r.family, r.k, r.kernel, r.example]
    .filter((x) => x !== undefined)
    .join('|');

// Rule 13, enforced where the number is made. `replicates()` used to be called
// only by `bench/run.js`, to print the word DISAGREES to a terminal while a
// sweep ran, so a cell whose three sweeps refute each other was withdrawn only
// when a human happened to re-read the rows at 3am — and twelve were not
// re-read (BUGS TC-37). A citation now aggregates the cells that replicate and
// nothing else.
//
// A cell measured ONCE is not a replicated cell and rule 13 has nothing to say
// about it. A cell measured twice or more is, however the runner labelled the
// rows: `protocol: 'replicated'` records that a row came from a `--replicate`
// invocation, and a cell whose three sweeps were run as one plain sweep and one
// pair of replications is still three sweeps of that cell under one protocol.
// Reading the marker instead of the count let 46 dispatch cells past this gate.
//
// `mode` is 'gate' for a published number, 'about' for a citation that quotes a
// withdrawal, and 'off' for a citation reading a superseded sweep — rule 13 is
// about the current protocol's rows, and the sweeps kept as history are kept
// BECAUSE they disagree.
type Mode = 'gate' | 'about' | 'off';

function replicating(matched: Row[], mode: Mode = 'gate'): { live: Row[]; withdrawn: string[] } {
  const cells = new Map<string, Row[]>();
  for (const r of matched) {
    const k = cellKey(r);
    const at = cells.get(k);
    if (at) at.push(r);
    else cells.set(k, [r]);
  }
  const live: Row[] = [];
  const withdrawn: string[] = [];
  for (const [key, cell] of cells) {
    const fails = mode !== 'off' && cell.length >= 2 && !replicates(cell);
    if (fails === (mode === 'about')) live.push(...cell);
    else if (fails) withdrawn.push(key);
  }
  return { live, withdrawn: withdrawn.sort() };
}

// Every cell in one sweep file whose three sweeps refute each other, whether or
// not a citation quotes it. `replicating()` sees only the rows one citation
// picks; this sees the file, so a cell that STARTS disagreeing is caught before
// a number is derived from it rather than after. `make test` holds the list.
export function unreplicable(root: string, file: string): string[] {
  return replicating(rows(root, file).filter(current)).withdrawn;
}

export function rows(root: string, file: string): Row[] {
  const p = path.join(root, 'bench', file);
  const text = fs.readFileSync(p, 'utf8').trim();
  return text.split('\n').map((line) => JSON.parse(line) as Row);
}

// Two decimals below ten, one below a hundred, none above: the precision the
// published strings carry, which is the precision the harness can defend.
const places = (v: number): number => (v < 10 ? 2 : v < 100 ? 1 : 0);

function render(key: string, c: Citation, matched: Row[], withdrawn: string[]): string {
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
  if (live.length === 0) {
    // Two different failures, and a reader has to be able to tell them apart:
    // a citation whose cells were renamed matches nothing, and a citation whose
    // every cell refutes itself has data and may not publish it.
    throw new Error(
      c.unreplicable
        ? `${key}: this citation quotes a withdrawal, and its cell now replicates — ` +
          'the withdrawal has stopped being true and the sentence quoting it must go'
        : withdrawn.length > 0
          ? `${key}: every cell is unreplicable under rule 13 (${withdrawn.join(', ')}) — ` +
            'this number cannot be published; withdraw the claim or re-measure'
          : `${key}: no rows match — the citation is stale`
    );
  }
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

export interface Derived {
  value: string;
  // The cells rule 13 withdrew, by key. Published in the provenance, because a
  // range over four cells and a range over six cells are different claims and
  // the string alone cannot say which it is.
  withdrawn: string[];
  cells: number;
}

export function deriveDetail(root: string): Record<string, Derived> {
  const cache = new Map<string, Row[]>();
  const out: Record<string, Derived> = {};
  for (const [key, c] of Object.entries(CITATIONS)) {
    const all: Row[] = [];
    for (const f of files(c)) {
      let some = cache.get(f);
      if (!some) {
        some = rows(root, f);
        cache.set(f, some);
      }
      all.push(...some);
    }
    // Never both. A range that spans two protocols is a range whose ends were
    // measured under different rules, and the file gives no sign of it.
    const want = !readsHistory(c);
    const matched = all.filter((r) => current(r) === want && c.pick(r));
    const mode: Mode = c.history ? 'off' : c.unreplicable ? 'about' : 'gate';
    const { live, withdrawn } = replicating(matched, mode);
    out[key] = {
      value: render(key, c, live, withdrawn),
      withdrawn,
      cells: new Set(matched.map(cellKey)).size,
    };
  }
  return out;
}

export function derive(root: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(deriveDetail(root)).map(([k, d]) => [k, d.value])
  );
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
const provenance = (c: Citation, d: Derived): string =>
  `${c.cells}` +
  (c.unreplicable ? ' — withdrawn under rule 13, quoted as the refutation it is' : '') +
  (readsHistory(c) ? ` — the older sweep, not re-measured under ${RUNNER}` : '') +
  (d.withdrawn.length > 0
    ? ` — ${d.withdrawn.length} of ${d.cells} cells withdrawn as unreplicable (rule 13): ` +
      d.withdrawn.join(', ')
    : '');

export function generate(root: string): string {
  const values = deriveDetail(root);
  const lines = Object.entries(CITATIONS).map(([key, c]) => {
    const d = values[key]!;
    return `  // ${files(c).join(' + ')}: ${provenance(c, d)}\n  '${key}': '${d.value}',`;
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
  const values = deriveDetail(root);
  const lines = Object.entries(CITATIONS).map(
    ([key, c]) =>
      `| \`${values[key]!.value}\` | ${files(c).map((f) => `\`bench/${f}\``).join(' + ')} — ` +
      `${provenance(c, values[key]!)} |`
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
