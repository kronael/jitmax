/** Array assignment and object spread check the getters they actually read. */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { load, program } from '../lib/ts.ts';
import { scan } from '../lib/scan.ts';
import { check } from '../lib/rules.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jitmax-getter-spread-'));
const file = path.join(dir, 'work.ts');
const source = `
class Box {
  row: {key?: number};
  constructor(row: {key?: number}) { this.row = row; }
  get value() { delete this.row.key; return 1; }
}
/** @jitmax */ function arrayAssignment(row: {key?: number}) {
  let value = 0; ([{value}] = [new Box(row)]); return value;
}
/** @jitmax */ function arrayBinding(row: {key?: number}) {
  const [{value}] = [new Box(row)]; return value;
}
/** @jitmax */ function secondElement(row: {key?: number}) {
  let value = 0; ([, {value}] = [{value: 2}, new Box(row)]); return value;
}
/** @jitmax */ function skippedGetter(row: {key?: number}) {
  let value = 0; ([, {value}] = [new Box(row), {value: 2}]); return value;
}
/** @jitmax */ function plainArray(row: {key?: number}) {
  let value = 0; ([{value}] = [{value: 2}]); return value;
}
const initial: {key?: number} = {};
const own = {row: initial, get value() { delete this.row.key; return 1; }};
/** @jitmax */ function ownSpread(row: {key?: number}) {
  own.row = row; return {...own};
}
/** @jitmax */ function ownRest(row: {key?: number}) {
  own.row = row; const {...copy} = own; return copy;
}
/** @jitmax */ function prototypeSpread(row: {key?: number}) { return {...new Box(row)}; }
`;
fs.writeFileSync(file, source);
const ts = load(path.join(import.meta.dirname, '..'));
const p = ts.createProgram([file], {strict: true, target: ts.ScriptTarget.ES2022,
  skipLibCheck: true, types: [], noEmit: true});
const result = scan(ts, program(ts, dir, [file]));
function rules(name: string) {
  const mark = result.marks.find((mark) => mark.name === name);
  assert.ok(mark, name);
  return check(ts, result.checker, mark).map((finding) => finding.rule);
}
after(() => { fs.unlinkSync(file); fs.rmdirSync(dir); });

/** These invocation fixtures use strict valid TypeScript. */
test('array assignment and object spread fixtures have zero diagnostics', () => {
  assert.deepEqual(ts.getPreEmitDiagnostics(p).map((d) =>
    ts.flattenDiagnosticMessageText(d.messageText, ' ')), []);
});

/** The nested assignment reads its first element's deleting getter. */
test('object pattern inside array assignment reaches its getter', () => {
  assert.ok(rules('arrayAssignment').includes('delete-property'));
});

/** The corresponding declaration binding keeps its getter coverage. */
test('object pattern inside array binding reaches its getter', () => {
  assert.ok(rules('arrayBinding').includes('delete-property'));
});

/** An omitted first position does not shift the second element's source. */
test('array assignment selects the second element getter', () => {
  assert.ok(rules('secondElement').includes('delete-property'));
});

/** A getter in an omitted element does not run during destructuring. */
test('array assignment does not check an omitted element getter', () => {
  assert.deepEqual(rules('skippedGetter'), []);
});

/** A plain data property requires no getter body. */
test('plain data array assignment stays clean', () => {
  assert.deepEqual(rules('plainArray'), []);
});

/** Ordinary spread reads the literal's own enumerable getter. */
test('ordinary object spread reaches its copied own getter', () => {
  assert.ok(rules('ownSpread').includes('delete-property'));
});

/** Rest keeps the same own enumerable getter coverage. */
test('object rest retains its copied own getter', () => {
  assert.ok(rules('ownRest').includes('delete-property'));
});

/** Class prototype accessors are absent from the spread's own keys. */
test('object spread does not check a class prototype getter', () => {
  assert.deepEqual(rules('prototypeSpread'), []);
});

/** Untimed runtime distinguishes actual getter reads from omitted/prototype properties. */
test('array and spread runtime effects agree with the getter controls', () => {
  const run = new Function(ts.transpile(source, {target: ts.ScriptTarget.ES2022}) +
    '; return {arrayAssignment, arrayBinding, secondElement, skippedGetter, plainArray, ' +
    'ownSpread, ownRest, prototypeSpread};')();
  for (const name of ['arrayAssignment', 'arrayBinding', 'secondElement', 'ownSpread', 'ownRest']) {
    const row = {key: 1};
    run[name](row);
    assert.equal(Object.hasOwn(row, 'key'), false, name);
  }
  for (const name of ['skippedGetter', 'plainArray', 'prototypeSpread']) {
    const row = {key: 1};
    run[name](row);
    assert.equal(Object.hasOwn(row, 'key'), true, name);
  }
});
