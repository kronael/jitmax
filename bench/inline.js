// Workload behind closed-world. The rule reports calls the checker cannot see
// into. This measures what an opaque call can cost you, by isolating the one
// mechanism a call boundary controls: inlining.
//
//   small  — helper is a few bytes of bytecode, well under the inlining budget
//   large  — the SAME helper, with dead code padding its bytecode past
//            max_inlined_bytecode_size (460, src/flags/flag-definitions.h:1606)
//
// The padding sits behind a runtime-false flag, so it inflates the bytecode the
// inliner budgets against and never executes. Both variants therefore do
// identical arithmetic and return identical values — the only difference is
// whether V8 was allowed to inline the call.
//
//   node bench/inline.js <small|large> <n> <mode> <reps> <seed>

const [variant, n, mode, reps, seed] = [
  process.argv[2],
  Number(process.argv[3]),
  process.argv[4],
  Number(process.argv[5]),
  Number(process.argv[6]),
];

let s = seed;
const rand = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

const source = Array.from({ length: n }, () => Math.floor(rand() * 1000));

// Runtime-false. Derived from argv so V8 cannot fold the branch away at parse
// time and drop the padding it is there to create.
const never = process.argv.length > 99;

// Built by hand rather than by eval, so what the engine sees is what is in this
// file. 240 statements is comfortably past the 460-byte budget.
const pad = (v) => {
  let t = v;
  t += 1; t += 2; t += 3; t += 4; t += 5; t += 6; t += 7; t += 8; t += 9; t += 10;
  t += 1; t += 2; t += 3; t += 4; t += 5; t += 6; t += 7; t += 8; t += 9; t += 10;
  t += 1; t += 2; t += 3; t += 4; t += 5; t += 6; t += 7; t += 8; t += 9; t += 10;
  t += 1; t += 2; t += 3; t += 4; t += 5; t += 6; t += 7; t += 8; t += 9; t += 10;
  t += 1; t += 2; t += 3; t += 4; t += 5; t += 6; t += 7; t += 8; t += 9; t += 10;
  t += 1; t += 2; t += 3; t += 4; t += 5; t += 6; t += 7; t += 8; t += 9; t += 10;
  t += 1; t += 2; t += 3; t += 4; t += 5; t += 6; t += 7; t += 8; t += 9; t += 10;
  t += 1; t += 2; t += 3; t += 4; t += 5; t += 6; t += 7; t += 8; t += 9; t += 10;
  return t;
};

function helperSmall(v) {
  return v * 2 + 1;
}

function helperLarge(v) {
  if (never) return pad(v);
  return v * 2 + 1;
}

const helper = variant === 'large' ? helperLarge : helperSmall;

const sweep = (a) => {
  let t = 0;
  for (let i = 0; i < a.length; i++) t += helper(a[i]);
  return t;
};

let sink = 0;
let t0;
let t1;

// 'excl' is the only meaningful mode here: there is nothing to construct. It is
// run in both so the cell shape matches every other sweep in this directory.
for (let w = 0; w < 3; w++) sink += sweep(source);
t0 = process.hrtime.bigint();
for (let i = 0; i < reps; i++) sink += sweep(source);
t1 = process.hrtime.bigint();

process.stdout.write(
  JSON.stringify({
    ns_per_op: Number(t1 - t0) / (reps * n),
    checksum: sweep(source).toFixed(6),
    sink: sink > 0,
    mode,
  })
);
