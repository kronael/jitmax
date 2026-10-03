import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { load, program } from '../lib/ts.ts';
import { scan } from '../lib/scan.ts';
import { check } from '../lib/rules.ts';

// Filling the body budget before a conditional call exposes partial admission.
test('dispatch reports checked bodies accurately across the walk cap', () => {
  const ts = load(path.join(import.meta.dirname, '..'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jitmax-dispatch-report-'));
  const file = path.join(dir, 'work.ts');
  try {
    for (const [helpers, checked] of [[0, 2], [198, 1], [199, 0]] as const) {
      fs.writeFileSync(file,
        'const row: {x?: number} = {};\n' +
        'function left(){delete row.x;} function right(){}\n' +
        Array.from({length: helpers}, (_, i) => `function f${i}(){return 1;}`).join('\n') +
        '\n/** @jitmax */\nfunction hot(flag: boolean){\n' +
        Array.from({length: helpers}, (_, i) => `f${i}();`).join('\n') +
        '\nconst picked = flag ? left : right; picked();}\n');
      const result = scan(ts, program(ts, dir, [file]));
      const mark = result.marks[0] ?? assert.fail('missing hot root');
      const finding = check(ts, result.checker, mark).find(f => f.rule === 'interface-dispatch');
      assert.ok(finding);
      assert.equal(mark.truncated, helpers > 0);
      assert.equal(mark.reached.some(body => body.name === 'left'), checked > 0);
      assert.equal(mark.reached.some(body => body.name === 'right'), checked === 2);
      if (checked === 0) assert.match(finding.message, /no readable body was checked/);
      else assert.match(finding.message, new RegExp(`${checked} readable bod`));
      if (checked === 1) assert.match(finding.message, /some located bodies were not checked/);
      assert.doesNotMatch(finding.message, /their bodies are not followed/);
    }
  } finally {
    fs.unlinkSync(file);
    fs.rmdirSync(dir);
  }
});

test('one receiver with multiple targets reports checked bodies', () => {
  const ts = load(path.join(import.meta.dirname, '..'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jitmax-dispatch-report-'));
  const file = path.join(dir, 'work.ts');
  try {
    fs.writeFileSync(file,
      'const row: {x?: number} = {};\n' +
      'const obj = {run(){return 0;}};\n' +
      'function replacement(){delete row.x; return 1;}\n' +
      '/** @jitmax */\n' +
      'function hot(){obj.run = replacement; return obj.run();}\n');
    const result = scan(ts, program(ts, dir, [file]));
    const mark = result.marks[0] ?? assert.fail('missing hot root');
    const findings = check(ts, result.checker, mark);
    const finding = findings.find(f => f.rule === 'interface-dispatch');
    assert.ok(finding);
    assert.ok(findings.some(f => f.rule === 'delete-property'));
    const dispatch = mark.escapes.find(c => c.dispatch.checked === 2)?.dispatch;
    assert.ok(dispatch);
    assert.equal(dispatch.count, 1);
    assert.equal(dispatch.located, 2);
    assert.match(finding.message, /2 readable bodies are checked/);
    assert.match(finding.message, /runtime target selection remains unresolved/);
  } finally {
    fs.unlinkSync(file);
    fs.rmdirSync(dir);
  }
});
