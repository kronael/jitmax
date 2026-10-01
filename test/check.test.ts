import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  CITATIONS,
  agreement,
  current,
  derive,
  deriveDetail,
  frozenReading,
  markdown,
  overGate,
  raisedGate,
  rows,
  type Row,
  unreplicable,
  withoutBlock,
} from '../lib/derive.ts';
// Rule 6's REJ predicate lives with the protocol it belongs to, and both
// bench/run.ts and this file read it from there.
import { replicate, spans1 } from '../bench/driver.ts';
// Rule 9's per-row half: what a row records about the machine, and the refusal
// that keeps a sweep-wide reading off a row (TC-24, TC-47).
import { environment, reading } from '../bench/env.ts';
// Resume's rule, in a module of its own so a test can ask it (BUGS TC-91).
import { done, key } from '../bench/resume.ts';
// The sweep table and the two lists that partition it. bench/run.ts is a
// script and runs a sweep on import; these live in sweeps.ts so they can be
// read without measuring anything (BUGS TC-99).
import { ALL as ALL_SWEEPS, BENCHMARKS, NOT_ALL, plan } from '../bench/sweeps.ts';
import { deriveBuiltins, loweredCases } from '../lib/derive-builtins.ts';
import { BUILTINS } from '../lib/builtins.ts';
import { N } from '../lib/numbers.ts';
import { load, program } from '../lib/ts.ts';
import { scan, type Mark } from '../lib/scan.ts';
import { check, DEFECT, EVIDENCE, resolveDisabled } from '../lib/rules.ts';
import { loadConfig } from '../lib/config.ts';
import { render } from '../lib/report.ts';
// The dataflow walkers, at module scope so a test can call one of them on a
// node of its own (lib/flow.ts).
import {
  compute,
  ctorArgFlow,
  declsOf,
  elementsOf,
  makeIndex,
  makeWalk,
  memberValueInner,
  paramFlow,
  readProperty,
  symbolFlow,
  type Query,
  type Res,
  type Walk,
} from '../lib/flow.ts';
import type * as TS from 'typescript';

const root = path.join(import.meta.dirname, '..');
const ts = load(root);

// The published prose, which is seven files since the split: each one answers a
// different question and any of them may quote a measured number. Every check
// below that used to read README.md alone reads this list, or the one file the
// claim now lives in — a register that named only README would stop seeing a
// number the day it moved out of it.
const DOCS = [
  'README.md',
  'ARCHITECTURE.md',
  path.join('docs', 'rules.md'),
  path.join('docs', 'limits.md'),
  path.join('bench', 'README.md'),
  path.join('test', 'README.md'),
  path.join('examples', 'README.md'),
];
const doc = (file: string): string => fs.readFileSync(path.join(root, file), 'utf8');
// The example pairs are published prose too. The header comment on each is what
// a reader gets when they `diff` a `.before.ts` against its `.after.ts`, and
// every one of them quotes what the fix was worth — which is the whole point of
// the pair. They are not doc files, so they are not in DOCS; they are read here
// because they are the surface where a ratio could go stale in silence, and
// four of them had (BUGS TC-38). Discovered rather than listed: a fifth example
// pair must not be able to arrive unchecked.
const examplePairs = (): string[] =>
  fs
    .readdirSync(path.join(root, 'examples'))
    .filter((f) => f.endsWith('.before.ts') || f.endsWith('.after.ts'))
    .sort()
    .map((f) => path.join('examples', f));
// Every published file end to end, with the generated block cut out of the one
// that carries it: the block would otherwise only ever be matching itself.
const docProse = (): string => withoutBlock([...DOCS, ...examplePairs()].map(doc).join('\n'));

function findingsByFunction(dir: string): Map<string, ReturnType<typeof check>> {
  const { checker, marks } = scan(ts, program(ts, root, [path.join(root, dir)]));
  return new Map(marks.map((m) => [m.name, check(ts, checker, m)]));
}

function rulesByFunction(dir: string): Map<string, string[]> {
  return new Map([...findingsByFunction(dir)].map(([name, fs]) => [name, fs.map((f) => f.rule)]));
}

const found = rulesByFunction('demo');
const rules = (name: string): string[] => found.get(name) ?? assert.fail(`no mark ${name}`);
// The dispatch fixtures are object TYPES with method signatures, so the walk
// cannot follow `x.area()` into a body and `interface-dispatch` reports it — which is
// correct and is what TC-45 asked for. These tests are about the dispatch rule,
// so they ask about the dispatch rule.
const shapeRules = (name: string): string[] =>
  rules(name).filter((r) => r !== 'closed-world' && r !== 'interface-dispatch');

// A second scan that keeps the marks themselves, for the config and
// annotation-override tests below: they need `mark.disabled` and the raw,
// unfiltered findings check() returns, not just the rule names.
const demoScan = scan(ts, program(ts, root, [path.join(root, 'demo')]));
const markByName = new Map(demoScan.marks.map((m) => [m.name, m]));
function markFor(name: string): Mark {
  return markByName.get(name) ?? assert.fail(`no mark ${name}`);
}
function rawFindings(name: string) {
  return check(ts, demoScan.checker, markFor(name));
}
// The report wraps every sentence at 78 columns, so a test that quotes one
// whole matches it with the continuation lines joined back up.
const unwrapped = (out: string): string => out.replace(/\n +/g, ' ');

test('a function is checked only where it is annotated', () => {
  assert.deepStrictEqual(
    [...found.keys()].sort(),
    [
      'addAll',
      'addField',
      'aliasedShapes',
      'allRows',
      'appendOnce',
      'areaOfFive',
      'areaOfFour',
      'byteAt',
      'cheapest',
      'clearToken',
      'collect',
      'collectByAssign',
      'collectByConcat',
      'collectByReduce',
      'collectInForEach',
      'collectObject',
      'drop',
      'dropElement',
      'dropQuiet',
      'dropThenSpread',
      'entriesMap',
      'evictSlot',
      'fiveShapes',
      'fiveShapesCast',
      'fiveShapesNoLoad',
      'fourShapes',
      'growByKey',
      'helper',
      'idOfFive',
      'joinByConcat',
      'joinByPlus',
      'keysMap',
      'lowest',
      'lowestNumber',
      'mergeInto',
      'mergeOnce',
      'mixed',
      'nearest',
      'oneStage',
      'optionalField',
      'runAll',
      'runParsed',
      'runTrio',
      'scrub',
      'sliceUnknown',
      'slotSize',
      'sortedStages',
      'splitJoin',
      'storeByDestructuring',
      'syncUniforms',
      'taggedShapes',
      'throughParam',
      'topTen',
      'total',
      'totalArea',
      'trimTail',
      'twoStages',
      'usesDependency',
      'usesHelper',
      'viaCallee',
      'viaCalleeQuiet',
      'viaConstructor',
      'viaOneImpl',
      'widen',
    ]
  );
});

// The next two are the measurements talking. A rule that fires here contradicts
// bench/shapes.jl, and the rule is wrong, not the code under test.
test('four shapes stay silent: no effect two sweeps could resolve', () => {
  assert.deepStrictEqual(rules('fourShapes'), []);
});

test('a plain number[] stays silent', () => {
  assert.ok(!rules('fourShapes').includes('boxed-elements'));
});

test('the fifth distinct property set fires: the cliff', () => {
  assert.deepStrictEqual(rules('fiveShapes'), ['megamorphic-elements']);
});

// TC-8, and the rule's own benchmark is what closes it: the kernel measured is
// `s += r.x + r.y`, so the cost needs a load off an ELEMENT. `rows.length`
// loads off the array, whose map does not change with the element type. The
// annotation cannot rescue this one — hot code that touches no property still
// touches no property.
test('a cast does not hide the read: the map is the object\'s, not the checker\'s', () => {
  assert.deepStrictEqual(rules('fiveShapesCast'), ['megamorphic-elements']);
});

// A destructuring assignment stores and never loads, and the access sits under
// an array or object literal rather than directly under the `=`. Matching only
// the direct parent counted it as a read and fired the rule on a body that
// loads nothing — TC-8 again, in the shape its first fix missed.
test('a destructuring store is not a read', () => {
  assert.deepStrictEqual(rules('storeByDestructuring'), []);
});

test('five property sets with no load off an element stay silent', () => {
  assert.deepStrictEqual(rules('fiveShapesNoLoad'), []);
});

// The two false-positive classes TC-42 named, both verified with
// `%HaveSameMap` before these tests were written: five aliases of one type
// share a map, and so do five discriminated-union variants over one key set.
// The rule counted union members and reported both. A test rather than a
// comment, because the fix is one line of counting and one line is easy to
// undo.
test('five aliases of one property set stay silent: a rename is not a shape', () => {
  assert.deepStrictEqual(rules('aliasedShapes'), []);
});

test('a discriminated union over one key set stays silent', () => {
  assert.deepStrictEqual(rules('taggedShapes'), []);
});

// The same V8 constant at a call site, found from the other end. Four shapes
// cost about what four cost at a load site, and the fifth costs an order of
// magnitude more, because it loses the inlining as well as the cached lookup.
// The figures live in EVIDENCE, where a re-measurement moves them.
test('four shapes at a call site stay silent', () => {
  assert.deepStrictEqual(shapeRules('areaOfFour'), []);
});

test('the fifth shape at a call site fires', () => {
  assert.deepStrictEqual(shapeRules('areaOfFive'), ['megamorphic-dispatch']);
});

// TC-8 is the flagship rule reporting a megamorphic load from a parameter's
// type without checking that anything is loaded. This rule requires the call,
// so five object types with nothing called on them is not a finding.
test('five object types with no method call stay silent', () => {
  assert.deepStrictEqual(shapeRules('idOfFive'), []);
});

// TC-45, and TC-31 with it: a call through an interface or an object type
// resolved to a declaration that was neither followable nor in a declaration
// file, so it fell through both branches of the escape test and vanished. A
// coverage report that silently omits a case is the lie this rule exists to
// prevent. `area()` is a method signature with no body anywhere in the program.
test('a call the walk cannot follow is reported, not silently dropped', () => {
  assert.ok(
    rules('areaOfFour').includes('interface-dispatch'),
    'a call through an object-type method signature vanished from the coverage report'
  );
});

/**
 * Three calls into code this program or the platform holds read as code
 * nobody can read. `this.rules.other.listItemRegex(bull)` reaches an arrow
 * function through a shorthand property; `super()` in `ArkError` runs a
 * `class {}` behind a cast; `super()` in `ReadonlyPath` runs `Array` behind
 * one. The first is followed, the second is an empty constructor, and the
 * third is the platform (BUGS TC-157).
 */
test('a shorthand property and a cast base resolve, and are not closed-world', () => {
  const dir = path.join(root, 'test', 'fixtures', 'inprogram');
  const { checker, marks } = scan(ts, program(ts, root, [dir]));
  const mark = (name: string): Mark =>
    marks.find((m) => m.name === name) ?? assert.fail(`no mark ${name}`);
  assert.deepStrictEqual(check(ts, checker, mark('list')).map((f) => f.rule), []);
  assert.strictEqual(mark('list').followed, 1);
  assert.deepStrictEqual(check(ts, checker, mark('raise')).map((f) => f.rule), []);
  assert.strictEqual(mark('raise').platform, 1);
});

/**
 * An annotated arrow function in a class field is named for its class and
 * field, and its `this` is the instance. It printed as `<anonymous>()`, and
 * `this.op.run(xs)` reported an unknown origin, "`this` outside any method",
 * where the one implementation is followed and its accumulating spread found
 * (BUGS TC-160).
 */
test('an arrow function in a class field is named and its this is the instance', () => {
  const byName = rulesByFunction(path.join('test', 'fixtures', 'arrowfield'));
  assert.deepStrictEqual([...byName.keys()], ['Union.apply']);
  assert.deepStrictEqual(byName.get('Union.apply'), ['accumulating-spread']);
});

// The other half of the same hole, and TC-31's own program: a call through a
// bare function-typed PARAMETER. Only the interface twin above had a fixture,
// so the half the entry is written about was asserted nowhere.
test('a call through a bare function parameter is reported, not dropped', () => {
  assert.deepStrictEqual(rules('throughParam'), ['closed-world']);
});

// One union reaching one site is one finding. megamorphic-elements has the
// array parameter, so the dispatch rule steps aside rather than billing it
// twice.
test('an array of a five-way union with method calls reports once', () => {
  assert.deepStrictEqual(shapeRules('totalArea'), ['megamorphic-elements']);
});

// TC-69, the owner's correction: count what REACHES the receiver by dataflow,
// not what could structurally fit the interface. The four verdicts below are
// the four the count can reach, each through the public path.

// One visible implementation and nothing unknown is not an escape at all. The
// accumulating-spread inside the implementation proves the body was walked;
// the absence of interface-dispatch proves the site was not reported.
test('an interface call with one visible implementation is followed, not reported', () => {
  assert.deepStrictEqual(rules('viaOneImpl'), ['accumulating-spread']);
});

/**
 * A function in a `#private` field resolves exactly as the same field spelled
 * without `#`, and both count every write to the field, not its initializer
 * alone. The private class reported interface-dispatch at all three calls
 * while the public one followed — and `pubBoth` followed into the stub the
 * constructor replaces and called that one implementation. The accumulating
 * spread is in the bodies that run, so a finding there proves the walk read
 * them (BUGS TC-159).
 */
test('a #private function field resolves as its public twin, writes included', () => {
  const byName = rulesByFunction(path.join('test', 'fixtures', 'private'));
  const of = (name: string): string[] => byName.get(name) ?? assert.fail(`no mark ${name}`);
  for (const held of ['Init', 'Both', 'Late']) {
    assert.deepStrictEqual(of(`priv${held}`), of(`pub${held}`), `${held}: #private and public differ`);
  }
  assert.deepStrictEqual(of('privInit'), ['accumulating-spread']);
  assert.deepStrictEqual(of('privLate'), ['accumulating-spread']);
  assert.deepStrictEqual(of('pubBoth'), ['interface-dispatch']);
});

// Five classes behind ONE non-union interface: the type-based dispatch rule
// sees nothing at the call, and the receiver's origins carry the count
// (TC-81 — zod's thirteen-way `_parse` rendered as the same sentence as a
// monomorphic site). "at least", because classes are counted by identity
// (TC-60) and the enumeration sees only this program.
test('five implementations reaching a receiver are a megamorphic-dispatch finding', () => {
  assert.deepStrictEqual(rules('runAll'), ['megamorphic-dispatch']);
  const f = rawFindings('runAll').find((x) => x.rule === 'megamorphic-dispatch');
  assert.match(f?.message ?? '', /at least 5 implementations/);
  assert.match(f?.message ?? '', /OpA, OpB, OpC, OpD, OpE/);
  assert.match(f?.note ?? '', /lower bound/);
});

/**
 * One call is one error. `x.area()` on five declared shapes is megamorphic-
 * dispatch's claim, and the same call has no body to bind, which
 * interface-dispatch printed as a second error at the same column — arktype's
 * union.ts:345:4 and pixi's render loop counted twice. The coverage half
 * prints as a note under the claim, and is not counted (BUGS TC-162).
 */
test('a call megamorphic-dispatch reports is one error, interface-dispatch a note', () => {
  const findings = rawFindings('areaOfFive');
  assert.deepStrictEqual(findings.map((f) => f.rule).sort(), ['interface-dispatch', 'megamorphic-dispatch']);
  const out = render(root, [{ mark: markFor('areaOfFive'), findings }]);
  assert.match(out, /1 annotated function, 1 error/);
  assert.doesNotMatch(out, /error {2}interface-dispatch/);
  assert.match(unwrapped(out), /note: interface-dispatch at this call: calls x\.area through an interface/);
});

// Inside V8's four-map budget: a note at most, never an error — and it names
// the implementations rather than saying "cannot tell which".
test('two to four implementations are a note, not the megamorphic claim', () => {
  assert.deepStrictEqual(rules('runTrio'), ['interface-dispatch']);
  const f = rawFindings('runTrio').find((x) => x.rule === 'interface-dispatch');
  assert.match(f?.message ?? '', /3 implementations reach this receiver/);
  assert.match(f?.message ?? '', /four-map budget/);
});

// A value from JSON.parse has no construction site to count. One such source
// makes any count a lower bound, and the tool says the origin is unknown
// rather than printing a number it cannot stand behind — the interface-dispatch
// statement, made about a value instead of a call (TC-82).
test('a receiver with no construction site to count says unknown origin, not a number', () => {
  assert.deepStrictEqual(rules('runParsed'), ['interface-dispatch']);
  const f = rawFindings('runParsed').find((x) => x.rule === 'interface-dispatch');
  assert.match(f?.message ?? '', /unknown origin/);
  assert.match(f?.message ?? '', /JSON\.parse/);
});

// The follow claims coverage, so the report states the assumption it rests on
// once per run, beside the count of what was followed.
test('a followed interface call is counted, with the closed-program assumption stated', () => {
  const run = spawnSync(
    process.execPath,
    [path.join(root, 'bin', 'jitmax.ts'), 'demo'],
    { cwd: root, encoding: 'utf8' }
  );
  // The COUNT is whatever demo/ holds — a fixture added for another rule can
  // add a followed call, and pinning the integer here made this test a second
  // register of demo/lib.ts's contents rather than a test of the sentence.
  assert.match(
    run.stdout,
    /[1-9]\d* interface calls? resolved to the one implementation this program builds/
  );
  assert.match(run.stdout, /sound only for a closed program/);
});

// bench/arrays.jl withdrew boxed-elements. The array a `(number | string)[]`
// annotation describes is PACKED_DOUBLE_ELEMENTS while only numbers are stored
// in it, and it measured 0.96-1.08x against a plain number[] — so the case the
// rule fired on is a case its own benchmark rejects.
test('a union mixing primitives stays silent: the declared type is not the kind', () => {
  assert.deepStrictEqual(rules('mixed'), []);
});

test('rebuilding the accumulator inside a loop fires', () => {
  assert.deepStrictEqual(rules('collect'), ['accumulating-spread']);
});

test('the same shape inside a reduce callback fires', () => {
  assert.deepStrictEqual(rules('collectByReduce'), ['accumulating-spread']);
});

// The measurement talking again: the cost is the loop re-running the copy, so
// a spread nothing re-runs is O(n) and the rule must not fire on it.
test('a spread no loop re-runs stays silent', () => {
  assert.deepStrictEqual(rules('widen'), []);
});

// concat carries the accumulator as the receiver, not as an argument, which is
// why the rule walked past this form until it was measured at 779x.
test('the concat form of the accumulator fires', () => {
  assert.deepStrictEqual(rules('collectByConcat'), ['accumulating-spread']);
});

// Same syntax, no loop. One concat is O(n) — the excl cells put it at 1.72x,
// two and a half orders of magnitude below the loop — so the rule stays quiet.
test('a single concat stays silent', () => {
  assert.deepStrictEqual(rules('appendOnce'), []);
});

// A string wears the syntax of the quadratic accumulator and is not it. V8
// appends into a cons-string instead of copying, and all three string forms BEAT
// the push-and-join the rule would ask for: 0.27-0.56x to build, and still
// 0.74-0.96x once the read back is counted. bench/strings.jl, 27 cells plus
// three replications of each of the nine at n=100000.
test('building a string by appending stays silent', () => {
  assert.deepStrictEqual(rules('joinByPlus'), []);
});

// The false positive that measurement killed. `.concat()` is a String method as
// much as an Array one, and the rule matched it by name with no type behind it,
// so it told anyone building a string that their code was a quadratic array
// copy. The receiver's type is now what decides.
test('the concat form on a STRING stays silent', () => {
  assert.deepStrictEqual(rules('joinByConcat'), []);
});

/** Checks both accumulator forms on the demo and requires their mutation limits. */
test('accumulator advice separates read cost from ownership and copy semantics', () => {
  const spreadFor = (name: string) =>
    rawFindings(name).find((x) => x.rule === 'accumulating-spread') ??
    assert.fail(`no accumulating-spread finding on ${name}`);
  const fixFor = (name: string): string => spreadFor(name).fix;
  const noteFor = (name: string): string => spreadFor(name).note ?? '';
  assert.match(fixFor('collect'), /^push onto acc /);
  assert.doesNotMatch(noteFor('collect'), /normalizes/);
  assert.match(fixFor('collectByConcat'), /^push onto acc /);
  assert.match(fixFor('collect'), /owns it.*earlier copy/);
  assert.match(noteFor('collect'), /aliases observe/);
  assert.match(noteFor('collect'), /sparse-array/);
  assert.match(fixFor('collectObject'), /benchmark a privately owned/);
  assert.match(noteFor('collectObject'), /define own data properties/);
  assert.match(noteFor('collectObject'), /checks CLEAN/);
  assert.match(noteFor('collectByAssign'), /read intervals span 1.0/);
  assert.ok(noteFor('collectObject').includes(N['ex.mergeall.build']));
  assert.ok(noteFor('collectObject').includes(N['ex.mergeall.build64']));
  assert.match(noteFor('collectObject'), /target setters, including __proto__/);
  const source = JSON.parse('{"__proto__":{"tag":"own"}}');
  const copied = { ...source };
  const assigned = Object.assign({}, source);
  assert.ok(Object.hasOwn(copied, '__proto__'));
  assert.ok(!Object.hasOwn(assigned, '__proto__'));
  assert.notStrictEqual(Object.getPrototypeOf(copied), Object.getPrototypeOf(assigned));
});

// Three tokens moved the measured defect out of the rule's sight, and both are
// forms the benchmark priced: the copy is the same copy either way (BUGS
// TC-43). A property target is not an identifier, and a forEach callback is a
// loop the syntax does not spell.
test('the accumulator on a field fires: a property target is still the target', () => {
  assert.deepStrictEqual(rules('addAll'), ['accumulating-spread']);
});

test('the same copy inside a forEach callback fires', () => {
  assert.deepStrictEqual(rules('collectInForEach'), ['accumulating-spread']);
});

// bench/delete.ts deletes a NAMED property from an object. Deleting an array
// element makes the backing store holey instead — a different representation,
// and the printed fix boxes the array, which is the effect that withdrew
// `boxed-elements` (BUGS TC-36).
// TC-63. `delete process.env.X` deletes nothing V8 owns, so bench/delete.jl's
// per-property-load cost prices something that cannot happen at that site. The
// test is the type's declaration file — `@types/node` and the DOM, never the
// language libs, because `Record` is declared in lib.es5.d.ts and is an
// ordinary object with a real map.
test('delete on a host object stays silent: there is no map to demote', () => {
  assert.deepStrictEqual(rules('clearToken'), []);
});

// The same platform, one keystroke away. `o[k]()` where k's type is a literal
// is `o.k()` — the same property, the same declaration, the same .d.ts — but
// `getSymbolAtLocation` answers nothing on an element access, so the callee
// resolved to no declaration and the platform test had none to read. pixi got
// ten warnings telling it to inline a native WebGL method (BUGS TC-108).
test('a platform call through a computed key is the platform', () => {
  assert.deepStrictEqual(rules('byteAt'), []);
});

test('delete on an array element stays silent: a different mechanism', () => {
  assert.deepStrictEqual(rules('dropElement'), []);
});

// `Object.create(null)` is already in dictionary mode before anything is
// written to it — `%HasFastProperties` answers false on the empty object — so
// the transition bench/delete.jl priced has happened before the delete runs.
// mathjs `lruQueue` is the case in the field, and three of its ten errors were
// this (BUGS TC-105).
test('delete on a null-prototype object stays silent: it was never fast', () => {
  assert.deepStrictEqual(rules('evictSlot'), []);
});

// The other half of TC-16, and the only place the width is stated: "build the
// object without the property" was measured working at the smaller of the two
// key counts es-toolkit omit was swept at and not at the larger.
//
// Asserted against the DATA, not against the sentence. This test used to match
// the literal `12 keys and not at 48`, so the two integers could stop being
// what example.jl holds and nothing would fail — the re-aimed TC-48. It now
// reads the derived pair and requires the fix to quote it.
test('the delete fix states the rebuild tradeoff at the swept sizes', () => {
  const f = rawFindings('drop').find((x) => x.rule === 'delete-property');
  const sizes = N['ex.omit.sizes'];
  assert.match(sizes, /^n=\d+ and n=\d+$/, `ex.omit.sizes reads "${sizes}"`);
  assert.ok(
    (f?.note ?? '').includes(sizes),
    `the fix's note does not quote the swept sizes (${sizes}): ${f?.note}`
  );
  const swept = [
    ...new Set(
      rows(root, 'example.jl')
        .filter((r) => r.example === 'estoolkit-omit' && r.mode === 'excl')
        .map((r) => r.n)
    ),
  ].sort((a, b) => a - b);
  assert.deepStrictEqual(
    sizes,
    `n=${swept[0]} and n=${swept[1]}`,
    'the derived pair is not the pair the rows were swept at'
  );
});

// The same sentence is republished three times outside the rule — in README's
// sample output, in examples/README.md, and in the example's header, which says
// it is quoting the run — and all three typed the pair by hand, so a
// re-measurement moved the rule and left the copies claiming the old sizes.
// Every copy is read here and held to the derived pair (BUGS TC-48).
test('every published copy of the delete fix quotes the swept sizes', () => {
  const sizes = N['ex.omit.sizes'];
  const typed: string[] = [];
  let copies = 0;
  for (const file of [
    'README.md',
    path.join('examples', 'README.md'),
    path.join('docs', 'rules.md'),
  ]) {
    // The sentence wraps across lines in prose and inside a `//` transcript, so
    // the file is flattened before it is matched.
    const flat = fs
      .readFileSync(path.join(root, file), 'utf8')
      .replace(/\n\s*(\/\/)?\s*/g, ' ');
    for (const m of flat.matchAll(/improves reads at ([^,]+),/gi)) {
      copies++;
      if (!m[1]!.includes(sizes)) typed.push(`${file}: "improves reads at ${m[1]}"`);
    }
  }
  assert.ok(copies >= 3, `the fix sentence was found ${copies} times — the regex has drifted`);
  assert.deepStrictEqual(typed, [], `these do not quote the swept sizes (${sizes})`);
});

// TC-79: "assign undefined" is correct about V8 and not always correct about
// the program. The tree is checked rather than caveated — where the deleted
// object reaches an observer that tells an absent key from one holding
// undefined, the rewrite is dropped and the observer is named at the finding.

// Object.keys in the same body — the Immich shape: `removeUndefinedKeys`
// exists to OMIT keys, and the printed rewrite would have written NULL to
// columns meant to be left alone.
test('a delete whose object reaches Object.keys loses the assign-undefined rewrite', () => {
  const f = rawFindings('scrub').find((x) => x.rule === 'delete-property');
  assert.match(f?.note ?? '', /Object\.keys observes this object/);
  assert.doesNotMatch(f?.fix ?? '', /assign undefined/);
});

// The delete in a callee and the spread in its caller are the same object, so
// the check crosses bodies the way the walk does.
test('the observer check crosses bodies: a spread in the caller reaches a delete in the callee', () => {
  const f = rawFindings('dropThenSpread').find((x) => x.rule === 'delete-property');
  assert.match(f?.note ?? '', /a spread observes this object/);
  assert.doesNotMatch(f?.fix ?? '', /assign undefined/);
});

// Where no observer is reachable the rewrite stands — and states its
// precondition, because the annotated tree is not the whole program.
test('a delete no observer reaches keeps the rewrite, with its precondition stated', () => {
  const f = rawFindings('drop').find((x) => x.rule === 'delete-property');
  assert.match(f?.fix ?? '', /assign undefined where the key may stay present/);
  assert.match(f?.note ?? '', /spread and Object\.assign copy it/);
  assert.match(f?.note ?? '', /Reflect\.ownKeys see it; JSON\.stringify does not/);
});

// The observer list, one row per entry. It shipped four entries long and the
// first JavaScript corpus it was pointed at held a fifth: mathjs `lruQueue`
// deletes a slot and, nine lines below, scans for the next live one with
// `Object.prototype.hasOwnProperty.call` — assign undefined and the scan stops
// on the hole it was written to skip. A list with no test per entry is how the
// first four drifted, so every entry is a row here (BUGS TC-79).
const tc79 = findingsByFunction(path.join('test', 'fixtures', 'tc79'));
const deleteFinding = (name: string) =>
  (tc79.get(name) ?? assert.fail(`no mark ${name}`)).find((f) => f.rule === 'delete-property') ??
  assert.fail(`${name} has no delete-property finding`);
const deleteFix = (name: string): string => deleteFinding(name).fix;

test('every observer that tells an absent key from an undefined one drops the rewrite', () => {
  const withRewrite: string[] = [];
  const unnamed: string[] = [];
  const observers: Array<[string, string]> = [
    ['enumerated', 'Object.keys'],
    ['scanned', 'hasOwnProperty'],
    ['askedDirectly', 'hasOwnProperty'],
    ['askedStatically', 'Object.hasOwn'],
    ['valued', 'Object.values'],
    ['paired', 'Object.entries'],
    ['named', 'Object.getOwnPropertyNames'],
    ['reflected', 'Reflect.ownKeys'],
    ['copiedFrom', 'Object.assign'],
  ];
  for (const [fn, op] of observers) {
    const { fix, note } = deleteFinding(fn);
    if (fix.includes('assign undefined')) withRewrite.push(`${fn} (${op})`);
    if (!new RegExp(`^${op.replace(/\./g, '\\.')} observes this object`).test(note ?? '')) {
      unnamed.push(`${fn}: ${note}`);
    }
  }
  assert.deepStrictEqual(withRewrite, [], 'the rewrite survived an observer that forbids it');
  assert.deepStrictEqual(unnamed, [], 'the finding does not name the observer it found');
});

// Both halves. `JSON.stringify` omits an absent key and a key holding undefined
// alike, and `Object.assign(o, …)` writes o rather than reading its keys —
// withdrawing the rewrite there would assert a false thing about JavaScript,
// which is what the shipped `JSON.stringify` arm did (BUGS TC-79).
test('a call that cannot tell the two apart keeps the rewrite', () => {
  for (const fn of ['stringified', 'copiedInto']) {
    assert.match(
      deleteFix(fn),
      /assign undefined where the key may stay present/,
      `${fn} lost the rewrite to a call that cannot tell an absent key from an undefined one`
    );
  }
});

// `lib/scan.ts` exports `isFunctionLike` because a second copy in rules.ts
// differed from it in two node kinds. TypeScript's own is a third answer and a
// strict superset — MethodSignature, CallSignature, ConstructSignature,
// IndexSignature, FunctionType and ConstructorType are functions to it and are
// nodes the walk never enters — so a rule that asks it builds alias edges out
// of declarations the closed world does not have (BUGS TC-96). The walk owns
// the answer; nothing under lib/ may ask TypeScript for a second one.
test('the walk owns what a function is, and no rule asks TypeScript instead', () => {
  const dir = path.join(root, 'lib');
  const second: string[] = [];
  for (const file of fs.readdirSync(dir, { recursive: true, encoding: 'utf8' })) {
    if (!file.endsWith('.ts')) continue;
    fs.readFileSync(path.join(dir, file), 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (line.includes('ts.isFunctionLike(')) second.push(`lib/${file}:${i + 1}`);
      });
  }
  assert.deepStrictEqual(
    second,
    [],
    "these call TypeScript's isFunctionLike; import the walk's from lib/scan.ts"
  );
});

// A chain on a string allocates no array at all, and the rule matched the
// method names without reading the receiver's type (BUGS TC-35). The same sweep
// that keeps accumulating-spread off strings keeps this rule off them.
test('a two-stage chain on a STRING stays silent', () => {
  assert.deepStrictEqual(rules('trimTail'), []);
});

/** Checks a detected map/filter chain and the callback-order risk its advice names. */
test('a two-stage chain fires with the limits on fusion', () => {
  assert.deepStrictEqual(rules('twoStages'), ['chained-allocation']);
  const finding = rawFindings('twoStages')[0]!;
  assert.match(finding.note ?? '', /callback order, side effects, indices, array arguments/);
  const events: string[] = [];
  const map = (n: number) => {
    events.push(`map ${n}`);
    return n;
  };
  const filter = (n: number) => {
    events.push(`filter ${n}`);
    return true;
  };
  [1, 2].map(map).filter(filter);
  const separate = events.slice();
  events.length = 0;
  for (const n of [1, 2]) filter(map(n));
  assert.notDeepStrictEqual(events, separate);
});

// One stage allocates once. That is the baseline the map-then-filter cell was
// measured against, so firing here would contradict the measurement.
test('a single map stays silent', () => {
  assert.deepStrictEqual(rules('oneStage'), []);
});

// Object.entries is a call, not a property access on the chain, so the rule
// walked past it until it was measured at 3.59x.
test('a chain that starts at Object.entries fires', () => {
  assert.deepStrictEqual(rules('entriesMap'), ['chained-allocation']);
});

// The next three are the measurement talking. Each is a form this sweep
// refused, and a rule that fires here contradicts bench/chained.jl.

// Object.keys allocates one array, not one per key, and the for-in loop that
// would fuse it away is SLOWER: 0.94x and 0.95x. The fix would be a
// pessimization, so the rule must not ask for it.
test('the same chain on Object.keys stays silent', () => {
  assert.deepStrictEqual(rules('keysMap'), []);
});

// sort sorts in place and returns the same array reference, so map().sort()
// allocates exactly what map() alone allocates — and that is the baseline.
// Measured at 1.04-1.05x, both intervals spanning 1.
// TC-54. n is written in the chain as an integer literal, so this is the one
// place a rule can read its own `silent` clause off the source rather than
// guess. Ten elements is three orders of magnitude under the smallest cell
// bench/chained.jl carries.
test('a chain a literal slice bounds below the measured n stays silent', () => {
  assert.deepStrictEqual(rules('topTen'), []);
});

// `.slice(2, -3)` bounds nothing the tool can see — the count depends on a
// length it does not know — so the rule fires. Two indices of the SAME sign are
// a real bound: `slice(-10, -5)` is five elements, and reading only the first
// argument called it ten.
test('a slice whose bound depends on an unknown length still fires', () => {
  assert.deepStrictEqual(rules('sliceUnknown'), ['chained-allocation']);
});

test('the same chain with nothing bounding it still fires', () => {
  assert.deepStrictEqual(rules('allRows'), ['chained-allocation']);
});

test('a chain ending in sort stays silent', () => {
  assert.deepStrictEqual(rules('sortedStages'), []);
});

// split and join do allocate, but fusing them away measured 1.06-1.09x against
// two different single-pass rewrites — under the 1.10x §4 asks of a warning.
test('the split-map-join chain stays silent', () => {
  assert.deepStrictEqual(rules('splitJoin'), []);
});

// The next three are the measurement talking, and they are the whole of what
// bench/addprop.jl bought. The most repeated claim in V8 folklore is that
// `o.b = 2` after the literal is a defect because it makes a second map. It
// does not: %HaveSameMap says every object taking the same path lands on the
// SAME final map, so the load site is monomorphic and there is no polymorphism
// to pay for. Measured, the pattern costs 1.21-1.34x on reads at L1 and L2 —
// inside the 1.0-1.7x band this harness has twice failed to replicate.
test('a property added after construction stays silent', () => {
  assert.deepStrictEqual(rules('addField'), []);
});

// `y?: number` really is two hidden classes reaching one load site, and it
// still does not earn a rule: 1.04x REJ at L2 on reads, and 0.90-0.97x with
// construction counted, because the shape without the property is cheaper to
// build than the one with it.
test('an optional property stays silent', () => {
  assert.deepStrictEqual(rules('optionalField'), []);
});

// The one large effect in that sweep, and it still ships no rule. Sixteen
// keyed stores cross fast_properties_soft_limit into dictionary mode and cost
// 6.17-6.34x to read; twelve cost 1.02-1.04x, interval spanning 1. The count
// is not visible to a checker, so a rule here would fire on the case its own
// benchmark rejected. BUGS TC-12 carries the proposal.
test('keyed stores in a loop stay silent: the count is not knowable', () => {
  assert.deepStrictEqual(rules('growByKey'), []);
});

// The edge is the absence of source, not a directory name. njit compiles
// through library code and raises only where it cannot compile at all.
test('a call into a typed dependency is where the promise stops', () => {
  assert.deepStrictEqual(rules('usesDependency'), ['closed-world']);
});

// TC-33 from the size end. The gap between this rule's trigger and its
// benchmark is stated in the rule's own evidence and printed under every
// finding it makes — and docs/rules.md had written the benchmark's bound down
// as one of the rule's SILENCES: "it is silent on ... a callee small enough to
// inline, which costs nothing". Nothing in `closed-world` consults a size and
// nothing could. `test/fixtures/tiny` is a one-parameter callee declared in a
// `.d.ts`, the smallest callee there is and one V8 would inline without
// hesitating, and the rule fires on it. A silence a fixture refutes is the one
// kind of claim this repo may not publish.
test('closed-world fires on the smallest callee it cannot read', () => {
  const tiny = rulesByFunction(path.join('test', 'fixtures', 'tiny'));
  assert.deepStrictEqual(tiny.get('total'), ['closed-world']);

  const reference = doc(path.join('docs', 'rules.md'));
  const from = reference.indexOf('## closed-world');
  const to = reference.indexOf('## interface-dispatch');
  assert.ok(from !== -1 && to > from, 'docs/rules.md has lost its closed-world section');
  assert.doesNotMatch(
    reference.slice(from, to),
    /silent on[\s\S]*?small enough to inline/,
    "docs/rules.md's closed-world section claims a silence on a callee small enough to " +
      'inline. The rule cannot see the size of a body it cannot read, and the fixture ' +
      'above is the counter-example'
  );
});

/** A visible constructed caller resolves the concrete method without walking the throwing stub. */
test('a method whose whole body throws is a declaration, not an implementation', () => {
  assert.deepStrictEqual(rules('slotSize'), []);
  const mark = markFor('slotSize');
  assert.strictEqual(mark.followed, 1);
  assert.strictEqual(mark.reached.length, 2);
  const implementation = mark.reached[1]!.node;
  assert.ok(ts.isMethodDeclaration(implementation));
  assert.ok(ts.isClassDeclaration(implementation.parent));
  assert.strictEqual(implementation.parent.name?.text, 'OneSlot');
  assert.ok(mark.reached.every((body) => !body.node.getText().includes('slotUnimplemented')));
});

// The walk located both bodies — it prints their positions — and followed
// neither. Stopping is defensible; "which we have no body for" in the same
// sentence as the file and line of two bodies is not, and neither is a fix line
// offering to inline a callee the tool has just pointed at (BUGS TC-109). Two
// located bodies the walk cannot pick between are interface-dispatch's case,
// and a function-valued call target has no four-map budget to be inside
// (BUGS TC-158).
test('a call the walk located two bodies for is not reported as bodiless', () => {
  assert.deepStrictEqual(rules('syncUniforms'), ['interface-dispatch']);
  const f = rawFindings('syncUniforms').find((x) => x.rule === 'interface-dispatch');
  assert.doesNotMatch(f?.message ?? '', /we have no body for/);
  assert.match(f?.message ?? '', /2 implementations reach this call \(uploadFloat\(\), uploadInt\(\)\)/);
  assert.doesNotMatch(f?.message ?? '', /four-map budget|through an interface/);
  assert.doesNotMatch(f?.fix ?? '', /^inline what you need/);
});

/**
 * One body located beside an origin nobody can see: arktype's
 * `opts?.stringifySymbol ?? printable`. `closed-world` called `printable`
 * readable and not walked, which is interface-dispatch's definition, and left
 * it unread. The site stays reported for the unknown origin, and the located
 * body is walked: the accumulating spread inside it is found (BUGS TC-158).
 */
test('one located body is walked, and the call is interface-dispatch', () => {
  const byName = findingsByFunction(path.join('test', 'fixtures', 'located'));
  const found = byName.get('copyAll') ?? assert.fail('no mark copyAll');
  assert.deepStrictEqual(found.map((f) => f.rule).sort(), ['accumulating-spread', 'interface-dispatch']);
  const f = found.find((x) => x.rule === 'interface-dispatch');
  assert.match(f?.message ?? '', /the callee has an unknown origin \(no visible caller of copyAll/);
  assert.match(f?.message ?? '', /1 implementation reaches this call \(spread\(\)\)/);
  assert.match(f?.message ?? '', /only the one body located is walked/);
});

test('the object form of the accumulator fires', () => {
  assert.deepStrictEqual(rules('collectObject'), ['accumulating-spread']);
});

// One spread with no loop to re-run it is O(n). The measurement says the cost
// is entirely in re-copying, so the rule must not fire here.
test('a single object spread stays silent', () => {
  assert.deepStrictEqual(rules('mergeOnce'), []);
});

test('the Object.assign copy form fires: 846-875x at n=500', () => {
  assert.deepStrictEqual(rules('collectByAssign'), ['accumulating-spread']);
});

// Object.assign(acc, …) mutates acc and returns it. That is the O(n) rewrite
// this rule asks for, so firing on it would indict its own fix.
test('Object.assign onto the accumulator itself stays silent', () => {
  assert.deepStrictEqual(rules('mergeInto'), []);
});

// The excerpt this rule came from: Decimal.min(a, b) never returns a, it
// returns a fresh Decimal, so the store happens even when nothing changed.
test('choosing between boxed values with an allocating call fires', () => {
  assert.deepStrictEqual(rules('lowest'), ['allocating-select']);
});

/** Checks imported conditional allocation and a cross-file observer without changing findings. */
test('allocation and deletion advice points to the source behind the finding', () => {
  const dir = path.join('test', 'fixtures', 'rule-advice');
  const findings = findingsByFunction(dir);
  const selection = findings.get('lowest')?.find((f) => f.rule === 'allocating-select');
  assert.ok(selection);
  assert.match(selection.message, /contains an allocation/);
  assert.doesNotMatch(selection.message, /every pass/);
  assert.match(selection.note ?? '', /do not prove selection or allocation on every path/);
  assert.match(selection.note ?? '', /ties.*object identity.*side effects/);
  const allocation = selection.related?.[0];
  assert.ok(allocation);
  assert.strictEqual(allocation.file, path.join(root, dir, 'helpers.ts'));
  const allocationLine = fs.readFileSync(allocation.file, 'utf8').split('\n')[allocation.line - 1]!;
  assert.ok(allocationLine.slice(allocation.column - 1).startsWith('{ value:'));
  const deletion = findings.get('removeThenList')?.find((f) => f.rule === 'delete-property');
  assert.ok(deletion);
  assert.strictEqual(deletion.file, path.join(root, dir, 'helpers.ts'));
  assert.doesNotMatch(deletion.fix, /assign undefined/);
  const observer = deletion.related?.[0];
  assert.ok(observer);
  assert.strictEqual(observer.file, path.join(root, dir, 'caller.ts'));
  const observerLine = fs.readFileSync(observer.file, 'utf8').split('\n')[observer.line - 1]!;
  assert.ok(observerLine.slice(observer.column - 1).startsWith('Object.keys('));
});

// Math.min returns a number. There is no allocation to remove, and the branch
// would only save one field store, which is what the number cell measured.
// The benchmark measured `Box.min`, whose body runs `new Box(...)`. A callee
// that returns one of its arguments allocates on no pass, and the rule read the
// return TYPE and asserted an allocation on every one (BUGS TC-34).
test('a select whose callee allocates nothing stays silent', () => {
  assert.deepStrictEqual(rules('nearest'), []);
});

// The second half of the same defect: the body-walk crossed into a nested
// function and counted an object literal in a callback the callee never calls,
// and counted a scratch value it never returns.
test('an allocation the callee neither returns nor reaches stays silent', () => {
  assert.deepStrictEqual(rules('cheapest'), []);
});

test('the same loop on numbers stays silent', () => {
  assert.deepStrictEqual(rules('lowestNumber'), []);
});

test('delete fires', () => {
  assert.deepStrictEqual(rules('drop'), ['delete-property']);
});

// njit compiles the call tree, so the checker checks the call tree. A callee
// whose source we have is followed, not reported as the end of the world.
test('an unannotated callee with source is followed, not reported', () => {
  assert.deepStrictEqual(rules('total'), []);
});

test('a violation inside an unannotated callee is found', () => {
  assert.deepStrictEqual(rules('viaCallee'), ['delete-property']);
});

test('an annotated arrow, and an alias to it, stay inside the closed world', () => {
  assert.deepStrictEqual(rules('usesHelper'), []);
});

test('a missing path fails loudly instead of reporting a clean run', () => {
  assert.throws(() => program(ts, root, ['no/such/dir']), /no such file or directory/);
});

// TypeScript 7 dropped `ts.sys`, the host `tsconfigOf` and `program` both
// read from, so a resolve that found a TypeScript without it used to succeed
// in load() and crash later, deep in a call whose message named neither the
// version found nor what to run. The fixture stands in for that package: a
// `typescript` on disk, resolvable, with no `sys` (BUGS TC-144).
test('a resolved TypeScript with no sys host fails loudly at load, naming the version found', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jitmax-tsguard-'));
  try {
    const pkg = path.join(dir, 'node_modules', 'typescript');
    fs.mkdirSync(pkg, { recursive: true });
    fs.writeFileSync(
      path.join(pkg, 'package.json'),
      JSON.stringify({ name: 'typescript', version: '7.0.2', main: 'index.js' })
    );
    fs.writeFileSync(path.join(pkg, 'index.js'), 'exports.version = "7.0.2";\n');
    assert.throws(
      () => load(dir),
      /TypeScript >=5\.0\.0 <6.*\b7\.0\.2\b.*no "sys" host.*npm install --save-dev typescript@\^5\.9/s
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Config and annotation overrides both name a rule or a defect code;
// resolveDisabled() is the one place both forms are expanded and validated.

test('a defect code expands to every rule that carries it', () => {
  assert.deepStrictEqual([...resolveDisabled(['TC-9'])].sort(), [
    'chained-allocation',
    'delete-property',
    'megamorphic-elements',
  ]);
});

test('an unknown rule name or defect code fails loudly instead of silently disabling nothing', () => {
  for (const key of ['not-a-real-rule', '__proto__', 'constructor', 'toString']) {
    assert.throws(() => resolveDisabled([key]), /unknown rule or defect code/);
  }
});

/** Checks both boolean settings against the rule vocabulary without inherited table keys. */
test('a TOML config disables a rule by name and by defect code', () => {
  const cfg = loadConfig(path.join(import.meta.dirname, 'fixtures', 'disable.toml'));
  assert.deepStrictEqual([...cfg.disabled].sort(), ['TC-9', 'delete-property']);
  assert.deepStrictEqual(
    [...resolveDisabled(cfg.disabled)].sort(),
    ['chained-allocation', 'delete-property', 'megamorphic-elements']
  );
  fs.mkdirSync(path.join(root, 'tmp'), { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, 'tmp', 'test-config-'));
  const file = path.join(dir, 'rules.toml');
  try {
    fs.writeFileSync(file, '[rules]\ndelete-property = true\nTC-9 = true\n');
    assert.deepStrictEqual([...loadConfig(file).disabled], []);
    for (const key of ['not-a-real-rule', '__proto__', 'constructor', 'toString']) {
      for (const value of ['true', 'false']) {
        fs.writeFileSync(file, `[rules]\n${key} = ${value}\n`);
        assert.throws(() => loadConfig(file), /unknown rule or defect code/);
      }
    }
    for (const table of ['__proto__', 'constructor', 'toString']) {
      fs.writeFileSync(file, `[${table}]\n__jitmax_config_probe__ = true\n`);
      assert.throws(() => loadConfig(file), /unknown table/);
      for (const target of [Object.prototype, Object, Object.prototype.toString]) {
        assert.strictEqual(Object.hasOwn(target, '__jitmax_config_probe__'), false);
      }
    }
  } finally {
    fs.unlinkSync(file);
    fs.rmdirSync(dir);
  }
});

// The same place the promise is made: `@jitmax -key` disables a rule for
// that function and everything its walk reaches, and nowhere else.

test('an annotation disable by rule name silences its own function and leaves its unmodified twin alone', () => {
  const disabled = resolveDisabled(markFor('dropQuiet').disabled);
  assert.deepStrictEqual(
    rawFindings('dropQuiet').filter((f) => !disabled.has(f.rule)),
    []
  );
  assert.deepStrictEqual(rules('drop'), ['delete-property']);
});

test('an annotation disable by defect code reaches through the walk, and does not leak into its sibling', () => {
  const quiet = markFor('viaCalleeQuiet');
  assert.deepStrictEqual(quiet.disabled, ['TC-9']);
  const disabled = resolveDisabled(quiet.disabled);
  assert.deepStrictEqual(
    rawFindings('viaCalleeQuiet').filter((f) => !disabled.has(f.rule)),
    []
  );
  // viaCallee calls the same unannotated callee and carries no override of
  // its own — the defect-code disable on its sibling must not reach it.
  assert.deepStrictEqual(rules('viaCallee'), ['delete-property']);
});

// Suppression is never silent: the report says how many findings a config or
// an annotation removed, and by what — a clean run that is clean because
// rules were switched off has to say so.

test('the report says how many findings were suppressed and by what', () => {
  const disabled = resolveDisabled(['delete-property']);
  const raw = rawFindings('drop');
  const findings = raw.filter((f) => !disabled.has(f.rule));
  const out = render(root, [{ mark: markFor('drop'), findings }], {
    count: raw.length - findings.length,
    keys: ['delete-property'],
  });
  assert.match(out, /1 finding suppressed \(delete-property\)/);
});

// The code under the finding, the sentence once in a legend after the findings:
// the sentence went under every finding that cited it, twelve times for TC-9
// in one run of demo/.
test('a finding prints the defects its rule carries', () => {
  const out = render(root, [{ mark: markFor('drop'), findings: rawFindings('drop') }]);
  assert.match(out, /^ {6}known defect: TC-9$/m);
  assert.match(out, /^ {4}TC-9 +rules fire outside the conditions their own evidence establishes$/m);
});

test('megamorphic findings locate the read and retain the collection location', () => {
  const mark = markFor('fiveShapes');
  const findings = rawFindings('fiveShapes');
  const f = findings.find((f) => f.rule === 'megamorphic-elements');
  const read = f?.related?.find((source) => source.name === 'read: r.x');
  assert.ok(f && read);
  assert.ok(read.line > f.line, 'the read is distinct from its collection declaration');
  const pos = mark.sf.getPositionOfLineAndCharacter(read.line - 1, read.column - 1);
  assert.strictEqual(mark.sf.text.slice(pos, pos + 3), 'r.x');
  const out = render(root, [{ mark, findings }]);
  assert.ok(out.includes(`demo/lib.ts:${f.line}:${f.column}`));
  assert.ok(out.includes(`related: demo/lib.ts:${read.line}:${read.column} read: r.x`));
  assert.match(out.replace(/\s+/g, ' '), /not an observed runtime map count/);
  assert.match(out, /type assertions do not change runtime shapes/);
});

test('the report prints exact finding positions and qualifies workload costs', () => {
  const mark = markFor('areaOfFive');
  const findings = rawFindings('areaOfFive');
  const out = render(root, [{ mark, findings }]);
  for (const f of findings) {
    assert.ok(out.includes(`demo/lib.ts:${f.line}:${f.column}`));
  }
  assert.match(out, /Static findings are candidates, not measured costs in this workload/);
  assert.doesNotMatch(out, /Every rule is measured|No cost is printed/);
});

/** Checks that each counted implementation links to source, without adding findings. */
test('dispatch and coverage findings link the implementations the walk already found', () => {
  for (const name of ['runAll', 'runTrio', 'syncUniforms']) {
    const mark = markFor(name);
    const findings = rawFindings(name);
    assert.strictEqual(findings.length, 1);
    const related = findings[0]!.related ?? [];
    assert.strictEqual(related.length, name === 'runAll' ? 5 : name === 'runTrio' ? 3 : 2);
    const out = render(root, [{ mark, findings }]);
    for (const site of related) {
      assert.strictEqual(site.file, mark.file);
      const pos = mark.sf.getPositionOfLineAndCharacter(site.line - 1, site.column - 1);
      assert.match(mark.sf.text.slice(pos), /^(class |function )/);
      assert.ok(out.includes(`related: demo/lib.ts:${site.line}:${site.column}`));
    }
  }
});

/** Checks that declared union members are not invented as builder locations. */
test('unlocated builders remain explicit beside a megamorphic read', () => {
  const f = rawFindings('fiveShapes')[0]!;
  assert.strictEqual(f.related?.length, 1);
  assert.match(f.relatedNote ?? '', /No builder located/);
  assert.match(f.relatedNote ?? '', /no visible caller/);
});

/** Checks that a long related-source list has an explicit display limit. */
test('the report counts omitted related locations without hiding the finding', () => {
  const mark = markFor('runAll');
  const original = rawFindings('runAll')[0]!;
  const related = Array.from({ length: 8 }, (_, i) => ({
    file: mark.file, line: i + 1, column: 1, name: `source ${i + 1}`,
  }));
  const out = render(root, [{ mark, findings: [{ ...original, related }] }]);
  assert.strictEqual((out.match(/related:/g) ?? []).length, 5);
  assert.match(out, /3 more related source locations omitted/);
  assert.match(out, /1 error/);
  assert.match(out, /Representative receiver sources/);
  assert.match(out, /use --verbose/);
  const verbose = render(root, [{ mark, findings: [{ ...original, related }] }],
    undefined, undefined, undefined, true);
  assert.strictEqual((verbose.match(/related:/g) ?? []).length, 8);
  assert.doesNotMatch(verbose, /omitted/);
});

/** Checks both verbosity flags through the CLI without changing its findings or exit code. */
test('CLI verbosity expands source locations without changing the result', () => {
  const input = path.join(root, 'test', 'fixtures', 'builders.ts');
  const baseline = spawnSync(process.execPath, [path.join(root, 'bin', 'cli.js'), input],
    { cwd: root, encoding: 'utf8' });
  assert.strictEqual(baseline.status, 1, baseline.stderr);
  assert.strictEqual((baseline.stdout.match(/related:/g) ?? []).length, 5);
  assert.match(baseline.stdout, /1 more related source location omitted/);
  for (const flag of ['-v', '--verbose']) {
    const run = spawnSync(process.execPath, [
      path.join(root, 'bin', 'cli.js'), input, flag,
    ], { cwd: root, encoding: 'utf8' });
    assert.strictEqual(run.status, 1, run.stderr);
    assert.strictEqual(run.stdout.split('\n')[0], baseline.stdout.split('\n')[0]);
    assert.strictEqual((run.stdout.match(/related:/g) ?? []).length, 6);
    assert.doesNotMatch(run.stdout, /related source locations omitted/);
  }
});

// Every line fits 78 columns. A finding's fix ran to 553 characters on one
// physical line, and a terminal wraps that at column 0, so its second half read
// as a new block; the run-level notes were hand-wrapped and the findings were
// not. The whole demo, because it fires every rule and every fix.
test('every line of the report fits 78 columns', () => {
  const results = demoScan.marks.map((mark) => ({ mark, findings: rawFindings(mark.name) }));
  const wide = render(root, results)
    .split('\n')
    .filter((line) => line.length > 78);
  assert.deepStrictEqual(wide, [], 'these lines run past 78 columns');
});

// The published numbers. A ratio used to be typed into `EVIDENCE`, into a spec
// table and into README prose, and the three contradicted each other twice in
// one day. Now every one of them is derived from the `.jl` rows, and this test
// is what makes that true rather than intended: re-derive from the data, and
// fail if the generated module, the generated block in bench/README.md, or the
// prose that quotes a number has fallen behind it. `make numbers` is the fix.

test('every published number is what its own data file says', () => {
  assert.deepStrictEqual(derive(root), N, 'lib/numbers.ts is stale — run `make numbers`');

  assert.ok(
    doc(path.join('bench', 'README.md')).includes(markdown(root)),
    "bench/README.md's generated block is stale — run `make numbers`"
  );

  // The prose quotes some of these in sentences, and it is spread over seven
  // files. Checked with the generated block cut out, or the block would only be
  // matching itself, and with the typographic dash normalised, because prose
  // uses one and code does not.
  const prose = docProse().replace(/[–—]/g, '-');
  // `N` is a literal object now, so a citation key that does not exist is a
  // compile error at every USE site — which is the point. This loop walks
  // CITATIONS at runtime, so it is the one place the cast is honest: derive()
  // and N are asserted equal three lines up.
  const table = N as Record<string, string>;
  for (const [key, c] of Object.entries(CITATIONS)) {
    if (!c.readme) continue;
    assert.ok(prose.includes(table[key]!), `the docs no longer quote ${key} = ${table[key]}`);
  }
});

// The exit code is the contract a CI gate reads, so it is tested through the
// binary rather than through the library. A walk that hit the cap printed the
// warning and exited 0, which told the gate the opposite of what the text said
// (BUGS TC-17). `test/fixtures/deep` is a chain longer than the cap with no
// finding in it, so 1 here can only come from the truncation.

/** Checks both help flags through each entrypoint despite invalid project inputs. */
test('CLI help works without a valid project and ignores other arguments', () => {
  fs.mkdirSync(path.join(root, 'tmp'), { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, 'tmp', 'test-cli-help-'));
  const config = path.join(dir, 'tsconfig.json');
  fs.writeFileSync(config, '{ invalid');
  try {
    for (const entry of ['jitmax.ts', 'cli.js']) {
      for (const flag of ['-h', '--help']) {
        const run = spawnSync(process.execPath, [
          path.join(root, 'bin', entry), '--unknown', 'missing.toml', flag,
        ], { cwd: dir, encoding: 'utf8' });
        assert.strictEqual(run.status, 0, run.stderr);
        assert.strictEqual(run.stderr, '');
        assert.match(run.stdout, /Usage: jitmax/);
        assert.match(run.stdout, /jitmax run\.cpuprofile src/);
        assert.match(run.stdout, /\/\*\* @jitmax \*\//);
        assert.match(run.stdout, /\/\*\* @jitmax -megamorphic-elements \*\//);
        assert.match(run.stdout, /working directory upward/);
        assert.match(run.stdout, /Exit codes: 0 checked, no errors; 1 errors/);
        assert.match(run.stdout, /2 the tool failed/);
      }
    }
  } finally {
    fs.unlinkSync(config);
    fs.rmdirSync(dir);
  }
});

/** Checks an unsupported option fails before scanning and points to usable help. */
test('CLI unknown options explain positional arguments and point to help', () => {
  const run = spawnSync(process.execPath, [
    path.join(root, 'bin', 'cli.js'), '--config=rules.toml', 'missing.ts',
  ], { cwd: root, encoding: 'utf8' });
  assert.strictEqual(run.status, 2);
  assert.strictEqual(run.stdout, '');
  assert.match(run.stderr, /Unknown option: --config=rules\.toml/);
  assert.match(run.stderr, /positional arguments/);
  assert.match(run.stderr, /jitmax --help/);
});

/** Checks invalid source reports its compiler message and exact position. */
test('CLI syntax errors name the compiler diagnostic and source position', () => {
  const file = path.join(root, 'tmp', `test-cli-syntax-${process.pid}.ts`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '/** @jitmax */\nexport const value = ;\n');
  try {
    const run = spawnSync(process.execPath, [
      path.join(root, 'bin', 'jitmax.ts'), file,
    ], { cwd: root, encoding: 'utf8' });
    assert.strictEqual(run.status, 2);
    assert.strictEqual(run.stdout, '');
    assert.match(run.stderr, /nothing here was checked/);
    assert.match(run.stderr, /Fix these errors and run jitmax again/);
    assert.match(run.stderr, /\.ts:2:22: TS1109: Expression expected\./);
  } finally {
    fs.unlinkSync(file);
  }
});

test('a truncated walk exits 1: not clean, even with no findings', () => {
  const run = spawnSync(
    process.execPath,
    [path.join(root, 'bin', 'jitmax.ts'), path.join(root, 'test', 'fixtures', 'deep')],
    { cwd: root, encoding: 'utf8' }
  );
  assert.match(run.stdout, /WALK TRUNCATED/);
  assert.match(run.stdout, /0 errors/);
  assert.strictEqual(run.status, 1);
});

// Profile mode (BUGS TC-57). The profile is synthesized here rather than
// committed: a real .cpuprofile carries absolute paths from the machine that
// recorded it, and a fixture that only works on one machine is not a fixture.
// The frame positions are V8's — a function's position is its parameter list's
// `(`, which is why the two columns below are not where the nodes start.
// The path carries the pid: two overlapping test runs shared one file and
// deleted each other's, which read as a real failure twice before it read as a
// race.
function writeProfile(
  target: string,
  frames: Array<{ line: number; column: number }>,
  url = `file://${path.join(root, 'test', 'fixtures', 'profile', 'work.ts')}`
): string {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const nodes = frames.map((f, i) => ({
    id: i + 1,
    callFrame: { functionName: 'f', url, lineNumber: f.line - 1, columnNumber: f.column - 1 },
  }));
  const profile = {
    nodes,
    samples: nodes.map((n) => n.id),
    timeDeltas: nodes.map((_, i) => (i === 0 ? 995 : 5)),
  };
  fs.writeFileSync(target, JSON.stringify(profile));
  return target;
}

test('a profile marks the function it measured as hot, and not the other one', () => {
  const dir = path.join(root, 'test', 'fixtures', 'profile');
  // A function's position is its parameter list's `(`: line 8 column 23 is
  // `export function kernel(`, line 4 column 26 is `export function parseOnce(`.
  // parseOnce gets 0.5% of the samples, under the 1% default, so this also
  // proves the threshold filters rather than just that the lookup works.
  const prof = writeProfile(path.join(root, 'tmp', `test-hot-${process.pid}.cpuprofile`), [
    { line: 8, column: 23 },
    { line: 4, column: 26 },
  ]);
  const run = spawnSync(process.execPath, [path.join(root, 'bin', 'jitmax.ts'), prof, dir], {
    cwd: root,
    encoding: 'utf8',
  });
  fs.unlinkSync(prof);
  assert.match(run.stdout, /1 hot function, 1 error/);
  assert.match(run.stdout, /kernel\(\) — 99\.5% of samples/);
  assert.ok(!run.stdout.includes('parseOnce'), 'the cold function was marked');
  assert.strictEqual(run.status, 1);
});

// A hot frame that matched no function is measured time the run could not
// look at — the same blindness `unresolved` names for modules, so it takes the
// same channel: printed above the findings, and exit 1. It used to be two
// different failures on one axis: all of them missing threw exit 2 blaming a
// stale profile, a cause the tool never checked, and a partial miss printed
// `clean` and exited 0 over the measured time it had dropped (BUGS TC-77).
test('a profile matching no function in the program names the frames, and exits 1', () => {
  const dir = path.join(root, 'test', 'fixtures', 'profile');
  const prof = writeProfile(path.join(root, 'tmp', `test-stale-${process.pid}.cpuprofile`), [{ line: 900, column: 1 }]);
  const run = spawnSync(process.execPath, [path.join(root, 'bin', 'jitmax.ts'), prof, dir], {
    cwd: root,
    encoding: 'utf8',
  });
  fs.unlinkSync(prof);
  assert.match(run.stdout, /0 hot frames matched a function here; 1 did not/);
  assert.match(run.stdout, /work\.ts:900:1/);
  assert.match(run.stdout, /this is not a clean run/);
  assert.strictEqual(run.status, 1);
});

// TC-145: a config that switches off the one rule that fired left a run that
// printed `1 finding suppressed` and then `every annotated function is clean`
// two lines below it. The exit code is the gate's contract and stays 0; the
// sentence stops denying the line above it.
test('a run whose findings were all suppressed does not call itself clean', () => {
  const config = path.join(root, 'tmp', `test-suppress-${process.pid}.toml`);
  fs.writeFileSync(config, '[rules]\n"accumulating-spread" = false\n');
  const run = spawnSync(process.execPath,
    [path.join(root, 'bin', 'jitmax.ts'), config, path.join(root, 'examples', 'radash-assign.before.ts')],
    { cwd: root, encoding: 'utf8' });
  fs.unlinkSync(config);
  assert.match(run.stdout, /1 finding suppressed \(accumulating-spread\)/);
  assert.doesNotMatch(run.stdout, /is clean/);
  assert.match(run.stdout, /no errors shown: 1 finding suppressed above, not fixed\./);
  assert.strictEqual(run.status, 0);
});

// TC-154: a site inside a nested function the walk also follows as its own
// body is found twice for one mark, and the fan-in counted findings, so one
// annotated function printed "reached by 2 annotated functions".
test('fan-in counts annotated functions, not findings', () => {
  const run = spawnSync(process.execPath,
    [path.join(root, 'bin', 'jitmax.ts'), path.join(root, 'test', 'fixtures', 'once')],
    { cwd: root, encoding: 'utf8' });
  assert.match(run.stdout, /1 annotated function/);
  assert.doesNotMatch(run.stdout, /reached by/);
});

// TC-128: five key ORDERS of one key set are five maps at one load site, and
// `%HaveSameMap` says so. No rule can separate them from five builders that
// agree, because key order is not part of a TypeScript type — the rules record
// that in `EVIDENCE.unreported`, which nothing printed. A clean run therefore
// said nothing about an axis measured at the same order as the cases it does
// report, and silence read as coverage.
test('a clean run names the axes no rule checks', () => {
  const file = path.join(root, 'tmp', `test-keyorder-${process.pid}.ts`);
  fs.writeFileSync(file, [
    '/** @jitmax */',
    'export function sumFiveOrders(rows: Array<{ a: number; b: number; c: number }>): number {',
    '  let s = 0; for (const r of rows) s += r.a + r.b + r.c; return s;',
    '}',
    'export function buildFive() {',
    '  return [{a:1,b:2,c:3}, {a:1,c:3,b:2}, {b:2,a:1,c:3}, {b:2,c:3,a:1}, {c:3,a:1,b:2}];',
    '}',
    '',
  ].join('\n'));
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [path.join(root, 'bin', 'jitmax.ts'), ...args, file],
      { cwd: root, encoding: 'utf8' });
  const plain = run();
  const verbose = run('-v');
  fs.unlinkSync(file);

  // The rules are right to be quiet here; the run is not right to stop there.
  assert.match(plain.stdout, /is clean\./);
  assert.strictEqual(plain.status, 0);
  assert.match(unwrapped(plain.stdout), /clean means no rule fired\./);
  assert.match(unwrapped(plain.stdout), /megamorphic-elements/);
  assert.match(plain.stdout, /run with -v/);
  // -v carries the sentence itself, key order named.
  assert.match(unwrapped(verbose.stdout), /five key ORDERS of one key set are five maps/);
  assert.ok(!/run with -v/.test(verbose.stdout), '-v still points at -v');
});

// The half that printed `clean`: one frame of two matched, so 0.5% of the
// measured time was checked and 99.5% was not, and the run said every hot
// function is clean and exited 0.
test('a partly matching profile is not a clean run either', () => {
  const dir = path.join(root, 'test', 'fixtures', 'profile');
  const prof = writeProfile(path.join(root, 'tmp', `test-partial-${process.pid}.cpuprofile`), [
    { line: 900, column: 1 },
    { line: 4, column: 26 },
  ]);
  const run = spawnSync(process.execPath, [path.join(root, 'bin', 'jitmax.ts'), prof, dir], {
    cwd: root,
    encoding: 'utf8',
  });
  fs.unlinkSync(prof);
  assert.ok(!/every hot function is clean/.test(run.stdout), 'unchecked hot time read as clean');
  assert.match(run.stdout, /0 hot frames matched a function here; 1 did not/);
  assert.strictEqual(run.status, 1);
});

// `path.relative` returns the EMPTY STRING when the two paths are equal, so a
// hot frame whose file IS the directory the run was started in rendered as
// `kernel (:12:5)` — and that line is the whole of what the run says it could
// not look at. lib/report.ts guarded its two renderers of a location and
// bin/jitmax.ts's third was unguarded; all four go through `rel` now
// (BUGS TC-100). Run from inside the fixture directory, which is what makes
// the frame's file and the run's cwd the same path.
test('an unmatched hot frame in the working directory is named, not blank', () => {
  const dir = path.join(root, 'test', 'fixtures', 'profile');
  const prof = writeProfile(
    path.join(root, 'tmp', `test-cwdframe-${process.pid}.cpuprofile`),
    [{ line: 12, column: 5 }],
    `file://${dir}`
  );
  const run = spawnSync(process.execPath, [path.join(root, 'bin', 'jitmax.ts'), prof, '.'], {
    cwd: dir,
    encoding: 'utf8',
  });
  fs.unlinkSync(prof);
  assert.ok(!run.stdout.includes('(:12:5)'), `the frame rendered with no file:\n${run.stdout}`);
  assert.ok(run.stdout.includes(`(${dir}:12:5)`), `the frame does not name its file:\n${run.stdout}`);
  assert.strictEqual(run.status, 1);
});

// TC-77. A profile's frames point into the file V8 RAN, which is not the file
// the author wrote whenever anything transformed it — and one real `enum` is
// enough to force a transform, because type stripping cannot run it. In
// test/fixtures/mapped the transform moves `kernel` from line 31 to line 25,
// and line 25 of the source is a doc comment: the report that filed TC-77 had
// V8 pointing at exactly that, and the tool answered "the profile is stale".
// dist/work.js is tsc's output with the map in a file beside it, and
// dist/transform.js is what Node's own --experimental-transform-types makes of
// the same source, with the map inline. Both are committed, because what has to
// be tested is a real transformer's map, not one written here to pass.
const mapped = path.join(root, 'test', 'fixtures', 'mapped');

// V8 reports a function at its parameter list's `(`. Read that position out of
// the artifact instead of writing it down, so a regenerated fixture moves the
// frame with it rather than leaving the test aimed at nothing.
function parenOf(file: string, name: string): { line: number; column: number } {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const i = lines.findIndex((l) => l.includes(`${name}(`));
  assert.ok(i >= 0, `${file} has no ${name}(`);
  return { line: i + 1, column: lines[i]!.indexOf(`${name}(`) + name.length + 1 };
}

function runPorted(artifact: string, tag: string): { stdout: string; status: number | null } {
  const gen = parenOf(path.join(mapped, 'dist', artifact), 'kernel');
  // The two positions disagreeing IS the fixture: one where they agreed would
  // pass without a source map ever being read.
  assert.notDeepStrictEqual(gen, parenOf(path.join(mapped, 'src', 'work.ts'), 'kernel'));
  const prof = writeProfile(
    path.join(root, 'tmp', `test-${tag}-${process.pid}.cpuprofile`),
    [gen],
    `file://${path.join(mapped, 'dist', artifact)}`
  );
  const run = spawnSync(
    process.execPath,
    [path.join(root, 'bin', 'jitmax.ts'), prof, path.join(mapped, 'src')],
    { cwd: root, encoding: 'utf8' }
  );
  fs.unlinkSync(prof);
  return run;
}

// The map is a file beside the artifact, which is what a build step leaves.
test('a hot frame in a transformed file is ported back through its source map', () => {
  const run = runPorted('work.js', 'tscmap');
  assert.match(run.stdout, /1 hot function, 1 error/);
  assert.match(run.stdout, /100\.0% of samples, .*ported through a source map/);
  // The finding names the line the author wrote. That is the whole point of
  // porting: a position in a generated file is not somewhere anybody can edit.
  const src = parenOf(path.join(mapped, 'src', 'work.ts'), 'kernel');
  assert.match(run.stdout, new RegExp(`work\\.ts:${src.line}\\s+kernel\\(\\)`));
  assert.ok(!run.stdout.includes('matched a function here'), `a frame was dropped:\n${run.stdout}`);
  assert.strictEqual(run.status, 1);
});

// The other shape of the same thing: the map inline as a data: URI, from the
// transform Node itself runs. Its segments do not start at the `(` V8 named —
// this one lands on the function's NAME — so it also covers the position a map
// actually maps a declaration to.
test('a hot frame is ported through an inline source map too', () => {
  const run = runPorted('transform.js', 'inlinemap');
  assert.match(run.stdout, /1 hot function, 1 error/);
  assert.match(run.stdout, /100\.0% of samples, .*ported through a source map/);
  assert.strictEqual(run.status, 1);
});

// And the half that must NOT guess. The same transformed source with no map
// beside it: nothing can port the position, so nothing is matched, and the run
// says which of the two causes that was instead of blaming the profile. A
// position this tool cannot map is a position it must not guess at, so the
// frame is named and the run is blind, never clean.
test('a transformed file with no source map is diagnosed, not called stale', () => {
  const gen = parenOf(path.join(mapped, 'dist', 'unmapped.js'), 'kernel');
  const prof = writeProfile(
    path.join(root, 'tmp', `test-nomap-${process.pid}.cpuprofile`),
    [gen],
    `file://${path.join(mapped, 'dist', 'unmapped.js')}`
  );
  const run = spawnSync(
    process.execPath,
    [path.join(root, 'bin', 'jitmax.ts'), prof, path.join(mapped, 'src')],
    { cwd: root, encoding: 'utf8' }
  );
  fs.unlinkSync(prof);
  assert.match(run.stdout, /0 hot frames matched a function here; 1 did not/);
  assert.match(run.stdout, new RegExp(`unmapped\\.js:${gen.line}:${gen.column}`));
  assert.match(run.stdout, /no source map covers any of those positions/);
  assert.match(run.stdout, /--experimental-transform-types/);
  assert.match(run.stdout, /this is not a clean run/);
  assert.ok(!run.stdout.includes('every hot function is clean'));
  assert.strictEqual(run.status, 1);
});

// Porting is not matching. A position the map DOES cover, that no function
// begins at — here the body's `return` — is still a miss, and the run says so
// with both ends of the port so the reader can find the frame in their own
// profile. Nothing re-matches it by the name in the frame, which would be the
// tool guessing at which function the measured time belongs to.
test('a ported frame that lands on no function is still a miss, at both positions', () => {
  const body = parenOf(path.join(mapped, 'dist', 'work.js'), 'kernel').line + 1;
  const prof = writeProfile(
    path.join(root, 'tmp', `test-portedmiss-${process.pid}.cpuprofile`),
    [{ line: body, column: 5 }],
    `file://${path.join(mapped, 'dist', 'work.js')}`
  );
  const run = spawnSync(
    process.execPath,
    [path.join(root, 'bin', 'jitmax.ts'), prof, path.join(mapped, 'src')],
    { cwd: root, encoding: 'utf8' }
  );
  fs.unlinkSync(prof);
  assert.match(run.stdout, /1 of those positions came back through a source map/);
  assert.match(run.stdout, new RegExp(`src/work\\.ts:\\d+:\\d+ <- .*dist/work\\.js:${body}:5`));
  assert.ok(!run.stdout.includes('every hot function is clean'));
  assert.strictEqual(run.status, 1);
});

/**
 * The threshold reads the project's share of the profile, and time in a
 * dependency is reported as a share, never as a frame the run missed. A
 * profile of this tool checking demo/ spent 71.4% in typescript.js and 4.0%
 * in lib/: at 1% of the whole no lib/ function was hot, and typescript.js was
 * named as measured time the run could not check (BUGS TC-132). Here `kernel`
 * holds 0.5% of the samples and all of the project's.
 */
test('a profile mostly spent in a dependency marks the project code it holds', () => {
  const dir = path.join(root, 'test', 'fixtures', 'profile');
  const prof = path.join(root, 'tmp', `test-partition-${process.pid}.cpuprofile`);
  const frame = (id: number, url: string, line: number, column: number) => ({
    id,
    callFrame: { functionName: 'f', url, lineNumber: line - 1, columnNumber: column - 1 },
  });
  fs.mkdirSync(path.dirname(prof), { recursive: true });
  fs.writeFileSync(prof, JSON.stringify({
    nodes: [
      frame(1, `file://${path.join(dir, 'work.ts')}`, 8, 23),
      frame(2, `file://${path.join(root, 'node_modules', 'typescript', 'lib', 'typescript.js')}`, 9, 1),
      frame(3, 'node:internal/modules/esm/utils', 1, 1),
    ],
    samples: [1, 2, 3],
    timeDeltas: [5, 950, 45],
  }));
  const run = spawnSync(process.execPath, [path.join(root, 'bin', 'jitmax.ts'), prof, dir], {
    cwd: root,
    encoding: 'utf8',
  });
  fs.unlinkSync(prof);
  assert.match(run.stdout, /1 hot function, 1 error/);
  assert.match(run.stdout, /kernel\(\) — 0\.5% of samples/);
  assert.ok(!run.stdout.includes('did not'), `a dependency frame was listed as missed:\n${run.stdout}`);
  assert.match(run.stdout, /self time: project 0\.5%, dependency 95\.0%, node: 4\.5%, engine 0\.0%/);
  assert.strictEqual(run.status, 1);
});

// Positionals are named by suffix, not by slot. With the profile second it was
// read as a source file: no annotations in a .cpuprofile, so the run reported
// `every annotated function is clean` and exited 0 over a profile it never
// opened. Same for a config after a path — suppression silently off.
test('a profile is found wherever it sits in the argument line', () => {
  const dir = path.join(root, 'test', 'fixtures', 'profile');
  const prof = writeProfile(path.join(root, 'tmp', `test-order-${process.pid}.cpuprofile`), [
    { line: 8, column: 23 },
  ]);
  const run = spawnSync(process.execPath, [path.join(root, 'bin', 'jitmax.ts'), dir, prof], {
    cwd: root,
    encoding: 'utf8',
  });
  fs.unlinkSync(prof);
  assert.match(run.stdout, /1 hot function, 1 error/);
  assert.strictEqual(run.status, 1);
});

// A [profile] table in a run with no profile configured nothing and said
// nothing about it — the silence loadConfig() already throws on for a
// misspelled table.
test('min_self_pct without a profile to apply it to is an error, not a no-op', () => {
  const cfg = path.join(root, 'tmp', `test-profcfg-${process.pid}.toml`);
  fs.mkdirSync(path.dirname(cfg), { recursive: true });
  fs.writeFileSync(cfg, '[profile]\nmin_self_pct = 50\n');
  const run = spawnSync(
    process.execPath,
    [path.join(root, 'bin', 'jitmax.ts'), cfg, path.join(root, 'test', 'fixtures', 'profile')],
    { cwd: root, encoding: 'utf8' }
  );
  fs.unlinkSync(cfg);
  assert.match(run.stderr, /applies only to a run given a \.cpuprofile/);
  assert.strictEqual(run.status, 2);
});

// An implicit constructor is not an empty one: it runs the base constructor and
// every field initializer. Reading a class with no constructor member as
// nothing to follow let a `delete` in a base class pass as a clean run — the
// shape TC-10's fix did not anticipate.
test('a base constructor and a field initializer are walked, not assumed empty', () => {
  const run = spawnSync(
    process.execPath,
    [path.join(root, 'bin', 'jitmax.ts'), path.join(root, 'test', 'fixtures', 'inherit')],
    { cwd: root, encoding: 'utf8' }
  );
  assert.match(run.stdout, /fromBase\(\)/);
  assert.match(run.stdout, /error {2}delete-property/);
  assert.match(run.stdout, /fromField\(\)/);
  assert.match(run.stdout, /error {2}chained-allocation/);
  assert.strictEqual(run.status, 1);
});

/**
 * A static field initializer runs when its class is defined, not on each `new`
 * the walk entered through, so a finding reached only through one is a warning
 * that names the initializer, and a run whose only finding it is exits 0.
 * arrow's `Vector` table was an error charged to 30 annotated functions
 * (BUGS TC-107).
 */
test('a finding reached only through a static initializer is a warning', () => {
  const run = spawnSync(
    process.execPath,
    [path.join(root, 'bin', 'jitmax.ts'), path.join(root, 'test', 'fixtures', 'once')],
    { cwd: root, encoding: 'utf8' }
  );
  assert.match(run.stdout, /1 annotated function, 0 errors, 1 warning\n/);
  assert.match(run.stdout, /once\.ts:8:25 {2}warn {2}chained-allocation/);
  assert.match(
    unwrapped(run.stdout),
    /once: reached only through the static initializer Table\.names at test\/fixtures\/once\/once\.ts:8:3/
  );
  assert.strictEqual(run.status, 0);
});

/**
 * A per-call path keeps the error whatever else reaches the body: `both` calls
 * `kindNames` directly as well as through `Kinds.names`, and `viaStatic`
 * reaches it only through the initializer, so the site stays an error in the
 * run and in `both`'s own findings. An instance field runs on every `new`, as a
 * constructor does, and a closure `Kinds.scale` holds runs on every call to it;
 * neither is demoted. Only `Kinds.table` is a warning (BUGS TC-107).
 */
test('a body a per-call path also reaches keeps its error', () => {
  const run = spawnSync(
    process.execPath,
    [path.join(root, 'bin', 'jitmax.ts'), path.join(root, 'test', 'fixtures', 'oncemix')],
    { cwd: root, encoding: 'utf8' }
  );
  assert.match(run.stdout, /2 annotated functions, 3 errors, 1 warning\n/);
  assert.match(run.stdout, /oncemix\.ts:11:10 {2}error {2}chained-allocation/);
  assert.match(run.stdout, /oncemix\.ts:16:25 {2}warn {2}chained-allocation/);
  assert.match(run.stdout, /oncemix\.ts:17:43 {2}error {2}chained-allocation/);
  assert.match(run.stdout, /oncemix\.ts:18:13 {2}error {2}chained-allocation/);
  assert.strictEqual(run.status, 1);

  const byName = findingsByFunction(path.join('test', 'fixtures', 'oncemix'));
  const site = (name: string, line: number) =>
    (byName.get(name) ?? assert.fail(`no mark ${name}`)).filter((f) => f.line === line);
  assert.deepStrictEqual(site('both', 11).map((f) => f.once), [undefined]);
  assert.deepStrictEqual(site('viaStatic', 11).map((f) => f.once?.name), ['Kinds.names']);
  assert.ok(site('viaStatic', 17).every((f) => f.once === undefined));
  assert.ok(site('viaStatic', 18).every((f) => f.once === undefined));
  assert.ok(rawFindings('viaConstructor').every((f) => f.once === undefined));
});

// A concise arrow body IS the returned expression, so there is no
// ReturnStatement to find and the allocation went uncounted — silence on
// exactly the shape bench/select.jl measured.
test('an allocation in a concise arrow body is still an allocation', () => {
  const run = spawnSync(
    process.execPath,
    [path.join(root, 'bin', 'jitmax.ts'), path.join(root, 'test', 'fixtures', 'concise')],
    { cwd: root, encoding: 'utf8' }
  );
  assert.match(run.stdout, /error {2}allocating-select/);
  assert.strictEqual(run.status, 1);
});

// `map` on a Result runs its callback at most once. Matching the method NAME
// alone made it a loop, so `accumulating-spread` claimed quadratic copying on a
// body nothing re-runs — its own silent clause. TC-35 was this defect in
// `chained-allocation`.
test('a run-once callback on a non-array is not a loop', () => {
  const run = spawnSync(
    process.execPath,
    [path.join(root, 'bin', 'jitmax.ts'), path.join(root, 'test', 'fixtures', 'notarray')],
    { cwd: root, encoding: 'utf8' }
  );
  assert.ok(!run.stdout.includes('accumulating-spread'), 'a run-once callback read as a loop');
  // `r.map` is an interface member, so `interface-dispatch` reports the call
  // and the run exits 1 on that alone. This test is about the rule that must
  // NOT be in the output.
  assert.match(run.stdout, /1 error\n/);
  assert.match(run.stdout, /error {2}interface-dispatch/);
});

// Two coverage holes of one class (BUGS TC-84): a file the walk skipped
// silently still counted as covered, and both ended in `0 annotated functions
// … clean` at exit 0.

// `.cjs` was missing from the extension list — `.cts` was in it — so a
// CommonJS file's annotated function was never read. The fixture carries a
// finding: seeing it proves the file was walked, not merely not-crashed-on.
test('an annotated function in a .cjs file is checked, not skipped', () => {
  const run = spawnSync(
    process.execPath,
    [path.join(root, 'bin', 'jitmax.ts'), path.join(root, 'test', 'fixtures', 'cjs')],
    { cwd: root, encoding: 'utf8' }
  );
  assert.match(run.stdout, /error {2}accumulating-spread/);
  assert.strictEqual(run.status, 1);
});

// The node_modules filter ran on the WHOLE path, after the emptiness guard, so
// naming a dependency's directory — the use case scan.ts endorses — dropped
// every file it had just collected and exited 0. The fixture lives in a temp
// tree because node_modules/ is gitignored here.
test('a named path into node_modules is scanned, and an emptied walk is loud', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jitmax-nm-'));
  const dep = path.join(tmp, 'node_modules', 'dep');
  fs.mkdirSync(dep, { recursive: true });
  fs.writeFileSync(
    path.join(dep, 'index.ts'),
    '/** @jitmax */\nexport function gather(xs: number[]): number[] {\n' +
      '  let acc: number[] = [];\n  for (const x of xs) acc = [...acc, x];\n  return acc;\n}\n'
  );
  const named = spawnSync(process.execPath, [path.join(root, 'bin', 'jitmax.ts'), dep], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.match(named.stdout, /error {2}accumulating-spread/);
  assert.strictEqual(named.status, 1);

  // The same tree by its parent: the walk finds only node_modules, the filter
  // empties the list, and that is a refusal at exit 2 — never a clean run.
  const emptied = spawnSync(process.execPath, [path.join(root, 'bin', 'jitmax.ts'), tmp], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.strictEqual(emptied.status, 2);
  assert.match(emptied.stderr, /no source files found/);
});

// A bound only binds what comes AFTER it. A trailing `.slice(0, 10)` slices the
// RESULT, and the stage before it still allocated one element per element of
// the source — so the trailing form was silencing the allocation the rule
// exists for. A literal-length source array bounds the chain for real; TC-54
// named it beside `.slice` and only `.slice` shipped.
test('a chain is bounded by what precedes a stage, not by what follows it', () => {
  const run = spawnSync(
    process.execPath,
    [path.join(root, 'bin', 'jitmax.ts'), path.join(root, 'test', 'fixtures', 'bounds')],
    { cwd: root, encoding: 'utf8' }
  );
  assert.match(run.stdout, /3 annotated functions, 1 error/);
  assert.match(run.stdout, /sliceLast\(\)/);
  assert.ok(!run.stdout.includes('sliceFirst'), 'a leading bound stopped binding');
  assert.ok(!run.stdout.includes('literalSource'), 'a literal-length source is unbounded');
  assert.strictEqual(run.status, 1);
});

// The accumulator of a reduce is re-run per element. `reduce` was missing from
// the set of methods whose callback is a loop body, so the assigning form was
// invisible; `reduceRight` was named nowhere; and the rule's own reduce handler
// never got TC-90's receiver check, so a Result's `reduce` read as a loop.
test('a reduce accumulator is a loop body, and only on an array', () => {
  const run = spawnSync(
    process.execPath,
    [path.join(root, 'bin', 'jitmax.ts'), path.join(root, 'test', 'fixtures', 'reduce')],
    { cwd: root, encoding: 'utf8' }
  );
  assert.match(run.stdout, /assigning\(\)/);
  assert.match(run.stdout, /rightward\(\)/);
  const onceAt = run.stdout.indexOf('runsOnce()');
  assert.ok(onceAt > 0, 'the run-once function was not reported at all');
  assert.ok(
    !run.stdout.slice(onceAt).includes('accumulating-spread'),
    'a run-once callback on a non-array read as a loop'
  );
  assert.strictEqual(run.status, 1);
});

// One run of the shapes fixture, three questions of it. Every defect below is
// megamorphic-elements binding a load to the wrong array, so they share the
// fixture directory and there is no reason to spawn the tool three times.
const shapesRun = spawnSync(
  process.execPath,
  [path.join(root, 'bin', 'jitmax.ts'), path.join(root, 'test', 'fixtures', 'shapes')],
  { cwd: root, encoding: 'utf8' }
);

// Three shape defects at once. The rule required the union array to ARRIVE as
// a parameter, so one built locally was invisible; it filtered intersections
// out of the shape count, so five branded types counted as none; and it
// accepted a load off any value whose type is a MEMBER of the union, so a
// monomorphic read off an unrelated parameter billed the array.
test('a local union array counts, a branded one counts, an unrelated read does not', () => {
  const run = shapesRun;
  assert.match(run.stdout, /6 annotated functions, 4 errors/);
  assert.match(run.stdout, /fromLocal\(\)/);
  assert.match(run.stdout, /branded\(\)/);
  assert.ok(!run.stdout.includes('otherReceiver'), 'a read off an unrelated value billed the array');
  // The fourth is `nestedScopes`, and it reports `rows` — the array its own
  // function loads from — and not `acc`, a write-only local in a SIBLING
  // function. `walk` does not stop at a function boundary, so `acc` borrowed
  // the read in `sum`; six of TypeScript's eight findings were that, under one
  // annotation on a 50,000-line function (BUGS TC-119).
  assert.match(run.stdout, /rows has 5 distinct property sets/);
  assert.ok(
    !run.stdout.includes('acc has 5 distinct property sets'),
    `an array its own function never loads from was billed:\n${run.stdout}`
  );
  assert.strictEqual(run.status, 1);
});

/**
 * Polymorphism written as classes reaches one load site as surely as a union
 * does. Six constructed subclasses of an abstract class counted zero shapes,
 * because only a union type was read, so `sumClasses` passed while `sumUnion`,
 * the same six shapes as type aliases, failed. Both report now, and so do five
 * literal builders reaching an interface-typed array. A walk that sees every
 * origin outranks the hierarchy (`sumOne`), and classes that agree on their
 * property names are one set (`sumSame`) (BUGS TC-104).
 */
test('class hierarchies and builders count as element shapes, beside the union', () => {
  const byName = findingsByFunction(path.join('test', 'fixtures', 'hierarchy'));
  const elements = (name: string) =>
    (byName.get(name) ?? assert.fail(`no mark ${name}`)).filter((f) => f.rule === 'megamorphic-elements');
  const [classes] = elements('sumClasses');
  assert.match(classes?.message ?? '', /rows receives elements with 6 distinct property sets/);
  assert.deepStrictEqual(
    (classes?.related ?? []).filter((r) => r.name.startsWith('class: ')).map((r) => r.name),
    ['class: K1', 'class: K2', 'class: K3', 'class: K4', 'class: K5', 'class: K6']
  );
  assert.match(elements('sumUnion')[0]?.message ?? '', /rows has 6 distinct property sets in its element type/);
  assert.match(elements('sumRows')[0]?.message ?? '', /rows receives elements with 5 distinct property sets/);
  assert.deepStrictEqual(elements('sumOne'), []);
  assert.deepStrictEqual(elements('sumSame'), []);
});

/**
 * A `.filter()` whose predicate tests a discriminant keeps one kind, and the
 * array it builds is counted by the kinds that pass. marked's spacers were
 * billed for all 17 property sets of `Token` where one map reaches the read;
 * `spaced` is that shape and stays silent. `longOnes` filters on something
 * every kind can pass, and still fires (BUGS TC-161).
 */
test('a filter on a discriminant narrows the element shapes it builds', () => {
  const byName = rulesByFunction(path.join('test', 'fixtures', 'filtered'));
  assert.deepStrictEqual(byName.get('spaced'), []);
  assert.deepStrictEqual(byName.get('longOnes'), ['megamorphic-elements']);
});

// Type identity is not value provenance. `probe` is annotated with the whole
// element union, so `(probe as A).a` — the one load in `collect` — satisfied a
// `t === element` test for both arrays in scope, neither of which is ever read.
// Ten of the twenty-nine findings this rule has ever produced on real code were
// this: a collection reported for a load off something else (BUGS TC-101).
test('a collection nothing reads is not billed for a load off a value of its type', () => {
  const run = shapesRun;
  for (const quiet of ['collect()', 'src has 5 distinct property sets', 'out has 5 distinct property sets']) {
    assert.ok(!run.stdout.includes(quiet), `${quiet}: an unread collection was billed:\n${run.stdout}`);
  }
});

// The same defect between two collections of one element type. The read is off
// an element of `items`, and only `items` pays for it (BUGS TC-94).
test('a read off one collection does not bill its same-typed sibling', () => {
  const run = shapesRun;
  assert.match(run.stdout, /items has 5 distinct property sets/);
  assert.ok(
    !run.stdout.includes('spare has 5 distinct property sets'),
    `an array with no read of its own was billed:\n${run.stdout}`
  );
});

// One run of the provenance fixture, three questions of it. `elementFlow`
// answered "did this value come out of this collection" for four forms, and
// everything else returned nothing — which the rule reads as silence, and
// silence is invisible by construction. Six ordinary forms were in that gap
// (BUGS TC-127).
const provenanceRun = spawnSync(
  process.execPath,
  [path.join(root, 'bin', 'jitmax.ts'), path.join(root, 'test', 'fixtures', 'provenance')],
  { cwd: root, encoding: 'utf8' }
);

// Every one of these was silent before 2026-08-31. `guardRows` is the case the
// entry warned about twice over: `find` returns `T | undefined`, so the read
// sits behind a narrowing, and narrowing moves the TYPE and not the provenance.
test('an element-returning method, a destructuring and a named callback reach their collection', () => {
  const run = provenanceRun;
  assert.match(run.stdout, /14 annotated functions, 17 errors/);
  for (const fires of [
    'atRows',
    'atUsed',
    'popRows',
    'popUsed',
    'findRows',
    'findUsed',
    'guardRows',
    'destRows',
    'destUsed',
    'nameRows',
    'nameUsed',
    'arrowRows',
  ]) {
    assert.match(
      run.stdout,
      new RegExp(`${fires} has 5 distinct property sets`),
      `${fires}: the read never reached its collection:\n${run.stdout}`
    );
  }
  assert.strictEqual(run.status, 1);
});

// The half a list of new edges does not have. Each of these arrays is in scope
// beside one the same form does reach, and none of them is read.
test('the same form on a collection nothing read stays silent', () => {
  const run = provenanceRun;
  for (const quiet of [
    'atSpare',
    'popSpare',
    'findSpare',
    'destSpare',
    'nameSpare',
    'letSpare',
    'letA',
  ]) {
    assert.ok(
      !run.stdout.includes(`${quiet} has 5 distinct property sets`),
      `${quiet}: an unread collection was billed:\n${run.stdout}`
    );
  }
});

// `let g = letRows; if (flag) g = letOther` puts both arrays behind one load
// site, and the honest answer is the union of what every write contributes.
// Reading the declaration alone reports the first and drops the second.
test('a reassigned local bills every write, not its declaration', () => {
  const run = provenanceRun;
  assert.match(run.stdout, /letRows has 5 distinct property sets/);
  assert.match(run.stdout, /letOther has 5 distinct property sets/);
});

// A `delete` on something with no hidden class to demote is not this rule's
// mechanism at all. `globalThis` has no declaration saying it is the host, an
// identifier that binds to nothing cannot be claimed to have a map, and an
// array element behind a cast is still an array element — where the printed
// remedy costs the 1.39-1.66x boxing `boxed-elements` was withdrawn over
// (BUGS TC-63, TC-97, TC-121).
test('a delete with no map to demote stays out, and a real one still fires', () => {
  const run = spawnSync(
    process.execPath,
    [path.join(root, 'bin', 'jitmax.ts'), path.join(root, 'test', 'fixtures', 'hostdelete')],
    { cwd: root, encoding: 'utf8' }
  );
  assert.match(run.stdout, /2 annotated functions, 1 error/);
  assert.match(run.stdout, /delete o\[k\] can move an ordinary object into dictionary mode/);
  for (const quiet of ['hostSlot', 'dataset', 'process.env', 'xs as any', 'al as any']) {
    assert.ok(!run.stdout.includes(quiet), `${quiet} was reported:\n${run.stdout}`);
  }
  assert.strictEqual(run.status, 1);
});

// The suppression line is counted per site too. Counting it per mark made one
// disabled line reached from three annotated functions read as "3 findings
// suppressed" — the fan-in TC-62 removed from every count above it, left behind
// in the line underneath.
test('one suppressed line reached from three functions is one suppression', () => {
  const run = spawnSync(
    process.execPath,
    [path.join(root, 'bin', 'jitmax.ts'), path.join(root, 'test', 'fixtures', 'suppress')],
    { cwd: root, encoding: 'utf8' }
  );
  assert.match(run.stdout, /1 finding suppressed \(chained-allocation\)/);
  assert.strictEqual(run.status, 0);
});

// Two legal-source crashes, both exit 2 — "the tool failed" — on programs that
// are nothing of the kind. Tested through the binary because the exit code is
// what a gate reads.
test('mutually recursive consts do not overflow the stack', () => {
  const run = spawnSync(
    process.execPath,
    [path.join(root, 'bin', 'jitmax.ts'), path.join(root, 'test', 'fixtures', 'cycle')],
    { cwd: root, encoding: 'utf8' }
  );
  assert.ok(!run.stderr.includes('Maximum call stack'), run.stderr);
  assert.notStrictEqual(run.status, 2);
});

test('prose in the annotation is prose, not a disable key', () => {
  const run = spawnSync(
    process.execPath,
    [path.join(root, 'bin', 'jitmax.ts'), path.join(root, 'test', 'fixtures', 'tagprose')],
    { cwd: root, encoding: 'utf8' }
  );
  assert.ok(!run.stderr.includes('unknown rule or defect code'), run.stderr);
  assert.strictEqual(run.status, 0);
});

// A module the program cannot resolve makes every type from it `any`, so every
// type-based rule goes quiet — and quiet is what this tool prints as clean. It
// exited 0 on a file it could not read the types of, which is the one shape of
// TC-7 and TC-17 left standing (BUGS TC-51).
test('an unresolved module is named, and the run is never clean', () => {
  const run = spawnSync(
    process.execPath,
    [path.join(root, 'bin', 'jitmax.ts'), path.join(root, 'test', 'fixtures', 'unresolved')],
    { cwd: root, encoding: 'utf8' }
  );
  assert.match(run.stdout, /1 module could not be resolved/);
  assert.match(run.stdout, /no-such-package-anywhere/);
  assert.match(run.stdout, /this is not a clean run/);
  assert.ok(!run.stdout.includes('every annotated function is clean'));
  assert.strictEqual(run.status, 1);
});

// A bare specifier is a missing package OR an alias, and the two have opposite
// fixes. The report offered `npm install` and "check that this run read the
// tsconfig.json defining it" without ever saying WHICH tsconfig.json this run
// read, so the user of TC-80 — whose imports were a `paths` alias and whose
// dependencies were fine — had to read the config and grep the import style
// themselves. Naming the file is what separates the two causes (BUGS TC-80).
test('an unresolved bare specifier names the tsconfig this run read', () => {
  const run = spawnSync(
    process.execPath,
    [path.join(root, 'bin', 'jitmax.ts'), path.join(root, 'test', 'fixtures', 'unresolved')],
    { cwd: root, encoding: 'utf8' }
  );
  assert.match(run.stdout, /no-such-package-anywhere/);
  // The config this run read, by name. `tsconfig.json` at the repository root
  // declares no `paths`, so the specifier is not an alias it knows about.
  assert.match(run.stdout, /tsconfig\.json/);
  assert.match(run.stdout, /no `paths` entry/);
  assert.strictEqual(run.status, 1);
});

// The other cause, and the one the entry was filed about: the alias IS declared
// in the tsconfig the run read and its target is not on disk. `npm install`
// installs nothing that would fix it (BUGS TC-80).
test('a bare specifier that matches a `paths` entry is reported as an alias', () => {
  const dir = path.join(root, 'test', 'fixtures', 'alias');
  const run = spawnSync(process.execPath, [path.join(root, 'bin', 'jitmax.ts')], {
    cwd: dir,
    encoding: 'utf8',
  });
  assert.match(run.stdout, /1 module could not be resolved/);
  assert.match(run.stdout, /matches a `paths` entry in tsconfig\.json/);
  assert.match(run.stdout, /@app\/row/);
  // The wrong advice, gone: nothing here is fixed by installing a package.
  assert.ok(!run.stdout.includes('npm install'), run.stdout);
  assert.strictEqual(run.status, 1);
});

// TC-32, and TC-76 from the other end: the two invocations have to compile the
// same project the same way. `program()` merged the project's options over
// built-in ES2022/NodeNext defaults, so every option the project did NOT set
// kept the tool's — and a tsconfig that leaves `moduleResolution` alone, which
// is most of them, got NodeNext for a path run and its own default for a bare
// one. Same files, same config, one exit 0 and one exit 1 over an alias that
// resolves under the project's own build.
test('a path argument compiles the project the same way a bare run does', () => {
  const dir = path.join(root, 'test', 'fixtures', 'aliasok');
  const runs = [[], ['.']].map((args) =>
    spawnSync(process.execPath, [path.join(root, 'bin', 'jitmax.ts'), ...args], {
      cwd: dir,
      encoding: 'utf8',
    })
  );
  for (const [i, run] of runs.entries()) {
    const how = i === 0 ? 'a bare run' : 'a run given a path';
    assert.ok(!run.stdout.includes('could not be resolved'), `${how}:\n${run.stdout}`);
    assert.match(run.stdout, /every annotated function is clean/);
    assert.strictEqual(run.status, 0, `${how}:\n${run.stdout}`);
  }
});

// The other half of that agreement, and the half the fixture above cannot see
// because it holds no JavaScript. `program()` gave the bare run `parsed.options`
// alone and the path run `{ ...parsed.options, allowJs: true, noEmit: true }`,
// so a project whose tsconfig leaves `allowJs` unset had its `.js` helpers read
// on `jitmax .` and reported unresolved on `jitmax` — "check the path", about a
// file that is on disk — and the loop inside the helper was a finding from one
// invocation and invisible from the other. allowJs and noEmit are the tool's,
// on both invocations, or a path argument chooses more than the file list.
test('a bare run reads a .js callee the way a path run does', () => {
  const dir = path.join(root, 'test', 'fixtures', 'allowjs');
  const runs = [[], ['.']].map((args) =>
    spawnSync(process.execPath, [path.join(root, 'bin', 'jitmax.ts'), ...args], {
      cwd: dir,
      encoding: 'utf8',
    })
  );
  for (const [i, run] of runs.entries()) {
    const how = i === 0 ? 'a bare run' : 'a run given a path';
    assert.ok(!run.stdout.includes('could not be resolved'), `${how}:\n${run.stdout}`);
    assert.match(run.stdout, /accumulating-spread/, `${how}:\n${run.stdout}`);
    assert.match(run.stdout, /helper\.js:3/, `${how}:\n${run.stdout}`);
    assert.strictEqual(run.status, 1, `${how}:\n${run.stdout}`);
  }
});

// TC-76. A tsconfig is found from the WORKING DIRECTORY, never from the path
// argument, so a run launched somewhere else reads a config that governs none
// of the files it was pointed at — and every alias in them goes unresolved.
// The blindness was already reported; which config was in force, and that a
// nearer one exists beside the named path, was not.
test('a tsconfig beside the named path, and not read, is named', () => {
  const run = spawnSync(
    process.execPath,
    [path.join(root, 'bin', 'jitmax.ts'), path.join(root, 'test', 'fixtures', 'alias')],
    { cwd: root, encoding: 'utf8' }
  );
  assert.match(run.stdout, /1 module could not be resolved/);
  assert.match(run.stdout, /test\/fixtures\/alias\/tsconfig\.json/);
  assert.match(run.stdout, /this run did not read/);
  assert.strictEqual(run.status, 1);
});

// TC-124. `isFunctionLike` tests the NODE KIND, and an overload signature and an
// ambient `declare function` are both that kind with nothing inside them. The
// walk had nothing to walk, found nothing, and the run printed "every annotated
// function is clean" at exit 0 over the implementation — the one failure this
// tool exists to prevent, reached by putting JSDoc where JSDoc for an overload
// set conventionally goes.
test('an annotation on an overload signature checks the implementation', () => {
  const run = spawnSync(
    process.execPath,
    [path.join(root, 'bin', 'jitmax.ts'), path.join(root, 'test', 'fixtures', 'bodyless')],
    { cwd: root, encoding: 'utf8' }
  );
  // One function, not two: the signature and its implementation are one
  // function however many of them carry the tag.
  assert.match(run.stdout, /1 annotated function, 1 error/);
  assert.match(run.stdout, /overload\.ts:9\s+grow\(\)/);
  assert.match(run.stdout, /accumulating-spread/);
  assert.ok(!run.stdout.includes('every annotated function is clean'));
  assert.strictEqual(run.status, 1);
});

// The other half: no declaration anywhere has a body, so there is nothing to
// bind the mark to and nothing was checked. That is a blind run, not a clean
// one, and it reaches the exit code through `blinded()` like the other two
// channels do.
test('an annotation with no body anywhere is named, and the run is never clean', () => {
  const run = spawnSync(
    process.execPath,
    [path.join(root, 'bin', 'jitmax.ts'), path.join(root, 'test', 'fixtures', 'bodyless', 'ambient.ts')],
    { cwd: root, encoding: 'utf8' }
  );
  assert.match(run.stdout, /1 annotation sits on a declaration with no body/);
  assert.match(run.stdout, /absent \(test\/fixtures\/bodyless\/ambient\.ts:/);
  assert.match(run.stdout, /this is not a clean run/);
  assert.ok(!run.stdout.includes('every annotated function is clean'));
  assert.strictEqual(run.status, 1);
});

// TC-131. Pointed at a directory whose files carry no annotation at all, the
// tool printed "every annotated function is clean" and exited 0. That is the
// default first-contact path — a user clones this, runs it on their repo before
// marking anything, and is told they passed. Nothing was read.
test('a directory with no annotation is not a clean run', () => {
  const run = spawnSync(
    process.execPath,
    [path.join(root, 'bin', 'jitmax.ts'), path.join(root, 'test', 'fixtures', 'noannot')],
    { cwd: root, encoding: 'utf8' }
  );
  assert.match(run.stdout, /0 annotated functions/);
  assert.match(run.stdout, /nothing was checked, so this is not a clean run/);
  assert.match(run.stdout, /add `\/\*\* @jitmax \*\/` above one hot function/);
  assert.ok(!run.stdout.includes('is clean.'), 'the clean verdict must not appear');
  assert.strictEqual(run.status, 1, 'the text and the exit code have to say the same thing');
});

test('a profile selecting no source function says how to make the next run useful', () => {
  const dir = path.join(root, 'test', 'fixtures', 'profile');
  const prof = writeProfile(
    path.join(root, 'tmp', `test-runtime-only-${process.pid}.cpuprofile`),
    [{ line: 1, column: 1 }],
    'node:internal/modules/esm/utils'
  );
  const run = spawnSync(process.execPath, [path.join(root, 'bin', 'jitmax.ts'), prof, dir], {
    cwd: root,
    encoding: 'utf8',
  });
  fs.unlinkSync(prof);
  assert.match(run.stdout, /0 hot functions/);
  assert.match(run.stdout, /confirm the workload reached this code, or lower/);
  assert.ok(!run.stdout.includes('is clean.'), 'an empty profile selection read as clean');
  assert.strictEqual(run.status, 1);
});

// TC-62. One line reached from three annotated functions is one finding. The
// count used to be the call-graph fan-in: agent-twitter-client reported 118
// errors over 12 distinct lines, and the TypeScript compiler 49 over 5.
test('one line reached from three functions is one finding, not three', () => {
  const run = spawnSync(
    process.execPath,
    [path.join(root, 'bin', 'jitmax.ts'), path.join(root, 'test', 'fixtures', 'fanin')],
    { cwd: root, encoding: 'utf8' }
  );
  assert.match(run.stdout, /3 annotated functions, 1 error/);
  assert.match(run.stdout, /2 repeats of a line already listed/);
  assert.strictEqual(run.status, 1);
});

// A call into Node's own API is counted, never listed. 157 of the 157 notes in
// a run over 67 real files were this, each one advising the reader to inline
// `path.join` (BUGS TC-55).
test('a call into the platform is counted, not listed', () => {
  const run = spawnSync(
    process.execPath,
    [path.join(root, 'bin', 'jitmax.ts'), path.join(root, 'test', 'fixtures', 'platform')],
    { cwd: root, encoding: 'utf8' }
  );
  assert.match(run.stdout, /1 call into the platform/);
  assert.ok(!run.stdout.includes('closed-world'), 'the platform call was listed as a finding');
  assert.strictEqual(run.status, 0);
});

// The dataflow walk says what it lost, or a cutoff turns into a stronger claim
// than the program supports. 64 `go(new A())` call sites hid the 65th
// `go(new B())`: the walk reported ONE implementation, scan.ts followed A as
// the only body that runs, and every rule ran over a call site where B also
// runs (BUGS TC-112).
test('a capped caller walk says so, instead of reporting one implementation', () => {
  const run = spawnSync(
    process.execPath,
    [path.join(root, 'bin', 'jitmax.ts'), path.join(root, 'test', 'fixtures', 'cap')],
    { cwd: root, encoding: 'utf8' }
  );
  assert.match(run.stdout, /more than 64 visible callers of go — not all of them were read/);
  assert.ok(
    !run.stdout.includes('resolved to the one implementation'),
    `a capped walk must not resolve a receiver to one body:\n${run.stdout}`
  );
  assert.strictEqual(run.status, 1);
});

// One `!` used to decide whether a five-map call site was megamorphic or
// monomorphic-and-followed, because lib/flow.ts stripped only parentheses from
// the callee while lib/scan.ts unwrapped it fully. The token is erased before
// V8 sees anything (BUGS TC-113).
test('an erased token does not change what the receiver is', () => {
  const run = spawnSync(
    process.execPath,
    [path.join(root, 'bin', 'jitmax.ts'), path.join(root, 'test', 'fixtures', 'erased')],
    { cwd: root, encoding: 'utf8' }
  );
  assert.match(run.stdout, /error {2}megamorphic-dispatch/);
  assert.match(
    unwrapped(run.stdout),
    /at least 5 implementations built by this program \(A, B, C, D, E\)/
  );
  assert.strictEqual(run.status, 1);
});

// A tsconfig that does not parse must not degrade the run to default compiler
// options and then call the result clean. That is TC-76's degraded run with the
// diagnostic removed (BUGS TC-114).
/** Checks invalid config fails, while explicit paths can replace empty file selections. */
test('a tsconfig that does not parse fails the run', () => {
  fs.mkdirSync(path.join(root, 'tmp'), { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, 'tmp', 'test-badconfig-'));
  const config = path.join(dir, 'tsconfig.json');
  const entry = path.join(dir, 'entry.ts');
  fs.writeFileSync(entry,
    '/** @jitmax */\nexport function k(n: number): number { return n + 1; }\n');
  try {
    const invalid = [
      '{ "compilerOptions": { "strict": true',
      '{ "compilerOptions": { "moduleResolution": "bundlr" } }',
      '{ "compilerOptions": { "strcit": true } }',
      '{ "extends": "./missing.json" }',
      '{ "files": "entry.ts" }',
    ];
    for (const text of invalid) {
      fs.writeFileSync(config, text);
      for (const inputs of [[], ['entry.ts']]) {
        assert.throws(() => program(ts, dir, inputs), /nothing here was checked/);
      }
    }
    fs.writeFileSync(config, invalid[1]!);
    const run = spawnSync(process.execPath,
      [path.join(root, 'bin', 'jitmax.ts'), 'entry.ts'],
      { cwd: dir, encoding: 'utf8' });
    assert.strictEqual(run.status, 2, run.stderr);
    assert.strictEqual(run.stdout, '');
    assert.match(run.stderr, /TS6046/);
    assert.match(run.stderr, /nothing here was checked/);
    fs.writeFileSync(config, JSON.stringify({
      compilerOptions: { module: 'commonjs', moduleResolution: 'nodenext' },
      files: ['entry.ts'],
    }));
    for (const inputs of [[], ['entry.ts']]) {
      const conflict = spawnSync(process.execPath,
        [path.join(root, 'bin', 'jitmax.ts'), ...inputs],
        { cwd: dir, encoding: 'utf8' });
      assert.strictEqual(conflict.status, 2, conflict.stderr);
      assert.strictEqual(conflict.stdout, '');
      assert.match(conflict.stderr, /configuration error/);
      assert.match(conflict.stderr, /tsconfig.json: TS5110/);
      assert.match(conflict.stderr, /nothing here was checked/);
    }
    for (const selection of [{ files: [] }, { include: ['missing/**/*.ts'] }]) {
      fs.writeFileSync(config, JSON.stringify({
        ...selection, compilerOptions: { strict: true },
      }));
      assert.throws(() => program(ts, dir, []), /nothing here was checked/);
      const selected = program(ts, dir, ['entry.ts']);
      assert.ok(selected.getSourceFile(entry));
      assert.strictEqual(selected.getCompilerOptions().strict, true);
    }
  } finally {
    fs.unlinkSync(config);
    fs.unlinkSync(entry);
    fs.rmdirSync(dir);
  }
});

// A method read off a value typed `any` resolves to NOTHING — not to
// lib.es2015's Map — so the platform test never fires and the call became an
// ordinary escape: `calls b.has, which we have no body for`, over a builtin
// nobody can inline and this tool cannot see. That is the `any` erasure TC-111
// gated the megamorphic promotion on, at the classification below it. It is
// blindness, so it goes through `Blind` with the unresolved modules and exits
// 1 — reported, never dropped, and never as a finding about somebody's code.
// A genuinely opaque application callee in the same function must STILL fire,
// or this is silencing the rule rather than aiming it (BUGS TC-129).
test('a method read off an `any` value is blindness, not a callee nobody can read', () => {
  const run = spawnSync(
    process.execPath,
    [path.join(root, 'bin', 'jitmax.ts'), path.join(root, 'test', 'fixtures', 'untyped')],
    { cwd: root, encoding: 'utf8' }
  );
  for (const call of ['a.entries', 'b.has', 'b.get']) {
    assert.ok(
      !run.stdout.includes(`calls ${call}, which we have no body for`),
      `${call} was reported as somebody's unreadable code:\n${run.stdout}`
    );
  }
  assert.match(run.stdout, /3 calls read a method off a value typed `any`/);
  assert.match(run.stdout, /a\.entries/);
  assert.match(run.stdout, /This is not a clean run/);
  assert.ok(
    !run.stdout.includes('every annotated function is clean'),
    `a run that could not see three callees called itself clean:\n${run.stdout}`
  );
  assert.match(run.stdout, /calls opaque, which we have no body for/);
  assert.strictEqual(run.status, 1);
});

// The host, reached three ways the callee's own declaration cannot see:
// `globalThis` augmented from own source resolves to a declaration this program
// wrote, `(0, eval)` resolves to a binary expression with no symbol at all, and
// `process.hrtime` resolves into `@types/node`. None of the three is a body a
// reader can go and look at, so "inline what you need from it" is advice nobody
// can take — the same ground TC-63 took `process.env` off `delete-property` on.
// A genuinely opaque application callee in the same function must STILL fire,
// or this is silencing the rule rather than aiming it (BUGS TC-110).
test('the host is counted, not listed, and opaque application code still fires', () => {
  const run = spawnSync(
    process.execPath,
    [path.join(root, 'bin', 'jitmax.ts'), path.join(root, 'test', 'fixtures', 'host')],
    { cwd: root, encoding: 'utf8' }
  );
  assert.match(run.stdout, /3 calls into the platform, not listed/);
  assert.strictEqual(
    (run.stdout.match(/error {2}closed-world/g) ?? []).length,
    1,
    `one finding for the opaque callee and none for the host:\n${run.stdout}`
  );
  assert.match(run.stdout, /calls opaque/);
  for (const host of ['hostHook', 'eval', 'hrtime']) {
    assert.ok(!run.stdout.includes(host), `${host} was reported as unreadable code`);
  }
  assert.strictEqual(run.status, 1);
});

// The receiver count is taken at EVERY escape, not only where the callee
// resolved to an interface member. `pickOne` is a conditional initializer: no
// function for the callee walk to follow, two sitting in the same file for the
// dataflow walk to name. And `p.emit()` on five classes declared in a `.d.ts`
// is V8's four-map budget exceeded at a call site — `megamorphic-dispatch`'s
// claim, carrying `megamorphic-dispatch`'s benchmark, whether or not the walk
// could read the callee's body. Both used to render as "we have no body for it"
// (BUGS TC-110).
test('an unreadable callee still counts what reaches its receiver', () => {
  const run = spawnSync(
    process.execPath,
    [path.join(root, 'bin', 'jitmax.ts'), path.join(root, 'test', 'fixtures', 'escape')],
    { cwd: root, encoding: 'utf8' }
  );
  // The sentence carrying that count is no longer "which we have no body for":
  // the walk located both bodies and printed their names in the same breath, so
  // it says that it did not follow them, as interface-dispatch (BUGS TC-109,
  // TC-158).
  assert.match(
    unwrapped(run.stdout),
    /interface-dispatch calls pickOne; 2 implementations reach this call \(left\(\), right\(\)\), and their bodies are not followed/
  );
  // Not megamorphic-dispatch's own body detector: P1 through P5 carry ONE
  // property set between them, so `objectShapes` counts 1 and that detector is
  // silent. The finding can only have come through the escape rule.
  assert.match(
    unwrapped(run.stdout),
    /\S+escape\.ts:\d+:\d+\s+error\s+megamorphic-dispatch p reaches this call as at least 5 implementations built by this program \(P1, P2, P3, P4, P5\)/
  );
  assert.strictEqual(run.status, 1);
});

// The same platform, with no `@types/node` anywhere — the state of a real
// checkout whose node_modules is absent. `path.join` then resolves to no
// symbol at all, and the walk reads the import's own specifier instead: a
// `node:*` or `builtinModules` name is the platform no matter what is
// installed. The fixture is copied OUT of this repository first, because in
// here @types/node resolves and the resolved branch (the test above) fires
// instead. A genuinely opaque application callee in the same file must STAY a
// finding — silencing it too would be silencing the rule (BUGS TC-55, TC-69
// cause 1).
test('a platform call with no @types/node is still the platform, and opaque code still fires', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jitmax-builtins-'));
  try {
    fs.copyFileSync(
      path.join(root, 'test', 'fixtures', 'builtins', 'entry.ts'),
      path.join(dir, 'entry.ts')
    );
    const run = spawnSync(process.execPath, [path.join(root, 'bin', 'jitmax.ts'), '.'], {
      cwd: dir,
      encoding: 'utf8',
    });
    assert.match(run.stdout, /1 error\n/);
    assert.match(run.stdout, /2 calls into the platform, not listed/);
    assert.strictEqual(
      (run.stdout.match(/error {2}closed-world/g) ?? []).length,
      1,
      `one finding for the opaque callee and none for the platform:\n${run.stdout}`
    );
    assert.match(run.stdout, /calls opaque/);
    assert.ok(!run.stdout.includes('path.join'), 'path.join was still reported');
    assert.ok(!run.stdout.includes('readFileSync'), 'readFileSync was still reported');
    // Math.max is not a platform CALL: TurboFan lowers it, so no call boundary
    // exists at the site — a version-specific claim, so the line names the V8
    // the list was derived from (BUGS TC-126).
    assert.match(run.stdout, /1 call lowered to inline code, not listed/);
    assert.ok(
      run.stdout.includes(`V8 ${BUILTINS.version} @ ${BUILTINS.revision.slice(0, 10)}`),
      `the lowered line names the pin:\n${run.stdout}`
    );
    assert.notStrictEqual(run.status, 2, run.stderr);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// The lowered-builtin list itself. Derived, never hand-written (BUGS TC-126):
// lowering describes the CALL BOUNDARY, not the work — Array.prototype.sort is
// lowered and still O(n log n) — so the only claim the list may carry is
// membership, and these are the members TC-126 checked against the pinned tree.
test('the lowered list carries the known-lowered names and none of the known-not-lowered', () => {
  for (const name of ['ArrayPrototypeSort', 'MathMax', 'RegExpPrototypeTest']) {
    assert.ok(BUILTINS.lowered.includes(name), `${name} is lowered at the pin and must be listed`);
  }
  for (const name of ['JsonParse', 'ObjectKeys', 'RegExpPrototypeExec']) {
    assert.ok(!BUILTINS.lowered.includes(name), `${name} is not lowered at the pin`);
  }
  // The static spellings scan.ts matches by text, and the two TC-126 names most
  // worth pinning: Math.max is in, JSON.parse can never be.
  assert.ok(BUILTINS.statics.includes('Math.max'));
  assert.ok(!BUILTINS.statics.includes('JSON.parse'));
  // Every static spelling is the spelling of a LOWERED builtin: the mapping
  // selects from the derived list and can never add to it.
  assert.ok(BUILTINS.statics.length <= BUILTINS.lowered.length);
});

// The drift assertion: the committed artifact against what the pinned V8
// source yields today. `make build` regenerates; this test only compares, so a
// stale artifact fails here rather than being silently refreshed. Without the
// gitignored v8src/ checkout the comparison cannot look, and it says so as a
// skip instead of passing quietly — `make v8-check` documents the clone.
test('the committed lowered list is what the pinned V8 source yields', (t) => {
  if (!fs.existsSync(path.join(root, 'v8src'))) {
    t.skip('v8src/ is missing, so the list cannot be re-derived — see CLAUDE.md for the clone');
    return;
  }
  assert.deepStrictEqual(
    deriveBuiltins(root),
    BUILTINS,
    'lib/builtins.ts is stale against v8src — run `make build` and commit the result'
  );
});

// The extraction refuses to derive from nothing: a reducer file with no
// `case Builtin::k…` labels means the file no longer looks like itself, and an
// empty list recorded as a result would silence every closed-world finding on
// the strength of a parse failure.
test('the derivation fails loudly on a source it cannot read a list from', () => {
  assert.throws(() => loweredCases('// nothing resembling a case label'), /no longer looks like/);
});

// The exit code is the contract a CI gate reads, so it is tested through the
// binary too. `closed-world` fires on a callee with no readable body, and it
// used to warn and exit 0 on the argument that no sweep measured that program.
// The annotation is the filter: a user writes `/** @jitmax */` on a
// function they need fast, so a finding on one is actionable by definition and
// a second tier gates nobody. The gap that argued for the tier is still stated
// — TC-33, printed under every finding of the three rules that carry it — and
// tuning is the `[rules]` table and the per-function `-rulename` / `-TC-NN`
// annotations (BUGS TC-33, TC-52).

test('a run whose only finding is closed-world fails it', () => {
  const run = spawnSync(
    process.execPath,
    [path.join(root, 'bin', 'jitmax.ts'), path.join(root, 'test', 'fixtures', 'opaque')],
    { cwd: root, encoding: 'utf8' }
  );
  assert.match(run.stdout, /1 error/);
  assert.match(run.stdout, /error {2}closed-world/);
  assert.match(run.stdout, /known defect: TC-33/);
  assert.ok(!/\bwarn/.test(run.stdout), `a warning survived:\n${run.stdout}`);
  assert.strictEqual(run.status, 1);
});

// TC-10. `new Foo()` is a NewExpression, so the walk stepped over it: a
// constructor in your own source was never checked, and one from a typed
// dependency was never reported as an escape — the closed-world report said the
// world was closed when it was not, which is the failure that rule exists to
// prevent. A class with no constructor of its own is neither: its default
// constructor has no body to follow and nothing to report.
test('the walk enters a constructor, and a class without one is not an escape', () => {
  assert.deepStrictEqual(rules('viaConstructor'), ['chained-allocation']);
});

// TC-70. A derived count reaching prose that assumes it is plural: the numeral
// is right and the word beside it was hand-written. Any sweep rule 13 withdraws
// down to one cell reaches the same sentence, so this is checked rather than
// corrected once.
test('a cell count agrees with the noun beside it', () => {
  for (const [name, e] of Object.entries(EVIDENCE)) {
    for (const text of [e.cost, e.source, e.silent, e.unreported ?? '']) {
      // The lookbehind matters, and both halves of it were found by this test
      // failing on its own first two runs: "the L2 cell there" is a cache level
      // and "the n=100000 cell" is a working set. Neither is a count of cells.
      for (const m of text.matchAll(/(?<![\w.=])(\d+) (cells?)\b/g)) {
        const want = m[1] === '1' ? 'cell' : 'cells';
        assert.strictEqual(m[2], want, `${name}: "${m[0]}" should read "${m[1]} ${want}"`);
      }
    }
  }
});

// Every finding is an error, and no rule may opt out of the exit code. The
// register below is the three rules that SAY, in their own `source`, that no
// sweep ran the program they fire on — `megamorphic-dispatch` joined it on its
// own words: every family in bench/dispatch.jl varies key order, the call
// target or where the function is held, all over one property set, and this
// rule counts property SETS. They warned until 2026-08-31. What states the gap
// now is TC-33 in their `defects`, printed under every finding they make, so a
// rule that drops it has either gained a sweep or quietly stopped admitting the
// gap.
// TC-15 was a rule citing a benchmark that was not in the repository, and the
// sentence it falsified — "every rule includes the benchmark that earned it" —
// is printed in docs/rules.md. `bench/delete.jl` closed it for
// `delete-property`; nothing ever held the sentence, and it went false again
// for `interface-dispatch`, which has no sweep and says so. Both ends are
// checked here: a rule that names a sweep must name one that exists, and a rule
// that names none may not be standing under a claim that every rule has one.
test('every rule names a sweep that exists, and the docs claim no more than that', () => {
  const noSweep: string[] = [];
  for (const [name, e] of Object.entries(EVIDENCE)) {
    const cited = [...e.source.matchAll(/bench\/([\w.-]+\.jl)/g)].map((m) => m[1]!);
    if (cited.length === 0) {
      noSweep.push(name);
      continue;
    }
    for (const file of cited) {
      assert.ok(
        fs.existsSync(path.join(root, 'bench', file)),
        `${name} cites bench/${file} as its evidence, and no such sweep is in the repository (BUGS TC-15)`
      );
    }
  }
  if (noSweep.length === 0) return;
  assert.doesNotMatch(
    doc(path.join('docs', 'rules.md')),
    /\*\*Every rule includes the benchmark that earned it/,
    `${noSweep.join(', ')} name no sweep, so docs/rules.md may not claim that every rule ` +
      'includes the benchmark that earned it'
  );
});

const UNMEASURED_TRIGGER = ['megamorphic-dispatch', 'closed-world', 'interface-dispatch'];

test('every rule reports as an error, and the unmeasured triggers still carry TC-33', () => {
  const mark = markFor('drop');
  // One finding per registered rule, at a column of its own: the report keys a
  // site by rule|file|line|column and would otherwise fold them into one.
  const findings = Object.entries(EVIDENCE).map(([rule, evidence], i) => ({
    file: mark.file,
    line: mark.line,
    column: i + 1,
    rule,
    message: 'm',
    fix: 'f',
    evidence,
  }));
  const out = render(root, [{ mark, findings }]);
  assert.match(out, new RegExp(`, ${findings.length} errors\n`));
  for (const rule of Object.keys(EVIDENCE)) {
    assert.match(out, new RegExp(`error {2}${rule}\n`));
  }
  assert.ok(!/\bwarn/.test(out), `a rule still reports as a warning:\n${out}`);

  for (const name of UNMEASURED_TRIGGER) {
    const e = EVIDENCE[name];
    assert.ok(e, `${name} is registered as unmeasured but is not a rule`);
    assert.ok(
      e.defects?.includes('TC-33'),
      `${name} fires on a program no sweep measured, but no longer carries TC-33 to say so`
    );
  }
});

// BUGS.md's live entries, read as a register: `## TC-44 — <text> (<date>,
// <status>)`. The status is the LAST parenthesised group, so a heading whose
// text carries brackets still parses. The archived `## ✅ FIXED … — TC-17 — …`
// form is deliberately not matched: those are closed entries filed under a
// heading of their own shape, and the plain form is the one an ID resolves to.
function bugEntries(): Array<{ id: string; text: string; status: string }> {
  const src = fs.readFileSync(path.join(root, 'BUGS.md'), 'utf8');
  const out: Array<{ id: string; text: string; status: string }> = [];
  const missed: string[] = [];
  for (const line of src.split('\n')) {
    const m = /^## (TC-\d+) — (.+) \(([^()]*)\)\s*$/.exec(line);
    if (m) out.push({ id: m[1]!, text: m[2]!, status: m[3]! });
    else if (line.startsWith('## TC-')) missed.push(line);
  }
  // Every `## TC-` heading has to parse. This used to be `out.length > 50`,
  // a canary for a regex that stopped matching — but a count is the wrong
  // invariant twice over: it fires when the queue is legitimately pruned (63
  // entries to 46, and it did fire), and it stays quiet when the pattern
  // misses half of what is there. A heading the pattern cannot read is the
  // actual failure, so that is what is asserted.
  assert.deepStrictEqual(missed, [], 'BUGS.md has a `## TC-` heading this pattern cannot read');
  assert.ok(out.length > 0, 'the heading pattern no longer matches BUGS.md');
  return out;
}

// The `known defect:` line under a finding is a promise that the ID resolves to
// ONE entry the reader can go and read. Two sessions appending concurrently
// each take the next free number from a copy the other has already extended,
// and it had happened four times before anything looked (BUGS TC-103).
test('no bug ID heads two entries in BUGS.md', () => {
  const seen = new Map<string, number>();
  for (const { id } of bugEntries()) seen.set(id, (seen.get(id) ?? 0) + 1);
  assert.deepStrictEqual(
    [...seen].filter(([, n]) => n > 1).map(([id]) => id),
    [],
    'renumber the later-filed entry of each pair to a free ID and move its citations'
  );
});

// The defect register, in both directions, because nothing read it at all: two
// of its lines had drifted from the headings they were copied from, and a third
// named TC-82 — closed by TC-69's dataflow — so every `interface-dispatch`
// finding printed `known defect: TC-82` about a defect this repository had
// already fixed (BUGS TC-98).
//
// The third direction is the one that has no register at all: `resolveDisabled`
// reads the codes off `EVIDENCE[].defects` and never off `DEFECT`, so the two
// can diverge either way — a code that is disable-able with no description to
// print, or a description that disables nothing.
test('every defect code is a live BUGS.md entry, and every code a rule cites is described', () => {
  const entries = new Map(bugEntries().map((e) => [e.id, e]));
  for (const [code, description] of Object.entries(DEFECT)) {
    const entry = entries.get(code);
    assert.ok(entry, `DEFECT describes ${code}, which heads no entry in BUGS.md`);
    assert.strictEqual(
      description,
      entry.text.replaceAll('`', ''),
      `DEFECT's line for ${code} has drifted from its BUGS.md heading`
    );
    assert.ok(
      !/\bFIXED\b/.test(entry.status),
      `${code} is "${entry.status}" — a closed defect must not be printed under a finding`
    );
  }
  assert.deepStrictEqual(
    [...new Set(Object.values(EVIDENCE).flatMap((e) => e.defects))].sort(),
    Object.keys(DEFECT).sort(),
    'a code a rule carries has no description, or a description names no rule'
  );
  for (const code of Object.keys(DEFECT)) {
    assert.ok(resolveDisabled([code]).size > 0, `${code} is described but disables no rule`);
  }
});

// `--all` is what a release measures, and the list is declared rather than
// derived so that adding a cell to the table is not silently also a change to
// what a release measures. Declaring it one-sidedly was the silence: three
// sweeps sat in the table outside `ALL`, `--all` wrote a manifest row per sweep
// it ran and said nothing about the third of the table it had skipped, and one
// of them is the sweep megamorphic-elements cites (BUGS TC-99).
test('every declared sweep is either run by --all or excluded with a reason', () => {
  assert.deepStrictEqual(
    [...ALL_SWEEPS, ...Object.keys(NOT_ALL)].sort(),
    Object.keys(BENCHMARKS).sort(),
    'a sweep in the table and in neither list is one --all would skip without a word'
  );
  assert.strictEqual(new Set(ALL_SWEEPS).size, ALL_SWEEPS.length, 'a sweep is listed twice');
});

// "Never dispatch on a variant string inside a timed loop. Resolve the kernel
// to a function once, before timing." The rule is in CLAUDE.md because a
// `switch` in a timed region produced a wrong result here, and six workloads
// were converted to a BUILD table of one function per variant. Three were not,
// and nothing said so for two weeks (BUGS TC-22): `select.ts` compares inside
// `scanHeap`, `scanNumber` and `minOf` — which `scanLocal` calls 32 times per
// repetition — and `spread.ts` and `spread-object.ts` compare inside `build()`.
//
// A reference to `variant` inside ANY function of a workload is what this
// reads, which is broader than "inside the timed region" and is the half a
// parser can be sure of: the module-scope references are the resolution the
// rule asks for, and every function in these files is called from a timed
// region. The scripts come from the sweep table, so a new workload is read
// without being added anywhere.
//
// The three are NOT fixed here. Converting them changes the code the published
// cells of select.jl, spread.jl and spread-object.jl were measured against, and
// a file that no longer is what was measured is worse than the untaken branch
// in it — those are 66 rows and three rules' evidence. The register is what
// keeps the three visible and a fourth impossible; closing it is a
// re-measurement, and the owner's call.
const DISPATCHES_INSIDE: Record<string, number> = {
  'select.ts': 3,
  'spread-object.ts': 2,
  'spread.ts': 2,
};

test('no workload reads the variant string inside a function except the three on record', () => {
  const scripts = new Set<string>();
  for (const name of Object.keys(BENCHMARKS)) {
    for (const c of plan(BENCHMARKS[name]!)) scripts.add(c.script);
  }
  assert.ok(scripts.size > 10, 'the sweep table no longer names its workloads');

  const isFunction = (n: TS.Node): boolean =>
    ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) ||
    ts.isMethodDeclaration(n) || ts.isConstructorDeclaration(n) ||
    ts.isGetAccessorDeclaration(n) || ts.isSetAccessorDeclaration(n);
  // A declaration of the name, and a property key that merely spells it, are
  // not reads of the module's `variant`. The shorthand `{ variant }` is.
  const declares = (n: TS.Node): boolean => {
    const p = n.parent as TS.NamedDeclaration | undefined;
    if (!p) return false;
    if (ts.isPropertyAssignment(p) && p.name === n) return true;
    return (ts.isParameter(p) || ts.isVariableDeclaration(p) || ts.isBindingElement(p)) && p.name === n;
  };

  const found: Record<string, number> = {};
  for (const script of [...scripts].sort()) {
    const src = ts.createSourceFile(
      script, fs.readFileSync(script, 'utf8'), ts.ScriptTarget.ESNext, true
    );
    let inside = 0;
    const walk = (n: TS.Node, inFn: boolean): void => {
      if (inFn && ts.isIdentifier(n) && n.text === 'variant' && !declares(n)) inside++;
      n.forEachChild((c) => { walk(c, inFn || isFunction(n)); });
    };
    walk(src, false);
    if (inside > 0) found[path.basename(script)] = inside;
  }

  assert.deepStrictEqual(
    found,
    DISPATCHES_INSIDE,
    'a workload reads `variant` inside a function that a timed region calls. Resolve it to a ' +
      'function once, before timing — or, if the three on record were converted, the cells they ' +
      'were measured against have moved and the register goes with them'
  );
});

// The end-to-end examples. Each `.before.ts` is a function a library ships and
// must report exactly the finding its header quotes; each `.after.ts` carries
// that fix and must be silent. If an after half ever regains a finding, the
// pair it was measured as is no longer the pair in the file.

test('every example before half reports its finding and every after half is clean', () => {
  const dir = path.join(root, 'examples');
  const { checker, marks } = scan(ts, program(ts, root, [dir]));
  const byFile = new Map(
    marks.map((m) => [path.basename(m.file), check(ts, checker, m).map((f) => f.rule)])
  );
  assert.deepStrictEqual(
    Object.fromEntries([...byFile].sort()),
    {
      'estoolkit-omit.after.ts': [],
      'estoolkit-omit.before.ts': ['delete-property'],
      'radash-assign.after.ts': [],
      'radash-assign.before.ts': ['accumulating-spread'],
      'remeda-merge-all.after.ts': [],
      'remeda-merge-all.before.ts': ['accumulating-spread'],
      'zod-clean-enum.after.ts': [],
      'zod-clean-enum.before.ts': ['chained-allocation'],
    }
  );
});

test('object example rewrites preserve copied properties', async () => {
  const { assign } = await import('../examples/radash-assign.after.ts');
  const { mergeAll } = await import('../examples/remeda-merge-all.after.ts');
  const { omit } = await import('../examples/estoolkit-omit.after.ts');
  const symbol = Symbol('setting');
  const input = JSON.parse('{"__proto__":{"enabled":true},"setting":4,"1":"one"}');
  input[symbol] = 5;
  Object.defineProperty(input, 'hidden', { value: 6 });
  let setters = 0;
  Object.defineProperty(Object.prototype, 'setting', {
    set() { setters++; }, configurable: true,
  });
  try {
    for (const result of [assign({}, input), mergeAll([input]), omit(input, [])]) {
      assert.strictEqual(Object.getPrototypeOf(result), Object.prototype);
      assert.deepStrictEqual(Object.getOwnPropertyDescriptor(result, '__proto__'), {
        value: { enabled: true }, writable: true, enumerable: true, configurable: true,
      });
      assert.strictEqual(Object.getOwnPropertyDescriptor(result, 'setting')?.value, 4);
      assert.strictEqual(Object.hasOwn(result, 'hidden'), false);
    }
    assert.strictEqual(setters, 0);
    assert.deepStrictEqual(mergeAll([input]), { ...input });
    assert.deepStrictEqual(omit(input, [symbol, 1]), {
      ['__proto__']: { enabled: true }, setting: 4,
    });
    let reads = 0;
    const source = { get dropped() { reads++; return 1; }, keep: 2 };
    assert.deepStrictEqual(omit(source, ['dropped']), { keep: 2 });
    assert.strictEqual(reads, 1);
    let keyReads = 0;
    const keys = Object.defineProperty(['dropped' as const], '0', {
      get() { keyReads++; return 'dropped'; },
    });
    assert.deepStrictEqual(omit(source, keys), { keep: 2 });
    assert.strictEqual(keyReads, 1);
    const run = spawnSync(process.execPath, ['examples/config-check.ts'], {
      cwd: root, encoding: 'utf8',
    });
    assert.strictEqual(run.status, 0, run.stderr || run.stdout);
  } finally {
    Reflect.deleteProperty(Object.prototype, 'setting');
  }
});

// The licence of somebody else's code, checked the way every number here is
// checked. `examples/` redistributes four MIT libraries, and MIT requires the
// permission notice to travel with each of them. That was wrong from the day
// the directory landed until TC-29 found it — an audit found it, and no test
// could have, because nothing read the licence text at all. This reads it.
//
// Both directions on purpose. A fifth vendored library with no entry is the
// defect TC-29 was; an entry naming a file that no longer exists is a notice
// that has stopped describing what it covers.
test('every vendored example is covered by the MIT notice, and the notice covers nothing else', () => {
  const dir = path.join(root, 'examples');
  const notice = fs.readFileSync(path.join(dir, 'LICENSE-MIT'), 'utf8');
  const vendored = fs.readdirSync(dir).filter((f) => f.endsWith('.before.ts')).sort();

  assert.ok(vendored.length > 0, 'examples/ holds no vendored file — the glob is wrong');

  for (const file of vendored) {
    const header = fs.readFileSync(path.join(dir, file), 'utf8').split('\n').slice(0, 4);
    const copyright = header
      .map((l) => l.replace(/^\/\/ ?/, '').trim())
      .find((l) => l.startsWith('Copyright (c)'));
    assert.ok(copyright, `${file} carries no copyright line`);
    assert.ok(
      notice.includes(copyright),
      `examples/LICENSE-MIT does not carry ${file}'s copyright line: ${copyright}`
    );
    assert.ok(
      notice.includes(file),
      `examples/LICENSE-MIT does not name ${file} among the files it covers`
    );
  }

  // The permission notice itself, not a paraphrase of it. MIT names this
  // sentence as the thing that must travel; a notice missing it is attribution.
  assert.ok(
    notice.includes(
      'The above copyright notice and this permission notice shall be included in all'
    ),
    'examples/LICENSE-MIT is missing the MIT permission notice'
  );

  const named = [...notice.matchAll(/→ (.+)/g)].flatMap((m) =>
    m[1].split(',').map((s) => s.trim())
  );
  for (const file of named) {
    assert.ok(
      fs.existsSync(path.join(dir, file)),
      `examples/LICENSE-MIT covers ${file}, which is not in examples/`
    );
  }
});

// The published page is the surface most people read, and until this test it
// was the only one where a number could go stale in silence. The docs' prose is
// checked above and `EVIDENCE` interpolates `N` directly; site/index.html had
// six figures typed by hand. That is the defect TC-28 was, on the page rather
// than in a clause.
//
// Every ratio on the page must BE a value in the derived table — not merely
// look like one. A sweep that moves therefore breaks the build instead of
// leaving the page quoting a measurement that no longer exists.
// The docs narrate history, so the page's rule — every ratio must BE a derived
// value — would fail on honest sentences: a superseded range quoted AS
// superseded, a withdrawn rule's cost, the three sweeps of a cell rule 13
// refuses. The register below is the shape that works. Every ratio in the
// published prose is either derived or listed here with the reason it is not,
// so a NEW typed ratio fails the build while history stays sayable (TC-73).
const HISTORICAL: Record<string, string> = {
  // Superseded ranges, quoted as superseded.
  '4.42-4.79x': 'closed-world before three replications, quoted as what it used to read',
  '3.21-4.95x': 'closed-world before rule 13 withdrew its n=100000 cell',
  // Rules this project withdrew. Their costs are real and ship nothing — and
  // where the rows are still in the repo the cost is DERIVED like every other,
  // withdrawn rule or not: `boxed-elements`' three figures read out of
  // bench/arrays.jl and left this register on 2026-09-01 (BUGS TC-14).
  '1.21-1.34x': 'the post-construction property add, refuted and shipping no rule',
  '0x': 'the delete-on-a-singleton refutation this project published and then overturned',
  '6.17-6.34x': 'the 16-keyed-store dictionary effect: measured, no rule, BUGS TC-12',
  // The three sweeps of a cell rule 13 refuses, printed as the refutation.
  '1.64x': 'one of three disagreeing sweeps, quoted to show they disagree',
  '0.91x': 'one of three disagreeing sweeps, quoted to show they disagree',
  // `0.89x` stood here for the same reason and is now DERIVED: the select
  // number cell at n=100000 was re-measured and disagrees at 0.89x, 0.97x and
  // 1.03x, so `select.silent.number.withdrawn` quotes the figure out of the
  // rows (BUGS TC-134). The register refuses an entry the data now supplies.
  // Ordinary prose, not a measurement of anything.
  '1.10x': "rule 6's broad-warning point-estimate bar, a protocol constant",
  '2x': "the calibration tolerance: a cell missing 120ms by more than this throws",
  '5x': 'an anecdote about what %GetOptimizationStatus reported during a slowdown',
};

test('every ratio in the published prose is derived, or registered as history', () => {
  const prose = docProse().replace(/[\u2013\u2014]/g, '-');
  const RATIO = /\b\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?x\b/g;
  const values = new Set<string>(Object.values(N));
  for (const v of Object.values(N)) for (const m of v.matchAll(RATIO)) values.add(m[0]);

  const quoted = [...new Set([...prose.matchAll(RATIO)].map((m) => m[0]))];
  assert.ok(quoted.length > 0, 'the docs quote no ratios — the regex has stopped matching');

  const unexplained = quoted.filter((q) => !values.has(q) && !(q in HISTORICAL));
  assert.deepStrictEqual(
    unexplained,
    [],
    `the docs quote ${unexplained.join(', ')}, which is neither a derived number nor ` +
      'registered as history. Derive it, or add it to HISTORICAL with the reason it cannot be.'
  );

  // The register may not outlive what it explains: an entry that becomes a
  // derived value, or stops appearing, is a line nobody will notice is stale.
  const dead = Object.keys(HISTORICAL).filter((h) => !quoted.includes(h) || values.has(h));
  assert.deepStrictEqual(dead, [], `HISTORICAL still lists ${dead.join(', ')}, which the docs no longer need it for`);
});

// Rule 6's other verdict, and the one the page could swallow. `unreplicable`
// citations announce themselves — the number they render IS three sweeps that
// disagree, so a reader cannot miss what it is. A `rejected` one renders an
// ordinary-looking interval, and the only thing saying the cell failed the bar
// its rule ships under is a flag in lib/derive.ts. `chained-allocation` is the
// one rule held to the broad-warning bar, its only end-to-end instance is
// rejected at one of two sizes, and docs/rules.md pointed at the table and said
// nothing (BUGS TC-83). The rule reference is where a reader goes to find out
// what a rule costs, so the rejection is stated there, beside the cost.
test('a cell published as a rule-6 rejection is named as one in the rule reference', () => {
  const reference = doc(path.join('docs', 'rules.md')).replace(/[–—]/g, '-');
  const table = N as Record<string, string>;
  const flagged = Object.keys(CITATIONS).filter((k) => CITATIONS[k]!.rejected);
  assert.ok(
    flagged.length > 0,
    'no citation is flagged `rejected` — this register has nothing left to hold'
  );
  for (const key of flagged) {
    const value = table[key]!;
    const at = [...reference.matchAll(new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))];
    assert.ok(
      at.length > 0,
      `docs/rules.md does not quote ${key} = ${value}, which lib/derive.ts publishes as a rule-6 rejection`
    );
    for (const m of at) {
      const around = reference.slice(Math.max(0, m.index - 400), m.index + 400);
      assert.match(
        around,
        /reject/i,
        `docs/rules.md quotes ${key} = ${value} without saying it is rejected under rule 6`
      );
    }
  }
});

// examples/README.md's two end-to-end tables print every sweep of every example
// cell and the interval each cell's three sweeps share. The register above
// cannot see one of them: they are bare decimals with no trailing `x`, so
// `RATIO` never matched one, HISTORICAL never had to explain one, and
// `make test` stayed green whatever they said. All of them were right the day
// they were typed and nothing would ever have said otherwise again. This reads
// them back out of that file and re-derives each from the rows.
//
// Read back rather than generated: the numbers are the half that drifts, and
// the rest of a row is editorial — which finding fired, REJECTED, DISAGREES,
// two sizes paired on one line — so generating them would move a page's layout
// into lib/derive.ts and both tables into the one generated block, 120 lines
// above the argument they belong to.
//
// The table spells a library the way a reader says it and the sweep spells it
// the way `examples/` names the fixture. Neither derives from the other, so the
// pairing is written down; a wrong pairing fails below on every number in the
// row.
const EXAMPLE: Record<string, string> = {
  'radash `assign`': 'radash-assign',
  'remeda `mergeAll`': 'remeda-merge-all',
  'es-toolkit `omit`': 'estoolkit-omit',
  'zod `cleanEnum`': 'zod-clean-enum',
};

test('every number in the end-to-end tables is what bench/example.jl says', () => {
  const readme = doc(path.join('examples', 'README.md')).replace(/[\u2013\u2014]/g, '-');

  const cells = new Map<string, Row[]>();
  for (const r of rows(root, 'example.jl').filter(current)) {
    const key = `${r.example}|${r.mode}|${r.n}`;
    const at = cells.get(key);
    if (at) at.push(r);
    else cells.set(key, [r]);
  }
  // In sweep order, because that is the order the table prints them in and a
  // set of three numbers is not the same claim as three numbers in order.
  const cell = (key: string): Row[] =>
    (cells.get(key) ?? assert.fail(`bench/example.jl has no cell ${key}`))
      .slice()
      .sort((a, b) => a.replicate! - b.replicate!);

  // Two places throughout both tables, whatever the magnitude — these are eight
  // paired cells read against each other, not eight independent headlines.
  const two = (v: number): string => v.toFixed(2);
  const sweeps = (key: string): string => cell(key).map((r) => two(r.ratio!)).join(' / ');
  const agreed = (key: string): string => {
    const shared = agreement(cell(key));
    if (!shared) return '**none - DISAGREES**';
    const lo = two(shared.lo);
    const hi = two(shared.hi);
    // An agreement containing 1.0 is a cell where the fix is worth nothing, and
    // the table says so rather than leaving a reader to test the ends. The
    // verdict is rule 6's, imported from the funnel that enforces it — a second
    // spelling of the predicate here is how it lived only in a terminal string
    // for a year (BUGS TC-84).
    const rejected = spans1(shared) ? ', REJECTED' : '';
    return `**${lo === hi ? lo : `${lo}-${hi}`}${rejected}**`;
  };

  const printed = new Set<string>();
  const tables = [
    ['| Function, and the finding | n | three sweeps | agreement |', 'incl'],
    ['| Function | n | three sweeps | agreement |', 'excl'],
  ] as const;
  for (const [header, mode] of tables) {
    const at = readme.indexOf(header);
    assert.notStrictEqual(at, -1, `examples/README.md has lost the table headed ${header}`);
    let read = 0;
    for (const line of readme.slice(at).split('\n').slice(2)) {
      if (!line.startsWith('|')) break;
      read++;
      const [name, ns, three, agree] = line.split('|').slice(1, -1).map((c) => c.trim());
      // The finding the row is about follows the function name; the sweep is
      // named by the function alone.
      const lib = name!.split(' - ')[0]!.trim();
      const example = EXAMPLE[lib] ?? assert.fail(`no sweep of example.jl is named ${lib}`);
      // One row carries two sizes, joined by a middot in all three columns.
      const keys = ns!.split('/').map((n) => `${example}|${mode}|${n.trim()}`);
      for (const key of keys) printed.add(key);
      assert.strictEqual(three, keys.map(sweeps).join(' \u00b7 '), `${lib} n=${ns}: three sweeps`);
      assert.strictEqual(agree, keys.map(agreed).join(' \u00b7 '), `${lib} n=${ns}: agreement`);
    }
    assert.ok(read > 0, `the table headed ${header} has lost its rows`);
  }

  // Both directions, like every other register here: a cell that stops being
  // printed is a measurement that left the page and said nothing.
  assert.deepStrictEqual(
    [...printed].sort(),
    [...cells.keys()].sort(),
    'the end-to-end tables and bench/example.jl no longer cover the same cells'
  );
});

test('every ratio on the published page is a derived number', () => {
  const page = fs.readFileSync(path.join(root, 'site', 'index.html'), 'utf8')
    .replace(/&ndash;|&mdash;|[–—]/g, '-');
  // The derived strings, and the individual ratios inside them. A citation
  // whose aggregate is `points` renders "6.48x and 6.58x and 7.51x" — three
  // sweeps of a cell rule 13 withdrew — and prose quotes those three with
  // commas and an "and", which no whole-string comparison can match. So the
  // page may quote a derived string or any ratio the derived data contains,
  // and nothing else.
  const RATIO = /\b\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?x\b/g;
  const values = new Set(Object.values(N));
  for (const v of Object.values(N)) {
    for (const m of v.matchAll(RATIO)) values.add(m[0]);
  }

  // A ratio is a number, or a range of them, followed by x: `4.4-11.5x`,
  // `149-166x`, `0.03x`. Version strings and pixel counts have no x and do not
  // match.
  const quoted = [...page.matchAll(RATIO)].map((m) => m[0]);
  assert.ok(quoted.length > 0, 'site/index.html quotes no ratios — the regex has stopped matching');

  const stale = [...new Set(quoted)].filter((q) => !values.has(q));
  assert.deepStrictEqual(
    stale,
    [],
    `site/index.html quotes ${stale.join(', ')}, which lib/numbers.ts does not contain — ` +
      'run `make numbers` and update the page, or the page is quoting a sweep that is gone'
  );
});

// The version and the rule count are stated in prose on the published
// surfaces and nowhere derived, which is how README came to say "seven rules"
// on line 906 while line 681 said "all eight" — a rule had been added and one
// of the two sentences moved. package.json is the one statement of the
// version and `EVIDENCE` the one register of the rules; every surface that
// claims a total is held to them here, and the split into seven doc files
// added two more places a total can be claimed (BUGS TC-123 is the same defect
// in the release gate).
//
// Each surface is matched at its OWN sentence rather than by scanning for
// `vX.Y.Z`, because README quotes Node's version and V8's too, and a release
// that bumped only one of the two surfaces is the drift this catches.
test('every published surface states this version and this many rules', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
    version: string;
  };
  const lock = JSON.parse(doc('package-lock.json')) as {
    version: string;
    packages: { '': { version: string } };
  };
  assert.strictEqual(lock.version, pkg.version, 'package-lock.json root version');
  assert.strictEqual(lock.packages[''].version, pkg.version, 'package-lock.json package version');
  const readme = doc('README.md');
  const page = fs.readFileSync(path.join(root, 'site', 'index.html'), 'utf8');

  const stated: [string, string, RegExp][] = [
    ['README.md', readme, /^Status: v(\d+\.\d+\.\d+),/m],
    ['site/index.html', page, /v(\d+\.\d+\.\d+), <strong>GPL/],
    ['lib/version.ts', doc('lib/version.ts'), /VERSION = '(\d+\.\d+\.\d+)'/],
  ];
  for (const [name, text, re] of stated) {
    const m = text.match(re);
    assert.ok(m, `${name} no longer states a version where this test looks: ${re}`);
    assert.strictEqual(m[1], pkg.version, `${name} states v${m[1]}; package.json says ${pkg.version}`);
  }

  // Every sentence that claims a TOTAL, on BOTH surfaces. Matching two
  // hand-picked sentences was not enough: "Seven rules ship." shipped on both
  // published pages while this test was green, because the first draft looked
  // only at "all N rules" and the Status line (BUGS TC-125). A subset count
  // like "the two rules twelve libraries never exercised" is not a total and
  // must not be matched, so the totals are enumerated by their phrasing.
  const WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  const count = Object.keys(EVIDENCE).length;
  const TOTALS = [
    /\ball ([a-z]+) rules\b/gi,
    /\b([a-z]+) rules ship\b/gi,
    /Status: v\d+\.\d+\.\d+, [^,]+, ([a-z]+) rules\b/g,
  ];
  for (const [name, text] of [
    ...DOCS.map((f) => [f, doc(f)] as const),
    ['site/index.html', page] as const,
  ]) {
    const claimed = TOTALS.flatMap((re) => [...text.matchAll(re)].map((m) => m[1].toLowerCase()));
    if (claimed.length === 0) continue;
    const wrong = [...new Set(claimed)].filter((c) => c !== WORD[count]);
    assert.deepStrictEqual(
      wrong,
      [],
      `${name} claims ${wrong.join('/')} rules in total; lib/rules/index.ts registers ${count} (${WORD[count]})`
    );
  }

  // The test count test/README.md prints beside `make test`. It was 67 against
  // a real 126 — the same hand-typed-figure defect, on the line a reader of the
  // suite is most likely to check first (BUGS TC-125).
  const suite = doc(path.join('test', 'README.md'));
  const claimedTests = suite.match(/make test\s+#\s*(\d+) unit tests/);
  assert.ok(claimedTests, 'test/README.md no longer prints a test count beside `make test`');
  const real =
    (fs.readFileSync(path.join(root, 'test', 'check.test.ts'), 'utf8').match(/^test\(/gm) ?? []).length +
    (fs.readFileSync(path.join(root, 'test', 'tiers.test.ts'), 'utf8').match(/^test\(/gm) ?? []).length +
    (fs.readFileSync(path.join(root, 'test', 'provenance.test.ts'), 'utf8').match(/^test\(/gm) ?? []).length;
  assert.strictEqual(
    Number(claimedTests[1]),
    real,
    `test/README.md says ${claimedTests[1]} unit tests; the test files define ${real}`
  );
});

/**
 * Checks the installed executable contract using the package manifest.
 * Assumes Git and tar are available in the development checkout.
 * Verifies runtime, licences and user guides ship without internal notes.
 */
test('installed copies support Bun source and explicit Node builds', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
    bin: Record<string, string>;
    files: string[];
    scripts: Record<string, string>;
    peerDependencies: Record<string, string>;
  };

  // Explicit Node invocation needs JavaScript under node_modules.
  const entry = pkg.bin.jitmax;
  assert.ok(entry.endsWith('.js'), `package.json bin.jitmax is ${entry}; Node cannot strip types under node_modules`);
  assert.ok(fs.existsSync(path.join(root, entry)), `package.json bin.jitmax names ${entry}, which does not exist`);
  assert.strictEqual(doc(entry).split('\n')[0], '#!/usr/bin/env bun',
    'bunx must use Bun to run source under node_modules without prepare');
  // Bun can load source when dependency lifecycle scripts are blocked.
  assert.ok(fs.existsSync(path.join(root, 'bin', 'jitmax.ts')));

  // Node loads the compiled entry emitted by prepare and included in packs.
  assert.ok(pkg.files.includes('dist/'), 'package.json files no longer ships dist/');
  const guides = DOCS.filter((file) => file !== path.join('test', 'README.md'))
    .map((file) => file.split(path.sep).join('/'));
  const required = ['bin/cli.js', 'bin/jitmax.ts', 'lib/rules/index.ts',
    'package.json', 'LICENSE', 'examples/LICENSE-MIT',
    'examples/megamorphic/jitmax.toml', 'examples/config-check.ts',
    'bench/shape-sets.jl', 'demo/demo.gif', ...guides];
  for (const file of ['examples/megamorphic/jitmax.toml', 'examples/LICENSE-MIT', ...guides]) {
    assert.ok(pkg.files.includes(file), `package.json files must ship ${file}`);
    assert.ok(fs.existsSync(path.join(root, file)), `${file} must exist`);
  }
  assert.deepStrictEqual(pkg.files.filter((file) => file.endsWith('.md')).sort(), guides.sort());
  assert.ok(!pkg.files.includes('docs/'), 'package docs must use the explicit guide list');
  for (const file of ['bin/', 'lib/', 'LICENSE', 'demo/demo.gif'])
    assert.ok(pkg.files.includes(file), `package.json files must ship ${file}`);
  const archive = spawnSync('git', ['archive', '--worktree-attributes', 'HEAD'], {
    cwd: root, maxBuffer: 16 * 1024 * 1024,
  });
  assert.strictEqual(archive.status, 0, String(archive.stderr || archive.error));
  const listing = spawnSync('tar', ['-tf', '-'], {
    input: archive.stdout, encoding: 'utf8',
  });
  assert.strictEqual(listing.status, 0, String(listing.stderr || listing.error));
  const files = listing.stdout.trim().split('\n');
  assert.deepStrictEqual(files.filter((file) => file.endsWith('.md')).sort(), guides.sort());
  assert.ok(!files.some((file) => /^\.(?:claude|diary|ship)(?:\/|$)/.test(file)),
    'source archives must exclude internal working notes');
  for (const file of required)
    assert.ok(files.includes(file), `source archives must retain ${file}`);
  assert.match(pkg.scripts.prepare ?? '', /tsconfig\.build\.json/);
  const build = JSON.parse(fs.readFileSync(path.join(root, 'tsconfig.build.json'), 'utf8')) as {
    compilerOptions: { noEmit: boolean; outDir: string };
  };
  assert.strictEqual(build.compilerOptions.noEmit, false, 'tsconfig.build.json emits nothing');
  assert.strictEqual(build.compilerOptions.outDir, 'dist');

  // TypeScript 7 is the native rewrite: no `ts.sys` and no `ts.createProgram`,
  // which is every call lib/ts.ts makes. An open `>=5.0.0` let a fresh install
  // resolve it, so the tool was dead on arrival for anyone who had not pinned
  // 5.x themselves — invisible here, because this repo develops against 5.9.
  const upper = pkg.peerDependencies.typescript.match(/<\s*(\d+)/);
  assert.ok(upper, `peerDependencies.typescript is ${pkg.peerDependencies.typescript}, which has no upper bound`);
  assert.ok(
    Number(upper[1]) <= 6,
    `peerDependencies.typescript allows TypeScript ${upper[1]}; ts.sys and ts.createProgram are gone from 7`
  );
});

// Protocol rule 13 — three whole sweeps per published cell, and agreement is a
// value common to all three intervals — had no code path to publication.
// `replicates()` lives in bench/driver.ts and was called from exactly two
// places: bench/run.ts, where it prints the word DISAGREES to a terminal while
// a sweep runs, and bench/tc11-report.ts. `lib/derive.ts` never called it and
// neither did any test, so a cell that refuted itself was withdrawn only when a
// human happened to re-read its rows. Twelve did not get re-read (BUGS TC-37).
//
// `lib/derive.ts` now withdraws them where the number is made, so this test is
// no longer the enforcement — it is the register. A NEW disagreement fails the
// build, and a listed cell that starts agreeing fails it too, because a stale
// exception list is how this became invisible in the first place. The check
// itself is `unreplicable()`, imported rather than re-implemented: a second
// copy of rule 13 in a test file is how a project ends up with two answers to
// whether a cell replicates.
const DISAGREE = new Set([
  // Quoted as refutations, by a citation that says so.
  'chained.jl chained|fused|incl|1000|dispatch-table',   // the old .map().filter() headline
  'inline.jl large|small|excl|100000',                   // closed-world's old floor
  'delete.jl rowundef|rowbase|incl|16384|dispatch-table',
  // Withdrawn, and the surviving cells carry the claim.
  // The two `arguments` cells are the sweep disagreeing with itself at the top
  // and bottom of its size range, which is what a null looks like when the
  // effect it is measuring is not there: seven cells replicate and every one of
  // them contains 1.00.
  'arguments.jl argesc|restesc|excl|16384',
  'arguments.jl arglen|restlen|excl|262144',
  // Holey reads at the largest size. The other five holey cells replicate, and
  // the whole-array half is where the answer is anyway.
  'sparse.jl holey|packed|excl|262144',
  // Dictionary elements at the largest size, whose three sweeps span 14.0 to
  // 15.8. The other five dict cells replicate, from 21x to 60x.
  'sparse.jl dict|packed|incl|262144',
  'chained.jl splitjoin|packed|excl|1000|dispatch-table',
  'delete.jl rowdel|rowbase|excl|262144|dispatch-table',
  'delete.jl rowdel|rowbase|incl|16384|dispatch-table',
  'delete.jl rowdel|rowbase|incl|262144|dispatch-table',
  'spread.jl concat|push|incl|10000',
  'spread-object.jl assign-copy|assign|incl|2000',
  'spread-object.jl spread|assign|incl|2000',
  'strings.jl concat|joined|excl|1000|dispatch-table',
  'strings.jl pluseq|joined|build|1000|dispatch-table',
  'shapes-calibrated.jl 3|1|incl|16384|L2',
  'shapes-calibrated.jl 4|1|incl|16384|L2',
  'example.jl zod-clean-enum/before|zod-clean-enum/after|excl|16|zod-clean-enum',
  'dispatch.jl cls2|cls1|excl|262144|L3|cls|2|dispatch-table',
  'dispatch.jl cls5|cls1|incl|262144|L3|cls|5|dispatch-table',
  'dispatch.jl lit6|lit1|incl|262144|L3|lit|6|dispatch-table',
  'dispatch.jl tgt3|lit1|excl|256|L1|tgt|3|dispatch-table',
  'dispatch.jl tgt5|lit1|excl|16384|L2|tgt|5|dispatch-table',
  'dispatch.jl lit6|lit1|incl|16384|L2|lit|6|dispatch-table',
  'dispatch.jl tgt2|lit1|excl|256|L1|tgt|2|dispatch-table',
  // Construction-counted cells of the new shape sweep. The reads-only cells,
  // which are the ones the rule cites, all replicate.
  'shape-sets.jl 2|1|incl|16384|L2',
  'shape-sets.jl 4|1|incl|16384|L2',
  'shape-sets.jl 5|1|incl|16384|L2',
  'shape-sets.jl 2|1|incl|262144|L3',
  // Withdrawn for the other reason the gate withdraws a cell: fewer sweeps
  // than the three rule 13 asks for, and the gate prints the count so a reader
  // can tell "never replicated" from "replicated and refuted". No citation
  // reads this file.
  'addprop.jl added|literal|build|256|dispatch-table (2 sweeps)',
  // The number cell at n=100000, from the re-measurement TC-134 ran. The
  // frozen sweep it replaces disagreed here too — 0.88x, 0.94x, 1.00x against
  // 0.97x, 0.89x, 1.03x — but its rows were not admissible to say so, and the
  // range they published spanned both sizes and hid it. `allocating-select`'s
  // silent clause now quotes the three sweeps instead of a range.
  'select.jl select|compare|number|100000',
]);

// Every sweep a citation reads. A file is here whether or not it is in
// `REMEASURED`: a cell that refutes itself does so under the protocol that
// measured it, and a number read out of older rows is still a published
// number. Both registers below — rule 13's and rule 9's — watch this one list,
// because "which files are published" is one fact and two copies of it would
// drift.
const SWEPT = [
  'chained.jl', 'inline.jl', 'select.jl', 'delete.jl', 'spread.jl',
  'spread-object.jl', 'strings.jl', 'shapes-calibrated.jl', 'example.jl',
  'dispatch.jl', 'addprop.jl', 'arrays.jl', 'shape-sets.jl',
  'arguments.jl', 'sparse.jl',
];

test('no published cell is withdrawn except the ones on record', () => {
  const found = new Set<string>();
  for (const file of SWEPT) {
    for (const cell of unreplicable(root, file)) found.add(`${file} ${cell}`);
  }

  const fresh = [...found].filter((c) => !DISAGREE.has(c)).sort();
  const healed = [...DISAGREE].filter((c) => !found.has(c)).sort();
  assert.deepStrictEqual(fresh, [], `these cells are withdrawn and nothing said so: ${fresh.join(', ')}`);
  assert.deepStrictEqual(healed, [], `DISAGREE lists cells that now replicate — remove them: ${healed.join(', ')}`);
});

// Protocol rules 6 and 13, proven through the publication path itself, never
// by calling the gate's internals. TC-84's defect was invariants living at
// call sites — bench/run.ts printed REJ to a terminal while derive.ts
// published the same cell — so this plants cells the protocol must refuse in a
// copy of the real data and derives: a change that routes numbers around the
// funnel makes the planted cells stop failing, and this test is what says so.
test('a single-sweep cell and a rejected interval cannot publish as live', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jitmax-funnel-'));
  fs.mkdirSync(path.join(tmp, 'bench'));
  for (const f of fs.readdirSync(path.join(root, 'bench'))) {
    if (f.endsWith('.jl')) fs.copyFileSync(path.join(root, 'bench', f), path.join(tmp, 'bench', f));
  }
  const plant = (file: string, planted: object[]): void =>
    fs.appendFileSync(
      path.join(tmp, 'bench', file),
      planted.map((r) => `${JSON.stringify(r)}\n`).join('')
    );

  // Rule 13's base case: one sweep of a 99x cell under select.heap's pick. A
  // cell measured once was the one count the old `length >= 2` guard let
  // through unchallenged (BUGS TC-84).
  // `load1`/`runnable` because select's citations ask `hasReading` since the
  // sweep was re-measured (TC-134): a planted row must look like a row the
  // rule publishes, or the funnel never sees it.
  const select = {
    runner: 'r2', variant: 'select', baseline: 'compare', mode: 'heap',
    protocol: 'replicated', load1: 1, runnable: 0, env: { maxRunnable: 1, cores: 2 },
  };
  plant('select.jl', [{ ...select, n: 555, replicate: 1, ratio: 99, lo: 98, hi: 100 }]);
  // Rule 6 on a rule's evidence: three agreeing sweeps whose shared interval
  // spans 1.0, however large the point estimates read.
  plant(
    'select.jl',
    [1, 2, 3].map((i) => ({
      ...select, n: 777, replicate: i, ratio: 1.4, lo: 0.9 + i / 100, hi: 1.1 + i / 100,
    }))
  );
  // Rule 6's broad-warning bar: a cell that clears 1.0 — the rule bar — and
  // still falls short of point >= 1.10x with the lower bound above 1.05x,
  // planted under chained-allocation, the one rule that claims 'broad'.
  plant(
    'chained.jl',
    [1, 2, 3].map((i) => ({
      runner: 'r2', variant: 'chained', baseline: 'fused', mode: 'incl', kernel: 'dispatch-table',
      protocol: 'replicated', n: 555, replicate: i, ratio: 1.06, lo: 1.01 + i / 1000, hi: 1.09,
    }))
  );

  const d = deriveDetail(tmp);
  assert.strictEqual(d['select.heap']!.value, N['select.heap'], 'a planted cell moved the published range');
  assert.deepStrictEqual(d['select.heap']!.withdrawn, ['select|compare|heap|555 (1 sweep)']);
  assert.deepStrictEqual(d['select.heap']!.rejected, ['select|compare|heap|777']);
  assert.strictEqual(d['chained.mapfilter']!.value, N['chained.mapfilter'], 'a planted cell moved the published range');
  assert.deepStrictEqual(d['chained.mapfilter']!.rejected, ['chained|fused|incl|555|dispatch-table']);

  // The verdicts are output, not bookkeeping: the generated numbers block names
  // every planted cell with the rule that refused it.
  const block = markdown(tmp);
  assert.match(block, /withdrawn as unreplicable \(rule 13\): select\\\|compare\\\|heap\\\|555 \(1 sweep\)/);
  assert.match(block, /rejected under rule 6 \(the rule's bar\): select\\\|compare\\\|heap\\\|777/);
  assert.match(block, /rejected under rule 6 \(the broad-warning bar\): chained\\\|fused\\\|incl\\\|555\\\|dispatch-table/);
});

// Protocol rule 9's load gate, in the same shape as rule 13's register above:
// the known state is written down, a NEW violation fails the build, and a
// healed entry fails it too. Counts per file, because an appended row has no
// identity beyond its position.
//
// Every one of these 601 rows was written while its own recorded `load1`
// exceeded its own recorded gate, and the gate never noticed, because the
// one-minute average it read was mostly the sweep's own children — one pinned
// child at a time, each worth ~1.0 in the window, so an idle two-core machine
// read ~1.5 against a gate of 1 (TC-25, TC-46). That is why these rows are
// REGISTERED and not withdrawn: the old observable cannot say which of them
// had a real tenant behind the harness, only that the gate was not answering
// its question, and withdrawing most of the corpus on a number like that is
// the owner's call, not this file's. Rows the reworked runner writes carry
// `runnable` — the count of runnable threads outside the harness, read as the
// row is written — and THAT pair is meaningful, so a new row over it lands
// here as a count the register does not explain, and stays until someone
// either re-measures the cell or registers it as a decision.
// [over the gate, judgeable at all]. The second number is here because the
// first one alone lies: `arrays.jl` registered a clean 0 over its gate and not
// one of its 60 rows carries a gate field to be judged against, and `select.jl`
// registered 0 while its 18 judgeable rows were unreadable to the query, which
// recorded their load under `env.load1` rather than beside it (TC-24, TC-47).
// A file whose judged count is 0 has answered no question; it has not passed.
const OVER_GATE: Record<string, [number, number]> = {
  'addprop.jl': [2, 2],
  'arrays.jl': [0, 0],
  'chained.jl': [58, 72],
  'delete.jl': [46, 48],
  'dispatch.jl': [205, 240],
  // Four excluded own-properties rows have replacement sweeps.
  'example.jl': [49, 88],
  'inline.jl': [4, 6],
  // 36 judgeable rows, not 18: the eighteen frozen ones the note above
  // describes, plus the eighteen that re-measured the same six cells with the
  // reading taken per row (TC-134). Every citation reads the second eighteen.
  'select.jl': [0, 36],
  'shape-sets.jl': [57, 72],
  'shapes-calibrated.jl': [64, 72],
  'spread.jl': [21, 24],
  'spread-object.jl': [23, 24],
  'strings.jl': [67, 81],
  // Swept under the gate that actually governs, so every row is judgeable. The
  // nine over-gate sparse rows are cells whose load rose DURING the timed
  // region (TC-74); each was re-measured, and resume discounts them (TC-91).
  'arguments.jl': [0, 27],
  'sparse.jl': [9, 45],
};

test('no published row is over its own gate except the ones on record', () => {
  for (const file of SWEPT) {
    const [knownOver, knownJudged] = OVER_GATE[file] ?? [0, 0];
    const { over, judged } = overGate(root, file);
    assert.strictEqual(
      over,
      knownOver,
      `${file}: the register says ${knownOver} over-gate rows and the file holds ${over} — ` +
        'a new row was written over its own gate, or the .jl was rewritten'
    );
    assert.strictEqual(
      judged,
      knownJudged,
      `${file}: the register says ${knownJudged} judgeable rows and the file holds ${judged} — ` +
        'a row lost or gained the pair its gate is read from'
    );
  }
});

// The file that registered a clean zero while carrying nothing to judge. Named
// here so it cannot quietly become a compliant-looking file again.
test('a file with no judgeable row is on record as unjudgeable, not as clean', () => {
  const unjudgeable = SWEPT.filter((f) => overGate(root, f).judged === 0);
  assert.deepStrictEqual(
    unjudgeable,
    ['arrays.jl'],
    'a sweep gained or lost the ability to answer its own load gate'
  );
});

// Rule 9's gate, at the three places it is checked: before the sweep, before
// every cell, and between the whole sweeps of a replicated cell. The third one
// is bench/driver.ts's `between` hook, injected by the runner because the
// driver measures and the runner gates — covering all three sweeps of a cell
// with the check before the cell is what let 601 rows past (TC-46).
//
// What this also pins is the boundary: `between` is called ONCE per sweep, so
// nothing reads the machine during one. A cell is forty processes and minutes,
// and nine rows of bench/sparse.jl record a machine that was at 0 or 1 runnable
// when their cell started and at 2 to 12 when the row was written (TC-74). The
// runner writes those rows, prints OVER GATE, and the register above names
// them; making the runner ACT on a reading taken during a sweep is a change to
// what `void` means and is not shipped here.
//
// The workload exits with no output, so every sweep voids on its first
// calibration probe: this measures nothing and spawns three processes that
// print nothing.
test('the gate runs between a cell\'s sweeps, and a busy machine stops the cell', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jitmax-gate-'));
  const script = path.join(dir, 'silent.js');
  fs.writeFileSync(script, 'process.exit(0);\n');
  const opts = { script, baseline: 'a', variant: 'b', n: 1, mode: 'excl' };

  const checked: number[] = [];
  const runs = replicate(opts, () => {}, 3, undefined, (i) => checked.push(i));
  assert.deepStrictEqual(checked, [2, 3], 'the gate is not checked between every pair of sweeps');
  assert.strictEqual(runs.length, 3);
  assert.ok(runs.every((r) => r.void), 'the silent workload was read as a measurement');

  // A refusal stops the cell where it stands, and every sweep that finished has
  // already been handed to `onRun` and written — a sweep lost to a gate refusal
  // would be a measurement thrown away for being correct.
  const written: number[] = [];
  assert.throws(
    () => replicate(opts, (r) => written.push(r.replicate), 3, undefined, (i) => {
      if (i === 3) throw new Error('load gate: 6 runnable outside the harness > 1');
    }),
    /load gate/
  );
  assert.deepStrictEqual(written, [1, 2]);
});

// Resume, which is the other half of rule 9's gate: the gate refuses to START a
// cell on a busy machine, and `runnable` is read again as each row is written,
// so a row over the gate is a row that says so. What resume does with it is
// what decides whether the contamination is repairable — counting it as a run
// made `sparse`'s dict/excl/16384 cell finished at three rows of which two were
// measured at runnable 4, and the only way to re-measure that one cell was to
// set the whole file aside and sweep all twelve again (BUGS TC-91).
//
// Rows, not the sweep: bench/resume.ts is a module because bench/run.ts starts
// a sweep on import, and this asks the real function about a real file.
test('resume counts a cell\'s runs within its gate, not its rows', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jitmax-resume-'));
  const file = path.join(dir, 'sparse.jl');
  const row = (over: boolean, rest: object = {}) => ({
    runner: 'r2', variant: 'dict', baseline: 'packed', mode: 'excl', n: 16384,
    replicate: 1, protocol: 'replicated', ratio: 1.5, lo: 1.4, hi: 1.6,
    runnable: over ? 4 : 0, env: { maxRunnable: 1, cores: 2 }, ...rest,
  });
  const cell = key(row(false));

  fs.writeFileSync(file, [row(false), row(true), row(true)].map((r) => `${JSON.stringify(r)}\n`).join(''));
  assert.strictEqual(done(file).get(cell), 1, 'two over-gate rows counted as measured runs');

  // A row this protocol did not write is not a run of anything, and a row
  // carrying only the OLD pair — a one-minute average dominated by the sweep's
  // own children, which cannot see a tenant behind the harness (TC-25, TC-46) —
  // is not evidence of contamination and is deliberately still counted.
  fs.appendFileSync(file, `${JSON.stringify(row(false, { runner: 'r1' }))}\n`);
  fs.appendFileSync(file, `${JSON.stringify(row(false, { runnable: undefined, load1: 9, env: { maxLoad: 1, cores: 2 } }))}\n`);
  assert.strictEqual(done(file).get(cell), 2);
  const revised = row(false, { kernel: 'own-properties' });
  fs.appendFileSync(file, `${JSON.stringify(revised)}\n`);
  assert.strictEqual(done(file).get(key(revised)), 1);
  assert.strictEqual(done(file).get(cell), 2);
  const example: Row = {
    runner: 'r2', variant: 'before', mode: 'incl', n: 8,
    example: 'remeda-merge-all', kernel: 'own-properties',
    load1: 0, runnable: 0, env: { maxRunnable: 1 },
  };
  assert.strictEqual(current(example), true);
  assert.strictEqual(current({ ...example, runnable: 2 }), false);
  assert.strictEqual(current({ ...example, kernel: undefined }), false);
});

// Rule 9 says the reading travels IN the row because a sweep runs for hours
// and the load it started at stops being true within minutes. Eighteen rows of
// select.jl predate that: they carry `load1: 0.97` inside `env`, one
// observation stamped onto three replicates of each of six cells, and it is
// the whole of what `allocating-select`'s cost line rests on (TC-24, TC-47).
// `overGate` judges them where the reading lives — better than asking nothing —
// but a frozen reading and a per-row one are not the same evidence, and this
// register is what keeps them apart. Closing it is a re-measurement of six
// cells and the owner's call; what a test can do is refuse to let the number
// grow, in both directions, and `reading()` below is why it cannot.
const FROZEN: Record<string, number> = { 'select.jl': 18 };

test('the rows whose recorded load is frozen are the eighteen on record', () => {
  const found: Record<string, number> = {};
  for (const file of SWEPT) {
    const n = frozenReading(root, file);
    if (n > 0) found[file] = n;
  }
  assert.deepStrictEqual(
    found,
    FROZEN,
    'a published row records its machine reading inside `env` — one number for a whole ' +
      'sweep — where every row since carries the reading taken as it was written'
  );
});

// The cause, not the count: the one place a row's environment is assembled
// refuses to assemble it out of a sweep record that already holds a reading.
// The 18 rows exist because nothing checked, and the type that would have
// caught it arrived after them.
test('a row cannot be written with the reading frozen into its environment', () => {
  const env = environment(1);
  assert.ok(!('load1' in env) && !('runnable' in env), 'the sweep record carries a reading');
  for (const field of ['load1', 'runnable']) {
    assert.throws(
      () => reading({ ...env, [field]: 0.97 }),
      new RegExp(`carries ${field}`),
      `an environment carrying ${field} was accepted onto a row`
    );
  }
  // And the reading it does take is this instant's, not the sweep's — off the
  // record bench/run.ts actually hands it, which carries what the gate let the
  // sweep begin at. That is a fact about the sweep, not a reading, and passes.
  const now = reading({ ...env, runnableStart: 0 });
  assert.ok(Number.isFinite(now.load1) && Number.isFinite(now.runnable), 'no reading was taken');
  assert.strictEqual(now.env.runnableStart, 0);
});

// The other way a row that was never a sweep reaches a published file: not by
// being written to the wrong file, but by being measured under a gate somebody
// raised for the afternoon. `overGate` above asks whether a row was over ITS
// OWN recorded gate, so a row written under `--max-load=99` answers no whatever
// the machine was doing — which is precisely the row TC-20 is about, produced
// at load 1.91 to check that a flag parsed. The override is documented and
// recorded; this is what makes it visible.
test('no published row was measured under a gate somebody raised', () => {
  const raised = SWEPT.flatMap((f) => raisedGate(root, f).map((r) => `${f} ${r}`));
  assert.deepStrictEqual(
    raised,
    [],
    'a published row records a load gate above the one its own core count derives — ' +
      'a --max-load run belongs in bench/scratch.jl, not in a sweep numbers are read from'
  );
});

// `--plan` is the command that answers "where will four hours of measurement
// land?", and it answered with the sweep's own file whatever `--scratch` said.
// A run started from a plan that names the wrong destination is how the TC-20
// row happened; both now read the same `destination`.
test('--plan names the file a run would actually write', () => {
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [path.join(root, 'bench', 'run.ts'), ...args], { encoding: 'utf8' });

  const planned = run('spread', '--plan');
  assert.strictEqual(planned.status, 0, planned.stderr);
  const dests = (o: string) => [...new Set(o.trim().split('\n').map((l) => l.split(' -> ')[1]?.split(' ')[0]))];
  assert.deepStrictEqual(dests(planned.stdout), ['spread.jl']);

  const scratch = run('spread', '--plan', '--scratch');
  assert.strictEqual(scratch.status, 0, scratch.stderr);
  assert.deepStrictEqual(dests(scratch.stdout), ['scratch.jl']);
});

// docs/limits.md tells a reader the corpus number; this register IS the corpus
// number. Typing it into prose is the one way it can drift out of the rows, so
// the prose is read back and compared against the sum.
test('the limits page quotes the over-gate register, not a number beside it', () => {
  const total = Object.values(OVER_GATE).reduce((a, [over]) => a + over, 0);
  assert.ok(
    doc(path.join('docs', 'limits.md')).includes(
      `${total} published rows were measured under a load gate`
    ),
    `docs/limits.md no longer quotes the over-gate total of ${total} rows`
  );
});

// ---------------------------------------------------------------------------
// lib/flow.ts's walkers, called directly.
//
// Every one of these was a closure inside `createFlow`, observable only through
// scan → check → report. That is where both provenance bugs lived and why
// `isElement` shipped as `t === element` for months: a pure function no test
// can call is a function whose behaviour is only ever seen through the whole
// pipeline. `makeWalk` builds the shared state over a tiny program; each test
// below picks one node and calls ONE walker on it.

let flowFixtures = 0;
function walkOver(source: string): { walk: Walk; sf: TS.SourceFile; prog: TS.Program } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jitmax-flow-'));
  const file = path.join(dir, `f${flowFixtures++}.ts`);
  fs.writeFileSync(file, source);
  const prog = program(ts, dir, [file]);
  const sf = prog.getSourceFile(file) ?? assert.fail(`no source file for ${file}`);
  return { walk: makeWalk(ts, prog, prog.getTypeChecker()), sf, prog };
}

function allNodes<T extends TS.Node>(root: TS.Node, is: (n: TS.Node) => n is T): T[] {
  const out: T[] = [];
  const visit = (n: TS.Node): void => {
    if (is(n)) out.push(n);
    ts.forEachChild(n, visit);
  };
  visit(root);
  return out;
}
const nth = <T extends TS.Node>(root: TS.Node, is: (n: TS.Node) => n is T, i = 0): T =>
  allNodes(root, is)[i] ?? assert.fail('the fixture has no such node');
const identsNamed = (root: TS.Node, text: string): TS.Identifier[] =>
  allNodes(root, ts.isIdentifier).filter((id) => id.text === text);
const fresh = (): Query => ({ budget: 4000, stack: new Set(), reading: new Set() });
const originNames = (r: Res): string[] => [...r.origins.values()].map((o) => o.name).sort();
const originKinds = (r: Res): string[] => [...r.origins.values()].map((o) => o.kind).sort();

test('compute resolves a literal, an array, and both arms of a conditional', () => {
  const { walk, sf } = walkOver(
    'export const pick = (b: boolean) => (b ? { a: 1, b: 2 } : [1, 2, 3]);\n'
  );
  const res = compute(walk, nth(sf, ts.isConditionalExpression), fresh());
  assert.deepStrictEqual(originKinds(res), ['array', 'literal']);
  assert.deepStrictEqual([...res.unknown], []);
  assert.ok(
    originNames(res).some((n) => n.startsWith('{a,b} (')),
    `the literal arm is not named by its shape: ${originNames(res).join(' | ')}`
  );
});

test('symbolFlow follows a declaration initializer and every later assignment', () => {
  const { walk, sf } = walkOver(
    'class A { m(): void {} }\n' +
      'class B { m(): void {} }\n' +
      'export function go(): void {\n' +
      '  let v = new A();\n' +
      '  v = new B();\n' +
      '  v.m();\n' +
      '}\n'
  );
  const use = identsNamed(sf, 'v').at(-1) ?? assert.fail('no use of v');
  const res = symbolFlow(walk, use, fresh());
  assert.deepStrictEqual(originNames(res), ['A', 'B']);
  assert.deepStrictEqual([...res.unknown], []);
});

test('symbolFlow says a declared name nothing assigns is not an origin', () => {
  const { walk, sf } = walkOver(
    'declare const g: { m(): void };\nexport function go(): void { g.m(); }\n'
  );
  const use = identsNamed(sf, 'g').at(-1) ?? assert.fail('no use of g');
  const res = symbolFlow(walk, use, fresh());
  assert.deepStrictEqual(originNames(res), []);
  assert.deepStrictEqual([...res.unknown], ['g is never visibly assigned']);
});

test('paramFlow reads every visible caller, and names the function when there is none', () => {
  const { walk, sf } = walkOver(
    'class A { m(): void {} }\n' +
      'class B { m(): void {} }\n' +
      'function run(v: { m(): void }): void { v.m(); }\n' +
      'run(new A());\n' +
      'run(new B());\n' +
      'export function orphan(v: { m(): void }): void { v.m(); }\n'
  );
  const params = allNodes(sf, ts.isParameter);
  const called = paramFlow(walk, params[0] ?? assert.fail('no parameter of run'), fresh());
  assert.deepStrictEqual(originNames(called), ['A', 'B']);
  assert.deepStrictEqual([...called.unknown], []);

  const none = paramFlow(walk, params[1] ?? assert.fail('no parameter of orphan'), fresh());
  assert.deepStrictEqual(originNames(none), []);
  assert.deepStrictEqual(
    [...none.unknown],
    ['no visible caller of orphan — its arguments come from outside this program']
  );
});

test('ctorArgFlow counts new, a subclass that declares no constructor, and super', () => {
  const { walk, sf } = walkOver(
    'class Seed {}\n' +
      'class Leaf {}\n' +
      'class Root {}\n' +
      'export class C { constructor(readonly v: object) {} }\n' +
      'class D extends C {}\n' +
      'class E extends C { constructor() { super(new Root()); } }\n' +
      'new C(new Seed());\n' +
      'new D(new Leaf());\n' +
      'new E();\n'
  );
  const c = allNodes(sf, ts.isClassDeclaration)[3] ?? assert.fail('no class C');
  const param = nth(c, ts.isParameter);
  const res = ctorArgFlow(walk, c, 0, param, fresh());
  assert.deepStrictEqual(originNames(res), ['Leaf', 'Root', 'Seed']);
  assert.deepStrictEqual([...res.unknown], []);
});

test('memberValueInner reads an own member, then walks up the extends chain', () => {
  const { walk, sf } = walkOver(
    'class Base { tag = { kind: 1 }; run(): void {} }\n' +
      'class Sub extends Base { other(): void {} }\n' +
      'export const s = new Sub();\n'
  );
  const [base, sub] = allNodes(sf, ts.isClassDeclaration);
  assert.ok(base && sub, 'the fixture lost a class');

  const own = memberValueInner(walk, base, 'run', false, fresh());
  assert.deepStrictEqual(originKinds(own), ['function']);
  assert.deepStrictEqual(originNames(own), ['run()']);

  const inherited = memberValueInner(walk, sub, 'tag', false, fresh());
  assert.ok(
    originNames(inherited)[0]?.startsWith('{kind} ('),
    `the base's field did not reach the subclass: ${originNames(inherited).join(' | ')}`
  );

  const absent = memberValueInner(walk, sub, 'nope', false, fresh());
  assert.deepStrictEqual(originNames(absent), []);
});

// The write channel is matched by property DECLARATION, never by name, or every
// `.type` field in a program would pour into every other. Passing no
// declarations is what that channel being closed looks like.
test('readProperty reads a literal field, plus writes that share its declaration', () => {
  const { walk, sf } = walkOver(
    'class A { m(): void {} }\n' +
      'class B { m(): void {} }\n' +
      'interface Holder { impl: { m(): void } }\n' +
      'const h: Holder = { impl: new A() };\n' +
      'function set(x: Holder): void { x.impl = new B(); }\n' +
      'export function go(): void { set(h); h.impl.m(); }\n'
  );
  const read =
    allNodes(sf, ts.isPropertyAccessExpression)
      .filter((a) => a.name.text === 'impl')
      .at(-1) ?? assert.fail('no read of .impl');
  const base = walk.valueOf(read.expression, fresh());
  const decls = declsOf(walk.checker, walk.checker.getSymbolAtLocation(read.name));

  const both = readProperty(walk, base, 'impl', decls, fresh());
  assert.deepStrictEqual(originNames(both), ['A', 'B']);

  const literalOnly = readProperty(walk, base, 'impl', [], fresh());
  assert.deepStrictEqual(originNames(literalOnly), ['A']);
});

test('elementsOf enumerates an array through a spread, and names what it cannot', () => {
  const { walk, sf } = walkOver(
    'class A { m(): void {} }\n' +
      'class B { m(): void {} }\n' +
      'const tail = [new B()];\n' +
      'const all = [new A(), ...tail];\n' +
      'const solo = { m(): void {} };\n' +
      'export function go(): void {\n' +
      '  for (const v of all) v.m();\n' +
      '  solo.m();\n' +
      '}\n'
  );
  const use = identsNamed(sf, 'all').at(-1) ?? assert.fail('no use of all');
  const res = elementsOf(walk, walk.valueOf(use, fresh()), fresh());
  assert.deepStrictEqual(originNames(res), ['A', 'B']);
  assert.deepStrictEqual([...res.unknown], []);

  const notArray = walk.valueOf(nth(sf, ts.isObjectLiteralExpression), fresh());
  const refused = elementsOf(walk, notArray, fresh());
  assert.deepStrictEqual(originNames(refused), []);
  assert.deepStrictEqual(
    [...refused.unknown],
    ['an element of a collection the walk cannot enumerate']
  );
});

// The reverse-edge index every walker that looks BACKWARDS reads. A caller it
// cannot see is an origin the count silently lacks, which is how a five-map
// site read as monomorphic-and-followed (BUGS TC-113).
test('makeIndex sees a callee behind a cast, a super call, and a property write', () => {
  const { sf, prog } = walkOver(
    'type F = (n: number) => void;\n' +
      'function f(n: number): void { void n; }\n' +
      'export function go(): void { (f as F)(1); }\n' +
      'class Base { constructor(readonly n: number) {} }\n' +
      'class Sub extends Base { constructor() { super(2); } }\n' +
      'export const s = new Sub();\n' +
      'export function w(b: { n: number }): void { b.n = 3; }\n'
  );
  const index = makeIndex(ts, prog)();
  assert.strictEqual(
    (index.calls.get('f') ?? []).length,
    1,
    'a call written behind a cast did not enter the index'
  );
  assert.strictEqual(index.supers.length, 1);
  assert.strictEqual(index.supers[0]?.cls, allNodes(sf, ts.isClassDeclaration)[1]);
  assert.deepStrictEqual((index.writes.get('n') ?? []).map((wr) => wr.kind), ['assign']);
  assert.strictEqual(index.classes.length, 2);
});
