import { test } from 'node:test';
import assert from 'node:assert/strict';
import type * as TS from 'typescript';
import { load } from '../lib/ts.ts';
import { createFlow } from '../lib/flow.ts';
import { scan } from '../lib/scan.ts';
import { check } from '../lib/rules.ts';

const ts = load(import.meta.dirname);
const file = '/jitmax-provenance.ts';
const source = `
class Handler { run() { return 1; } }
function build() { return { value: 1 }; }
const handler = new Handler();
const record = build();
const records = [record, handler, { extra: 2 }];
const sameShape = Math.random() ? { value: 1 } : { value: 2 };
const sameArrays = Math.random() ? [{ first: 1 }] : [{ second: 2 }];
function external(value: object) { return value; }
function cycle() { return Math.random() ? cycle() : { leaf: 1 }; }
const recursive = cycle();
const unknown = JSON.parse('{}');
handler.run();
type Row = { value: number; a: number } | { value: number; b: number } |
  { value: number; c: number } | { value: number; d: number } | { value: number; e: number };
function makeRows(): Row[] {
  return [{ value: 1, a: 1 }, { value: 2, b: 2 }, { value: 3, c: 3 },
    { value: 4, d: 4 }, { value: 5, e: 5 }];
}
/** @jitmax */
function readRows(rows: Row[]): number {
  let sum = 0;
  for (const row of rows) sum += row.value;
  return sum;
}
readRows(makeRows());
const partial = Math.random() ? handler : JSON.parse('{}');
partial.run();
const deep0 = { end: 1 };
${Array.from({ length: 55 }, (_, i) => `const deep${i + 1} = deep${i};`).join('\n')}
`;
const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
const host = ts.createCompilerHost({});
const getSourceFile = host.getSourceFile.bind(host);
host.getSourceFile = (name, ...args) => name === file ? sf : getSourceFile(name, ...args);
const program = ts.createProgram([file], {}, host);

function find<T extends TS.Node>(is: (node: TS.Node) => node is T, text: string): T {
  let found: T | undefined;
  function visit(node: TS.Node): void {
    if (is(node) && node.getText(sf) === text) found = node;
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return found ?? assert.fail(`missing node: ${text}`);
}

/** Traces visible builders through factories and collections.
 * The fixture contains a class instance and two literal shapes.
 * Each reported source points to the actual declaration or literal.
 */
test('source queries retain builder nodes through factory and collection flow', () => {
  const flow = createFlow(ts, program, program.getTypeChecker());
  const records = flow.sources(find(ts.isIdentifier, 'records'), true);
  assert.deepEqual([...records.origins.values()].map((origin) => origin.kind), [
    'literal', 'class', 'literal',
  ]);
  assert.deepEqual([...records.origins.values()].map((origin) => origin.node.getText(sf)), [
    '{ value: 1 }', 'class Handler { run() { return 1; } }', '{ extra: 2 }',
  ]);
  assert.equal(records.unknown.size, 0);
  assert.equal(records.tainted, false);
  assert.equal(records.starved, false);
  assert.equal(flow.sources(find(ts.isIdentifier, 'record')).origins.size, 1);
});

/** Exposes the counted receiver source without changing its target.
 * The call uses a visible class with a concrete method body.
 * Metadata queries leave the cached receiver answer unchanged.
 */
test('receiver origins expose their source node and retain the followed body', () => {
  const flow = createFlow(ts, program, program.getTypeChecker());
  const call = find(ts.isCallExpression, 'handler.run()');
  const traced = flow.receiver(call);
  assert.equal(traced.origins.length, 1);
  assert.equal(traced.origins[0]?.node, find(ts.isClassDeclaration,
    'class Handler { run() { return 1; } }'));
  assert.equal(traced.origins[0]?.follow?.getText(sf), 'run() { return 1; }');
  flow.sources(find(ts.isIdentifier, 'handler'));
  assert.equal(flow.receiver(call), traced);
  const partialCall = find(ts.isCallExpression, 'partial.run()');
  const partial = flow.receiver(partialCall);
  assert.equal(partial.origins.length, 1);
  assert.match(partial.unknown.join(' '), /JSON/);
  flow.sources(find(ts.isIdentifier, 'partial'));
  assert.equal(flow.receiver(partialCall), partial);
});

/** Keeps the walk's unknown, cycle and budget limits visible.
 * Inputs include an external parameter, JSON, recursion and a deep alias chain.
 * Provenance never converts a partial result into a complete claim.
 */
test('source queries preserve unknown, cyclic and exhausted results', () => {
  const flow = createFlow(ts, program, program.getTypeChecker());
  const external = flow.sources(find(ts.isParameter, 'value: object').name);
  assert.match([...external.unknown].join(' '), /no visible caller of external/);
  const parsed = flow.sources(find(ts.isIdentifier, 'unknown'), true);
  assert.match([...parsed.unknown].join(' '), /JSON/);
  const recursive = flow.sources(find(ts.isIdentifier, 'recursive'));
  assert.equal(recursive.tainted, true);
  assert.equal(recursive.origins.size, 1);
  const deep = flow.sources(find(ts.isIdentifier, 'deep55'));
  assert.equal(deep.starved, true);
  assert.match([...deep.unknown].join(' '), /budget/);
});

/** Retains the flow walk's representative origin identities.
 * Same-key literals and array literals share their existing origin keys.
 * The query does not claim to enumerate every allocation or collection member.
 */
test('source queries preserve coalesced literal and array representatives', () => {
  const flow = createFlow(ts, program, program.getTypeChecker());
  const literals = flow.sources(find(ts.isIdentifier, 'sameShape'));
  assert.equal(literals.origins.size, 1);
  const arrays = flow.sources(find(ts.isIdentifier, 'sameArrays'));
  assert.equal(arrays.origins.size, 1);
  const elements = flow.sources(find(ts.isIdentifier, 'sameArrays'), true);
  assert.equal(elements.origins.size, 1);
  assert.equal([...elements.origins.values()][0]?.node.getText(sf), '{ second: 2 }');
});

/** Checks that an annotated reader points through its caller to the actual factory literals. */
test('a megamorphic read links its factory builders through the normal scan', () => {
  const result = scan(ts, program);
  const mark = result.marks.find((mark) => mark.name === 'readRows');
  assert.ok(mark);
  const findings = check(ts, result.checker, mark);
  assert.equal(findings.length, 1);
  const finding = findings[0]!;
  assert.equal(finding.rule, 'megamorphic-elements');
  assert.equal(finding.related?.length, 6);
  for (const builder of finding.related!.slice(1)) {
    const pos = sf.getPositionOfLineAndCharacter(builder.line - 1, builder.column - 1);
    assert.equal(builder.file, file);
    assert.match(sf.text.slice(pos), /^\{ value: [1-5], [a-e]: [1-5] \}/);
  }
  assert.match(finding.relatedNote ?? '', /Representative sources/);
  assert.doesNotMatch(finding.relatedNote ?? '', /partial|No builder/);
});
