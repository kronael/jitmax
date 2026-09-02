// Every ratio this project publishes, and the query over the sweep data that
// produces it. Run it to regenerate `lib/numbers.ts`:
//
//   make numbers
//
// A number used to be typed out three times — in `EVIDENCE`, in a table, and in
// README prose — and the three drifted apart twice in one day. Now there is one
// place a number comes from: the `.jl` file it was measured into. `EVIDENCE`
// interpolates the generated strings, the docs quote them, and `make test` fails
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
import { replicates, RUNNER } from '../bench/driver.ts';
import { frozen, hasReading } from '../bench/env.ts';
// Rule 9's gate as a function of the core count, imported for the same reason:
// a row is judged against the gate its own machine derives, and the model has
// one home (bench/env.ts).
import { gateFor } from '../bench/env.ts';

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
  // What the machine was doing as the row was written, and the gate it ran
  // under. `load1`/`env.maxLoad` is the pair the first runner recorded;
  // `runnable`/`env.maxRunnable` — runnable threads outside the harness — is
  // the pair the gate actually governs since TC-46. `overGate` below reads
  // whichever pair a row has.
  load1?: number;
  runnable?: number;
  // Eighteen select rows record their reading INSIDE env rather than beside it.
  env?: { maxLoad?: number; maxRunnable?: number; load1?: number; cores?: number };
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
  // shared rule 13's AGREEMENT: the interval every sweep of a cell contains,
  //        [max(lo), min(hi)], spanned across cells where the citation reads
  //        more than one. `cispan` is the UNION of those same intervals — where
  //        ANY sweep landed — so the two are different claims about identical
  //        rows, and README printed both for one cell with nothing comparing
  //        them (BUGS TC-73). A sentence about what three sweeps AGREE on wants
  //        this one; `range`, the spread of the three point estimates, is a
  //        third answer again.
  // count  how many distinct cells (variant, baseline, mode, n) matched
  //
  // `point` and `ci` were the singular forms of `range` and `cispan`, and every
  // published cell is now measured three times over, so both of them asked the
  // data for something it no longer has. They did not need replacing — `range`
  // and `cispan` render a single row identically — they needed deleting, and a
  // citation that still wants ONE number out of three sweeps is a citation
  // picking the flattering one.
  agg: 'range' | 'points' | 'cispan' | 'shared' | 'count' | 'minn' | 'sizes';
  // Decimal places. The default scales with magnitude; an override is here
  // where the published string does not.
  dp?: number;
  // Quoted verbatim in the published docs as well as in EVIDENCE.
  readme?: boolean;
  // What this citation's cells claim, which is the bar rule 6 holds them to —
  // stated on every citation, never inferred, so a new one cannot skip the
  // question (BUGS TC-84):
  //   'rule'     evidence a rule ships on. The agreed interval's lower bound
  //              must clear 1.00x, which also rejects every interval that
  //              spans 1.0.
  //   'broad'    a broad warning's evidence — additionally a point estimate at
  //              or above 1.10x and a lower bound above 1.05x. Only
  //              `chained-allocation` claims this today: its own EVIDENCE
  //              holds its silent clause to the broad-warning bar, and no
  //              other rule's says which kind it is.
  //   'nothing'  a silent clause's refutation, a below-threshold contrast, an
  //              interval or count quoted as provenance, history. Rule 6 ships
  //              a refutation as a result and gates none of these; rule 13
  //              still does.
  claims: 'rule' | 'broad' | 'nothing';
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
  // This citation is ABOUT a cell rule 6 rejects, and quotes its number as the
  // refutation it is — the same shape as `unreplicable` above, for the other
  // gate. `claims` still names the bar the cell is judged against; this flag
  // says the citation publishes the failure rather than the pass. One that
  // sets it and finds its cell now clears the bar fails loudly.
  rejected?: true;
}

// Rows the current runner wrote. CLAUDE.md: a superseded sweep is history,
// never a source for a published number — so a citation reads this protocol's
// rows unless it says otherwise, and one whose cells have not been re-measured
// fails loudly at `no rows match` rather than quietly averaging two protocols
// together. The marker is bench/driver.ts's, imported: it used to be a second
// `const RUNNER = 'r2'` here, and the two had to be equal with nothing making
// them equal — the writer moving to `r3` alone would fail every citation.
//
// Rule 9 asks for the environment in EVERY row, and 689 rows carrying this
// marker predate the field entirely. Withdrawing them is a re-measurement of
// ten sweeps and an owner's call, not a query (BUGS TC-136); `hasReading` is
// applied per citation instead, where a sweep HAS been re-measured.
export const current = (r: Row): boolean => r.runner === RUNNER;

// The sweeps that have been re-measured under it, whole. A file moves in here
// when every cell `bench/sweeps.ts` declares for it has three sweeps under the
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
  'shape-sets.jl',
  // Both swept for the first time under this protocol, so every one of their
  // rows is current: `arguments.jl` 9 cells and `sparse.jl` 12, each with three
  // in-gate runs.
  'arguments.jl',
  'sparse.jl',
]);

const files = (c: Citation): string[] => (Array.isArray(c.file) ? c.file : [c.file]);

// Does this citation read rows the current runner did not write? Either because
// its sweep is still on the old protocol, or because the citation is ABOUT a
// superseded sweep. A citation over two files needs BOTH re-measured: half a
// claim on new rows and half on old is the mixing this exists to prevent.
const readsHistory = (c: Citation): boolean =>
  Boolean(c.history) || !files(c).every((f) => REMEASURED.has(f));

const replicated = (r: Row): boolean => r.protocol === 'replicated';

export const CITATIONS: Record<string, Citation> = {
  // megamorphic-elements
  //
  // These read `shape-sets.jl`, not `shapes-calibrated.jl`. The older sweep
  // varies key ORDER: five builders over one key set, which is five V8 maps and
  // exactly one TypeScript type — so it prices a program this rule is silent on
  // (BUGS TC-42). `shape-sets.jl` is the same 24 cells over five key SETS, the
  // shapes a declared type can express and this rule counts. The key-order
  // sweep stays on disk and stays quoted, as the contrast it is.
  'elem.reads': {
    claims: 'rule',
    file: 'shape-sets.jl',
    cells: 'five distinct property sets, reads only, L1 through RAM',
    pick: (r) => r.mode === 'excl' && r.shapes === 5,
    agg: 'range',
    dp: 1,
    readme: true,
  },
  'elem.constr.l1l2': {
    claims: 'rule',
    file: 'shape-sets.jl',
    cells: 'construction counted, five property sets, L1 and L2',
    pick: (r) => r.mode === 'incl' && r.shapes === 5 && (r.size === 'L1' || r.size === 'L2'),
    agg: 'range',
  },
  'elem.constr.l3': {
    claims: 'rule',
    file: 'shape-sets.jl',
    cells: 'construction counted at RAM size, five property sets',
    pick: (r) => r.mode === 'incl' && r.shapes === 5 && r.size === 'L3',
    agg: 'range',
  },
  'elem.cells': {
    claims: 'nothing',
    file: 'shape-sets.jl',
    cells: 'the whole sweep',
    pick: () => true,
    agg: 'count',
  },
  'elem.silent.24': {
    claims: 'nothing',
    file: 'shape-sets.jl',
    cells: 'two to four property sets, reads only, every size — where the rule stays quiet',
    pick: (r) => r.mode === 'excl' && (r.shapes ?? 0) <= 4,
    agg: 'range',
  },
  // The key-order sweep, kept because the contrast is the finding: the same
  // five maps at the same load site, reached through a shape no TypeScript type
  // can express. It is what the rule CANNOT see, and it costs the same order as
  // what it can.
  'elem.keyorder.reads': {
    claims: 'nothing',
    file: 'shapes-calibrated.jl',
    cells: 'five key orders of ONE key set, reads only, L1 through RAM',
    pick: (r) => r.mode === 'excl' && r.shapes === 5,
    agg: 'range',
    dp: 1,
  },

  // megamorphic-dispatch
  'disp.proto.reads': {
    claims: 'rule',
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
    claims: 'nothing',
    file: 'dispatch.jl',
    cells: 'a method on a prototype, four shapes, reads only at L1',
    pick: (r) => r.family === 'cls' && r.mode === 'excl' && r.size === 'L1' && r.k === 4,
    agg: 'range',
  },
  'disp.proto.five': {
    claims: 'rule',
    file: 'dispatch.jl',
    cells: 'a method on a prototype, five shapes, reads only at L1',
    pick: (r) => r.family === 'cls' && r.mode === 'excl' && r.size === 'L1' && r.k === 5,
    agg: 'range',
    // Two places against the 1.56x it is quoted next to: the pair is the step.
    dp: 2,
  },
  'disp.shared.reads': {
    claims: 'rule',
    file: 'dispatch.jl',
    cells: 'one shared function held as an own property, five and six shapes, reads only',
    pick: (r) => r.family === 'shr' && r.mode === 'excl' && (r.k ?? 0) >= 5,
    agg: 'range',
    dp: 1,
  },
  'disp.constr.l1l2': {
    claims: 'rule',
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
    claims: 'rule',
    file: 'dispatch.jl',
    cells: 'a method on a prototype at RAM size, five and six shapes',
    pick: (r) => r.family === 'cls' && r.mode === 'incl' && r.size === 'L3' && (r.k ?? 0) >= 5,
    agg: 'range',
  },
  'disp.constr.l3.four': {
    claims: 'nothing',
    file: 'dispatch.jl',
    cells: 'the same cells at two to four shapes',
    pick: (r) => r.family === 'cls' && r.mode === 'incl' && r.size === 'L3' && (r.k ?? 0) <= 4,
    agg: 'range',
  },
  'disp.cells': {
    claims: 'nothing',
    file: 'dispatch.jl',
    cells: 'the whole sweep',
    pick: () => true,
    agg: 'count',
  },
  'disp.silent.proto4': {
    claims: 'nothing',
    file: 'dispatch.jl',
    cells: 'four shapes on a prototype method, reads only, every size — where the rule is quiet',
    pick: (r) => r.family === 'cls' && r.mode === 'excl' && r.k === 4,
    agg: 'range',
    readme: true,
  },
  'disp.silent.shared4': {
    claims: 'nothing',
    file: 'dispatch.jl',
    cells: 'four shapes on one shared own-property function, reads only, every size',
    pick: (r) => r.family === 'shr' && r.mode === 'excl' && r.k === 4,
    agg: 'range',
  },
  'disp.silent.own': {
    claims: 'nothing',
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
    claims: 'rule',
    file: 'spread.jl',
    cells: 'array spread against push at n=1000, construction counted, both sweeps',
    pick: (r) => r.variant === 'spread' && r.mode === 'incl' && r.n === 1000,
    agg: 'range',
  },
  'spread.array.n10000': {
    claims: 'rule',
    file: 'spread.jl',
    cells: 'the same at n=10000, the three replications',
    pick: (r) => r.variant === 'spread' && r.mode === 'incl' && r.n === 10000 && replicated(r),
    agg: 'range',
  },
  'spread.array.n10000.earlier': {
    claims: 'nothing',
    file: 'spread.jl',
    cells: 'the two sweeps of that cell that predate the replication',
    pick: (r) => r.variant === 'spread' && r.mode === 'incl' && r.n === 10000 && !replicated(r),
    agg: 'points',
    history: true,
  },
  'spread.concat': {
    claims: 'rule',
    file: 'spread.jl',
    cells: 'acc.concat(v) against push at n=1000, construction counted',
    pick: (r) => r.variant === 'concat' && r.mode === 'incl' && r.n === 1000,
    agg: 'range',
  },
  'spread.concat.ci': {
    claims: 'nothing',
    file: 'spread.jl',
    cells: 'every interval measured for that cell',
    pick: (r) => r.variant === 'concat' && r.mode === 'incl' && r.n === 1000,
    agg: 'cispan',
  },
  // The read half of both spread forms, which is what the `fix:` line costs a
  // caller (BUGS TC-16). An array pushed to reads like an array spread into; an
  // object filled key by key does not.
  'spread.array.reads': {
    claims: 'nothing',
    file: 'spread.jl',
    cells: 'the finished array read back, spread against push, both sizes and both sweeps',
    pick: (r) => r.variant === 'spread' && r.mode === 'excl',
    agg: 'range',
  },
  'spread.object.reads': {
    claims: 'nothing',
    file: 'spread-object.jl',
    cells: 'the finished object read back, spread against keyed assignment, n=500',
    pick: (r) => r.variant === 'spread' && r.mode === 'excl' && r.n === 500,
    agg: 'range',
  },
  'spread.object': {
    claims: 'rule',
    file: 'spread-object.jl',
    cells: 'object spread against keyed assignment at n=500, the three replications',
    pick: (r) => r.variant === 'spread' && r.mode === 'incl' && r.n === 500 && replicated(r),
    agg: 'range',
    readme: true,
  },
  'spread.assign': {
    claims: 'rule',
    file: 'spread-object.jl',
    cells: 'Object.assign({}, acc, …) at n=500, the three replications',
    pick: (r) => r.variant === 'assign-copy' && r.mode === 'incl' && r.n === 500 && replicated(r),
    agg: 'range',
  },
  // The silent half: a copy no loop re-runs. One claim over four forms that
  // live in two files, so the citation reads both rather than the clause
  // quoting two numbers where it makes one point.
  'spread.silent.reads': {
    claims: 'nothing',
    file: ['spread.jl', 'spread-object.jl'],
    cells: 'all four accumulating forms with construction excluded, every size',
    pick: (r) => r.mode === 'excl',
    agg: 'range',
  },
  'spread.silent.strings.build': {
    claims: 'nothing',
    file: 'strings.jl',
    cells: 's = s + x, s += x and s = s.concat(x) against a push-and-join, building only',
    pick: (r) => r.mode === 'build',
    agg: 'range',
  },
  'spread.silent.strings.incl': {
    claims: 'nothing',
    file: 'strings.jl',
    cells: 'the same three with the read back counted',
    pick: (r) => r.mode === 'incl',
    agg: 'range',
  },
  'spread.silent.strings.incl.ci': {
    claims: 'nothing',
    file: 'strings.jl',
    cells: 'every interval measured for those nine cells',
    pick: (r) => r.mode === 'incl',
    agg: 'cispan',
  },

  // allocating-select. Every pick here asks `hasReading`, which the other
  // sweeps' picks do not. select.jl holds two sweeps of the same six cells: the
  // eighteen rows that stamped ONE sweep-wide reading onto an evening's work,
  // and the eighteen that re-measured them with the reading taken as each row
  // was written. `frozenReading` below counts the first set and says its exit
  // condition is a re-measurement rather than a query; this is that
  // re-measurement being read (BUGS TC-134). The two sweeps agree cell for
  // cell, so nothing here moved — what moved is that a reader can now check
  // what the machine was doing under every number.
  'select.heap': {
    claims: 'rule',
    file: 'select.jl',
    cells: 'the chosen value stored where it outlives the loop, both sizes',
    pick: (r) => r.mode === 'heap' && hasReading(r),
    agg: 'range',
  },
  'select.heap.ci10k': {
    claims: 'nothing',
    file: 'select.jl',
    cells: 'the intervals at n=10000, across the three replications of the re-measurement',
    pick: (r) => r.mode === 'heap' && r.n === 10000 && hasReading(r),
    agg: 'cispan',
  },
  'select.heap.ci100k': {
    claims: 'nothing',
    file: 'select.jl',
    cells: 'the intervals at n=100000, across the three replications of the re-measurement',
    pick: (r) => r.mode === 'heap' && r.n === 100000 && hasReading(r),
    agg: 'cispan',
  },
  'select.cells': {
    claims: 'nothing',
    file: 'select.jl',
    cells: 'the whole re-measurement',
    pick: (r) => hasReading(r),
    agg: 'count',
  },
  'select.silent.number': {
    claims: 'nothing',
    file: 'select.jl',
    cells: 'the same loop on numbers at n=10000 — where the rule stays quiet',
    pick: (r) => r.mode === 'number' && r.n === 10000 && hasReading(r),
    agg: 'range',
  },
  'select.silent.number.ci': {
    claims: 'nothing',
    file: 'select.jl',
    cells: 'every interval measured on numbers at n=10000',
    pick: (r) => r.mode === 'number' && r.n === 10000 && hasReading(r),
    agg: 'cispan',
  },
  // The n=100000 number cell. Rule 13 withdraws it — three sweeps at 0.97,
  // 0.89 and 1.03 — so what is published about it is the disagreement, not a
  // range that would read as a measurement of nothing.
  'select.silent.number.withdrawn': {
    claims: 'nothing',
    file: 'select.jl',
    cells: 'the three sweeps of the n=100000 number cell',
    pick: (r) => r.mode === 'number' && r.n === 100000 && hasReading(r),
    agg: 'points',
    unreplicable: true,
  },
  'select.silent.local': {
    claims: 'nothing',
    file: 'select.jl',
    cells: 'the boxed form kept in a local, where escape analysis could see it, both sizes',
    pick: (r) => r.mode === 'local' && hasReading(r),
    agg: 'range',
  },

  // chained-allocation. The 0.3 sweep carries `kernel`; the rows before it are
  // from the switch-dispatched kernel TurboFan miscompiled and are void.
  // Both sizes, not the flattering one. This citation named n=1000 alone, and
  // that cell's three sweeps read 7.51 / 6.58 / 6.48 with no common value —
  // rule 13 withdraws it, and what the rule may claim is what is left (TC-37).
  'chained.mapfilter': {
    claims: 'broad',
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
    claims: 'nothing',
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
    claims: 'nothing',
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
    claims: 'broad',
    file: 'chained.jl',
    cells: 'Object.entries(o).map(f) against a for-in walk at n=1000, construction counted',
    pick: (r) =>
      r.variant === 'entriesmap' && r.mode === 'incl' && r.n === 1000 && r.kernel === 'dispatch-table',
    agg: 'range',
  },
  'chained.entries.n1000.ci': {
    claims: 'nothing',
    file: 'chained.jl',
    cells: 'every interval measured for that cell',
    pick: (r) =>
      r.variant === 'entriesmap' && r.mode === 'incl' && r.n === 1000 && r.kernel === 'dispatch-table',
    agg: 'cispan',
  },
  'chained.entries.n10000': {
    claims: 'broad',
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
    claims: 'nothing',
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
    claims: 'nothing',
    file: 'chained.jl',
    cells: 'the 0.3 sweep, which is every row the dispatch-table kernel wrote',
    pick: (r) => r.kernel === 'dispatch-table',
    agg: 'count',
  },
  'chained.n.min': {
    claims: 'nothing',
    file: 'chained.jl',
    cells: 'the smallest n any construction-counted cell in this sweep was measured at',
    pick: (r) => r.mode === 'incl',
    agg: 'minn',
  },
  'chained.silent.reads': {
    claims: 'nothing',
    file: 'chained.jl',
    cells: 'reading the finished array back, all six chained forms, both sizes',
    pick: (r) => r.mode === 'excl',
    agg: 'range',
  },
  'chained.silent.keys': {
    claims: 'nothing',
    file: 'chained.jl',
    cells: 'Object.keys(o).map(f) against the for-in walk that fuses it, construction counted',
    pick: (r) => r.variant === 'keysmap' && r.mode === 'incl',
    agg: 'range',
  },
  'chained.silent.sort': {
    claims: 'nothing',
    file: 'chained.jl',
    cells: 'xs.map(f).sort() against the same map, construction counted — .sort() is in place',
    pick: (r) => r.variant === 'chainedsort' && r.mode === 'incl',
    agg: 'range',
  },
  'chained.silent.sort.ci': {
    claims: 'nothing',
    file: 'chained.jl',
    cells: 'every interval measured for those cells',
    pick: (r) => r.variant === 'chainedsort' && r.mode === 'incl',
    agg: 'cispan',
  },
  'chained.silent.split': {
    claims: 'nothing',
    file: 'chained.jl',
    cells: 's.split(sep).map(f).join(sep) against two different fusions, construction counted',
    pick: (r) => r.variant === 'splitjoin' && r.mode === 'incl',
    agg: 'range',
  },

  // closed-world
  'inline.reads': {
    claims: 'rule',
    file: 'inline.jl',
    cells: 'a callee past the inlining budget against the same callee under it',
    pick: () => true,
    agg: 'range',
    readme: true,
  },
  // `inline.ci100k` stood here and quoted the interval at n=100000. Rule 13
  // withdraws that cell, so what is published about it is the disagreement.
  'inline.withdrawn.100k': {
    claims: 'nothing',
    file: 'inline.jl',
    cells: 'the three sweeps at n=100000',
    pick: (r) => r.n === 100000,
    agg: 'points',
    unreplicable: true,
  },
  'inline.ci1000': {
    claims: 'nothing',
    file: 'inline.jl',
    cells: 'the interval at n=1000',
    pick: (r) => r.n === 1000,
    agg: 'cispan',
  },
  'inline.cells': {
    claims: 'nothing',
    file: 'inline.jl',
    cells: 'the whole sweep',
    pick: () => true,
    agg: 'count',
  },

  // delete-property
  'delete.rows': {
    claims: 'rule',
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
  'delete.rows.sizes': {
    claims: 'nothing',
    file: 'delete.jl',
    cells: 'the sizes the cells behind delete.rows still replicate at',
    pick: (r) =>
      r.variant === 'rowdel' &&
      r.baseline === 'rowbase' &&
      r.mode === 'excl' &&
      (r.n === 16384 || r.n === 262144),
    agg: 'sizes',
  },
  'delete.vs.undefined': {
    claims: 'rule',
    file: 'delete.jl',
    cells: 'the same delete against assigning undefined instead, n=16384',
    pick: (r) =>
      r.variant === 'rowdel' && r.baseline === 'rowundef' && r.mode === 'excl' && r.n === 16384,
    agg: 'range',
    dp: 1,
  },
  'delete.single': {
    claims: 'rule',
    file: 'delete.jl',
    cells: 'one object with one delete, reads only, every size and every sweep',
    pick: (r) => r.variant === 'shdel' && r.mode === 'excl',
    agg: 'range',
    dp: 1,
    readme: true,
  },
  'delete.rows.constr': {
    claims: 'rule',
    file: 'delete.jl',
    cells: 'one delete per object with construction counted, n=256',
    pick: (r) =>
      r.variant === 'rowdel' && r.baseline === 'rowbase' && r.mode === 'incl' && r.n === 256,
    agg: 'range',
    dp: 1,
  },
  'delete.single.constr': {
    claims: 'rule',
    file: 'delete.jl',
    cells: 'the single object with construction counted, every size',
    pick: (r) => r.variant === 'shdel' && r.mode === 'incl',
    agg: 'range',
    dp: 1,
  },
  'delete.cells': {
    claims: 'nothing',
    file: 'delete.jl',
    cells: 'the whole sweep',
    pick: () => true,
    agg: 'count',
  },
  'delete.silent.undef.reads': {
    claims: 'nothing',
    file: 'delete.jl',
    cells: 'assigning undefined instead of deleting, reads only — the fix, not the defect',
    pick: (r) => r.variant === 'rowundef' && r.mode === 'excl',
    agg: 'range',
  },
  'delete.silent.undef.reads.ci': {
    claims: 'nothing',
    file: 'delete.jl',
    cells: 'every interval measured for that cell',
    pick: (r) => r.variant === 'rowundef' && r.mode === 'excl',
    agg: 'cispan',
  },
  // `delete.silent.undef.build` stood here, for the construction-counted half
  // of the same clause. Its one cell does not replicate; the clause quotes the
  // three sweeps instead of a range they do not agree on.
  'delete.silent.undef.build.withdrawn': {
    claims: 'nothing',
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
  // The whole call, not the line — what a reader actually gets. Every one of
  // these is far below the microbenchmark ratio the rule cites, which is the
  // most useful thing in the file and the reason the page prints both.
  'ex.assign.whole': {
    claims: 'rule',
    file: 'example.jl',
    cells: 'radash assign — the whole call, both sizes, three sweeps each',
    pick: (r) => r.example === 'radash-assign' && r.mode === 'incl',
    agg: 'range',
  },
  'ex.assign.reads': {
    claims: 'rule',
    file: 'example.jl',
    cells: "radash assign — the caller's reads of the result, both sizes, what each cell's three sweeps agree on",
    pick: (r) => r.example === 'radash-assign' && r.mode === 'excl',
    agg: 'shared',
  },
  'ex.omit.whole': {
    claims: 'rule',
    file: 'example.jl',
    cells: 'es-toolkit omit — the whole call, 12 and 48 keys',
    pick: (r) => r.example === 'estoolkit-omit' && r.mode === 'incl',
    agg: 'range',
  },
  // The two sizes `delete-property`'s printed FIX names — the only user-facing
  // numbers in that rule that were typed by hand rather than read from the
  // rows, which is the re-aimed TC-48. The test asserted the sentence still
  // said 12 and 48, never that the data still did.
  // `arguments` against rest parameters, the folk advice this project set out
  // to price and could not. Nine cells, three sweeps each: seven replicate and
  // every one of them contains 1.00, and two agree on nothing at all. The
  // sweep is published as the refutation it is (BUGS TC-53).
  'args.null': {
    claims: 'nothing',
    file: 'arguments.jl',
    cells: 'the `arguments` object against a rest parameter, escaping, indexed and length-only',
    pick: (r) => r.baseline?.startsWith('rest') === true,
    agg: 'cispan',
    readme: true,
  },
  'args.cells': {
    claims: 'nothing',
    file: 'arguments.jl',
    cells: 'the cells behind args.null',
    pick: (r) => r.baseline?.startsWith('rest') === true,
    agg: 'count',
  },
  // Dictionary-mode ELEMENTS, which no rule reports and which is the largest
  // ratio in this project by an order of magnitude. Reads only, and reads with
  // the build counted, because the two answer different questions and the
  // holey pair below shows why that matters (BUGS TC-52).
  'sparse.dict.reads': {
    claims: 'rule',
    file: 'sparse.jl',
    cells: 'dictionary elements against a packed array, reads only',
    pick: (r) => r.variant === 'dict' && r.mode === 'excl',
    agg: 'range',
    dp: 1,
    readme: true,
  },
  'sparse.dict.whole': {
    claims: 'rule',
    file: 'sparse.jl',
    cells: 'the same with construction counted',
    pick: (r) => r.variant === 'dict' && r.mode === 'incl',
    agg: 'range',
    dp: 1,
    readme: true,
  },
  // And the half that refutes the folklore beside it: a holey array reads a
  // little slower and is FASTER once you count building it, so "holey arrays
  // are slow" is not the sparse transition worth a rule.
  'sparse.holey.reads': {
    claims: 'nothing',
    file: 'sparse.jl',
    cells: 'a holey array against a packed one, reads only',
    pick: (r) => r.variant === 'holey' && r.mode === 'excl',
    agg: 'range',
    readme: true,
  },
  'sparse.holey.whole': {
    claims: 'nothing',
    file: 'sparse.jl',
    cells: 'the same with construction counted, where the holey array wins',
    pick: (r) => r.variant === 'holey' && r.mode === 'incl',
    agg: 'range',
    readme: true,
  },
  // `boxed-elements`, the rule this project withdrew. TC-14 asked for the sweep
  // that had never existed and for the rule's numbers to be re-derived or
  // withdrawn; `bench/arrays.jl` answered the first half, the rule went, and
  // the three numbers stayed typed into the docs and excused as history — the
  // only published figures in the repo whose rows were sitting right here. A
  // withdrawn rule's cost is still a measurement, and a measurement quoted by
  // hand is the one thing this file exists to prevent. `arrays.jl` is not in
  // REMEASURED, so these read the older rows and say so in their provenance.
  'arrays.boxed.reads': {
    claims: 'nothing',
    file: 'arrays.jl',
    cells: 'a genuinely boxed array against a double one, reads only, every size',
    pick: (r) => r.variant === 'boxed' && r.mode === 'excl',
    agg: 'range',
    readme: true,
  },
  'arrays.boxed.build.ram': {
    claims: 'nothing',
    file: 'arrays.jl',
    cells: 'the same with construction counted, at RAM size',
    pick: (r) => r.variant === 'boxed' && r.mode === 'incl' && r.n === 262144,
    agg: 'range',
    readme: true,
  },
  // The case the rule actually FIRED on, which is the half that withdrew it: a
  // `(number | string)[]` holding only numbers is the array `number[]` builds,
  // because V8 picks the elements kind from the values stored and not from the
  // declared type.
  'arrays.union': {
    claims: 'nothing',
    file: 'arrays.jl',
    cells: 'a union-typed array holding only numbers, both halves, every size',
    pick: (r) => r.variant === 'unionnum',
    agg: 'range',
    readme: true,
  },
  'ex.omit.sizes': {
    claims: 'nothing',
    file: 'example.jl',
    cells: 'the key counts es-toolkit omit was swept at, which delete-property quotes in its fix',
    pick: (r) => r.example === 'estoolkit-omit' && r.mode === 'excl',
    agg: 'sizes',
  },
  'ex.omit.reads12': {
    claims: 'rule',
    file: 'example.jl',
    cells: "es-toolkit omit — the caller's reads of the result at 12 keys",
    pick: (r) => r.example === 'estoolkit-omit' && r.mode === 'excl' && r.n === 12,
    agg: 'range',
  },
  'ex.omit.reads48': {
    claims: 'nothing',
    file: 'example.jl',
    cells: 'the same at 48 keys, where the fix stops fixing the read — what its three sweeps agree on',
    pick: (r) => r.example === 'estoolkit-omit' && r.mode === 'excl' && r.n === 48,
    // The sentence quoting this says the interval spans 1.0, which is rule 13's
    // agreement — not the `range` of the three point estimates it used to
    // render. README carried both, 0.99-1.05x in the table and 0.97-1.04x in
    // the prose, for one cell, and nothing compared them.
    agg: 'shared',
  },
  // One key per size. The paragraph about this example gives a figure for each,
  // and the range over both that stood here (1.03-1.20x) was a third number for
  // the same rows that no sentence made.
  'ex.cleanenum.whole16': {
    claims: 'broad',
    file: 'example.jl',
    cells: 'zod cleanEnum — the whole call at a 16-member enum, what its three sweeps agree on',
    pick: (r) => r.example === 'zod-clean-enum' && r.mode === 'incl' && r.n === 16,
    agg: 'shared',
  },
  'ex.cleanenum.whole256': {
    claims: 'broad',
    file: 'example.jl',
    // The transfer TC-83 is about: the cell replicates and clears 1.0, and
    // still does not clear the bar a broad warning needs — the agreed lower
    // bound is under 1.05x and the point estimate under 1.10x. The number is
    // published as that verdict, not as evidence.
    rejected: true,
    cells: 'the same at 256 members',
    pick: (r) => r.example === 'zod-clean-enum' && r.mode === 'incl' && r.n === 256,
    agg: 'shared',
  },
  'ex.mergeall.build': {
    claims: 'rule',
    file: 'example.jl',
    cells: 'remeda mergeAll — building the result at n=8',
    pick: (r) => r.example === 'remeda-merge-all' && r.mode === 'incl' && r.n === 8,
    agg: 'range',
  },
  'ex.mergeall.build64': {
    claims: 'rule',
    file: 'example.jl',
    cells: 'the same at n=64 — the triple that disagreed, re-swept, and what these three agree on',
    pick: (r) => r.example === 'remeda-merge-all' && r.mode === 'incl' && r.n === 64,
    agg: 'shared',
    // Two places, not the one the magnitude gives. The end-to-end tables print
    // every sweep and every agreement at two, and 18.8-20.9x here would be the
    // same interval spelled two ways nine lines apart.
    dp: 2,
  },
  'ex.mergeall.reads': {
    claims: 'nothing',
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
// only by `bench/run.ts`, to print the word DISAGREES to a terminal while a
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
// The mode is 'gate' for a published number, 'about' for a citation that
// quotes a withdrawal, and 'off' for a citation reading a superseded sweep —
// the protocol is about the current protocol's rows, and the sweeps kept as
// history are kept BECAUSE they disagree.
type Mode = 'gate' | 'about' | 'off';

// Rule 6, enforced where the number is made, beside rule 13 below (BUGS
// TC-84). The bar is what the citation `claims`: nothing is shipped as the
// refutation or provenance it is; a rule's evidence needs the agreed
// interval's lower bound above 1.00x; a broad warning's additionally needs a
// point estimate at or above 1.10x and a lower bound above 1.05x. The point
// estimate of a replicated cell is the mean of its sweeps' ratios — each
// sweep's ratio is already a ratio of means (rule 5), and three sweeps have no
// single interval to speak for them (TC-73), but they do have one centre.
function clears(claims: Citation['claims'], cell: Row[]): boolean {
  if (claims === 'nothing') return true;
  const a = agreement(cell);
  if (!a || a.lo <= 1) return false;
  if (claims === 'rule') return true;
  const measured = cell.filter((r) => !r.void && r.ratio !== undefined);
  const point = measured.reduce((sum, r) => sum + r.ratio!, 0) / measured.length;
  return a.lo > 1.05 && point >= 1.1;
}

// The one gate every published number passes through: rule 13 first, rule 6 on
// what survives it. Called with no citation it is the pure rule-13 register
// query `unreplicable()` runs per file.
function replicating(
  matched: Row[],
  c?: Citation
): { live: Row[]; withdrawn: string[]; rejected: string[] } {
  const mode: Mode = c?.history ? 'off' : c?.unreplicable ? 'about' : 'gate';
  const cells = new Map<string, Row[]>();
  for (const r of matched) {
    const k = cellKey(r);
    const at = cells.get(k);
    if (at) at.push(r);
    else cells.set(k, [r]);
  }
  const live: Row[] = [];
  const withdrawn: string[] = [];
  const rejected: string[] = [];
  for (const [key, cell] of cells) {
    if (mode === 'off') {
      live.push(...cell);
      continue;
    }
    // Rule 13, base case included: `replicates()` asks for three whole sweeps,
    // and fewer is not a smaller agreement, it is the absence of the test. The
    // guard here used to be `cell.length >= 2`, so a cell measured ONCE
    // published unchallenged into the same bucket as a replicated one (BUGS
    // TC-84). The count is printed with the withdrawal so a reader can tell
    // "never replicated" from "replicated and refuted".
    if (!replicates(cell)) {
      if (mode === 'about') live.push(...cell);
      else
        withdrawn.push(
          cell.length < 3 ? `${key} (${cell.length} sweep${cell.length === 1 ? '' : 's'})` : key
        );
      continue;
    }
    if (mode === 'about') continue; // render() fails loudly when nothing is left
    // Rule 6, on the agreement rule 13 just established.
    const clear = clears(c?.claims ?? 'nothing', cell);
    if (c?.rejected) {
      if (!clear) live.push(...cell); // quoting the rejection; a pass falls to render()
    } else if (clear) live.push(...cell);
    else rejected.push(key);
  }
  return { live, withdrawn: withdrawn.sort(), rejected: rejected.sort() };
}

// Rule 13's agreement itself: the values EVERY sweep of the cell contains.
// Whether that interval is empty is `replicates()` in bench/driver.ts and stays
// there — one definition, two callers — so this asks it rather than comparing
// the ends a second time, and returns null where there is nothing to publish.
export function agreement(cell: Row[]): { lo: number; hi: number } | null {
  if (!replicates(cell)) return null;
  return {
    lo: Math.max(...cell.map((r) => r.lo!)),
    hi: Math.min(...cell.map((r) => r.hi!)),
  };
}

// Every cell in one sweep file whose three sweeps refute each other, whether or
// not a citation quotes it. `replicating()` sees only the rows one citation
// picks; this sees the file, so a cell that STARTS disagreeing is caught before
// a number is derived from it rather than after. `make test` holds the list.
export function unreplicable(root: string, file: string): string[] {
  return replicating(rows(root, file).filter(current)).withdrawn;
}

// Protocol rule 9's load gate, checked where the data is read — the same shape
// as `unreplicable` above, and like it, the register lives in `make test`. A
// row is over the gate when the reading recorded AS IT WAS WRITTEN exceeds the
// gate recorded beside it: `runnable` against `env.maxRunnable` on rows the
// reworked runner writes, `load1` against `env.maxLoad` on every row before
// it. A row that recorded no gate, or no reading (18 select rows predate the
// per-row field, TC-24), cannot be judged and is not counted.
//
// UNLIKE rule 13's gate, this one withdraws nothing. The old pair cannot
// separate a tenant from the harness itself — the one-minute average was
// mostly the sweep's own children (TC-25) — so the 601 published rows over it
// are rows whose gate was not answering its question, not rows known to be
// contaminated, and whether any of them must go is a judgement about the
// corpus, not a query over it (TC-46). What a query CAN do is keep the number
// visible and frozen: the register in test/check.test.ts fails on a count this
// one does not explain — a new row written over its (now meaningful) gate —
// and on a count that shrinks, which appended rows never do.
// `judged` is returned beside `over` because a file with nothing to judge
// reported ZERO over its gate, which reads as compliant and means the opposite:
// all 60 rows of arrays.jl carry no gate field at all, and all 18 judgeable
// rows of select.jl record their reading under `env.load1` rather than beside
// it, so both registered a clean 0 while answering no question (TC-24, TC-47).
export function overGate(root: string, file: string): { over: number; judged: number } {
  let over = 0;
  let judged = 0;
  for (const r of rows(root, file)) {
    const meaningful = r.env?.maxRunnable !== undefined;
    const limit = meaningful ? r.env?.maxRunnable : r.env?.maxLoad;
    const seen = meaningful ? r.runnable : r.load1 ?? r.env?.load1;
    if (limit === undefined || seen === undefined) continue;
    judged++;
    if (seen > limit) over++;
  }
  return { over, judged };
}

// The rows whose reading of the machine is frozen into the sweep record
// instead of taken as the row was written — `env.load1`, one observation
// stamped onto every row of a sweep that ran for an evening. `overGate` above
// judges them against it because a false reading answered where it lives is
// still better than no question asked at all, but the two are not the same
// evidence and a count is the only thing that keeps them apart: eighteen rows
// of select.jl are the whole of it, they back `allocating-select`, and closing
// that is a re-measurement of six cells, not a query (TC-24, TC-47).
// bench/env.ts refuses to write another; this is what sees the ones there are.
export function frozenReading(root: string, file: string): number {
  return rows(root, file).filter((r) => frozen(r)).length;
}

// The rows whose gate was RAISED — a recorded limit above the one their own
// core count derives, which is `--max-load`. The flag is documented and the
// override is recorded, so this withdraws nothing; what it does is make the
// override visible, because `overGate` cannot see it. That query asks whether a
// row was over ITS OWN recorded gate, and a row measured under `--max-load=99`
// answers no however loaded the machine was. The row that started TC-20 was
// exactly that: `--max-load=99` at load 1.91, run to check that a flag parsed,
// appended to a published sweep. `--scratch` is where such a run belongs now;
// this is what says so when it did not.
export function raisedGate(root: string, file: string): string[] {
  const raised: string[] = [];
  for (const [i, r] of rows(root, file).entries()) {
    const cores = r.env?.cores;
    const limit = r.env?.maxRunnable ?? r.env?.maxLoad;
    if (cores === undefined || limit === undefined) continue;
    if (limit > gateFor(cores)) raised.push(`line ${i + 1}: gate ${limit} on ${cores} cores`);
  }
  return raised;
}

export function rows(root: string, file: string): Row[] {
  const p = path.join(root, 'bench', file);
  const text = fs.readFileSync(p, 'utf8').trim();
  return text.split('\n').map((line) => JSON.parse(line) as Row);
}

// Two decimals below ten, one below a hundred, none above: the precision the
// published strings carry, which is the precision the harness can defend.
const places = (v: number): number => (v < 10 ? 2 : v < 100 ? 1 : 0);

function render(
  key: string,
  c: Citation,
  matched: Row[],
  withdrawn: string[],
  rejected: string[]
): string {
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
    // Four different failures, and a reader has to be able to tell them apart:
    // a citation whose cells were renamed matches nothing; one whose every
    // cell refutes itself has data and may not publish it; one whose every
    // cell fails the bar its claim needs has lost its evidence; and one that
    // quotes a failure that stopped failing is claiming a verdict the data no
    // longer gives.
    throw new Error(
      c.unreplicable
        ? `${key}: this citation quotes a withdrawal, and its cell now replicates — ` +
          'the withdrawal has stopped being true and the sentence quoting it must go'
        : c.rejected
          ? `${key}: this citation quotes a rule-6 rejection, and its cell now clears the ` +
            `bar a ${c.claims === 'broad' ? 'broad warning' : 'rule'} needs — the rejection ` +
            'has stopped being true and the sentence quoting it must go'
          : rejected.length > 0
            ? `${key}: every cell is rejected under rule 6 (${rejected.join(', ')}) — ` +
              `this number cannot ship as a ${c.claims === 'broad' ? 'broad warning' : 'rule'}'s ` +
              'evidence; withdraw the claim or re-measure'
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
  if (c.agg === 'shared') {
    // Per cell, then spanned across cells the way `range` spans their ratios —
    // a citation over two sizes publishes where both agreements lie.
    const cells = new Map<string, Row[]>();
    for (const r of live) {
      const at = cells.get(cellKey(r));
      if (at) at.push(r);
      else cells.set(cellKey(r), [r]);
    }
    const spans = [...cells].map(([k, cell]) => {
      // The gate above withdraws a cell whose sweeps disagree, but it lets a
      // cell measured ONCE through — rule 13 has nothing to say about one
      // sweep — and one sweep has no agreement to publish either.
      const a = agreement(cell);
      if (!a)
        throw new Error(
          `${key}: ${k} has no rule-13 agreement — it was swept fewer than three times`
        );
      return a;
    });
    const hi = Math.max(...spans.map((s) => s.hi));
    const lo = fmt(Math.min(...spans.map((s) => s.lo)), hi);
    const top = fmt(hi, hi);
    return lo === top ? `${lo}x` : `${lo}-${top}x`;
  }
  // The smallest working set the citation's cells were measured at. A rule that
  // can see a literal bound on its own n needs to know where its evidence
  // starts, and typing that integer here would be the hand-typed constant this
  // project forbids everywhere else (BUGS TC-54).
  if (c.agg === 'minn') return String(Math.min(...live.map((r) => r.n)));
  // The sizes a citation's SURVIVING cells were measured at. Typed into a
  // sentence beside a derived ratio, a size drifts the moment rule 13 withdraws
  // one of the cells — `delete-property` claimed "n=16384 and n=262144" while
  // the second was withdrawn and excluded from the very number the sentence
  // introduces (BUGS TC-48).
  if (c.agg === 'sizes') {
    const ns = [...new Set(live.map((r) => r.n))].sort((a, b) => a - b);
    return ns.length === 1 ? `n=${ns[0]}` : `n=${ns.slice(0, -1).join(', n=')} and n=${ns.at(-1)}`;
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
  // The cells rule 6 rejected — replicated, agreed, and still short of the bar
  // the citation claims. Published in the provenance for the same reason.
  rejected: string[];
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
    const { live, withdrawn, rejected } = replicating(matched, c);
    out[key] = {
      value: render(key, c, live, withdrawn, rejected),
      withdrawn,
      rejected,
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

// No `Record<string, string>` on the generated object: that annotation accepts
// EVERY key, so `N['delete.rowsTYPO']` typechecked, rendered `measured
// undefined` on a user's terminal, and left all 67 tests green. Inferred, the
// object's own keys are its type and a typo is a compile error.
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
  (c.rejected
    ? ` — rejected under rule 6 (${
        c.claims === 'broad' ? 'the broad-warning bar' : "the rule's bar"
      }), quoted as the refutation it is`
    : '') +
  (readsHistory(c) ? ` — the older sweep, not re-measured under ${RUNNER}` : '') +
  (d.withdrawn.length > 0
    ? ` — ${d.withdrawn.length} of ${d.cells} cells withdrawn as unreplicable (rule 13): ` +
      d.withdrawn.join(', ')
    : '') +
  (d.rejected.length > 0
    ? ` — ${d.rejected.length} of ${d.cells} cells rejected under rule 6 (${
        c.claims === 'broad' ? 'the broad-warning bar' : "the rule's bar"
      }): ` + d.rejected.join(', ')
    : '');

export function generate(root: string): string {
  const values = deriveDetail(root);
  const lines = Object.entries(CITATIONS).map(([key, c]) => {
    const d = values[key]!;
    return `  // ${files(c).join(' + ')}: ${provenance(c, d)}\n  '${key}': '${d.value}',`;
  });
  return `${HEADER}\nexport const N = {\n${lines.join('\n')}\n};\n`;
}

// bench/README.md carries the same numbers, so it gets them from here too. The
// block between these markers is written by `make numbers` and asserted by `make
// test`; the prose around it, and the prose in every other doc file, quotes the
// same strings, and the test checks the ones it quotes.
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

// A doc file with the generated block cut out of it. The prose quotes some
// of these numbers in sentences, and a check that the block contains them would
// only ever be checking the block against itself. This is `spliceReadme`
// splicing nothing in. The two were the same four lines twice, missing marker
// message included.
export const withoutBlock = (text: string): string => spliceReadme(text, '');

export function spliceReadme(text: string, block: string): string {
  const from = text.indexOf(BEGIN);
  const to = text.indexOf(END);
  if (from === -1 || to === -1)
    throw new Error('bench/README.md has lost its generated-numbers markers');
  return text.slice(0, from) + block + text.slice(to + END.length);
}

// Run as a script, not imported: `make numbers` and `make builtins` are the
// only callers, and both lib/derive.ts and lib/derive-builtins.ts are also
// imported as modules — by test/check.test.ts, and now by bench/run.ts through
// the protocol file. Matching argv[2] alone meant any importer whose OWN second
// argument was `--write` rewrote the published artifacts. bench/tiers.ts
// already guards its main this way.
if (process.argv[1] === import.meta.filename && process.argv[2] === '--write') {
  const root = path.join(import.meta.dirname, '..');
  fs.writeFileSync(path.join(root, 'lib', 'numbers.ts'), generate(root));
  const docPath = path.join(root, 'bench', 'README.md');
  fs.writeFileSync(
    docPath,
    spliceReadme(fs.readFileSync(docPath, 'utf8'), markdown(root))
  );
  process.stdout.write(
    `numbers: ${Object.keys(CITATIONS).length} citations -> lib/numbers.ts, bench/README.md\n`
  );
}
