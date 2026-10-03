/** Merged array shapes retain each element source without inventing getter reads. */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { load, program } from '../lib/ts.ts';
import { scan } from '../lib/scan.ts';
import { check } from '../lib/rules.ts';
import { createFlow } from '../lib/flow.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jitmax-array-provenance-'));
const file = path.join(dir, 'work.ts');
function alternatives(count: number, supplied: (index: number) => string) {
  function tree(start: number, end: number): string {
    if (end - start === 1) return `[${supplied(start)}]`;
    const middle = Math.floor((start + end) / 2);
    return `(flag < ${middle} ? ${tree(start, middle)} : ${tree(middle, end)})`;
  }
  return tree(0, count);
}
const widenedCases = [
  {name: 'objectClip', type: 'object', value: 'dirty', count: 65, at: 0, coverage: true},
  {name: 'emptyClip', type: '{}', value: 'dirty', count: 65, at: 0, coverage: true},
  {name: 'objectSourceClip', type: 'object', value: 'objectDirty', count: 65, at: 0, coverage: true},
  {name: 'emptySourceClip', type: '{}', value: 'emptyDirty', count: 65, at: 0, coverage: true},
  {name: 'mappedClip', type: "{[K in 'value']: number}", value: 'mappedDirty', count: 65, at: 0, coverage: true},
  {name: 'indexedClip', type: 'Record<string, number>', value: 'indexedDirty', count: 65, at: 0, coverage: true},
  {name: 'object64', type: 'object', value: 'dirty', count: 64, at: 0, coverage: false},
  {name: 'objectReverse', type: 'object', value: 'dirty', count: 65, at: 64, coverage: true},
  {name: 'objectPlain', type: 'object', value: 'data', count: 65, at: 0, coverage: false},
  {name: 'emptyPlain', type: '{}', value: 'data', count: 65, at: 0, coverage: false},
  {name: 'objectPrototype', type: 'object', value: 'prototype', count: 65, at: 0, coverage: false},
];
const source = `
const row: {key?: number} = {key: 1};
const dirty = {get value() { delete row.key; return 1; }};
const data = {value: 2};
const typedDirty: {value: number} = {get value() { delete row.key; return 1; }};
const objectDirty: object = dirty;
const emptyDirty: {} = dirty;
const mappedDirty: {[K in 'value']: number} = dirty;
const indexedDirty: Record<string, number> = dirty;
/** @jitmax */ function conditionalDefault(flag: boolean) {
  const items = flag ? [dirty] : [data];
  let value = 0; ([{value} = data] = items); return value;
}
/** @jitmax */ function reverseDefault(flag: boolean) {
  const items = flag ? [data] : [dirty];
  let value = 0; ([{value} = data] = items); return value;
}
/** @jitmax */ function conditionalRead(flag: boolean) {
  const items = flag ? [dirty] : [data];
  let value = 0; ([{value}] = items); return value;
}
/** @jitmax */ function reverseRead(flag: boolean) {
  const items = flag ? [data] : [dirty];
  let value = 0; ([{value}] = items); return value;
}
/** @jitmax */ function conditionalEmpty(flag: boolean) {
  const items = flag ? [] : [data];
  let value = 0; ([{value} = dirty] = items); return value;
}
/** @jitmax */ function conditionalUndefined(flag: boolean) {
  const items = flag ? [undefined] : [data];
  let value = 0; ([{value} = dirty] = items); return value;
}
/** @jitmax */ function plain(flag: boolean) {
  const items = flag ? [data] : [{value: 3}];
  let value = 0; ([{value}] = items); return value;
}
/** @jitmax */ function unusedDefault(flag: boolean) {
  const items = flag ? [data] : [{value: 3}];
  let value = 0; ([{value} = dirty] = items); return value;
}
/** @jitmax */ function omittedGetter(flag: boolean) {
  const items = flag ? [dirty, data] : [data, data];
  let value = 0; ([, {value} = dirty] = items); return value;
}
class Prototype { get value() { delete row.key; return 1; } }
const prototype = new Prototype();
/** @jitmax */ function arrays64(flag: number) {
  const items = ${alternatives(64, (index) => index === 0 ? 'dirty' : 'data')};
  return {...items[0]};
}
/** @jitmax */ function clipped65(flag: number) {
  const items = ${alternatives(65, (index) => index === 0 ? 'dirty' : 'data')};
  return {...items[0]};
}
/** @jitmax */ function retained65(flag: number) {
  const items = ${alternatives(65, (index) => index === 64 ? 'dirty' : 'data')};
  return {...items[0]};
}
/** @jitmax */ function typedClipped65(flag: number) {
  const items = ${alternatives(65, (index) => index === 0 ? 'typedDirty' : 'data')};
  return {...items[0]};
}
/** @jitmax */ function plain65(flag: number) {
  const items = ${alternatives(65, () => 'data')};
  return {...items[0]};
}
/** @jitmax */ function prototype65(flag: number) {
  const items = ${alternatives(65, () => 'prototype')};
  return {...items[0]};
}
${widenedCases.map(({name, type, value, count, at}) => `
const ${name}Choices = [${Array.from({length: count}, (_, index) =>
  `[${index === at ? value : 'data'}]`).join(',')}];
/** @jitmax */ function ${name}(index: number) {
  const items: (${type})[] = ${name}Choices[index]!;
  return {...items[0]!};
}`).join('\n')}
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

/** Each conditional source and fallback control is strict valid TypeScript. */
test('conditional array provenance fixtures have zero diagnostics', () => {
  assert.deepEqual(ts.getPreEmitDiagnostics(p).map((d) =>
    ts.flattenDiagnosticMessageText(d.messageText, ' ')), []);
});

/** A supplied getter survives the merge when the data array comes last. */
test('conditional array default retains its first branch getter', () => {
  assert.ok(rules('conditionalDefault').includes('delete-property'));
});

/** Swapping conditional branches leaves the same possible getter body. */
test('reversed conditional array default retains its getter', () => {
  assert.ok(rules('reverseDefault').includes('delete-property'));
});

/** Assignment without a default also reads either retained array element. */
test('conditional array without a default retains its first branch getter', () => {
  assert.ok(rules('conditionalRead').includes('delete-property'));
});

/** Branch order does not alter the no-default read. */
test('reversed conditional array without a default retains its getter', () => {
  assert.ok(rules('reverseRead').includes('delete-property'));
});

/** A retained empty branch runs the fallback getter. */
test('conditional empty array retains the used default getter', () => {
  assert.ok(rules('conditionalEmpty').includes('delete-property'));
});

/** A retained undefined element also runs the fallback getter. */
test('conditional undefined element retains the used default getter', () => {
  assert.ok(rules('conditionalUndefined').includes('delete-property'));
});

/** Both branches supply data properties rather than accessors. */
test('conditional plain data arrays stay clean', () => {
  assert.deepEqual(rules('plain'), []);
});

/** Both defined elements make the deleting fallback unreachable. */
test('conditional supplied data arrays skip the unused getter default', () => {
  assert.deepEqual(rules('unusedDefault'), []);
});

/** The selected second slot excludes a getter present only in the first slot. */
test('conditional arrays preserve omitted-slot getter silence', () => {
  assert.deepEqual(rules('omittedGetter'), []);
});

/** Array allocations share one counted shape while retaining their separate sources. */
test('conditional arrays retain allocation sites within one counted origin', () => {
  const flow = createFlow(ts, p, p.getTypeChecker());
  const sf = p.getSourceFile(file)!;
  const fn = sf.statements.find((node) => ts.isFunctionDeclaration(node) &&
    node.name?.text === 'conditionalDefault');
  assert.ok(fn && ts.isFunctionDeclaration(fn) && fn.body);
  const statement = fn.body.statements[0];
  assert.ok(ts.isVariableStatement(statement));
  const value = statement.declarationList.declarations[0].initializer!;
  const source = flow.sources(value);
  assert.equal(source.origins.size, 1);
  assert.deepEqual([...source.unknown], []);
  const elements = flow.sources(value, true);
  const literal = [...elements.origins.values()][0];
  assert.ok(literal);
  assert.equal(literal.literalNodes?.length, 2);
});

/** All 64 array sites remain readable before clipping begins. */
test('64 array sites retain the first own getter body', () => {
  assert.ok(rules('arrays64').includes('delete-property'));
  assert.ok(!rules('arrays64').includes('interface-dispatch'));
});

/** Clipping the first getter source reports coverage instead of a clean copy. */
test('65 array sites report a clipped own getter source', () => {
  const mark = result.marks.find((mark) => mark.name === 'clipped65')!;
  assert.deepEqual(rules('clipped65'), ['interface-dispatch']);
  const call = mark.escapes[0];
  assert.ok(call?.dispatch);
  assert.equal(call.dispatch.count, 1);
  assert.equal(call.dispatch.checked, 0);
  assert.ok(call.dispatch.unknown.some((reason) => reason.includes('array allocation sites')));
});

/** A retained getter is checked even when other array sources are clipped. */
test('65 array sites check the retained getter and report incomplete sources', () => {
  assert.ok(rules('retained65').includes('delete-property'));
  assert.ok(rules('retained65').includes('interface-dispatch'));
});

/** Contextual structural types cannot prove a clipped property is plain data. */
test('65 array sites report a clipped structurally typed getter', () => {
  assert.ok(rules('typedClipped65').includes('interface-dispatch'));
});

/** Bounded array provenance cannot invent accessors on plain data copies. */
test('65 plain array sources stay silent for object spread', () => {
  assert.deepEqual(rules('plain65'), []);
});

/** A clipped array does not make class prototype accessors own enumerable keys. */
test('65 prototype array sources stay silent for object spread', () => {
  assert.deepEqual(rules('prototype65'), []);
});

/** Allocation-site retention stays bounded while the array shape count stays one. */
test('array provenance retains at most 64 sites and marks clipping', () => {
  const flow = createFlow(ts, p, p.getTypeChecker());
  const sf = p.getSourceFile(file)!;
  for (const name of ['arrays64', 'clipped65']) {
    const fn = sf.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.ok(fn && ts.isFunctionDeclaration(fn) && fn.body);
    const statement = fn.body.statements[0];
    assert.ok(ts.isVariableStatement(statement));
    const value = statement.declarationList.declarations[0].initializer!;
    const source = flow.sources(value);
    assert.equal(source.origins.size, 1);
    const origin = [...source.origins.values()][0];
    assert.equal(origin.arrayNodes?.length, 64);
    assert.equal(!!origin.arrayCapped, name === 'clipped65');
    const elements = flow.sources(value, true);
    assert.equal(!!elements.arrayCapped, name === 'clipped65');
  }
});

/** Source provenance controls coverage despite widened, mapped or indexed types. */
for (const {name, coverage, value, count} of widenedCases) {
  test(`array source evidence survives ${name}`, () => {
    const found = rules(name);
    const deletes = !['data', 'prototype'].includes(value);
    assert.equal(found.includes('interface-dispatch'), coverage, name);
    assert.equal(found.includes('delete-property'), deletes &&
      (count === 64 || name === 'objectReverse'), name);
    if (!deletes) assert.deepEqual(found, [], name);
  });
}

/** Untimed runtime establishes both branches' actual reads and fallback choices. */
test('conditional array runtime agrees with getter and silent controls', () => {
  const run = new Function(ts.transpile(source, {target: ts.ScriptTarget.ES2022}) +
    '; return {row, conditionalDefault, reverseDefault, conditionalRead, reverseRead, ' +
    'conditionalEmpty, conditionalUndefined, plain, unusedDefault, omittedGetter, ' +
    'arrays64, clipped65, retained65, typedClipped65, plain65, prototype65, ' +
    widenedCases.map(({name}) => name).join(',') + '};')();
  for (const name of ['conditionalDefault', 'reverseDefault', 'conditionalRead',
    'reverseRead', 'conditionalEmpty', 'conditionalUndefined']) {
    for (const flag of [true, false]) {
      run.row.key = 1;
      const dirtyBranch = name.startsWith('reverse') ? !flag : flag;
      assert.equal(run[name](flag), dirtyBranch ? 1 : 2, name);
      assert.equal(Object.hasOwn(run.row, 'key'), !dirtyBranch, name);
    }
  }
  for (const name of ['plain', 'unusedDefault', 'omittedGetter']) {
    for (const flag of [true, false]) {
      run.row.key = 1;
      run[name](flag);
      assert.equal(Object.hasOwn(run.row, 'key'), true, name);
    }
  }
  for (const [name, flag] of [['arrays64', 0], ['clipped65', 0], ['retained65', 64],
    ['typedClipped65', 0]] as const) {
    run.row.key = 1;
    assert.deepEqual(run[name](flag), {value: 1});
    assert.equal(Object.hasOwn(run.row, 'key'), false, name);
  }
  for (const name of ['plain65', 'prototype65']) {
    run.row.key = 1;
    run[name](0);
    assert.equal(Object.hasOwn(run.row, 'key'), true, name);
  }
  for (const {name, value, at} of widenedCases) {
    run.row.key = 1;
    const copied = run[name](at);
    const deletes = !['data', 'prototype'].includes(value);
    assert.deepEqual(copied, value === 'prototype' ? {} : {value: deletes ? 1 : 2}, name);
    assert.equal(Object.hasOwn(run.row, 'key'), !deletes, name);
  }
});
