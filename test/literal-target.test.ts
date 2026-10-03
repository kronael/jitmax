/** Equal property sets count as one shape and retain every readable implementation. */
import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {load, program} from '../lib/ts.ts';
import {scan} from '../lib/scan.ts';
import {check} from '../lib/rules.ts';
import {createFlow, emptyRes, merge, originOf, makeWalk} from '../lib/flow.ts';

const root = path.join(import.meta.dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jitmax-literal-'));
const file = path.join(dir, 'hot.ts');
const source = `
type Row = {key?: number};
const row: Row = {key: 1};
const dirty = {run() {delete row.key; return 1;}};
const clean = {run() {return 0;}};
const otherClean = {run() {return 2;}};
const different = {extra: 1, run() {delete row.key; return 1;}};
/** @jitmax */ function forward(flag: boolean) {const obj = flag ? dirty : clean; return obj.run();}
/** @jitmax */ function reverse(flag: boolean) {const obj = flag ? clean : dirty; return obj.run();}
/** @jitmax */ function distinct(flag: boolean) {const obj = flag ? different : clean; return obj.run();}
/** @jitmax */ function twoClean(flag: boolean) {const obj = flag ? clean : otherClean; return obj.run();}
/** @jitmax */ function singleton() {return clean.run();}
function shared() {return 0;}
const sharedA = {run: shared};
const sharedB = {run: shared};
/** @jitmax */ function duplicated(flag: boolean) {const obj = flag ? sharedA : sharedB; return obj.run();}
const dirtyField = {run: () => {delete row.key; return 1;}};
const cleanField = {run: () => 0};
/** @jitmax */ function fields(flag: boolean) {const obj = flag ? dirtyField : cleanField; return obj.run();}
const nestedDirty = {inner: dirty};
const nestedClean = {inner: clean};
/** @jitmax */ function nested(flag: boolean) {const obj = flag ? nestedDirty : nestedClean; return obj.inner.run();}
/** @jitmax */ function extracted(flag: boolean) {const {run} = flag ? dirty : clean; return run();}
const mutated = {run() {return 0;}};
mutated.run = () => {delete row.key; return 0;};
/** @jitmax */ function writes(flag: boolean) {const obj = flag ? mutated : clean; return obj.run();}
const dirtyAccessor = {get value() {delete row.key; return 1;}, set value(value: number) {delete row.key;}};
const cleanAccessor = {get value() {return 0;}, set value(value: number) {}};
/** @jitmax */ function getter(flag: boolean) {const obj = flag ? dirtyAccessor : cleanAccessor; return obj.value;}
/** @jitmax */ function setter(flag: boolean) {const obj = flag ? dirtyAccessor : cleanAccessor; obj.value = 1;}
const setterOnly = {get value() {return 0;}, set value(value: number) {delete row.key;}};
/** @jitmax */ function readDoesNotSet(flag: boolean) {const obj = flag ? setterOnly : cleanAccessor; return obj.value;}
class Clean {constructor() {}}
class Dirty {constructor() {delete row.key;}}
const dirtyCtor = {Ctor: Dirty};
const cleanCtor = {Ctor: Clean};
/** @jitmax */ function construct(flag: boolean) {const obj = flag ? dirtyCtor : cleanCtor; return new obj.Ctor();}
const dirtyGet = {get value() {delete row.key; return 1;}};
const cleanGet = {get value() {return 0;}};
/** @jitmax */ function rest(flag: boolean) {const obj = flag ? dirtyGet : cleanGet; const {...copy} = obj; return copy;}
/** @jitmax */ function restReverse(flag: boolean) {const obj = flag ? cleanGet : dirtyGet; const {...copy} = obj; return copy;}
/** @jitmax */ function cleanRest() {const {...copy} = {get a() {return 0;}, get b() {return 1;}}; return copy;}
`;
fs.writeFileSync(file, source);
const ts = load(root);
const p = program(ts, root, [file]);
const result = scan(ts, p);
const flow = createFlow(ts, p, result.checker);
const sf = p.getSourceFile(file)!;
function mark(name: string) {return result.marks.find(entry => entry.name === name) ?? assert.fail(name);}
function findings(name: string) {return check(ts, result.checker, mark(name));}
function rules(name: string) {return findings(name).map(finding => finding.rule).sort();}
function invocation(name: string) {
  let found: import('typescript').CallExpression | undefined;
  const visit = (node: import('typescript').Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) found = node;
    ts.forEachChild(node, visit);
  };
  visit(mark(name).node);
  return found ?? assert.fail(name);
}
after(() => {fs.unlinkSync(file); fs.rmdirSync(dir);});

test('same-shape method targets are checked in either conditional order', () => {
  for (const name of ['forward', 'reverse']) {
    assert.ok(rules(name).includes('delete-property'), name);
    const traced = flow.receiver(invocation(name));
    assert.equal(traced.origins.length, 1);
    assert.equal(traced.bodies.length, 2);
    assert.equal(traced.origins[0]?.follow, undefined);
    const call = mark(name).escapes.find(call => call.text === 'obj.run');
    assert.equal(call?.dispatch.count, 1);
    assert.equal(call?.dispatch.located, 2);
    assert.equal(call?.dispatch.checked, 2);
  }
});

test('distinct shapes retain their distinct receiver count', () => {
  assert.ok(rules('distinct').includes('delete-property'));
  const traced = flow.receiver(invocation('distinct'));
  assert.equal(traced.origins.length, 2);
  assert.equal(traced.bodies.length, 2);
});

test('literal function fields and nested or extracted members retain all targets', () => {
  for (const name of ['fields', 'nested', 'extracted', 'writes']) {
    assert.ok(rules(name).includes('delete-property'), name);
  }
});

test('same-shape accessor reads and writes check the matching bodies', () => {
  assert.ok(rules('getter').includes('delete-property'));
  assert.ok(rules('setter').includes('delete-property'));
  assert.ok(mark('getter').reached.every(body => !ts.isSetAccessorDeclaration(body.node)));
  assert.ok(mark('setter').reached.every(body => !ts.isGetAccessorDeclaration(body.node)));
  assert.ok(!rules('readDoesNotSet').includes('delete-property'));
});

test('constructor values held by same-shape literals retain both classes', () => {
  assert.ok(rules('construct').includes('delete-property'));
  const constructors = mark('construct').reached.filter(body => ts.isConstructorDeclaration(body.node));
  assert.equal(constructors.length, 2);
});

test('rest copies read every candidate literal getter', () => {
  for (const name of ['rest', 'restReverse']) assert.ok(rules(name).includes('delete-property'), name);
  assert.deepEqual(rules('cleanRest'), []);
});

test('literal grouping retains singleton silence and honest multiple-target coverage', () => {
  assert.deepEqual(rules('singleton'), []);
  assert.deepEqual(rules('duplicated'), []);
  assert.deepEqual(rules('twoClean'), ['interface-dispatch']);
  const traced = flow.receiver(invocation('twoClean'));
  assert.equal(traced.origins.length, 1);
  assert.equal(traced.bodies.length, 2);
});

test('merging literal provenance leaves cached singleton origins unchanged', () => {
  const id = sf.statements.flatMap(statement => ts.isVariableStatement(statement)
    ? statement.declarationList.declarations : []).find(decl => decl.name.getText(sf) === 'dirty')!.name;
  const before = flow.sources(id);
  const node = [...before.origins.values()][0]!.node;
  flow.receiver(invocation('forward'));
  const after = flow.sources(id);
  assert.equal([...after.origins.values()][0]!.node, node);
  assert.equal(after.origins.size, 1);
  assert.equal([...after.origins.values()][0]!.literalNodes, undefined);
});

test('literal provenance limits report uncertainty without inflating shape counts', () => {
  const text = Array.from({length: 65}, (_, index) => `const v${index} = {run() {return ${index};}};`).join('\n');
  const bounded = ts.createSourceFile('bounded.ts', text, ts.ScriptTarget.Latest, true);
  const w = makeWalk(ts, p, result.checker);
  const combined = emptyRes();
  for (const statement of bounded.statements) {
    assert.ok(ts.isVariableStatement(statement));
    const node = statement.declarationList.declarations[0]!.initializer!;
    merge(combined, originOf(w, {kind: 'literal', node, name: 'literal'}));
  }
  assert.equal(combined.origins.size, 1);
  assert.equal([...combined.origins.values()][0]!.literalNodes?.length, 64);
  assert.ok([...combined.unknown].some(reason => reason.includes('literal')));
});

test('same-shape runtime controls execute each selected deleting implementation', () => {
  const names = ['forward', 'reverse', 'distinct', 'fields', 'nested', 'extracted', 'writes', 'getter', 'setter', 'construct', 'rest', 'restReverse'];
  const run = new Function(ts.transpile(source) + '; return {row,' + names.join(',') + ',singleton,duplicated,twoClean};')();
  for (const name of names) {
    run.row.key = 1;
    run[name](name !== 'reverse' && name !== 'restReverse');
    assert.equal(Object.hasOwn(run.row, 'key'), false, name);
  }
  for (const name of ['singleton', 'duplicated', 'twoClean']) {
    run.row.key = 1;
    run[name](true);
    assert.equal(Object.hasOwn(run.row, 'key'), true, name);
  }
});

test('literal target fixtures satisfy the strict TypeScript contract', () => {
  assert.deepEqual(ts.getPreEmitDiagnostics(p).map(diagnostic => diagnostic.code), []);
});
