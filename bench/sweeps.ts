// Every sweep this project runs, as data. `bench/run.ts` is the runner around
// this table and `bench/tiers.ts` reads the same cells, so there is ONE place a
// cell shape is declared and no second list to drift from it.
//
// A benchmark declares only what is particular to it — which kernel to spawn,
// which cells to sweep, which .jl to append to, and whether a cell is run once
// or three times over. Everything else is bench/driver.ts, which is where the
// measurement protocol lives and the only place it may live.

import path from 'node:path';
import { workload } from './driver.ts';

// A sweep's cell table, as declared below: a cell says what is particular to
// it and inherits the rest from its benchmark.
export interface CellDecl {
  script?: string;
  out?: string;
  baseline: string;
  variant: string;
  sizes?: number[] | Record<string, number>;
  modes?: string[];
  extra?: Record<string, string | number>;
  recordBaseline?: boolean;
}

export interface Bench {
  what: string;
  script?: string;
  out?: string;
  modes?: string[];
  sizes?: number[] | Record<string, number>;
  extra?: Record<string, string | number>;
  recordBaseline?: boolean;
  replicated?: boolean;
  cells: CellDecl[];
}

// What `plan` hands the runner: the workload to spawn, the .jl to append to,
// the cell options the driver measures, and the row fields that travel along.
export interface SweepOpts {
  baseline: string;
  variant: string;
  n: number;
  mode: string;
}

// Three sizes span L1 to RAM, because a cost that is about memory and a cost
// that is about work look identical at one size (protocol rule 12).
const WIDE = [256, 16384, 262144];
const ENDS = [256, 262144];
const MID = [16384];
const MANY = [256, 8192];
const NARROW = [256, 16384];
const NAMED = { L1: 256, L2: 16384, L3: 262144 };
const NAMED_SMALL = { L1: 256, L2: 16384 };

const KERNEL: Record<string, string> = { kernel: 'dispatch-table' };

// Which workload writes which `.jl`, and the row fields that travel with every
// cell of that sweep. Written once because `tc11` re-runs cells of these same
// sweeps and MUST append to the same files: a re-run that lands in the wrong
// `.jl` is a superseded sweep silently mixed into a live one, which is the
// failure the never-overwrite rule exists to prevent.
const SWEEP: Record<string, { script: string; out: string; recordBaseline?: boolean; extra?: Record<string, string | number> }> = {
  shapes: { script: 'shapes.ts', out: 'shapes-calibrated.jl' },
  shapeSets: { script: 'shape-sets.ts', out: 'shape-sets.jl' },
  spread: { script: 'spread.ts', out: 'spread.jl' },
  spreadObject: { script: 'spread-object.ts', out: 'spread-object.jl' },
  strings: { script: 'strings.ts', out: 'strings.jl', recordBaseline: true, extra: KERNEL },
  select: { script: 'select.ts', out: 'select.jl' },
  chained: { script: 'chained.ts', out: 'chained.jl', recordBaseline: true, extra: KERNEL },
  inline: { script: 'inline.ts', out: 'inline.jl' },
  addprop: { script: 'addprop.ts', out: 'addprop.jl', recordBaseline: true, extra: KERNEL },
  dispatch: { script: 'dispatch.ts', out: 'dispatch.jl', recordBaseline: true, extra: KERNEL },
  delete: { script: 'delete.ts', out: 'delete.jl', recordBaseline: true, extra: KERNEL },
  arrays: { script: 'arrays.ts', out: 'arrays.jl', recordBaseline: true, extra: KERNEL },
  example: { script: 'example.ts', out: 'example.jl', recordBaseline: true },
  arguments: { script: 'arguments.ts', out: 'arguments.jl', recordBaseline: true },
  sparse: { script: 'sparse.ts', out: 'sparse.jl', recordBaseline: true },
};

export const BENCHMARKS: Record<string, Bench | undefined> = {
  // The object-shape sweep behind megamorphic-elements. The two earlier sweeps
  // stay on disk under their own names: they were measured before the
  // calibration loop existed and are not comparable cell for cell with this
  // one.
  shapes: {
    ...SWEEP.shapes,
    what: 'the 24-cell object-shape sweep',
    modes: ['excl', 'incl'],
    // `shapes` and `size` are the names this sweep has always published, and
    // bench/meme.js reads them.
    sizes: NAMED,
    cells: [2, 3, 4, 5].map((shapes) => ({
      baseline: '1',
      variant: String(shapes),
      extra: { shapes },
    })),
  },

  // The same sweep over shapes the rule can actually see: five key SETS rather
  // than five key orders. `shapes` prices a program `megamorphic-elements` is
  // silent on, so this one prices the program it fires on, cell for cell, at
  // the same sizes and in both modes (BUGS TC-42).
  'shape-sets': {
    ...SWEEP.shapeSets,
    what: 'the same 24 cells, over shapes a TypeScript type can express',
    modes: ['excl', 'incl'],
    sizes: NAMED,
    cells: [2, 3, 4, 5].map((shapes) => ({
      baseline: '1',
      variant: String(shapes),
      extra: { shapes },
    })),
  },

  // Both variants are measured against the same push baseline, because both
  // make the same claim: the accumulator is copied whole on every pass.
  spread: {
    ...SWEEP.spread,
    what: 'accumulating spread, array form',
    modes: ['excl', 'incl'],
    sizes: [1000, 10000],
    cells: ['spread', 'concat'].map((variant) => ({ baseline: 'push', variant })),
  },

  // Whether the copy is written as a spread or as Object.assign, the claim
  // under test is the same, so both run against the same mutating baseline.
  'spread-object': {
    ...SWEEP.spreadObject,
    what: 'accumulating spread, object form',
    modes: ['excl', 'incl'],
    sizes: [500, 2000],
    cells: ['spread', 'assign-copy'].map((variant) => ({ baseline: 'assign', variant })),
  },

  // Does building a string by appending cost what building an array by copying
  // costs? `s = s + x` in a loop is the same syntax accumulating-spread
  // measured in the hundreds for arrays, and the rule matched `.concat()` by
  // name. All three forms run against the same `joined` baseline — an array
  // pushed to once per pass and joined at the end — because all three make the
  // same claim. Three sizes two orders of magnitude apart, because a quadratic
  // cost GROWS with n and a constant factor does not.
  strings: {
    ...SWEEP.strings,
    what: 'string building — the refutation, not a rule',
    modes: ['build', 'excl', 'incl'],
    sizes: [1000, 10000, 100000],
    cells: ['plus', 'pluseq', 'concat'].map((variant) => ({ baseline: 'joined', variant })),
  },

  // The mode decides whether the freshly allocated value escapes, which is the
  // whole question of whether TurboFan can delete the allocation. `number` is
  // the cell that says where the rule must stay quiet.
  select: {
    ...SWEEP.select,
    what: 'choosing between two boxed values',
    modes: ['heap', 'local', 'number'],
    sizes: [10000, 100000],
    cells: [{ baseline: 'compare', variant: 'select' }],
  },

  // Each cell is a chained form and the fused single pass it is measured
  // against. The map/filter row keeps the sizes the 0.2 sweep used, so
  // re-running it replicates the shipped cell rather than replacing it. The
  // rows appended here carry `kernel`; the rows before them that do not are
  // from the switch-dispatched kernel TurboFan miscompiled, and they are void.
  chained: {
    ...SWEEP.chained,
    what: 'chained array passes',
    modes: ['excl', 'incl'],
    cells: [
      { baseline: 'fused', variant: 'chained', sizes: [1000, 100000] },
      { baseline: 'scanned', variant: 'splitjoin', sizes: [1000, 10000] },
      { baseline: 'packed', variant: 'splitjoin', sizes: [1000, 10000] },
      { baseline: 'walked', variant: 'entriesmap', sizes: [1000, 10000] },
      { baseline: 'walked', variant: 'keysmap', sizes: [1000, 10000] },
      { baseline: 'sorted', variant: 'chainedsort', sizes: [1000, 10000] },
    ],
  },

  // closed-world reports calls the checker cannot see into, and "we could not
  // read this" is a coverage fact, not a cost. What CAN be measured is the
  // mechanism a call boundary controls: whether V8 inlines the callee. Read the
  // result as an upper bound on what one unchecked call can cost, not as a
  // claim about any particular unchecked call. One mode only — there is nothing
  // to construct in this kernel, so an 'incl' cell would be the same
  // measurement under a different name.
  inline: {
    ...SWEEP.inline,
    what: 'the inlining boundary behind closed-world',
    modes: ['excl'],
    sizes: [1000, 100000],
    cells: [{ baseline: 'small', variant: 'large' }],
  },

  // BUGS TC-53. There is no rule here and this sweep is not a bid for one: it
  // exists to publish a null. Every JS performance guide still says the
  // arguments object is slow, TurboFan's escape analysis says it is only slow
  // where it escapes, and this project has no business repeating either
  // without measuring. Each variant is paired against the rest-parameter
  // rewrite computing the same value, so a variant that computes something
  // else is a failed run and not a fast one. One mode: the arguments object is
  // built inside the callee on every call, so construction is inside the timed
  // region by definition.
  arguments: {
    ...SWEEP.arguments,
    what: 'the arguments object against rest parameters',
    modes: ['excl'],
    sizes: WIDE,
    cells: [
      { baseline: 'restlen', variant: 'arglen' },
      { baseline: 'restidx', variant: 'argidx' },
      { baseline: 'restesc', variant: 'argesc' },
    ],
  },

  // BUGS TC-52. The elements-kind transition nobody here has measured. Holey
  // is already known to be free (0.93-1.06x, which is why boxed-elements was
  // withdrawn), so it is swept beside dictionary rather than instead of it: if
  // the two columns do not separate, the outcome is a published null and no
  // rule. Both modes, because entering the transition and living with it are
  // different costs and this project has had a verdict reversed by measuring
  // only one.
  sparse: {
    ...SWEEP.sparse,
    what: 'holey and dictionary elements against a packed array',
    modes: ['excl', 'incl'],
    sizes: WIDE,
    cells: [
      { baseline: 'packed', variant: 'holey' },
      { baseline: 'packed', variant: 'dict' },
    ],
  },

  // Does adding a property after construction cost anything? The claim is the
  // most repeated one in V8 folklore and this project had never tested it.
  // Every variant is paired against the rewrite a rule would demand: the same
  // properties, with the same values, in one object literal — and the driver
  // compares checksums inside every pair, so a variant that builds a different
  // object is a failed run rather than a fast one.
  //
  //   added / added2   one final map, reached by one or two transitions
  //   diverge          two paths, two final maps, one load site
  //   optmissing       `y?: number` written as two literals
  //   optadded         the same two shapes reached by assignment
  //   late             the property arrives after the site is already hot,
  //                    against BOTH the literal (total cost) and the identical
  //                    finished objects the site never saw grow (the stale-map
  //                    effect on its own). excl-only: the timing point is a
  //                    mutation that happens once, so rebuilding it every rep
  //                    would measure the warm phase instead.
  //   keyed12/16       fast_properties_soft_limit is 12 and only a KEYED store
  //                    consults it: 15 keyed adds stay fast, 16 go to
  //                    dictionary mode
  //   named16          the same field count reached by named stores, which
  //                    never normalize — the control that isolates dictionary
  //                    mode from the field count
  //
  // The many-field families stop at 8192 because a seventeen-field object is
  // three times the size and the point there is a threshold, not bandwidth.
  addprop: {
    ...SWEEP.addprop,
    what: 'adding a property after construction — a refutation',
    cells: [
      { baseline: 'literal', variant: 'added', sizes: WIDE, modes: ['build', 'excl', 'incl'] },
      { baseline: 'literal', variant: 'added2', sizes: WIDE, modes: ['build', 'excl', 'incl'] },
      { baseline: 'literal', variant: 'diverge', sizes: WIDE, modes: ['build', 'excl', 'incl'] },
      { baseline: 'optbase', variant: 'optmissing', sizes: NARROW, modes: ['excl', 'incl'] },
      { baseline: 'optbase', variant: 'optadded', sizes: NARROW, modes: ['excl', 'incl'] },
      { baseline: 'latebase', variant: 'late', sizes: WIDE, modes: ['excl'] },
      { baseline: 'latefresh', variant: 'late', sizes: WIDE, modes: ['excl'] },
      { baseline: 'lit12', variant: 'keyed12', sizes: MANY, modes: ['excl', 'incl'] },
      { baseline: 'lit16', variant: 'named16', sizes: MANY, modes: ['excl', 'incl'] },
      { baseline: 'lit16', variant: 'keyed16', sizes: MANY, modes: ['excl', 'incl'] },
    ],
  },

  // `x.step()` where x is one of K shapes. K = 1 is the baseline of every
  // family and every K from 2 to 6 is reported against it, so a cliff has to
  // show up as a step between two adjacent cells rather than as one large
  // number with nothing either side of it.
  //
  //   cls  K classes                K maps, K targets, method on the prototype
  //   lit  K literal shapes, own fn K maps, K targets, method an own property
  //   tgt  one shape, K fns         ONE map, K targets
  //   shr  K shapes, one fn         K maps, ONE target
  //
  // cls and lit get three working sets and both modes. tgt and shr are controls
  // that split one effect into its two halves — the receiver's map and the call
  // target — and they run reads-only at L1 and L2, which is where the effect is
  // if it exists at all.
  dispatch: {
    ...SWEEP.dispatch,
    what: 'calling a method on five object types',
    cells: [
      { family: 'cls', baseline: 'cls1', sizes: NAMED, modes: ['excl', 'incl'] },
      { family: 'lit', baseline: 'lit1', sizes: NAMED, modes: ['excl', 'incl'] },
      { family: 'tgt', baseline: 'lit1', sizes: NAMED_SMALL, modes: ['excl'] },
      { family: 'shr', baseline: 'lit1', sizes: NAMED_SMALL, modes: ['excl'] },
    ].flatMap(({ family, ...rest }) =>
      [2, 3, 4, 5, 6].map((k) => ({ ...rest, variant: `${family}${k}`, extra: { family, k } }))
    ),
  },

  // The measurement delete-property should have shipped with. Its first number
  // came from an ad-hoc probe with no pairing, no interval, no rep count and no
  // data file (BUGS TC-15); this produces all four. The cells separate the two
  // populations that probe measured and could not reconcile:
  //
  //   rowdel/rowbase    n objects, one delete each
  //   shdel/shbase      ONE object, one delete, the same kernel over an array
  //                     of n references to it — the case the probe published as
  //                     refuted, and the rule fires on it regardless (TC-9)
  //   rowundef/rowbase  the rule's own named fix against never building the
  //                     property. A control: if this is not ~1.0x the rule is
  //                     recommending a cost.
  //   rowdel/rowundef   the delete against that fix, which is the comparison a
  //                     developer following the finding actually faces.
  delete: {
    ...SWEEP.delete,
    what: 'delete, on many objects and on exactly one',
    modes: ['excl', 'incl'],
    replicated: true,
    cells: [
      { baseline: 'rowbase', variant: 'rowdel', sizes: WIDE },
      { baseline: 'shbase', variant: 'shdel', sizes: WIDE },
      { baseline: 'rowbase', variant: 'rowundef', sizes: MID },
      { baseline: 'rowundef', variant: 'rowdel', sizes: MID },
    ],
  },

  // The sweep boxed-elements had been citing since it shipped, and which was
  // never written (BUGS TC-14). Replicated, which this rule needed more than
  // any other: its published range sat inside the band a single sweep on this
  // harness cannot resolve.
  //
  //   boxed/double     the claim. PACKED_ELEMENTS against PACKED_DOUBLE.
  //   unionnum/double  the TRIGGER. The rule fired on the declared type; V8
  //                    picks the elements kind from the values stored, so a
  //                    `(number | string)[]` holding only numbers is the same
  //                    array. Checkable with
  //                    `node --allow-natives-syntax bench/arrays.ts unionnum 8
  //                    kinds 1 1`, which reports PACKED_DOUBLE for both.
  //   holey/double     control, published refuted.
  //   f64/double       control, refuted on reads and faster to construct — the
  //                    one case where measuring only one half buried a result.
  arrays: {
    ...SWEEP.arrays,
    what: 'elements kinds — the sweep that withdrew a rule',
    modes: ['excl', 'incl'],
    replicated: true,
    cells: [
      { baseline: 'double', variant: 'boxed', sizes: WIDE },
      { baseline: 'double', variant: 'unionnum', sizes: WIDE },
      { baseline: 'double', variant: 'holey', sizes: ENDS },
      { baseline: 'double', variant: 'f64', sizes: ENDS },
    ],
  },

  // Does doing what jitmax says make a real program faster? The ratio is
  // before/after, so a cell above 1.0 is the shipped function costing that much
  // more than the fixed one — the orientation every rule benchmark here uses,
  // where the number is what the pattern costs. A cell that shows nothing is
  // published exactly as it comes out: these ratios are what a caller gets, and
  // they are far below the microbenchmark ratios the rules cite.
  example: {
    ...SWEEP.example,
    what: 'four shipped library functions, before and after',
    modes: ['excl', 'incl'],
    replicated: true,
    cells: [
      { example: 'radash-assign', sizes: [16, 128] },
      { example: 'remeda-merge-all', sizes: [8, 64] },
      { example: 'estoolkit-omit', sizes: [12, 48] },
      { example: 'zod-clean-enum', sizes: [16, 256] },
    ].map(({ example, sizes }) => ({
      baseline: `${example}/after`,
      variant: `${example}/before`,
      sizes,
      extra: { example },
    })),
  },

  // Exactly the cells BUGS TC-11's audit flagged — published cells that ran on
  // a handful of repetitions, always at the largest n of their sweep. Each is
  // run three times, and each appends to ITS OWN sweep's file: the old rows are
  // the record of what was published and they stay, distinguished by the
  // `protocol: 'replicated'` and `replicate` fields the new rows carry.
  //
  // The point is not a longer region. A cell that fits two passes in 120 ms was
  // measured for 120 ms, and no threshold on the rep count would be anything
  // but a constant nobody measured. The point is that the bootstrap interval is
  // over the pairs of ONE sweep and cannot see what varies BETWEEN sweeps —
  // which is how three near-identical addprop constructions came out at 1.64x,
  // 0.91x and 0.89x with intervals that exclude each other.
  tc11: {
    what: 'the TC-11 cells, three sweeps each, into their own files',
    replicated: true,
    cells: [
      ...[2, 3, 4, 5].map((shapes) => ({
        ...SWEEP.shapes,
        baseline: '1',
        variant: String(shapes),
        sizes: { L3: 262144 },
        modes: ['incl'],
        extra: { shapes },
      })),
      {
        ...SWEEP.spread,
        baseline: 'push',
        variant: 'spread',
        sizes: [10000],
        modes: ['incl'],
      },
      ...['spread', 'assign-copy'].map((variant) => ({
        ...SWEEP.spreadObject,
        baseline: 'assign',
        variant,
        sizes: [500],
        modes: ['incl'],
      })),
      ...['plus', 'pluseq', 'concat'].map((variant) => ({
        ...SWEEP.strings,
        baseline: 'joined',
        variant,
        sizes: [100000],
        modes: ['build', 'excl', 'incl'],
      })),
      ...['added', 'added2', 'diverge'].map((variant) => ({
        ...SWEEP.addprop,
        baseline: 'literal',
        variant,
        sizes: [262144],
        modes: ['build', 'incl'],
      })),
      // The one flagged cell that is not at the largest n of its sweep: the
      // dictionary-mode variant is slow enough to reach the region in six
      // passes where its own baseline took seventy-eight.
      {
        ...SWEEP.addprop,
        baseline: 'lit16',
        variant: 'keyed16',
        sizes: [8192],
        modes: ['incl'],
      },
      ...['cls', 'lit'].flatMap((family) =>
        [2, 3, 4, 5, 6].map((k) => ({
          ...SWEEP.dispatch,
          baseline: `${family}1`,
          variant: `${family}${k}`,
          sizes: { L3: 262144 },
          modes: ['incl'],
          extra: { family, k, ...KERNEL },
        }))
      ),
    ],
  },
};

// A cell declares modes and sizes, or inherits the benchmark's. Named sizes
// travel into the row as `size`, because that is the field the sweeps that use
// them have always published.
export function* plan(bench: Bench): Generator<{
  script: string;
  out: string;
  opts: SweepOpts;
  extra: Record<string, string | number>;
}> {
  for (const cell of bench.cells) {
    const sizes = (cell.sizes ?? bench.sizes)!;
    const named = !Array.isArray(sizes);
    for (const mode of (cell.modes ?? bench.modes)!) {
      for (const [size, n] of named ? Object.entries(sizes) : sizes.map<[null, number]>((v) => [null, v])) {
        const opts = { baseline: cell.baseline, variant: cell.variant, n, mode };
        const extra = {
          ...bench.extra,
          ...cell.extra,
          ...(named ? { size: size! } : {}),
          ...((cell.recordBaseline ?? bench.recordBaseline) ? { baseline: cell.baseline } : {}),
        };
        yield {
          script: workload((cell.script ?? bench.script)!),
          out: path.join(import.meta.dirname, (cell.out ?? bench.out)!),
          opts,
          extra,
        };
      }
    }
  }
}

export const label = (o: SweepOpts): string =>
  `${o.mode.padEnd(5)} n=${String(o.n).padEnd(6)} ${o.variant}/${o.baseline}`.padEnd(38);

// Every sweep `--all` runs, in order. Declared rather than taken from
// Object.keys(BENCHMARKS) so adding a sweep to the table is not silently also a
// change to what a release measures — and declared BOTH ways for the same
// reason, because the one-sided list was the silence: `shape-sets`, `arguments`
// and `sparse` sat in the table, outside ALL, and `--all` wrote a manifest that
// said nothing about the third of the table it had skipped. `make test` holds
// the two lists to the table, so a new sweep in neither of them fails the build
// instead of going unmeasured (BUGS TC-99).
export const ALL: readonly string[] = [
  'shapes', 'shape-sets', 'spread', 'spread-object', 'strings', 'select', 'chained',
  'inline', 'arguments', 'sparse', 'addprop', 'dispatch', 'delete', 'arrays', 'example',
];

// Declared, and deliberately not in ALL, with the reason `--all` skips it.
export const NOT_ALL: Record<string, string> = {
  tc11: 're-runs cells of the other sweeps, so running it inside --all would append ' +
    'a second set of replications to rows the same pass had just written',
};
