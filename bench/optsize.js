// Does a function above max_optimized_bytecode_size (60 KB) ever reach
// TurboFan? V8's flag says no; this asks V8 directly, then times the gap.
//   node --allow-natives-syntax bench/optsize.js
const BITS = [
  [1, 'IsFunction'], [1 << 1, 'NeverOptimize'], [1 << 3, 'Optimized'],
  [1 << 4, 'Maglevved'], [1 << 5, 'TurboFanned'], [1 << 6, 'Interpreted'],
  [1 << 14, 'Baseline'], [1 << 15, 'TopFrameInterpreted'],
];

const make = (statements) =>
  new Function('a', `let s = 0;\n${
    Array.from({ length: statements }, (_, i) => `s += a * ${i % 97};`).join('\n')
  }\nreturn s;`);

function tierOf(fn) {
  for (let i = 0; i < 30000; i++) fn(1);
  const st = %GetOptimizationStatus(fn);
  return BITS.filter(([b]) => st & b).map(([, n]) => n).join(',');
}

const optimizes = (n) => /Maglevved|TurboFanned|Optimized/.test(tierOf(make(n)));

let lo = 1, hi = 8000;
while (hi - lo > 1) {
  const mid = (lo + hi) >> 1;
  if (optimizes(mid)) lo = mid; else hi = mid;
}
process.stdout.write(`last size V8 still optimizes: ${lo} statements (${hi} is not optimized)\n`);

// Per-statement cost either side of the edge, normalized by statement count.
for (const n of [lo, hi]) {
  const fn = make(n);
  for (let i = 0; i < 30000; i++) fn(1);
  const t0 = process.hrtime.bigint();
  let sink = 0;
  for (let i = 0; i < 20000; i++) sink += fn(i);
  const t1 = process.hrtime.bigint();
  process.stdout.write(
    `${String(n).padStart(5)} statements: ${(Number(t1 - t0) / 20000 / n).toFixed(3)} ns/statement` +
    `  [${tierOf(fn)}]  sink=${sink > 0}\n`
  );
}
