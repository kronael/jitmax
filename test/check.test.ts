import { test } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { load, program } from '../lib/ts.ts';
import { scan } from '../lib/scan.ts';
import { check } from '../lib/rules.ts';

const root = path.join(import.meta.dirname, '..');
const ts = load(root);

function rulesByFunction(dir: string): Map<string, string[]> {
  const { checker, marks } = scan(ts, program(ts, root, [path.join(root, dir)]));
  return new Map(marks.map((m) => [m.name, check(ts, checker, m).map((f) => f.rule)]));
}

const found = rulesByFunction('demo');
const rules = (name: string): string[] => found.get(name) ?? assert.fail(`no mark ${name}`);

test('a function is checked only where it is annotated', () => {
  assert.deepStrictEqual(
    [...found.keys()].sort(),
    [
      'collect',
      'collectByReduce',
      'drop',
      'fiveShapes',
      'fourShapes',
      'helper',
      'mixed',
      'oneStage',
      'total',
      'twoStages',
      'usesDependency',
      'usesHelper',
      'viaCallee',
      'widen',
    ]
  );
});

// The next two are the measurements talking. A rule that fires here contradicts
// bench/shapes.jsonl, and the rule is wrong, not the code under test.
test('four shapes stay silent: no effect two sweeps could resolve', () => {
  assert.deepStrictEqual(rules('fourShapes'), []);
});

test('a plain number[] stays silent', () => {
  assert.ok(!rules('fourShapes').includes('boxed-elements'));
});

test('the fifth shape fires: 3.6-10.6x on reads, the cliff', () => {
  assert.deepStrictEqual(rules('fiveShapes'), ['megamorphic-elements']);
});

test('a union mixing primitives fires', () => {
  assert.deepStrictEqual(rules('mixed'), ['boxed-elements']);
});

test('rebuilding the accumulator inside a loop fires', () => {
  assert.deepStrictEqual(rules('collect'), ['accumulating-spread']);
});

test('the same shape inside a reduce callback fires', () => {
  assert.deepStrictEqual(rules('collectByReduce'), ['accumulating-spread']);
});

// The measurement talking again: the cost is the loop re-running the copy, so
// a spread nothing re-runs is O(n) and the rule must not fire on it.
test('a spread no loop re-runs stays silent', () => {
  assert.deepStrictEqual(rules('widen'), []);
});

test('a two-stage chain fires', () => {
  assert.deepStrictEqual(rules('twoStages'), ['chained-allocation']);
});

// One stage allocates once. That is the baseline the 7.64x was measured
// against, so firing here would contradict the measurement.
test('a single map stays silent', () => {
  assert.deepStrictEqual(rules('oneStage'), []);
});

// The edge is the absence of source, not a directory name. njit compiles
// through library code and raises only where it cannot compile at all.
test('a call into a typed dependency is where the promise stops', () => {
  assert.deepStrictEqual(rules('usesDependency'), ['closed-world']);
});

test('delete fires', () => {
  assert.deepStrictEqual(rules('drop'), ['delete-property']);
});

// njit compiles the call tree, so the checker checks the call tree. A callee
// whose source we have is followed, not reported as the end of the world.
test('an unannotated callee with source is followed, not reported', () => {
  assert.deepStrictEqual(rules('total'), []);
});

test('a violation inside an unannotated callee is found', () => {
  assert.deepStrictEqual(rules('viaCallee'), ['delete-property']);
});

test('an annotated arrow, and an alias to it, stay inside the closed world', () => {
  assert.deepStrictEqual(rules('usesHelper'), []);
});

test('a missing path fails loudly instead of reporting a clean run', () => {
  assert.throws(() => program(ts, root, ['no/such/dir']), /no such file or directory/);
});
