// The tier diagnostic's reader, against traces V8 actually printed.
//
// Plain JavaScript and not part of the tsconfig `include`, because bench/ is
// JavaScript: the checker is the TypeScript half of this repo and the
// measurement code is not.
//
// What is worth a test here is the one thing that was wrong first: the token
// says WHAT WAS RUNNING WHEN THE STOPWATCH STARTED, and reading the last
// optimization event in the process instead of replaying them in order reported
// a function that was optimized throughout as if the region had run cold. Six
// cells of the shapes sweep were called tier mismatches for that reason alone.

import assert from 'node:assert/strict';
import test from 'node:test';
import { parse, summarize } from '../bench/tiers.js';

const of = (trace) => summarize(parse(trace));

const MARK = (f) =>
  `[marking 0x1 <JSFunction ${f} (sfi = 0x9)> for optimization to TURBOFAN, ` +
  `ConcurrencyMode::kConcurrent, reason: hot and stable]`;
const DONE = (f, osr = '') =>
  `[completed optimizing 0x1 <JSFunction ${f} (sfi = 0x9)> (target TURBOFAN)${osr}]`;
const BAIL = (f, reason) =>
  `[bailout (kind: deopt-eager, reason: ${reason}): begin. deoptimizing 0x1 ` +
  `<JSFunction ${f} (sfi = 0x9)>, 0x2 <Code TURBOFAN>, opt id 1, bytecode offset 251]`;

test('optimized in warmup, and nothing changed inside the region', () => {
  assert.deepEqual(
    of([MARK('sum'), DONE('sum', ' OSR'), '[[region begin]]', '[[region end]]'].join('\n')),
    { sum: 'TF/osr' }
  );
});

test('a deopt after the region does not make the region cold', () => {
  // The bug. `sum` ran TurboFan code for the whole timed region; the deopt and
  // the recompile are the checksum pass afterwards.
  assert.deepEqual(
    of([
      MARK('sum'), DONE('sum'),
      '[[region begin]]', '[[region end]]',
      BAIL('sum', 'wrong map'), DONE('sum'),
    ].join('\n')),
    { sum: 'TF' }
  );
});

test('tiering up inside the region is reported inside the region', () => {
  assert.deepEqual(
    of(['[[region begin]]', MARK('build'), DONE('build', ' OSR'), '[[region end]]'].join('\n')),
    { build: 'none[+TF/osr]' }
  );
});

test('marked in warmup and not landed by the time the stopwatch started', () => {
  assert.deepEqual(
    of([MARK('build'), '[[region begin]]', DONE('build'), '[[region end]]'].join('\n')),
    { build: 'marked[+TF]' }
  );
});

test('a deopt inside the region is part of the token', () => {
  assert.deepEqual(
    of([
      MARK('read'), DONE('read'),
      '[[region begin]]', BAIL('read', 'wrong call target'), DONE('read'), '[[region end]]',
    ].join('\n')),
    { read: 'TF[-deopt +TF]' }
  );
});

test('unnamed functions are told apart by their sfi', () => {
  const t = [
    '[completed optimizing 0x1 <JSFunction (sfi = 0xaa)> (target TURBOFAN) OSR]',
    '[completed optimizing 0x2 <JSFunction (sfi = 0xbb)> (target TURBOFAN)]',
    '[completed optimizing 0x3 <JSFunction (sfi = 0xaa)> (target TURBOFAN) OSR]',
    '[[region begin]]',
    '[[region end]]',
  ].join('\n');
  assert.deepEqual(of(t), { '(anon 1)': 'TF/osr', '(anon 2)': 'TF' });
});

test('a deopt reason and its phase survive the parse', () => {
  const { deopts } = parse(
    ['[[region begin]]', BAIL('sum', 'Insufficient type feedback for generic named access'),
      '[[region end]]'].join('\n')
  );
  assert.deepEqual(deopts, [{
    fn: 'sum',
    kind: 'deopt-eager',
    reason: 'Insufficient type feedback for generic named access',
    phase: 'region',
  }]);
});

test('every line of a real trace is recognised', () => {
  // An unparsed `[...]` line is a trace format this reader does not know about,
  // and a reader that silently ignores one reports a tier it never saw. The
  // shapes are the ones V8 15.x prints; `unknown` is where anything else lands.
  const { unknown } = parse([
    MARK('sum'),
    '[compiling method 0x1 <JSFunction sum (sfi = 0x9)> (target TURBOFAN), mode: X]',
    '[completed compiling 0x1 <JSFunction sum (sfi = 0x9)> (target TURBOFAN) - took 0.1, 1, 0.1 ms]',
    DONE('sum'),
    BAIL('sum', 'wrong map'),
    '[aborted optimizing 0x1 <JSFunction sum (sfi = 0x9)> (target TURBOFAN) because: X]',
    '[not marking function sum for optimization: small function]',
    '{"ns_per_op":1,"checksum":"0.000000","sink":true}',
  ].join('\n'));
  assert.deepEqual(unknown, []);
});
