// Workload behind BUGS TC-53. `jitmax` reports nothing on a function that
// reads `arguments`, and the project cannot currently say whether that silence
// is right. Every JS performance guide still repeats that the arguments object
// is slow; TurboFan's escape analysis materializes it only where it leaks, so
// the advice is probably dead. This sweep is here to publish the null, or to
// refute it.
//
// Three forms, each against the rest-parameter rewrite that computes the same
// value, so the checksum the driver compares is a real test:
//
//   restlen / arglen   read the count only
//   restidx / argidx   read the three values by index
//   restesc / argesc   hand the whole thing to another function, so it escapes
//
// The escape pair is the one with a mechanism behind it: a materialized
// arguments object is a real allocation, and a rest parameter is a real array
// either way.
//
//   node bench/arguments.ts <variant> <n> <mode> <reps> <seed>

import { args, emit, lcg } from './kernel.ts';

const { variant, n, mode, reps, seed } = args();

const rand = lcg(seed);

// Three columns, so every call carries three arguments drawn from the seed.
const a = Array.from({ length: n }, () => Math.floor(rand() * 1000));
const b = Array.from({ length: n }, () => Math.floor(rand() * 1000));
const c = Array.from({ length: n }, () => Math.floor(rand() * 1000));

// The escape target. Not inlined away by being given something to do with the
// whole collection: it sums whatever it was handed.
function sumOf(xs: ArrayLike<number>): number {
  let t = 0;
  for (let i = 0; i < xs.length; i++) t += xs[i];
  return t;
}

function restLen(...xs: number[]): number {
  return xs.length;
}
function argLen(): number {
  return arguments.length;
}

function restIdx(...xs: number[]): number {
  return xs[0] + xs[1] + xs[2];
}
function argIdx(): number {
  return arguments[0] + arguments[1] + arguments[2];
}

function restEsc(...xs: number[]): number {
  return sumOf(xs);
}
function argEsc(): number {
  return sumOf(arguments);
}

// Resolved once, before timing. A switch inside a timed region produced a wrong
// result in this project already.
const KERNEL: Record<string, ((...xs: number[]) => number) | undefined> = {
  restlen: restLen,
  arglen: argLen,
  restidx: restIdx,
  argidx: argIdx,
  restesc: restEsc,
  argesc: argEsc,
};
const f = KERNEL[variant];
if (!f) throw new Error(`unknown variant ${variant}`);

const sweep = () => {
  let t = 0;
  for (let i = 0; i < n; i++) t += f(a[i], b[i], c[i]);
  return t;
};

let sink = 0;
for (let w = 0; w < 3; w++) sink += sweep();
const t0 = process.hrtime.bigint();
for (let i = 0; i < reps; i++) sink += sweep();
const t1 = process.hrtime.bigint();

// 'excl' only: the arguments object is built inside the callee on every call,
// so it is inside the timed region by construction and an 'incl' cell would be
// the same measurement under a different name — as in bench/inline.ts.
emit({ t0, t1, reps, n, checksum: sweep(), sink });
