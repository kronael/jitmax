/** Destructuring reads reach getters; rest copies only own enumerable properties. */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { load, program } from '../lib/ts.ts';
import { scan } from '../lib/scan.ts';
import { check } from '../lib/rules.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jitmax-accessor-'));
const file = path.join(dir, 'work.ts');
const source = `
class Box {
  row: { key?: number } = { key: 1 };
  get value() { delete this.row.key; return 1; }
  set value(value: number) {}
}
class Clean { get value() { return 1; } }
class Holder {
  row: {key?: number} = {key: 1};
  get box() { delete this.row.key; return new Clean(); }
}
/** @jitmax */ function assignment(box: Box) {
  let value = 0; ({value} = box); return value;
}
/** @jitmax */ function computed(box: Box) {
  const {['value']: value} = box; return value;
}
/** @jitmax */ function quoted(box: Box) {
  const {'value': value} = box; return value;
}
/** @jitmax */ function loop(boxes: Box[]) {
  let total = 0; for (const {value} of boxes) total += value; return total;
}
/** @jitmax */ function loopAssignment(boxes: Box[]) {
  let value = 0; for ({value} of boxes) {} return value;
}
/** @jitmax */ function nestedAssignment(box: Box) {
  let value = 0; ({box: {value}} = {box}); return value;
}
function extract({box: {value}}: {box: Box}) { return value; }
/** @jitmax */ function nestedParameter(box: Box) { return extract({box}); }
/** @jitmax */ function nestedOuter(holder: Holder) {
  const {box: {value}} = holder; return value;
}
/** @jitmax */ function clean(box: Clean) {
  let value = 0; ({value} = box); return value;
}
/** @jitmax */ function restCollision(box: Box) { const {...value} = box; return value; }
/** @jitmax */ function restRenamed(box: Box) { const {...copy} = box; return copy; }
/** @jitmax */ function restAssignment(box: Box) {
  let value = {}; ({...value} = box); return value;
}
const initialRow: {key?: number} = {key: 1};
const ownBox = {
  row: initialRow,
  get value() { delete this.row.key; return 1; }
};
/** @jitmax */ function ownRest(row: {key?: number}) {
  ownBox.row = row;
  const {...copy} = ownBox; return copy;
}
/** @jitmax */ function ownRestAssignment(row: {key?: number}) {
  ownBox.row = row;
  let copy = {}; ({...copy} = ownBox); return copy;
}
const twoGetters = {get left() { return 1; }, get right() { return 2; }};
/** @jitmax */ function twoOwnGetters() { const {...copy} = twoGetters; return copy; }
const spreadData: {value?: number} = {value: 1};
const spreadRow: {key?: number} = {key: 1};
const spreadOverrides = {get value() { delete spreadRow.key; return 2; }, ...spreadData};
/** @jitmax */ function overwrittenGetter() { const {...copy} = spreadOverrides; return copy; }
const otherData = {other: 2};
const spreadPreserves = {get value() { delete spreadRow.key; return 2; }, ...otherData};
/** @jitmax */ function preservedGetter() { const {...copy} = spreadPreserves; return copy; }
/** @jitmax */ function store(box: Box) { ({value: box.value} = {value: 1}); }
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

/** Every getter fixture is strict valid TypeScript rather than a parser-only case. */
test('destructuring accessor fixtures have no TypeScript diagnostics', () => {
  assert.deepEqual(ts.getPreEmitDiagnostics(p).map((d) =>
    ts.flattenDiagnosticMessageText(d.messageText, ' ')), []);
});

/** Assignment destructuring executes and checks the source getter. */
test('assignment destructuring reaches the deleting getter', () => {
  assert.ok(rules('assignment').includes('delete-property'));
});

/** A computed string literal selects the known getter. */
test('computed literal binding reaches the deleting getter', () => {
  assert.ok(rules('computed').includes('delete-property'));
});

/** A quoted key retains the same getter as its identifier spelling. */
test('quoted binding reaches the deleting getter', () => {
  assert.ok(rules('quoted').includes('delete-property'));
});

/** Each for-of element supplies the declaration pattern's getter. */
test('for-of binding reaches the deleting getter', () => {
  assert.ok(rules('loop').includes('delete-property'));
});

/** A for-of assignment pattern also reads each element's getter. */
test('for-of assignment reaches the deleting getter', () => {
  assert.ok(rules('loopAssignment').includes('delete-property'));
});

/** Nested assignment patterns obtain the inner getter from the source property. */
test('nested assignment reaches the deleting getter', () => {
  assert.ok(rules('nestedAssignment').includes('delete-property'));
});

/** Nested parameter bindings retain their existing getter coverage. */
test('nested parameter binding reaches the deleting getter', () => {
  assert.ok(rules('nestedParameter').includes('delete-property'));
});

/** A nested binding reads its outer accessor before the inner property. */
test('nested binding reaches the deleting outer getter', () => {
  assert.ok(rules('nestedOuter').includes('delete-property'));
});

/** A getter without a deleting operation remains clean. */
test('clean assignment getter stays clean', () => {
  assert.deepEqual(rules('clean'), []);
});

/** The destructuring destination calls only the setter on a plain store. */
test('destructuring store does not report its deleting getter', () => {
  assert.deepEqual(rules('store'), []);
});

/** The rest destination name does not select the prototype getter. */
test('rest destination matching a prototype getter stays clean', () => {
  assert.deepEqual(rules('restCollision'), []);
});

/** Renaming the rest destination leaves the same copied properties. */
test('renamed rest destination stays clean', () => {
  assert.deepEqual(rules('restRenamed'), []);
});

/** An assignment rest pattern also excludes prototype accessors. */
test('assignment rest stays clean for a class prototype getter', () => {
  assert.deepEqual(rules('restAssignment'), []);
});

/** Declaration rest reads a literal's own enumerable getter. */
test('declaration rest reaches the copied own getter', () => {
  assert.ok(rules('ownRest').includes('delete-property'));
});

/** Assignment rest reads the same own enumerable getter. */
test('assignment rest reaches the copied own getter', () => {
  assert.ok(rules('ownRestAssignment').includes('delete-property'));
});

/** Rest calls both definite getters rather than choosing alternative targets. */
test('rest copies two clean own getters without dispatch uncertainty', () => {
  assert.deepEqual(rules('twoOwnGetters'), []);
});

/** A later spread's own data property replaces the earlier literal accessor. */
test('rest does not reach a getter overwritten by a known spread', () => {
  assert.deepEqual(rules('overwrittenGetter'), []);
});

/** A spread without the getter's key leaves that accessor intact. */
test('rest reaches a getter preserved beside a known spread', () => {
  assert.ok(rules('preservedGetter').includes('delete-property'));
});

/** Untimed execution distinguishes actual reads, setter stores and prototype-free rest. */
test('runtime getter effects agree with the destructuring controls', () => {
  const run = new Function(ts.transpile(source, {target: ts.ScriptTarget.ES2022}) +
    '; return { Box, Holder, assignment, computed, quoted, loop, loopAssignment, ' +
    'nestedAssignment, nestedParameter, restCollision, restRenamed, restAssignment, ' +
    'ownRest, ownRestAssignment, store, nestedOuter, twoOwnGetters, overwrittenGetter, ' +
    'preservedGetter, spreadRow };')();
  for (const name of ['assignment', 'computed', 'quoted', 'loop', 'loopAssignment',
    'nestedAssignment', 'nestedParameter']) {
    const box = new run.Box();
    run[name](name.startsWith('loop') ? [box] : box);
    assert.equal(Object.hasOwn(box.row, 'key'), false, name);
  }
  const holder = new run.Holder();
  run.nestedOuter(holder);
  assert.equal(Object.hasOwn(holder.row, 'key'), false);
  for (const name of ['restCollision', 'restRenamed', 'restAssignment', 'store']) {
    const box = new run.Box();
    run[name](box);
    assert.equal(Object.hasOwn(box.row, 'key'), true, name);
  }
  for (const name of ['ownRest', 'ownRestAssignment']) {
    const row = {key: 1};
    assert.deepEqual(run[name](row), {row, value: 1});
    assert.equal(Object.hasOwn(row, 'key'), false, name);
  }
  assert.deepEqual(run.twoOwnGetters(), {left: 1, right: 2});
  assert.deepEqual(run.overwrittenGetter(), {value: 1});
  assert.equal(Object.hasOwn(run.spreadRow, 'key'), true);
  assert.deepEqual(run.preservedGetter(), {value: 2, other: 2});
  assert.equal(Object.hasOwn(run.spreadRow, 'key'), false);
});
