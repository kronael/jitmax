// Workload for the end-to-end examples. Each variant is a real function from a
// real library, in one of two states:
//
//   <example>/before   the function exactly as the library ships it
//   <example>/after    the same function with the fix turbocharge printed on it
//                      and nothing else
//
// Both states are timed through the same caller — the batch of inputs, the
// application, and the read are all one code path from examples/workloads.ts,
// so the only thing that differs between a pair is the library function itself.
// The checksum is compared inside every pair by the driver, so an `after` that
// computes something different fails the cell rather than winning it.
//
//   node bench/example.js <example>/<before|after> <n> <excl|incl> <reps> <seed>
//
// `incl` builds the batch of results and reads them; that is the number a
// caller gets. `excl` builds the batch once and times only the reads, which is
// the half that matters for `delete-property`, whose cost is paid by whoever
// loads a property off the returned object.
//
// ns_per_op is divided by reps*n to keep bench/driver.js's calibration
// arithmetic — time per rep is ns_per_op * n — and the unit is otherwise
// arbitrary: only the ratio inside a pair is published.

import { args, emit } from './kernel.js';
import { estoolkitOmit, radashAssign, remedaMergeAll } from '../examples/workloads.ts';
import { assign as assignBefore } from '../examples/radash-assign.before.ts';
import { assign as assignAfter } from '../examples/radash-assign.after.ts';
import { mergeAll as mergeAllBefore } from '../examples/remeda-merge-all.before.ts';
import { mergeAll as mergeAllAfter } from '../examples/remeda-merge-all.after.ts';
import { omit as omitBefore } from '../examples/estoolkit-omit.before.ts';
import { omit as omitAfter } from '../examples/estoolkit-omit.after.ts';

const { variant, n, mode, reps, seed } = args();

const EXAMPLES = {
  'radash-assign': { workload: radashAssign, before: assignBefore, after: assignAfter },
  'remeda-merge-all': { workload: remedaMergeAll, before: mergeAllBefore, after: mergeAllAfter },
  'estoolkit-omit': { workload: estoolkitOmit, before: omitBefore, after: omitAfter },
};

const cut = variant.lastIndexOf('/');
const example = EXAMPLES[variant.slice(0, cut)];
const side = variant.slice(cut + 1);
if (!example) throw new Error(`unknown example ${variant}`);
if (side !== 'before' && side !== 'after') throw new Error(`unknown side ${variant}`);

// Resolved to a function ONCE, before anything is timed. A variant string
// compared inside a timed region produced a wrong result in this project
// before, and it is a rule of the repo that it never happens again.
const kernel = example[side];
const { run, read, digest, inputs } = example.workload;
const batch = inputs(n, seed);

const readAll = (outs) => {
  let s = 0;
  for (let i = 0; i < outs.length; i++) s += read(outs[i]);
  return s;
};

const applyAll = () => {
  const outs = new Array(batch.length);
  for (let i = 0; i < batch.length; i++) outs[i] = run(kernel, batch[i]);
  return outs;
};

let sink = 0;
let t0;
let t1;

if (mode === 'excl') {
  const outs = applyAll();
  for (let w = 0; w < 5; w++) sink += readAll(outs);
  t0 = process.hrtime.bigint();
  for (let i = 0; i < reps; i++) sink += readAll(outs);
  t1 = process.hrtime.bigint();
} else {
  for (let w = 0; w < 3; w++) sink += readAll(applyAll());
  t0 = process.hrtime.bigint();
  for (let i = 0; i < reps; i++) sink += readAll(applyAll());
  t1 = process.hrtime.bigint();
}

// One untimed verification pass produces the compared checksum: the whole
// batch, walked in full, not the four fields the timed read touches. `sink` is
// printed so the timed loop cannot be eliminated as dead.
let sum = 0;
for (const out of applyAll()) sum = (sum + digest(out)) % 1e12;

emit({ t0, t1, reps, n, checksum: sum, sink });
