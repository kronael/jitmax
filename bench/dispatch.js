// Workload for megamorphic dispatch: `x.step()` at ONE call site, where x is
// one of K shapes. `megamorphic-elements` measured the same V8 constant —
// max_valid_polymorphic_map_count = 4 — at a LOAD site, on the element type of
// an array. A call site is governed by the same four maps, and a union-typed
// parameter with a method called on it is far more common in real TypeScript
// than an array of a five-way union.
//
//   node bench/dispatch.js <variant> <n> <excl|incl> <reps> <seed>
//
// A call site has TWO things that can diverge, and the folklore rolls them
// into one: the receiver's MAP, which decides where `step` is found, and the
// call TARGET, which decides what runs. Four families separate them, and the
// answers below were read out of V8 with --allow-natives-syntax before any
// cell ran (tmp/dispatch-probe.cjs):
//
//   cls   K classes                     K maps, K targets, method on the
//                                       prototype — the TypeScript union of
//                                       classes. Two hand-written classes with
//                                       identical fields are two maps
//                                       (%HaveSameMap false).
//   lit   K literal shapes, own fn      K maps, K targets, method an OWN
//                                       property — what a lot of TypeScript
//                                       actually looks like.
//   tgt   one literal shape, K fns      ONE map, K targets. %HaveSameMap is
//                                       TRUE across two objects from one key
//                                       order carrying different functions, so
//                                       this really is the target on its own.
//   shr   K literal shapes, one fn      K maps, ONE target. The shared body's
//                                       own `this.v` load then sees K maps,
//                                       which cls and lit do not — stated
//                                       rather than controlled for.
//
// lit, tgt and shr share the baseline `lit1`: one key order, one function.
//
// Two modes, because measuring one half reversed two verdicts in round 2
// (SPEC §4 rule 11):
//   excl — repeated reads of rows built once. What dispatch costs.
//   incl — construction and a full read, every rep.
'use strict';

const [variant, n, mode, reps, seed] = [
  process.argv[2],
  Number(process.argv[3]),
  process.argv[4],
  Number(process.argv[5]),
  Number(process.argv[6]),
];

const parsed = /^(cls|lit|tgt|shr)([1-6])$/.exec(variant ?? '');
if (!parsed) throw new Error(`unknown variant ${variant}`);
const family = parsed[1];
const k = Number(parsed[2]);

function rng(a) {
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Six classes and six functions, written out rather than produced by a
// factory. Every closure one factory hands back shares a SharedFunctionInfo,
// and V8's call feedback treats closures of one SFI as a case of its own — so
// a generated class would not be the six-hand-written-classes case this is
// supposed to measure. Six source positions are six SFIs. The bodies are
// identical on purpose: the driver compares checksums inside every pair, so a
// variant that computes something else is a failed run, not a fast one.
class C0 { constructor(v) { this.v = v; } step() { return this.v * 2 + 1; } }
class C1 { constructor(v) { this.v = v; } step() { return this.v * 2 + 1; } }
class C2 { constructor(v) { this.v = v; } step() { return this.v * 2 + 1; } }
class C3 { constructor(v) { this.v = v; } step() { return this.v * 2 + 1; } }
class C4 { constructor(v) { this.v = v; } step() { return this.v * 2 + 1; } }
class C5 { constructor(v) { this.v = v; } step() { return this.v * 2 + 1; } }
const CLASSES = [C0, C1, C2, C3, C4, C5];

function step0() { return this.v * 2 + 1; }
function step1() { return this.v * 2 + 1; }
function step2() { return this.v * 2 + 1; }
function step3() { return this.v * 2 + 1; }
function step4() { return this.v * 2 + 1; }
function step5() { return this.v * 2 + 1; }
const STEPS = [step0, step1, step2, step3, step4, step5];

// Six key orders of the same three fields: same object size, same values, six
// maps. This is the shape sweep's own device (bench/shapes.js), so the only
// thing that varies across the variants of a family is the count.
const SHAPES = [
  (v, w, f) => ({ v, w, step: f }),
  (v, w, f) => ({ v, step: f, w }),
  (v, w, f) => ({ w, v, step: f }),
  (v, w, f) => ({ w, step: f, v }),
  (v, w, f) => ({ step: f, v, w }),
  (v, w, f) => ({ step: f, w, v }),
];

// One function per family, resolved ONCE below. A `switch` on the variant
// inside the timed region put a string comparison in every rep and TurboFan
// miscompiled it — SPEC §3, and the reason this is a table.
const BUILD = {
  cls: () => {
    const r = rng(seed);
    const rows = new Array(n);
    for (let i = 0; i < n; i++) rows[i] = new CLASSES[i % k](r());
    return rows;
  },
  lit: () => {
    const r = rng(seed);
    const rows = new Array(n);
    for (let i = 0; i < n; i++) {
      const v = r();
      rows[i] = SHAPES[i % k](v, r(), STEPS[i % k]);
    }
    return rows;
  },
  tgt: () => {
    const r = rng(seed);
    const rows = new Array(n);
    for (let i = 0; i < n; i++) {
      const v = r();
      rows[i] = SHAPES[0](v, r(), STEPS[i % k]);
    }
    return rows;
  },
  shr: () => {
    const r = rng(seed);
    const rows = new Array(n);
    for (let i = 0; i < n; i++) {
      const v = r();
      rows[i] = SHAPES[i % k](v, r(), STEPS[0]);
    }
    return rows;
  },
};

const build = BUILD[family];

// The one call site the whole sweep is about.
function read(rows) {
  let s = 0;
  for (let i = 0; i < rows.length; i++) s += rows[i].step();
  return s;
}

let sink = 0;

// Enough sweeps to put the call site past invocation_count_for_turbofan at
// small n, and enough loop iterations for OSR to reach it at large n. A
// dispatch benchmark that times a site still collecting feedback is measuring
// the warmup.
const WARMS = Math.max(3, Math.ceil(2e6 / n));

let t0;
let t1;
if (mode === 'excl') {
  const rows = build();
  for (let w = 0; w < WARMS; w++) sink += read(rows);
  t0 = process.hrtime.bigint();
  for (let i = 0; i < reps; i++) sink += read(rows);
  t1 = process.hrtime.bigint();
} else {
  for (let w = 0; w < WARMS; w++) sink += read(build());
  t0 = process.hrtime.bigint();
  for (let i = 0; i < reps; i++) sink += read(build());
  t1 = process.hrtime.bigint();
}

// One untimed verification pass produces the compared checksum; sink is printed
// so the timed loop cannot be eliminated as dead.
process.stdout.write(
  JSON.stringify({
    ns_per_op: Number(t1 - t0) / (reps * n),
    checksum: read(build()).toFixed(6),
    sink: sink > 0,
  })
);
