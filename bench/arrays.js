// Workload for boxed-elements. The rule shipped 1.45-1.89x on reads and
// 2.36-3.28x with construction, cited to a benchmark write-up whose Results
// section read, in full, "(filled in after the runs; raw observations in
// `bench/results.jsonl`)". Neither that file nor the kernels it named were ever
// written, and the write-up is gone (BUGS TC-14). This is the sweep.
//
// One kernel, `s += a[i]`, over five arrays holding the SAME doubles in the
// same order. Only the elements kind varies:
//
//   double     PACKED_DOUBLE_ELEMENTS — the baseline, and the fast case
//   boxed      PACKED_ELEMENTS — every element a pointer to a HeapNumber
//   holey      HOLEY_DOUBLE_ELEMENTS — a control, published refuted at 0.94-1.09x
//   f64        Float64Array — a control, published refuted on reads and ~3x
//              faster to construct
//   unionnum   the case the RULE actually fires on: a value that MAY be a
//              string and never is
//
// `unionnum` is the trigger, and V8's source says the trigger is wrong.
// `Object::OptimalElementsKind` (src/objects/objects-inl.h:700) picks the kind
// from the value being STORED, one store at a time, so an array whose declared
// TypeScript type is `(number | string)[]` and whose contents are all numbers is
// PACKED_DOUBLE_ELEMENTS — the same array `double` builds. This variant exists
// to measure that rather than assert it. `mode=kinds` prints the kind V8 chose.
//
//   node bench/arrays.js <variant> <n> <excl|incl|kinds> <reps> <seed>

import { args, emit, mulberry32 as rng } from './kernel.js';

const { variant, n, mode, reps, seed } = args();

// The union's string branch, dead at runtime and live in the type. Derived from
// the seed, which the driver only ever passes as a positive integer, so the
// branch is never taken and the array only ever sees doubles. Written this way
// rather than as a literal `false` because a literal is folded before the code
// exists, and the claim under test is about what V8 does with a store it cannot
// prove is a double.
const STRINGY = seed < 0;
const maybeString = (v) => (STRINGY ? String(v) : v);

// One function per variant, resolved ONCE below. A `switch` on the variant
// inside the timed region put a string comparison in every rep and TurboFan
// miscompiled it — a rule of the repo, and the reason this is a table.
const BUILD = {
  double: () => {
    const r = rng(seed);
    const a = [r()];
    for (let i = 1; i < n; i++) a.push(r());
    return a;
  },

  // Seeded with a string so V8 picks the general kind on the first store, then
  // overwritten before anything reads it. The kind lattice only moves one way,
  // so every double stored afterwards is boxed into a HeapNumber.
  boxed: () => {
    const r = rng(seed);
    const a = ['boxed'];
    a[0] = r();
    for (let i = 1; i < n; i++) a.push(r());
    return a;
  },

  // `new Array(n)` starts HOLEY_SMI_ELEMENTS and filling it in order leaves it
  // HOLEY_DOUBLE_ELEMENTS with no actual holes — how most code allocates a
  // result array, and a kind that never goes back to packed.
  holey: () => {
    const r = rng(seed);
    const a = new Array(n);
    for (let i = 0; i < n; i++) a[i] = r();
    return a;
  },

  f64: () => {
    const r = rng(seed);
    const a = new Float64Array(n);
    for (let i = 0; i < n; i++) a[i] = r();
    return a;
  },

  unionnum: () => {
    const r = rng(seed);
    const a = [maybeString(r())];
    for (let i = 1; i < n; i++) a.push(maybeString(r()));
    return a;
  },
};

const build = BUILD[variant];
if (!build) throw new Error(`unknown variant ${variant}`);

const sum = (a) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s;
};

// `kinds` is a diagnostic and never an evidence run: it needs
// --allow-natives-syntax, which protocol rule 8 forbids in a measured process.
// The
// natives go through a direct eval so this file still parses without the flag.
//   node --allow-natives-syntax bench/arrays.js unionnum 8 kinds 1 1
if (mode === 'kinds') {
  const a = build();
  const ask = (expr) => {
    try {
      return eval(expr);
    } catch {
      return 'needs --allow-natives-syntax';
    }
  };
  process.stdout.write(
    JSON.stringify({
      variant,
      packedDouble: ask('%HasDoubleElements(a)'),
      packedObject: ask('%HasObjectElements(a)'),
      smi: ask('%HasSmiElements(a)'),
      holey: ask('%HasHoleyElements(a)'),
      typed: ask('%HasFixedFloat64Elements(a)'),
    })
  );
} else {
  let sink = 0;

  // Enough sweeps to put the read site past invocation_count_for_turbofan at
  // small n, and enough loop iterations for OSR to reach it at large n.
  const WARMS = Math.max(4, Math.ceil(2e6 / n));

  let t0;
  let t1;

  if (mode === 'excl') {
    const a = build();
    for (let w = 0; w < WARMS; w++) sink += sum(a);
    t0 = process.hrtime.bigint();
    for (let i = 0; i < reps; i++) sink += sum(a);
    t1 = process.hrtime.bigint();
  } else {
    for (let w = 0; w < 3; w++) sink += sum(build());
    t0 = process.hrtime.bigint();
    for (let i = 0; i < reps; i++) sink += sum(build());
    t1 = process.hrtime.bigint();
  }

  emit({ t0, t1, reps, n, checksum: sum(build()), sink });
}
