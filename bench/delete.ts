// Workload for delete-property. The rule shipped 28-67x, and that number came
// from an ad-hoc probe appendix in a product-design document, written before
// this harness existed (BUGS TC-15). This file is the measurement it should
// have had.
//
// The probe measured TWO populations and they disagreed, which is the whole
// point and is reproduced here:
//
//   row   n distinct objects, one `delete` each, then a read loop over all of
//         them. The probe read 28-67x here.
//   sh    ONE object, one `delete`, then the same read loop over it. The probe
//         read 0x here, with the dictionary object up to 10% FASTER.
//
// The two families run the IDENTICAL kernel over an array of the same length —
// `sh` fills its array with n references to one object — so the only thing that
// varies between them is how many distinct receivers reach the load site. That
// is the discriminating experiment: if the cost is that each normalized object
// carries its own slow map and the site goes megamorphic, `sh` pays nothing; if
// the cost is the dictionary probe itself, `sh` pays the same as `row`.
//
// The array is the harness, not the claim. A true singleton read in a bare loop
// has no receiver the optimizer cannot see through, so a hoisted load on one
// side and a runtime lookup on the other would measure the compiler rather than
// the effect. Indexing an array forces a real load per iteration on both sides.
//
// Three variants per family, paired only within a family:
//   base    { a, b, c }                       — built without the property
//   undef   { a, tmp, b, c }, o.tmp = undefined — the rule's OWN named fix
//   del     { a, tmp, b, c }, delete o.tmp      — the pattern the rule fires on
// `tmp` is a middle property, as in the original probe. All three read a+b+c,
// so the per-pair checksum is a real test.
//
//   node bench/delete.ts <variant> <n> <excl|incl|kinds> <reps> <seed>

import { args, emit, mulberry32 as rng } from './kernel.ts';

const { variant, n, mode, reps, seed } = args();

type Row = { a: number; b: number; c: number };

const FAMILY: Record<string, string | undefined> = {
  rowbase: 'row',
  rowundef: 'row',
  rowdel: 'row',
  shbase: 'sh',
  shundef: 'sh',
  shdel: 'sh',
};
const family = FAMILY[variant];
if (!family) throw new Error(`unknown variant ${variant}`);

// Every variant draws a, b and c off the stream in that order, so identical
// indices carry identical values and the checksum compared inside every pair is
// a real test rather than a formality. `tmp` is a constant, so it costs the
// stream nothing and the three variants stay aligned.
const ONE: Record<'base' | 'undef' | 'del', (r: () => number) => Row> = {
  base: (r) => ({ a: r(), b: r(), c: r() }),
  undef: (r) => {
    const o: { a: number; tmp: number | undefined; b: number; c: number } =
      { a: r(), tmp: 1, b: r(), c: r() };
    o.tmp = undefined;
    return o;
  },
  del: (r) => {
    const o: { a: number; tmp?: number; b: number; c: number } =
      { a: r(), tmp: 1, b: r(), c: r() };
    delete o.tmp;
    return o;
  },
};

// One function per variant, resolved ONCE below. A `switch` on the variant
// inside the timed region put a string comparison in every rep and TurboFan
// miscompiled it — a rule of the repo, and the reason this is a table.
const BUILD: Record<string, () => Row[]> = {
  rowbase: () => {
    const r = rng(seed);
    const rows: Row[] = new Array(n);
    for (let i = 0; i < n; i++) rows[i] = ONE.base(r);
    return rows;
  },
  rowundef: () => {
    const r = rng(seed);
    const rows: Row[] = new Array(n);
    for (let i = 0; i < n; i++) rows[i] = ONE.undef(r);
    return rows;
  },
  rowdel: () => {
    const r = rng(seed);
    const rows: Row[] = new Array(n);
    for (let i = 0; i < n; i++) rows[i] = ONE.del(r);
    return rows;
  },
  // One object, one delete, n slots pointing at it. The read loop below cannot
  // tell this array from `row`'s without loading the object, which is the point.
  shbase: () => new Array<Row>(n).fill(ONE.base(rng(seed))),
  shundef: () => new Array<Row>(n).fill(ONE.undef(rng(seed))),
  shdel: () => new Array<Row>(n).fill(ONE.del(rng(seed))),
};

const build = BUILD[variant];

const read = (rows: Row[]): number => {
  let s = 0;
  for (let i = 0; i < rows.length; i++) s += rows[i].a + rows[i].b + rows[i].c;
  return s;
};

// `kinds` is a diagnostic and never an evidence run: it needs
// --allow-natives-syntax, which protocol rule 8 forbids in a measured process.
// The
// natives go through a direct eval so this file still parses without the flag.
//   node --allow-natives-syntax bench/delete.ts rowdel 4 kinds 1 1
if (mode === 'kinds') {
  const rows = build();
  const ask = (expr: string): unknown => {
    try {
      return eval(expr);
    } catch {
      return 'needs --allow-natives-syntax';
    }
  };
  process.stdout.write(
    JSON.stringify({
      variant,
      fastPropertiesFirst: ask('%HasFastProperties(rows[0])'),
      fastPropertiesLast: ask('%HasFastProperties(rows[n - 1])'),
      sameMapAcrossRows: ask('%HaveSameMap(rows[0], rows[n - 1])'),
      keys: Object.keys(rows[0]),
    })
  );
} else {
  let sink = 0;

  // Enough sweeps to put the read site past invocation_count_for_turbofan at
  // small n, and enough loop iterations for OSR to reach it at large n.
  const WARMS = Math.max(4, Math.ceil(2e6 / n));

  let t0: bigint;
  let t1: bigint;

  if (mode === 'excl') {
    const rows = build();
    for (let w = 0; w < WARMS; w++) sink += read(rows);
    t0 = process.hrtime.bigint();
    for (let i = 0; i < reps; i++) sink += read(rows);
    t1 = process.hrtime.bigint();
  } else {
    for (let w = 0; w < 3; w++) sink += read(build());
    t0 = process.hrtime.bigint();
    for (let i = 0; i < reps; i++) sink += read(build());
    t1 = process.hrtime.bigint();
  }

  emit({ t0, t1, reps, n, checksum: read(build()), sink });
}
