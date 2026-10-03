/** Visible callees and implicit calls expose their bodies to the checker. */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { load, program } from '../lib/ts.ts';
import { scan } from '../lib/scan.ts';
import { check } from '../lib/rules.ts';

const root = path.join(import.meta.dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jitmax-walk-'));
const file = path.join(dir, 'work.ts');
const source = `
type Row = { key?: number };
class Base { run(row: Row) { return row.key; } }
class Child extends Base { run(row: Row) { delete row.key; return 0; } }
function invoke(base: Base, row: Row) { return base.run(row); }
/** @jitmax */ function overridden(row: Row) { return invoke(new Child(), row); }
/** @jitmax */ function nativeMath() { return Math.abs(-1); }
const Maths = { abs(row: Row) { delete row.key; return 0; } };
/** @jitmax */ function shadowMath(row: Row) {
  const Math = Maths;
  return Math.abs(row);
}
const typedRow: Row = {};
const typedMath: Pick<Math, 'abs'> = { abs(value) { delete typedRow.key; return value; } };
/** @jitmax */ function typedShadowMath() {
  const Math = typedMath;
  return Math.abs(1);
}
/** @jitmax */ function callback(xs: number[], cb: (n: number) => boolean) {
  return xs.filter(cb);
}
function hold(cb: (n: number) => boolean) { return cb; }
/** @jitmax */ function heldCallback(cb: (n: number) => boolean) { return hold(cb); }
/** @jitmax */ function arrayThisArg(xs: number[], context: () => boolean) {
  return xs.filter((n) => n > 0, context);
}
const custom = { filter(cb: (n: number) => boolean) { return cb; } };
/** @jitmax */ function customFilter(cb: (n: number) => boolean) { return custom.filter(cb); }
function remove(row: Row) { delete row.key; return 0; }
/** @jitmax */ function mutable(row: Row) {
  let fn = (row: Row) => 0;
  fn = remove;
  return fn(row);
}
/** @jitmax */ function immutable(row: Row) {
  const fn = (row: Row) => 0;
  return fn(row);
}
class AccessBase {
  row: Row = {};
  get value() { return 0; }
  set value(value: Row | number) {}
}
class AccessChild extends AccessBase {
  get value() { delete this.row.key; return 0; }
  set value(value: Row | number) {
    if (typeof value !== 'number') delete value.key;
  }
}
/** @jitmax */ function overriddenGetter(base: AccessBase) { return base.value; }
/** @jitmax */ function overriddenSetter(base: AccessBase, row: Row) { base.value = row; }
/** @jitmax */ function directGetter(child: AccessChild) { return child.value; }
/** @jitmax */ function directSetter(child: AccessChild, row: Row) { child.value = row; }
/** @jitmax */ function unknownAccessor(base: AccessBase) { return base.value; }
/** @jitmax */ function plainAccessors() {
  const base = new AccessBase();
  base.value = {};
  return base.value;
}
overriddenGetter(new AccessChild());
overriddenSetter(new AccessChild(), {});
/** @jitmax */ function literalCallback(rows: number[], fn: (n: number) => number) {
  return rows['map'](fn);
}
/** @jitmax */ function dotCallback(rows: number[], fn: (n: number) => number) {
  return rows.map(fn);
}
class Access {
  row: Row = {};
  get value() { delete this.row.key; return 0; }
  set value(value: number) { delete this.row.key; }
}
class ReadOnly {
  row: Row = {};
  get value() { delete this.row.key; return 0; }
  set value(value: number) {}
}
class WriteOnly {
  row: Row = {};
  get value() { return 0; }
  set value(value: number) { delete this.row.key; }
}
/** @jitmax */ function getter() { return new Access()['value']; }
/** @jitmax */ function setter() { const access = new Access(); access.value = 1; }
/** @jitmax */ function getterDoesNotSet() { return new WriteOnly().value; }
/** @jitmax */ function setterDoesNotGet() { const access = new ReadOnly(); access.value = 1; }
/** @jitmax */ function compound() { const access = new Access(); access['value'] += 1; }
function tag(strings: TemplateStringsArray) {
  const row: Row = {};
  delete row.key;
  return strings[0];
}
/** @jitmax */ function tagged() { return tag\`hello\`; }
/** @jitmax */ function unknownTag(tag: (strings: TemplateStringsArray) => string) {
  return tag\`hello\`;
}
class Callable {
  get action() { return remove; }
}
/** @jitmax */ function getterCall(row: Row) { return new Callable().action(row); }
declare class Unread { get value(): number; }
declare const unread: Unread;
/** @jitmax */ function unreadGetter() { return unread.value; }
/** @jitmax */ function unknownMutable(row: Row, next: (row: Row) => number) {
  let fn = (row: Row) => 0;
  fn = next;
  return fn(row);
}
`;
fs.writeFileSync(file, source);
const ts = load(root);
const result = scan(ts, program(ts, dir, [file]));
function mark(name: string) {
  return result.marks.find((entry) => entry.name === name) ?? assert.fail(name);
}
function rules(name: string) {
  return check(ts, result.checker, mark(name)).map((finding) => finding.rule);
}
after(() => { fs.unlinkSync(file); fs.rmdirSync(dir); });

/** A base-typed receiver constructed as Child checks Child.run. */
test('walk follows a visible subclass override', () => {
  assert.ok(rules('overridden').includes('delete-property'));
  assert.ok(mark('overridden').reached.some((body) =>
    body.node.parent?.getText().startsWith('class Child')));
});

/** A local Math object checks its method and native Math stays lowered. */
test('walk distinguishes shadowed Math from the native builtin', () => {
  assert.ok(rules('shadowMath').includes('delete-property'));
  assert.equal(mark('shadowMath').lowered, 0);
  assert.ok(rules('typedShadowMath').includes('delete-property'));
  assert.equal(mark('typedShadowMath').lowered, 0);
  assert.deepEqual(rules('nativeMath'), []);
  assert.equal(mark('nativeMath').lowered, 1);
});

/** A native array method with an external callback reports the unread body. */
test('walk reports an unresolved callback passed to a native method', () => {
  assert.ok(rules('callback').includes('closed-world'));
  assert.ok(mark('callback').escapes.some((call) => call.text === 'cb'));
});

/** A reassigned function checks every visible target and const stays silent. */
test('walk checks assignments to a mutable function binding', () => {
  assert.ok(rules('mutable').includes('delete-property'));
  assert.deepEqual(rules('immutable'), []);
});

/** An element access read checks its getter. */
test('walk follows an element access getter', () => {
  assert.ok(rules('getter').includes('delete-property'));
});

/** A property assignment checks its setter without running its getter. */
test('walk follows the setter for a property assignment', () => {
  assert.ok(rules('setter').includes('delete-property'));
  assert.deepEqual(rules('setterDoesNotGet'), []);
});

/** A read checks its getter without running its setter. */
test('walk does not call a setter during a property read', () => {
  assert.deepEqual(rules('getterDoesNotSet'), []);
});

/** An element compound assignment checks both accessors. */
test('walk follows both accessors in a compound assignment', () => {
  const accessors = mark('compound').reached.filter((body) =>
    ts.isGetAccessorDeclaration(body.node) ||
    ts.isSetAccessorDeclaration(body.node));
  assert.equal(accessors.length, 2);
});

/** A tagged template checks the tag function body. */
test('walk follows a tagged template function', () => {
  assert.ok(rules('tagged').includes('delete-property'));
});

/** A tag parameter with no visible caller reports the missing body. */
test('walk reports an unresolved tag function', () => {
  assert.ok(rules('unknownTag').includes('closed-world'));
});

/** Calling a getter result checks both the getter and the returned function. */
test('walk follows the function returned by a getter', () => {
  assert.ok(rules('getterCall').includes('delete-property'));
});

/** An accessor declared without source reports the unread body. */
test('walk reports a declared getter without a body', () => {
  assert.ok(rules('unreadGetter').includes('closed-world'));
});

/** An unknown function assignment preserves the coverage finding. */
test('walk reports an unknown assignment to a mutable binding', () => {
  assert.ok(rules('unknownMutable').includes('interface-dispatch'));
  assert.ok(mark('unknownMutable').escapes.some((call) => call.dispatch.unknown.length > 0));
});

/** The original receiver and mutable call paths really execute deletion. */
test('override and reassignment invoke the deleting implementation at runtime', () => {
  const javascript = ts.transpile(source);
  const run = new Function(javascript + '; return { overridden, mutable, shadowMath };')();
  for (const name of ['overridden', 'mutable', 'shadowMath']) {
    const row = { key: 1 };
    run[name](row);
    assert.equal(Object.hasOwn(row, 'key'), false);
  }
});

/** A helper that returns a callback without invoking it stays silent. */
test('walk does not invoke an unknown callback passed to an ordinary helper', () => {
  assert.deepEqual(rules('heldCallback'), []);
  assert.deepEqual(rules('customFilter'), []);
});

/** Array.filter invokes the first argument and passes thisArg as context. */
test('walk does not invoke a callable array thisArg', () => {
  assert.deepEqual(rules('arrayThisArg'), []);
});

/** A base-typed read checks the visible subclass getter. */
test('walk follows a visible getter override', () => {
  assert.ok(rules('directGetter').includes('delete-property'));
  assert.ok(rules('overriddenGetter').includes('delete-property'));
  const accessor = mark('overriddenGetter').reached.find((body) =>
    ts.isGetAccessorDeclaration(body.node));
  assert.ok(accessor?.node.parent.getText().startsWith('class AccessChild'));
  assert.ok(mark('overriddenGetter').reached.every((body) =>
    !ts.isSetAccessorDeclaration(body.node)));
  assert.deepEqual(rules('plainAccessors'), []);
});

/** A base-typed write checks the visible subclass setter. */
test('walk follows a visible setter override', () => {
  assert.ok(rules('directSetter').includes('delete-property'));
  assert.ok(rules('overriddenSetter').includes('delete-property'));
  const accessor = mark('overriddenSetter').reached.find((body) =>
    ts.isSetAccessorDeclaration(body.node));
  assert.ok(accessor?.node.parent.getText().startsWith('class AccessChild'));
  assert.ok(mark('overriddenSetter').reached.every((body) =>
    !ts.isGetAccessorDeclaration(body.node)));
});

/** Dot and literal access to native map report the same unknown callback. */
test('walk reports a callback passed to a literal native method access', () => {
  assert.deepEqual(rules('dotCallback'), ['closed-world']);
  assert.deepEqual(rules('literalCallback'), rules('dotCallback'));
});

/** Base-typed getter and setter paths execute subclass deletion at runtime. */
test('getter and setter overrides execute at runtime', () => {
  const run = new Function(ts.transpile(source) +
    '; return { AccessChild, overriddenGetter, overriddenSetter };')();
  const accessor = new run.AccessChild();
  accessor.row = { key: 1 };
  run.overriddenGetter(accessor);
  assert.equal(Object.hasOwn(accessor.row, 'key'), false);
  const row = { key: 1 };
  run.overriddenSetter(accessor, row);
  assert.equal(Object.hasOwn(row, 'key'), false);
});

/** An overridable accessor on an unknown receiver preserves coverage uncertainty. */
test('walk reports an overridable accessor with no visible receiver', () => {
  assert.ok(rules('unknownAccessor').includes('closed-world'));
  assert.ok(mark('unknownAccessor').escapes.some((call) =>
    call.dispatch.unknown.length > 0));
});
