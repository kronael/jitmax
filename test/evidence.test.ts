import { test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cellOrVoid, replicate, replicates } from '../bench/driver.ts';
import { environment } from '../bench/env.ts';
import { emit } from '../bench/kernel.ts';

const opts = {
  script: 'test-only-output', baseline: 'base', variant: 'test',
  n: 1000, mode: 'incl',
};
const valid = { ns_per_op: 120, checksum: '1.000000', sink: true,
  warmups: 3 };

function mockOutput(t: TestContext, output: (args: readonly string[]) => string) {
  t.mock.method(cp, 'execFileSync',
    function (_bin: string, args: readonly string[]) {
      return output(args);
    });
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
}

/** Missing checksums must void every replicate before agreement is checked. */
test('missing checksums cannot become replicated evidence', (t) => {
  mockOutput(t, (args) => JSON.stringify({
    ns_per_op: args.at(-5) === 'base' ? 120 : 240, sink: false,
  }));
  const written: unknown[] = [];
  const runs = replicate(opts, (run) => written.push(run));
  assert.equal(written.length, 3);
  assert.equal(replicates(runs), false);
  for (const run of runs) {
    assert.equal(run.void, true);
    assert.match(run.error ?? '', /checksum/);
  }
});

/** Invalid timing values must void the cell without producing NaN evidence. */
test('child timing must be finite, numeric and positive', (t) => {
  let ns: unknown;
  mockOutput(t, () => JSON.stringify({ ...valid, ns_per_op: ns }));
  for (ns of [undefined, null, '120', 0, -1, NaN, Infinity]) {
    const run = cellOrVoid(opts);
    assert.equal(run.void, true, `accepted timing ${String(ns)}`);
    assert.match(run.error ?? '', /ns_per_op/);
  }
  ns = Number.MIN_VALUE;
  const overflow = cellOrVoid(opts);
  assert.equal(overflow.void, true);
  assert.match(overflow.error ?? '', /calibration repetition count/);
});

/** Invalid JSON shapes and extra stdout must void the cell with an error. */
test('child output must be one workload JSON object', (t) => {
  let output = '';
  mockOutput(t, () => output);
  for (output of ['{}', 'null', '[]', '120', 'true', '"row"',
    '', 'diagnostic\n' + JSON.stringify(valid),
    JSON.stringify(valid).replace('120', '1e999')]) {
    const run = cellOrVoid(opts);
    assert.equal(run.void, true, `accepted output ${output}`);
    assert.ok(run.error);
  }
});

/** Missing or nonnumeric checksums and nonboolean sinks must void the cell. */
test('child checksum and sink must meet the emitted contract', (t) => {
  let output: object = valid;
  mockOutput(t, () => JSON.stringify(output));
  for (const checksum of [undefined, null, 1, '', ' ', 'NaN',
    'Infinity', '1e999', 'not-a-number', '0x10']) {
    output = { ...valid, checksum };
    const run = cellOrVoid(opts);
    assert.equal(run.void, true, `accepted checksum ${String(checksum)}`);
    assert.match(run.error ?? '', /checksum/);
  }
  for (const sink of [undefined, null, 0, 1, 'true', {}]) {
    output = { ...valid, sink };
    const run = cellOrVoid(opts);
    assert.equal(run.void, true, `accepted sink ${String(sink)}`);
    assert.match(run.error ?? '', /sink/);
  }
});

/** Invalid measured output after valid calibration must still void the cell. */
test('validation covers measured children and preserves checksum mismatch', (t) => {
  let calls = 0;
  let mismatch = false;
  mockOutput(t, (args) => {
    if (++calls <= 12) return JSON.stringify(valid);
    return JSON.stringify(mismatch
      ? { ...valid, checksum: args.at(-5) === 'base' ? '1.000000' : '2.000000' }
      : { ...valid, ns_per_op: null });
  });
  const invalid = cellOrVoid(opts);
  assert.equal(invalid.void, true);
  assert.match(invalid.error ?? '', /ns_per_op/);
  calls = 0;
  mismatch = true;
  const unequal = cellOrVoid(opts);
  assert.equal(unequal.void, true);
  assert.match(unequal.error ?? '', /checksum mismatch/);
});

/** Real emit output permits zero, negative and exponent checksums and false sinks. */
test('finite kernel output preserves measured pairs and region checks', (t) => {
  let output = '';
  t.mock.method(process.stdout, 'write', function (chunk: string) {
    output = chunk;
    return true;
  });
  mockOutput(t, () => output);
  const checksums = [0, -0.0000001, -123.5, 1e21, Number.MAX_VALUE];
  for (const [warmups, checksum] of checksums.entries()) {
    emit({ t0: 0n, t1: 120000n, reps: 1, n: 1000,
      checksum, sink: checksum, warmups });
    const run = cellOrVoid(opts);
    if (run.void) assert.fail(run.error);
    assert.equal(run.void, undefined);
    assert.equal(run.base.length, 20);
    assert.equal(run.test.length, 20);
    assert.equal(run.msBase, 120);
    assert.equal(run.msTest, 120);
    assert.equal(run.ratio, 1);
    assert.equal(run.warmupsBase, warmups);
    assert.equal(run.warmupsTest, warmups);
    assert.equal(run.calibrationSeed, 1);
    assert.deepEqual(run.seeds, Array.from({ length: 20 }, (_, i) => 1000 + i));
  }
  output = JSON.stringify({ ...valid, ns_per_op: 300000 });
  const outside = cellOrVoid(opts);
  assert.equal(outside.void, true);
  assert.match(outside.error ?? '', /outside 60-240 ms/);
});

/** A row must carry the actual per-side warmups and the input seeds sent to children. */
test('driver records distinct warmups and the actual calibration and pair seeds', (t) => {
  const seeds: number[] = [];
  mockOutput(t, (args) => {
    seeds.push(Number(args.at(-1)));
    return JSON.stringify({ ...valid,
      warmups: args.at(-5) === 'base' ? 0 : 7 });
  });
  const run = cellOrVoid(opts);
  if (run.void) assert.fail(run.error);
  assert.equal(run.warmupsBase, 0);
  assert.equal(run.warmupsTest, 7);
  assert.deepEqual(seeds.slice(0, 12), Array(12).fill(run.calibrationSeed));
  assert.deepEqual(seeds.slice(12), run.seeds.flatMap((seed) => [seed, seed]));
});

/** Invalid or changing warmup counts must void calibration and measured pairs. */
test('driver rejects invalid and inconsistent child warmup counts', (t) => {
  let warmups: unknown;
  let calls = 0;
  let changeAfter = Infinity;
  mockOutput(t, () => JSON.stringify({ ...valid,
    warmups: ++calls > changeAfter ? 4 : warmups }));
  for (warmups of [undefined, null, '3', -1, 1.5, Infinity]) {
    const run = cellOrVoid(opts);
    assert.equal(run.void, true, `accepted warmups ${String(warmups)}`);
    assert.match(run.error ?? '', /warmups/);
  }
  warmups = 3;
  calls = 0;
  changeAfter = 1;
  const calibration = cellOrVoid(opts);
  assert.equal(calibration.void, true);
  assert.match(calibration.error ?? '', /warmup count changed during calibration/);
  calls = 0;
  changeAfter = 12;
  const measured = cellOrVoid(opts);
  assert.equal(measured.void, true);
  assert.match(measured.error ?? '', /warmup count changed in pair/);
});

/** Parent Node options and coverage must not enter any benchmark child. */
test('child environment clears Node options and coverage without mutating parent', (t) => {
  t.mock.method(cp, 'execFileSync', function (_bin: string,
    _args: readonly string[], options: cp.ExecFileSyncOptions) {
    assert.equal(options.env?.NODE_OPTIONS ?? '', '');
    assert.equal(options.env?.NODE_V8_COVERAGE ?? '', '');
    assert.equal(options.env?.JITMAX_TEST_VALUE, 'kept');
    return JSON.stringify(valid);
  });
  syncBuiltinESMExports();
  const saved = { ...process.env };
  t.after(() => {
    process.env = saved;
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  process.env.NODE_OPTIONS = '--max-old-space-size=256 --require=missing';
  process.env.NODE_V8_COVERAGE = '/test-only-coverage';
  process.env.JITMAX_TEST_VALUE = 'kept';
  const run = cellOrVoid(opts);
  assert.equal(run.void, undefined, run.error ?? 'unexpected void cell');
  assert.equal(process.env.NODE_OPTIONS, '--max-old-space-size=256 --require=missing');
  assert.equal(process.env.NODE_V8_COVERAGE, '/test-only-coverage');
  const env = environment(1);
  assert.equal(env.flags, '');
  assert.equal(env.nodeOptions, '');
  assert.equal(env.nodeV8Coverage, false);
});

/** A constant child must match a clean heap and emit no inherited coverage. */
test('actual child heap and coverage match the recorded clean environment', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jitmax-child-contract-'));
  const script = path.join(dir, 'constant.cjs');
  const coverage = path.join(dir, 'coverage');
  fs.mkdirSync(coverage);
  fs.writeFileSync(script, `process.stdout.write(JSON.stringify({
    ns_per_op: 120, checksum: '1.000000', sink: false, warmups: 0,
    nodeOptions: process.env.NODE_OPTIONS || '',
    coverage: process.env.NODE_V8_COVERAGE || '',
    heap: require('node:v8').getHeapStatistics().heap_size_limit
  }));`);
  const saved = { ...process.env };
  const clean = { ...saved };
  delete clean.NODE_OPTIONS;
  delete clean.NODE_V8_COVERAGE;
  const control: unknown = JSON.parse(cp.execFileSync(process.execPath, [script],
    { encoding: 'utf8', env: clean }));
  const real = cp.execFileSync;
  let child: unknown;
  t.mock.method(cp, 'execFileSync', function (bin: string,
    args: readonly string[], options: cp.ExecFileSyncOptionsWithStringEncoding) {
    if (child) throw new Error('test stops after one constant child');
    const output = real(bin, args, options);
    child = JSON.parse(output);
    return output;
  });
  syncBuiltinESMExports();
  t.after(() => {
    process.env = saved;
    t.mock.restoreAll();
    syncBuiltinESMExports();
    for (const file of fs.readdirSync(coverage))
      fs.unlinkSync(path.join(coverage, file));
    fs.rmdirSync(coverage);
    fs.unlinkSync(script);
    fs.rmdirSync(dir);
  });
  process.env.NODE_OPTIONS = '--max-old-space-size=256';
  process.env.NODE_V8_COVERAGE = coverage;
  const run = cellOrVoid({ ...opts, script });
  assert.equal(run.void, true);
  assert.match(run.error ?? '', /test stops after one constant child/);
  assert.deepEqual(child, control);
  assert.deepEqual(fs.readdirSync(coverage), []);
});
