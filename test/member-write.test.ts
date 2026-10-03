/** Mutable member calls retain both known bodies and unknown replacements. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { load, program } from '../lib/ts.ts';
import { scan } from '../lib/scan.ts';
import { check } from '../lib/rules.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jitmax-member-write-'));
const file = path.join(dir, 'work.ts');
const source = `
type Row = { key?: number };
function remove(row: Row) { delete row.key; return 0; }
const method = { run(row: Row) { return 0; } };
/** @jitmax */ function unknownMethod(row: Row, next: (row: Row) => number) {
  method.run = next;
  return method.run(row);
}
class Worker { run(row: Row) { return 0; } }
const worker = new Worker();
/** @jitmax */ function unknownClassMethod(row: Row, next: (row: Row) => number) {
  worker.run = next;
  return worker.run(row);
}
const property = { run: (row: Row) => 0 };
/** @jitmax */ function unknownProperty(row: Row, next: (row: Row) => number) {
  property.run = next;
  return property.run(row);
}
class Field { run = (row: Row) => 0; }
const field = new Field();
/** @jitmax */ function unknownField(row: Row, next: (row: Row) => number) {
  field.run = next;
  return field.run(row);
}
const dirty = { run(row: Row) { delete row.key; return 0; } };
/** @jitmax */ function unknownDirtyMethod(row: Row, next: (row: Row) => number) {
  dirty.run = next;
  return dirty.run(row);
}
const replaced = new Worker();
replaced.run = remove;
/** @jitmax */ function knownMethod(row: Row) { return replaced.run(row); }
const stable = { run(row: Row) { return 0; } };
/** @jitmax */ function stableMethod(row: Row) { return stable.run(row); }
class StableWorker { run(row: Row) { return 0; } }
const stableWorker = new StableWorker();
/** @jitmax */ function stableClassMethod(row: Row) { return stableWorker.run(row); }
const stablePropertyValue = { run: (row: Row) => 0 };
/** @jitmax */ function stableProperty(row: Row) { return stablePropertyValue.run(row); }
const bracket = { run(row: Row) { return 0; } };
/** @jitmax */ function bracketMethod(row: Row) {
  bracket['run'] = remove;
  return bracket.run(row);
}
const unknownBracket = { run(row: Row) { return 0; } };
/** @jitmax */ function unknownBracketMethod(row: Row, next: (row: Row) => number) {
  unknownBracket['run'] = next;
  return unknownBracket['run'](row);
}
const stableBracket = { run(row: Row) { return 0; } };
/** @jitmax */ function stableBracketMethod(row: Row) { return stableBracket['run'](row); }
class CleanConstructor { constructor(row: Row) {} }
class DirtyConstructor { constructor(row: Row) { delete row.key; } }
const constructors = { C: CleanConstructor };
constructors.C = DirtyConstructor;
/** @jitmax */ function propertyConstructor(row: Row) { return new constructors.C(row); }
const cleanConstructors = { C: CleanConstructor };
/** @jitmax */ function cleanPropertyConstructor(row: Row) { return new cleanConstructors.C(row); }
/** @jitmax */ function directDirtyConstructor(row: Row) { return new DirtyConstructor(row); }
/** @jitmax */ function directCleanConstructor(row: Row) { return new CleanConstructor(row); }
class StableValue {
  clone(): StableValue { return new StableValue(); }
  static copy(value: StableValue): StableValue { return value.clone(); }
}
/** @jitmax */ function stableTypedInput(seed: StableValue) {
  const box = { value: seed };
  box.value = StableValue.copy(box.value);
  return box.value;
}
`;
fs.writeFileSync(file, source);
const ts = load(process.cwd());
const parsed = program(ts, dir, [file]);
const result = scan(ts, parsed);
function mark(name: string) {
  return result.marks.find(entry => entry.name === name) ?? assert.fail(name);
}
function rules(name: string) {
  return check(ts, result.checker, mark(name)).map(finding => finding.rule);
}
after(() => { fs.unlinkSync(file); fs.rmdirSync(dir); });

/** Type-correct member replacements provide valid source for the regressions. */
test('mutable member fixture has no TypeScript diagnostics', () => {
  assert.deepEqual(ts.getPreEmitDiagnostics(parsed), []);
  const strict = ts.createProgram([file], {
    ...parsed.getCompilerOptions(), strict: true,
  });
  assert.deepEqual(ts.getPreEmitDiagnostics(strict), []);
});

/** An unknown assigned callback preserves coverage for each member form. */
test('unknown member replacements retain their escape findings', () => {
  for (const name of ['unknownMethod', 'unknownClassMethod',
    'unknownProperty', 'unknownField']) {
    assert.ok(rules(name).includes('interface-dispatch'), name);
    assert.ok(mark(name).escapes.some(call => call.dispatch.unknown.length > 0),
      name);
  }
});

/** Uncertainty about a replacement keeps the original readable body checked. */
test('unknown replacement retains findings from the located original method', () => {
  assert.ok(rules('unknownDirtyMethod').includes('interface-dispatch'));
  assert.ok(rules('unknownDirtyMethod').includes('delete-property'));
});

/** Known replacement bodies stay checked and unrelated stable members stay clean. */
test('known method writes and stable member controls keep their behavior', () => {
  assert.ok(rules('knownMethod').includes('delete-property'));
  for (const name of ['stableMethod', 'stableClassMethod', 'stableProperty'])
    assert.deepEqual(rules(name), [], name);
});

/** Each unknown replacement invokes the externally supplied deleting callback. */
test('mutable member replacement calls execute the callback at runtime', () => {
  const run = new Function(ts.transpile(source) +
    '; return { unknownMethod, unknownClassMethod, unknownProperty, unknownField };')();
  for (const name of ['unknownMethod', 'unknownClassMethod',
    'unknownProperty', 'unknownField']) {
    const row: { key?: number } = { key: 1 };
    run[name](row, (value: { key?: number }) => { delete value.key; return 0; });
    assert.equal(Object.hasOwn(row, 'key'), false, name);
  }
});

/** Literal-key assignments preserve known and unknown targets like dot writes. */
test('literal-key method assignments participate in member flow', () => {
  assert.ok(rules('bracketMethod').includes('delete-property'));
  assert.ok(rules('unknownBracketMethod').includes('interface-dispatch'));
  assert.ok(mark('unknownBracketMethod').escapes.some(call =>
    call.dispatch.unknown.length > 0));
  assert.deepEqual(rules('stableBracketMethod'), []);
});

/** Constructor properties expose each known constructor and keep clean ones quiet. */
test('constructor-valued properties expose their readable constructors', () => {
  assert.ok(rules('propertyConstructor').includes('delete-property'));
  assert.ok(rules('directDirtyConstructor').includes('delete-property'));
  assert.deepEqual(rules('cleanPropertyConstructor'), []);
  assert.deepEqual(rules('directCleanConstructor'), []);
});

/** Literal writes and property constructions execute the deleting body at runtime. */
test('literal writes and constructor properties match their runtime controls', () => {
  const run = new Function(ts.transpile(source) +
    '; return { bracketMethod, unknownBracketMethod, propertyConstructor, ' +
    'cleanPropertyConstructor, directDirtyConstructor, directCleanConstructor };')();
  for (const name of ['bracketMethod', 'unknownBracketMethod',
    'propertyConstructor', 'directDirtyConstructor']) {
    const row: { key?: number } = { key: 1 };
    run[name](row, (value: { key?: number }) => { delete value.key; return 0; });
    assert.equal(Object.hasOwn(row, 'key'), false, name);
  }
  for (const name of ['cleanPropertyConstructor', 'directCleanConstructor']) {
    const row = { key: 1 };
    run[name](row);
    assert.equal(Object.hasOwn(row, 'key'), true, name);
  }
});

/** Unknown input receivers do not imply writes to their stable concrete method. */
test('stable concrete methods stay quiet with external and constructed receivers', () => {
  assert.deepEqual(rules('stableTypedInput'), []);
  const selected = mark('stableTypedInput');
  assert.ok(selected.flow);
  const copy = selected.reached.find(body =>
    ts.isMethodDeclaration(body.node) && body.node.name.getText() === 'copy')?.node;
  assert.ok(copy && ts.isMethodDeclaration(copy));
  const returned = copy.body!.statements[0];
  assert.ok(ts.isReturnStatement(returned) && returned.expression &&
    ts.isCallExpression(returned.expression));
  const traced = selected.flow.receiver({
    expression: returned.expression.expression,
  });
  assert.ok(traced.unknown.length > 0);
  assert.equal(traced.origins.length, 1);
  assert.ok(traced.origins[0].follow);
  assert.equal(traced.bodies.length, 1);
  const run = new Function(ts.transpile(source) +
    '; return { StableValue, stableTypedInput };')();
  const seed = new run.StableValue();
  assert.ok(run.stableTypedInput(seed) instanceof run.StableValue);
  assert.notEqual(run.stableTypedInput(seed), seed);
});
