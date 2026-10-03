/** Constructor results preserve returned objects and actual receiver fields. */
import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {load, program} from '../lib/ts.ts';
import {scan} from '../lib/scan.ts';
import {check} from '../lib/rules.ts';
import {createFlow} from '../lib/flow.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jitmax-constructor-result-'));
const file = path.join(dir, 'work.ts');
const source = `
const row: {key?: number} = {key: 1};
const data = {value: 2};
function makeDirty() { return {get value() {delete row.key; return 1;}}; }
class ReturnedGetter {value = 2; constructor() {return makeDirty();}}
class ReturnedMethod {
  run() {return 2;}
  constructor() {return {run() {delete row.key; return 1;}};}
}
class ReturnedData {
  get value() {delete row.key; return 1;}
  constructor() {return data;}
}
class ReturnedSetter {
  set value(n: number) {delete row.key;}
  constructor() {return {value: 2};}
}
class ReturnedCleanMethod {
  run() {delete row.key; return 1;}
  constructor() {return {run() {return 2;}};}
}
class Primitive {constructor() {return 42;}}
class Bare {value = 2; constructor() {return;}}
class Prototype {get value() {delete row.key; return 1;}}
class Conditional {value = 2; constructor(flag: boolean) {if (flag) return makeDirty();}}
class Both {value = 2; constructor(flag: boolean) {if (flag) return makeDirty(); else return data;}}
class Inherited extends ReturnedGetter {}
class FieldOverride extends ReturnedGetter {value = 4;}
class FieldKeep extends ReturnedGetter {other = 4;}
class MethodField extends ReturnedMethod {run = () => 2;}
class DirtyMethodField extends ReturnedMethod {run = () => {delete row.key; return 1;};}
class FinalMethodField extends DirtyMethodField {run = () => 2;}
class WriteBase {run() {return 0;} constructor() {return {run() {return 0;}};}}
class WriteChild extends WriteBase {run = () => 0;}
class OtherWriteChild extends WriteBase {run = () => 0;}
class CappedFields extends ReturnedGetter {
  ${Array.from({length: 64}, (_, index) => `field${index} = ${index};`).join('\n  ')}
  value = 4;
}
declare function externalData(): {value: number};
class ExternalResult {value = 2; constructor() {return externalData();}}
class ExplicitOverride extends ReturnedGetter {
  value = 4;
  constructor() {super(); return makeDirty();}
}
class DefaultBase {value = 2;}
class DefaultChild extends DefaultBase {other = 3;}
function initialize() {delete row.key; return 2;}
class Initializer {value = initialize(); constructor() {return data;}}
class ConstructorBody {value = 2; constructor() {delete row.key; return data;}}
const selected = new ReturnedGetter();
const selectedMethod = new ReturnedMethod();
const selectedData = new ReturnedData();
const selectedCleanMethod = new ReturnedCleanMethod();
const selectedInherited = new Inherited();
const selectedOverride = new FieldOverride();
const selectedKeep = new FieldKeep();
const selectedExplicit = new ExplicitOverride();
const selectedMethodField = new MethodField();
const selectedDirtyMethodField = new DirtyMethodField();
const selectedFinalMethodField = new FinalMethodField();
const mutatedWrite = new WriteChild();
const otherWrite = new OtherWriteChild();
mutatedWrite.run = () => {delete row.key; return 1;};
const selectedCapped = new CappedFields();
const selectedExternal = new ExternalResult();
const choices64 = [${Array.from({length: 64}, (_, index) => `[${index === 0 ? 'selected' : 'data'}]`).join(',')}];
const choices65 = [${Array.from({length: 65}, (_, index) => `[${index === 0 ? 'selected' : 'data'}]`).join(',')}];
const selectedBoth = new Both(true);
const selectedDefault = new DefaultChild();
/** @jitmax */ function copyReturned() {return {...selected};}
/** @jitmax */ function readReturned() {return selected.value;}
/** @jitmax */ function callReturned() {return selectedMethod.run();}
/** @jitmax */ function returnedData() {return selectedData.value;}
/** @jitmax */ function returnedSetterData() {const result = new ReturnedSetter(); result.value = 3; return result;}
/** @jitmax */ function returnedMethodData() {return selectedCleanMethod.run();}
/** @jitmax */ function primitive() {return new Primitive();}
/** @jitmax */ function bare() {return {...new Bare()};}
/** @jitmax */ function prototypeCopy() {return {...new Prototype()};}
/** @jitmax */ function prototypeRead() {return new Prototype().value;}
/** @jitmax */ function conditional(flag: boolean) {return {...new Conditional(flag)};}
/** @jitmax */ function both(flag: boolean) {return {...new Both(flag)};}
/** @jitmax */ function inherited() {return {...selectedInherited};}
/** @jitmax */ function fieldOverride() {return {...selectedOverride};}
/** @jitmax */ function fieldKeep() {return {...selectedKeep};}
/** @jitmax */ function methodField() {return selectedMethodField.run();}
/** @jitmax */ function dirtyMethodField() {return selectedDirtyMethodField.run();}
/** @jitmax */ function finalMethodField() {return selectedFinalMethodField.run();}
/** @jitmax */ function changedField() {return mutatedWrite.run();}
/** @jitmax */ function otherField() {return otherWrite.run();}
/** @jitmax */ function explicitOverride() {return {...selectedExplicit};}
/** @jitmax */ function defaultChild() {return {...new DefaultChild()};}
/** @jitmax */ function cappedFields() {return {...selectedCapped};}
/** @jitmax */ function externalResult() {return {...selectedExternal};}
/** @jitmax */ function initializer() {return new Initializer();}
/** @jitmax */ function constructorBody() {return new ConstructorBody();}
/** @jitmax */ function array64(index: number) {return {...choices64[index]![0]!};}
/** @jitmax */ function array65(index: number) {return {...choices65[index]![0]!};}
`;
fs.writeFileSync(file, source);
const ts = load(path.join(import.meta.dirname, '..'));
const p = ts.createProgram([file], {strict: true, target: ts.ScriptTarget.ES2022,
  skipLibCheck: true, types: [], noEmit: true});
const result = scan(ts, program(ts, dir, [file]));
after(() => {fs.unlinkSync(file); fs.rmdirSync(dir);});
function rules(name: string) {
  const mark = result.marks.find((mark) => mark.name === name);
  assert.ok(mark, name);
  return check(ts, result.checker, mark).map((finding) => finding.rule);
}
function dirty(name: string) {assert.ok(rules(name).includes('delete-property'), name);}
function clean(name: string) {assert.deepEqual(rules(name), [], name);}

test('constructor result fixtures have zero strict diagnostics', () => {
  assert.deepEqual(ts.getPreEmitDiagnostics(p).map((d) =>
    ts.flattenDiagnosticMessageText(d.messageText, ' ')), []);
});
test('constructor returned own getter runs during spread', () => dirty('copyReturned'));
test('constructor returned own getter runs during read', () => dirty('readReturned'));
test('constructor returned method body is followed', () => dirty('callReturned'));
test('constructor returned data excludes a discarded prototype getter', () => clean('returnedData'));
test('constructor returned data excludes a discarded prototype setter', () => clean('returnedSetterData'));
test('constructor returned method excludes a discarded prototype method', () => clean('returnedMethodData'));
test('primitive constructor return retains the actual instance', () => clean('primitive'));
test('bare constructor return retains fields', () => clean('bare'));
test('actual prototype getter stays silent under spread', () => clean('prototypeCopy'));
test('actual prototype getter still runs under read', () => dirty('prototypeRead'));
test('conditional constructor object return keeps the getter', () => dirty('conditional'));
test('constructor returning objects in both branches keeps the getter', () => dirty('both'));
test('inherited constructor object return keeps the getter', () => dirty('inherited'));
test('derived field overwrites a returned getter descriptor', () => clean('fieldOverride'));
test('derived other field preserves a returned getter descriptor', () => dirty('fieldKeep'));
test('derived function field replaces a constructor returned method', () => clean('methodField'));
test('derived function field body remains reachable', () => dirty('dirtyMethodField'));
test('later derived function field replaces an earlier field value', () => clean('finalMethodField'));
test('real assignment to an overlaid field preserves its callable body', () => dirty('changedField'));
test('overlaid field remains clean before the real assignment', () => {
  const pristine = path.join(dir, 'pristine.ts');
  fs.writeFileSync(pristine, source.replace('mutatedWrite.run = () => {delete row.key; return 1;};', ''));
  try {
    const before = scan(ts, program(ts, dir, [pristine]));
    const mark = before.marks.find((mark) => mark.name === 'changedField')!;
    assert.deepEqual(check(ts, before.checker, mark), []);
  } finally {fs.unlinkSync(pristine);}
});
test('assignment to another declared instance field stays separate', () => clean('otherField'));
test('explicit derived object return replaces the initialized receiver', () => dirty('explicitOverride'));
test('ordinary inherited instance keeps its fields', () => clean('defaultChild'));
test('constructor field metadata clips with coverage rather than an overwritten getter', () => {
  assert.deepEqual(rules('cappedFields'), ['interface-dispatch']);
  const flow = createFlow(ts, p, p.getTypeChecker());
  const declaration = p.getSourceFile(file)!.statements.filter(ts.isVariableStatement)
    .flatMap((statement) => statement.declarationList.declarations)
    .find((node) => node.name.getText() === 'selectedCapped')!;
  const sources = flow.sources(declaration.initializer!);
  assert.equal(sources.accessorIncomplete, true);
  assert.ok([...sources.origins.values()].every((origin) =>
    (origin.fieldWrites?.length ?? 0) <= 64 && (origin.fieldMask?.length ?? 0) <= 64));
});
test('unreadable constructor object return preserves accessor coverage uncertainty', () => {
  assert.deepEqual(rules('externalResult'), ['interface-dispatch']);
});
test('discarded receiver still executes field initializers', () => dirty('initializer'));
test('object return still executes the constructor body', () => dirty('constructorBody'));
test('64 array sites retain a constructor returned getter', () => dirty('array64'));
test('65 array sites report a clipped constructor returned getter', () => {
  assert.deepEqual(rules('array65'), ['interface-dispatch']);
});

test('definite constructor object return has no fabricated class origin', () => {
  const flow = createFlow(ts, p, p.getTypeChecker());
  const sf = p.getSourceFile(file)!;
  for (const name of ['selected', 'selectedBoth']) {
    const declaration = sf.statements.filter(ts.isVariableStatement)
      .flatMap((statement) => statement.declarationList.declarations)
      .find((node) => node.name.getText() === name)!;
    const res = flow.sources(declaration.initializer!);
    assert.ok(res.origins.size > 0);
    assert.ok([...res.origins.values()].every((origin) => origin.kind === 'literal'), name);
    assert.deepEqual([...res.unknown], [], name);
  }
});

test('constructor result runtime agrees with positive and silent controls', () => {
  const run = new Function('function externalData() {return {get value() {delete row.key; return 1;}};}\n' +
    ts.transpile(source, {target: ts.ScriptTarget.ES2022}) +
    ';return {row, Primitive, selected, selectedDefault, copyReturned, readReturned, callReturned, ' +
    'returnedData, returnedSetterData, returnedMethodData, primitive, bare, prototypeCopy, prototypeRead, conditional, ' +
    'both, inherited, fieldOverride, fieldKeep, methodField, dirtyMethodField, finalMethodField, changedField, otherField, ' +
    'explicitOverride, defaultChild, cappedFields, externalResult, ' +
    'initializer, constructorBody, array64, array65};')();
  for (const name of ['copyReturned', 'readReturned', 'callReturned', 'prototypeRead',
    'inherited', 'fieldKeep', 'dirtyMethodField', 'changedField', 'explicitOverride', 'initializer', 'constructorBody',
    'array64', 'array65', 'externalResult']) {
    run.row.key = 1;
    run[name](0);
    assert.equal(Object.hasOwn(run.row, 'key'), false, name);
  }
  for (const name of ['returnedData', 'returnedSetterData', 'returnedMethodData', 'primitive', 'bare',
    'prototypeCopy', 'fieldOverride', 'methodField', 'finalMethodField', 'otherField', 'defaultChild', 'cappedFields']) {
    run.row.key = 1;
    run[name]();
    assert.equal(Object.hasOwn(run.row, 'key'), true, name);
  }
  for (const name of ['conditional', 'both']) {
    for (const flag of [true, false]) {
      run.row.key = 1;
      assert.deepEqual(run[name](flag), {value: flag ? 1 : 2}, name);
      assert.equal(Object.hasOwn(run.row, 'key'), !flag, name);
    }
  }
  assert.ok(run.primitive() instanceof run.Primitive);
  assert.deepEqual(run.fieldOverride(), {value: 4});
  assert.deepEqual(run.defaultChild(), {value: 2, other: 3});
  assert.equal(Object.getOwnPropertyDescriptor(run.selected, 'value')?.get instanceof Function, true);
});
