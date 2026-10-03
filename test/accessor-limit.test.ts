/** Capped literal provenance reports unknown accessor work and preserves proven silence. */
import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {load, program} from '../lib/ts.ts';
import {scan} from '../lib/scan.ts';
import {check} from '../lib/rules.ts';
import {makeWalk, originOf} from '../lib/flow.ts';

const root = path.join(import.meta.dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jitmax-accessor-limit-'));
const file = path.join(dir, 'hot.ts');
const plain = (count: number) => Array.from({length: count}, () => '{value: 0}').join(',');
const getters = Array.from({length: 65}, (_, index) => `get key${index}() {getterReads++; return ${index};}`).join(',');
const source = `
let getterReads = 0;
const many = {${getters}};
/** @jitmax */ function allGetters() {return {...many};}
const row: {key?: number} = {key: 1};
const dirty = {get value() {delete row.key; return 1;}};
const setter = {set value(value: number) {delete row.key;}};
const lost = [dirty, ${plain(64)}];
const retained = [${plain(64)}, dirty];
const full = [dirty, ${plain(63)}];
const data = [${plain(65)}];
const setters = [setter, ${plain(64)}];
/** @jitmax */ function rest65(index: number) {const {...copy} = lost[index]!; return copy;}
/** @jitmax */ function spread65(index: number) {return {...lost[index]!};}
/** @jitmax */ function named65(index: number) {return lost[index]!.value;}
/** @jitmax */ function store65(index: number) {setters[index]!.value = 1;}
/** @jitmax */ function rest64(index: number) {const {...copy} = full[index]!; return copy;}
/** @jitmax */ function reverse65(index: number) {const {...copy} = retained[index]!; return copy;}
/** @jitmax */ function plain65(index: number) {const {...copy} = data[index]!; return copy;}
/** @jitmax */ function plainSpread65(index: number) {return {...data[index]!};}
/** @jitmax */ function readSetter65(index: number) {return setters[index]!.value;}
/** @jitmax */ function excluded65(index: number) {const {value, ...copy} = lost[index]!; return {value, copy};}
/** @jitmax */ function unrelated65(index: number) {return lost[index]!.valueOf;}
const source: {value?: number} = data[0]!;
const wrapped = {get value() {delete row.key; return 2;}, ...source};
/** @jitmax */ function masked65() {const {...copy} = wrapped; return copy;}
class Box {get value() {delete row.key; return 1;}}
/** @jitmax */ function prototype() {const {...copy} = new Box(); return copy;}
/** @jitmax */ function singleton() {return {...{value: 0}};}
`;
fs.writeFileSync(file, source);
const ts = load(root);
const p = program(ts, root, [file]);
const result = scan(ts, p);

function mark(name: string) {return result.marks.find(entry => entry.name === name) ?? assert.fail(name);}
function rules(name: string) {return check(ts, result.checker, mark(name)).map(finding => finding.rule).sort();}
function uncovered(name: string) {
  assert.deepEqual(rules(name), ['interface-dispatch'], name);
  assert.equal(mark(name).truncated, false);
  const call = mark(name).escapes[0]!;
  assert.equal(call.dispatch.count, 1);
  assert.equal(call.dispatch.located, 0);
  assert.equal(call.dispatch.checked, 0);
  assert.ok(call.dispatch.unknown.some(reason => reason.includes('64 literal')));
  assert.ok(call.viaInterface);
  assert.ok(mark(name).reached.every(body => !ts.isGetAccessorDeclaration(body.node) && !ts.isSetAccessorDeclaration(body.node)));
}
after(() => {fs.unlinkSync(file); fs.rmdirSync(dir);});

test('rest reports the capped getter with zero bodies checked', () => {uncovered('rest65');});
test('ordinary spread reports the capped getter with zero bodies checked', () => {uncovered('spread65');});
test('named getter and setter operations report matching capped targets', () => {
  uncovered('named65');
  uncovered('store65');
  assert.deepEqual(rules('readSetter65'), []);
});
test('the 64-site and retained-getter controls still check actual bodies', () => {
  assert.deepEqual(rules('rest64'), ['delete-property']);
  assert.ok(rules('reverse65').includes('delete-property'));
  assert.equal(mark('reverse65').escapes[0]?.dispatch.checked, 1);
});
test('capped data-only sources preserve silent copies and prototype exclusions', () => {
  for (const name of ['plain65', 'plainSpread65', 'prototype', 'singleton', 'unrelated65']) {
    assert.deepEqual(rules(name), [], name);
  }
});
test('rest exclusions do not duplicate the named getter coverage error', () => {
  assert.deepEqual(rules('excluded65'), ['interface-dispatch']);
  assert.equal(mark('excluded65').escapes.length, 1);
  assert.ok(!mark('excluded65').escapes[0]!.text.includes('copied'));
});
test('capped known data still masks an outer own getter', () => {assert.deepEqual(rules('masked65'), []);});
test('a single literal with 65 getter keys checks every body without coverage uncertainty', () => {
  assert.deepEqual(rules('allGetters'), []);
  assert.equal(mark('allGetters').escapes.length, 0);
  assert.equal(mark('allGetters').reached.filter(body => ts.isGetAccessorDeclaration(body.node)).length, 65);
  const run = new Function(ts.transpile(source, {target: ts.ScriptTarget.ES2022}) + ';const value = allGetters(); return {value, getterReads};')();
  assert.equal(run.getterReads, 65);
  assert.equal(Object.keys(run.value).length, 65);
  for (let index = 0; index < 65; index++) assert.equal(run.value['key' + index], index);
});
test('bounded accessor summaries alone do not imply missing callable bodies', () => {
  const text = 'const value = {' + Array.from({length: 65}, (_, index) => `get key${index}() {return 0;}`).join(',') + '};';
  const sf = ts.createSourceFile('keys.ts', text, ts.ScriptTarget.Latest, true);
  const statement = sf.statements[0]!;
  assert.ok(ts.isVariableStatement(statement));
  const node = statement.declarationList.declarations[0]!.initializer!;
  const value = originOf(makeWalk(ts, p, result.checker), {kind: 'literal', node, name: 'keys'});
  const origin = [...value.origins.values()][0]!;
  assert.ok(origin.literalAccessors!.get.length <= 64);
  assert.ok(origin.literalAccessors!.get.includes(undefined));
  assert.equal(value.unknown.size, 0);
  assert.equal(origin.literalCapped, undefined);
});
test('boundary source is strict-valid and executes real getter and setter work', () => {
  assert.deepEqual(ts.getPreEmitDiagnostics(p).map(diagnostic => diagnostic.code), []);
  const names = ['rest65', 'spread65', 'named65', 'store65', 'rest64', 'reverse65', 'excluded65', 'masked65', 'plain65', 'prototype'];
  const run = new Function(ts.transpile(source, {target: ts.ScriptTarget.ES2022}) + ';return {row,' + names.join(',') + '};')();
  for (const name of ['rest65', 'spread65', 'named65', 'store65', 'rest64', 'reverse65', 'excluded65']) {
    run.row.key = 1;
    run[name](name === 'reverse65' ? 64 : 0);
    assert.equal(Object.hasOwn(run.row, 'key'), false, name);
  }
  for (const name of ['masked65', 'plain65', 'prototype']) {
    run.row.key = 1;
    run[name](0);
    assert.equal(Object.hasOwn(run.row, 'key'), true, name);
  }
});
