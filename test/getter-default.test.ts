/** Array assignment defaults inspect the supplied value or the fallback that runs. */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { load, program } from '../lib/ts.ts';
import { scan } from '../lib/scan.ts';
import { check } from '../lib/rules.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jitmax-getter-default-'));
const file = path.join(dir, 'work.ts');
const source = `
const row: {key?: number} = {key: 1};
const dirty = {get value() { delete row.key; return 1; }};
const data = {value: 2};
class Box {
  row: {key?: number};
  constructor(row: {key?: number}) { this.row = row; }
  get value() { delete this.row.key; return 1; }
}
/** @jitmax */ function suppliedGetter() {
  let value = 0; ([{value} = data] = [dirty]); return value;
}
/** @jitmax */ function unusedGetterDefault() {
  let value = 0; ([{value} = dirty] = [data]); return value;
}
/** @jitmax */ function emptyDefault() {
  let value = 0; ([{value} = dirty] = []); return value;
}
/** @jitmax */ function undefinedDefault() {
  let value = 0; ([{value} = dirty] = [undefined]); return value;
}
/** @jitmax */ function emptyDataDefault() {
  let value = 0; ([{value} = data] = []); return value;
}
/** @jitmax */ function withoutDefault() {
  let value = 0; ([{value}] = [dirty]); return value;
}
/** @jitmax */ function declarationDefault() {
  const [{value} = data] = [dirty]; return value;
}
/** @jitmax */ function suppliedAlias() {
  const items = [data]; let value = 0; ([{value} = dirty] = items); return value;
}
/** @jitmax */ function emptyAlias() {
  const items: Array<{value: number}> = [];
  let value = 0; ([{value} = dirty] = items); return value;
}
/** @jitmax */ function suppliedClass() {
  let value = 0; ([{value} = data] = [new Box(row)]); return value;
}
/** @jitmax */ function externalTyped(items: Box[]) {
  let value = 0; ([{value} = data] = items); return value;
}
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

/** The default controls require no invalid TypeScript or type assertions. */
test('array default fixtures have zero strict TypeScript diagnostics', () => {
  assert.deepEqual(ts.getPreEmitDiagnostics(p).map((d) =>
    ts.flattenDiagnosticMessageText(d.messageText, ' ')), []);
});

/** A supplied object makes the fallback unreachable. */
test('array assignment default reads the supplied getter', () => {
  assert.ok(rules('suppliedGetter').includes('delete-property'));
});

/** A supplied data object never reads the deleting default getter. */
test('array assignment leaves an unused getter default clean', () => {
  assert.deepEqual(rules('unusedGetterDefault'), []);
});

/** A missing array element selects its deleting fallback getter. */
test('empty array assignment reads the default getter', () => {
  assert.ok(rules('emptyDefault').includes('delete-property'));
});

/** An explicitly undefined element also selects the fallback. */
test('undefined array element reads the default getter', () => {
  assert.ok(rules('undefinedDefault').includes('delete-property'));
});

/** A used data fallback has no getter body to inspect. */
test('empty array assignment with a data fallback stays clean', () => {
  assert.deepEqual(rules('emptyDataDefault'), []);
});

/** The equivalent assignment without a default retains getter coverage. */
test('array assignment without a default retains getter coverage', () => {
  assert.ok(rules('withoutDefault').includes('delete-property'));
});

/** The declaration spelling retains its supplied getter coverage. */
test('array declaration default retains getter coverage', () => {
  assert.ok(rules('declarationDefault').includes('delete-property'));
});

/** Visible array aliases still prove that the supplied data is present. */
test('known supplied array alias skips the getter fallback', () => {
  assert.deepEqual(rules('suppliedAlias'), []);
});

/** A known empty array alias selects the fallback despite its element type. */
test('known empty array alias reads the getter fallback', () => {
  assert.ok(rules('emptyAlias').includes('delete-property'));
});

/** A class allocation supplies its instance getter rather than a constructor type. */
test('known class instance supplies its getter through a default pattern', () => {
  assert.ok(rules('suppliedClass').includes('delete-property'));
});

/** An external array retains its readable typed getter when source proof is unavailable. */
test('external typed array retains its possible getter coverage', () => {
  assert.ok(rules('externalTyped').includes('delete-property'));
});

/** Untimed runtime establishes which object supplies each property read. */
test('runtime default effects agree with supplied and missing elements', () => {
  const run = new Function(ts.transpile(source, {target: ts.ScriptTarget.ES2022}) +
    '; return {row, suppliedGetter, unusedGetterDefault, emptyDefault, undefinedDefault, ' +
    'emptyDataDefault, withoutDefault, declarationDefault, suppliedAlias, emptyAlias, ' +
    'Box, suppliedClass, externalTyped};')();
  for (const name of ['suppliedGetter', 'emptyDefault', 'undefinedDefault',
    'withoutDefault', 'declarationDefault', 'emptyAlias', 'suppliedClass']) {
    run.row.key = 1;
    assert.equal(run[name](), 1, name);
    assert.equal(Object.hasOwn(run.row, 'key'), false, name);
  }
  for (const name of ['unusedGetterDefault', 'emptyDataDefault', 'suppliedAlias']) {
    run.row.key = 1;
    assert.equal(run[name](), 2, name);
    assert.equal(Object.hasOwn(run.row, 'key'), true, name);
  }
  run.row.key = 1;
  assert.equal(run.externalTyped([new run.Box(run.row)]), 1);
  assert.equal(Object.hasOwn(run.row, 'key'), false);
  run.row.key = 1;
  assert.equal(run.externalTyped([]), 2);
  assert.equal(Object.hasOwn(run.row, 'key'), true);
});
