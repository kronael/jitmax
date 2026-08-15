// Workload for the oldest claim in V8 folklore: that adding a property after
// the object is built is a defect, because it makes a second map and a
// transition to reach it.
//
//   const o = { a: 1 };
//   o.b = 2;
//
// The mechanism was read out of V8 with --allow-natives-syntax BEFORE any cell
// was run, because the folklore does not survive contact with it:
//
//   {x,y,z} literal          instance size 48, 3 in-object, PropertyArray[0]
//   {x,y} then o.z = v       instance size 40, 2 in-object, PropertyArray[3],
//                            and z lives at properties[0] — OUT of the object
//   two objects, same path   %HaveSameMap -> TRUE. One map, not two.
//   {x}+y+z versus {x}+z+y   %HaveSameMap -> FALSE. Two maps, really.
//
// So "a second map" is a fact about the map TREE, not about what any load site
// sees. Every object that takes the same path lands on the same final map, and
// a site reading them is monomorphic. What actually differs is where the field
// lives: an added field is in the property backing store, one dereference away.
// Each variant below separates one of those two things.
//
// Five families, each variant paired against the rewrite a rule would demand —
// the same properties, in one literal, so the checksum matches inside the pair:
//
//   full   literal / added / added2 / diverge     read x + y + z
//          added is the case most real code is in: every object takes the same
//          path, so the load site sees ONE map. added2 takes two steps down the
//          same path. diverge takes two DIFFERENT paths, which really does end
//          at two maps.
//   opt    optbase / optmissing / optadded        read x
//          the `y?: number` case: the property is on some objects and not
//          others, so two maps reach one load site. optmissing writes both
//          literals; optadded reaches the second shape by assignment.
//   late   latebase / latefresh / late            read x + y
//          the property arrives AFTER the site is hot. `late` warms the sweep
//          over {x,y}, adds z to every row, and warms again; `latefresh` builds
//          the same finished objects without ever showing the site the first
//          map. late/latefresh is the stale-map effect on its own.
//   many   lit12 / keyed12                        read x + k0 + k11
//   many   lit16 / named16 / keyed16              read x + k0 + k11
//          V8's fast_properties_soft_limit is 12, and Map::TooManyFastProperties
//          only consults it for a KEYED store. Probed: 15 keyed adds on {x:1}
//          stay fast, 16 go to dictionary mode; named adds never normalize at
//          any count. named16 and keyed16 share one baseline and one field
//          count, so the gap between them is the dictionary transition alone.
//
// Three modes, because construction and reads answer different questions and
// measuring one half reversed two verdicts in round 2 (protocol rule 11):
//   build — construction only, consumed by one field of one row.
//   excl  — repeated reads of rows built once. What the FINISHED objects cost.
//   incl  — construction and a full read, every rep.
//
//   node bench/addprop.js <variant> <n> <build|excl|incl> <reps> <seed>

import { args, emit, mulberry32 as rng } from './kernel.js';

const { variant, n, mode, reps, seed } = args();

const FAMILY = {
  literal: 'full',
  added: 'full',
  added2: 'full',
  diverge: 'full',
  optbase: 'opt',
  optmissing: 'opt',
  optadded: 'opt',
  latebase: 'late',
  latefresh: 'late',
  late: 'late',
  lit12: 'many',
  keyed12: 'many',
  lit16: 'many',
  named16: 'many',
  keyed16: 'many',
};
const family = FAMILY[variant];
if (!family) throw new Error(`unknown variant ${variant}`);

// Every variant in a family draws the same values off the same stream in the
// same order, so identical indices carry identical values and the per-pair
// checksum is a real test rather than a formality.
const KEYS = ['k0', 'k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9', 'k10',
  'k11', 'k12', 'k13', 'k14', 'k15'];

// One function per variant, resolved ONCE below. A `switch` on the variant
// inside the timed region put a string comparison in every rep and TurboFan
// miscompiled it — a rule of the repo, and the reason this is a table.
const BUILD = {
  literal: () => {
    const r = rng(seed);
    const rows = new Array(n);
    for (let i = 0; i < n; i++) {
      const x = r();
      const y = r();
      rows[i] = { x, y, z: r() };
    }
    return rows;
  },

  // The folklore's own example. One transition, taken by every object, so all n
  // of them share one final map and the sweep below is monomorphic.
  added: () => {
    const r = rng(seed);
    const rows = new Array(n);
    for (let i = 0; i < n; i++) {
      const x = r();
      const y = r();
      const o = { x, y };
      o.z = r();
      rows[i] = o;
    }
    return rows;
  },

  // Two steps down the same path. The property array grows in blocks of
  // JSObject::kFieldsAdded = 3, so this allocates no more backing store than
  // `added` does — only one more transition.
  added2: () => {
    const r = rng(seed);
    const rows = new Array(n);
    for (let i = 0; i < n; i++) {
      const x = r();
      const y = r();
      const o = { x };
      o.y = y;
      o.z = r();
      rows[i] = o;
    }
    return rows;
  },

  // Two paths to the same three fields. %HaveSameMap says these are two maps,
  // so the sweep really does see two.
  diverge: () => {
    const r = rng(seed);
    const rows = new Array(n);
    for (let i = 0; i < n; i++) {
      const x = r();
      const y = r();
      const z = r();
      if (i % 2 === 0) {
        const o = { x };
        o.y = y;
        o.z = z;
        rows[i] = o;
      } else {
        const o = { x };
        o.z = z;
        o.y = y;
        rows[i] = o;
      }
    }
    return rows;
  },

  optbase: () => {
    const r = rng(seed);
    const rows = new Array(n);
    for (let i = 0; i < n; i++) {
      const x = r();
      rows[i] = { x, y: r() };
    }
    return rows;
  },

  // `y?: number` as it is actually written: the property is simply absent from
  // three quarters of the literals.
  optmissing: () => {
    const r = rng(seed);
    const rows = new Array(n);
    for (let i = 0; i < n; i++) {
      const x = r();
      const y = r();
      rows[i] = i % 4 === 0 ? { x } : { x, y };
    }
    return rows;
  },

  // The same two shapes, reached by assignment instead of by a second literal.
  optadded: () => {
    const r = rng(seed);
    const rows = new Array(n);
    for (let i = 0; i < n; i++) {
      const x = r();
      const y = r();
      const o = { x };
      if (i % 4 !== 0) o.y = y;
      rows[i] = o;
    }
    return rows;
  },

  lit12: () => {
    const r = rng(seed);
    const rows = new Array(n);
    for (let i = 0; i < n; i++) {
      const v = r();
      rows[i] = { x: v, k0: v + 1, k1: v + 2, k2: v + 3, k3: v + 4, k4: v + 5,
        k5: v + 6, k6: v + 7, k7: v + 8, k8: v + 9, k9: v + 10, k10: v + 11,
        k11: v + 12 };
    }
    return rows;
  },

  // Twelve keyed adds: the backing store is not full, so TooManyFastProperties
  // is never consulted and the object stays in fast properties.
  keyed12: () => {
    const r = rng(seed);
    const rows = new Array(n);
    for (let i = 0; i < n; i++) {
      const v = r();
      const o = { x: v };
      for (let j = 0; j < 12; j++) o[KEYS[j]] = v + j + 1;
      rows[i] = o;
    }
    return rows;
  },

  lit16: () => {
    const r = rng(seed);
    const rows = new Array(n);
    for (let i = 0; i < n; i++) {
      const v = r();
      rows[i] = { x: v, k0: v + 1, k1: v + 2, k2: v + 3, k3: v + 4, k4: v + 5,
        k5: v + 6, k6: v + 7, k7: v + 8, k8: v + 9, k9: v + 10, k10: v + 11,
        k11: v + 12, k12: v + 13, k13: v + 14, k14: v + 15, k15: v + 16 };
    }
    return rows;
  },

  // Sixteen NAMED adds. Map::TooManyFastProperties returns false for anything
  // that is not a keyed store, so this one stays fast whatever the count.
  named16: () => {
    const r = rng(seed);
    const rows = new Array(n);
    for (let i = 0; i < n; i++) {
      const v = r();
      const o = { x: v };
      o.k0 = v + 1; o.k1 = v + 2; o.k2 = v + 3; o.k3 = v + 4;
      o.k4 = v + 5; o.k5 = v + 6; o.k6 = v + 7; o.k7 = v + 8;
      o.k8 = v + 9; o.k9 = v + 10; o.k10 = v + 11; o.k11 = v + 12;
      o.k12 = v + 13; o.k13 = v + 14; o.k14 = v + 15; o.k15 = v + 16;
      rows[i] = o;
    }
    return rows;
  },

  // Sixteen KEYED adds. The sixteenth finds the backing store full with more
  // than fast_properties_soft_limit fields outside the object, and the object
  // goes to dictionary mode. Probed at exactly 16, cold and after 20k builds.
  keyed16: () => {
    const r = rng(seed);
    const rows = new Array(n);
    for (let i = 0; i < n; i++) {
      const v = r();
      const o = { x: v };
      for (let j = 0; j < 16; j++) o[KEYS[j]] = v + j + 1;
      rows[i] = o;
    }
    return rows;
  },
};

BUILD.latebase = BUILD.literal;
BUILD.latefresh = BUILD.added;
// `late` ends at the objects `added` builds — same fields, same values, same
// final map — so the checksum can be taken without repeating the warm phase.
BUILD.late = BUILD.added;

const READ = {
  full: (rows) => {
    let s = 0;
    for (let i = 0; i < rows.length; i++) s += rows[i].x + rows[i].y + rows[i].z;
    return s;
  },
  // Only the property both shapes have. A sweep that read the optional one
  // would be measuring `undefined` on a quarter of the rows, which is a
  // different question and not one any rewrite fixes.
  opt: (rows) => {
    let s = 0;
    for (let i = 0; i < rows.length; i++) s += rows[i].x;
    return s;
  },
  // The two fields that exist before AND after the late assignment, so the
  // warm phase and the timed phase read the same site for the same property.
  late: (rows) => {
    let s = 0;
    for (let i = 0; i < rows.length; i++) s += rows[i].x + rows[i].y;
    return s;
  },
  many: (rows) => {
    let s = 0;
    for (let i = 0; i < rows.length; i++) s += rows[i].x + rows[i].k0 + rows[i].k11;
    return s;
  },
};

const read = READ[family];
const build = BUILD[variant];
if (!build) throw new Error(`unknown variant ${variant}`);

let sink = 0;

// Enough sweeps to put the read site past invocation_count_for_turbofan at
// small n, and enough loop iterations for OSR to reach it at large n.
const WARMS = Math.max(4, Math.ceil(2e6 / n));
const warm = (rows) => {
  for (let w = 0; w < WARMS; w++) sink += read(rows);
};

// `late` is the only variant whose cost depends on WHEN the property arrives,
// so it is the only one that cannot be built by a function the driver may call
// once per rep. It is excl-only, and asking for another mode is a wrong
// measurement rather than a slow one.
function buildLate() {
  const r = rng(seed);
  const rows = new Array(n);
  for (let i = 0; i < n; i++) {
    const x = r();
    const y = r();
    r();
    rows[i] = { x, y };
  }
  warm(rows);
  const rz = rng(seed);
  for (let i = 0; i < n; i++) {
    rz();
    rz();
    rows[i].z = rz();
  }
  return rows;
}

let t0;
let t1;

if (variant === 'late') {
  if (mode !== 'excl') throw new Error('late is excl-only: the timing point is the mutation');
  const rows = buildLate();
  // Both sides warm twice. The one-time deopt and re-optimization after the
  // mutation therefore happens OUTSIDE the timed region, on purpose: it is
  // O(1) and a 120 ms region amortizes it to nothing. What is measured is the
  // steady state of a site that has seen the old map and the new one.
  warm(rows);
  for (let w = 0; w < 3; w++) sink += read(rows);
  t0 = process.hrtime.bigint();
  for (let i = 0; i < reps; i++) sink += read(rows);
  t1 = process.hrtime.bigint();
} else if (mode === 'excl') {
  const rows = build();
  if (family === 'late') warm(rows);
  for (let w = 0; w < 3; w++) sink += read(rows);
  t0 = process.hrtime.bigint();
  for (let i = 0; i < reps; i++) sink += read(rows);
  t1 = process.hrtime.bigint();
} else if (mode === 'build') {
  for (let w = 0; w < 3; w++) sink += build()[n - 1].x;
  t0 = process.hrtime.bigint();
  for (let i = 0; i < reps; i++) sink += build()[n - 1].x;
  t1 = process.hrtime.bigint();
} else {
  for (let w = 0; w < 3; w++) sink += read(build());
  t0 = process.hrtime.bigint();
  for (let i = 0; i < reps; i++) sink += read(build());
  t1 = process.hrtime.bigint();
}

emit({ t0, t1, reps, n, checksum: read(build()), sink });
