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
  markdown,
  overGate,
  rows,
  type Row,
  spans1,
  unreplicable,
  withoutBlock,
} from '../lib/derive.ts';
import { deriveBuiltins, loweredCases } from '../lib/derive-builtins.ts';
import { BUILTINS } from '../lib/builtins.ts';
import { N } from '../lib/numbers.ts';
import { load, program } from '../lib/ts.ts';
import { scan, type Mark } from '../lib/scan.ts';
import { check, EVIDENCE, resolveDisabled } from '../lib/rules.ts';
import { loadConfig } from '../lib/config.ts';
import { render } from '../lib/report.ts';

const root = path.join(import.meta.dirname, '..');
const ts = load(root);

function rulesByFunction(dir: string): Map<string, string[]> {
  const { checker, marks } = scan(ts, program(ts, root, [path.join(root, dir)]));
  return new Map(marks.map((m) => [m.name, check(ts, checker, m).map((f) => f.rule)]));
}

const found = rulesByFunction('demo');
const rules = (name: string): string[] => found.get(name) ?? assert.fail(`no mark ${name}`);
// The dispatch fixtures are object TYPES with method signatures, so the walk
// cannot follow `x.area()` into a body and `closed-world` reports it — which is
// correct and is what TC-45 asked for. These tests are about the dispatch rule,
// so they ask about the dispatch rule.
const shapeRules = (name: string): string[] => rules(name).filter((r) => r !== 'closed-world');

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
      'entriesMap',
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
      'sliceUnknown',
      'sortedStages',
      'splitJoin',
      'storeByDestructuring',
      'taggedShapes',
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
    rules('areaOfFour').includes('closed-world'),
    'a call through an object-type method signature vanished from the coverage report'
  );
});

// One union reaching one site is one finding. megamorphic-elements has the
// array parameter, so the dispatch rule steps aside rather than billing it
// twice.
test('an array of a five-way union with method calls reports once', () => {
  assert.deepStrictEqual(shapeRules('totalArea'), ['megamorphic-elements']);
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

// BUGS TC-16: the printed fix is a contract, and one sentence was wrong for
// half the cases it was printed on. An array pushed to reads exactly like an
// array spread into (0.96-1.07x); an object filled key by key is normalized,
// and remeda's mergeAll bought a faster build and reads an order of magnitude
// slower by following this rule. The two forms therefore print two fixes, and
// the conditional one is the object.
test('the fix differs by form: the array half is unconditional and the object half is not', () => {
  const fixFor = (name: string): string => {
    const f = rawFindings(name).find((x) => x.rule === 'accumulating-spread');
    return f?.fix ?? assert.fail(`no accumulating-spread finding on ${name}`);
  };
  assert.match(fixFor('collect'), /^push onto acc /);
  assert.doesNotMatch(fixFor('collect'), /normalizes/);
  assert.match(fixFor('collectByConcat'), /^push onto acc /);
  // The object half stopped being an instruction (BUGS TC-38): applying it
  // makes the build faster and the reads 8x slower, and the tool reports the
  // result CLEAN — so the text has to carry what the exit code cannot.
  assert.match(fixFor('collectObject'), /^there is no rewrite here/);
  assert.match(fixFor('collectObject'), /normalizes the object/);
  assert.match(fixFor('collectObject'), /checks CLEAN/);
  assert.match(fixFor('collectByAssign'), /normalizes the object/);
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

test('delete on an array element stays silent: a different mechanism', () => {
  assert.deepStrictEqual(rules('dropElement'), []);
});

// The other half of TC-16, and the only place the width is stated: "build the
// object without the property" was measured working at the smaller of the two
// key counts es-toolkit omit was swept at and not at the larger.
//
// Asserted against the DATA, not against the sentence. This test used to match
// the literal `12 keys and not at 48`, so the two integers could stop being
// what example.jl holds and nothing would fail — the re-aimed TC-48. It now
// reads the derived pair and requires the fix to quote it.
test('the delete fix says where the rebuild stops paying, in the swept sizes', () => {
  const f = rawFindings('drop').find((x) => x.rule === 'delete-property');
  const sizes = N['ex.omit.sizes'];
  assert.match(sizes, /^n=\d+ and n=\d+$/, `ex.omit.sizes reads "${sizes}"`);
  assert.ok(
    (f?.fix ?? '').includes(sizes),
    `the fix does not quote the swept sizes (${sizes}): ${f?.fix}`
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

// A chain on a string allocates no array at all, and the rule matched the
// method names without reading the receiver's type (BUGS TC-35). The same sweep
// that keeps accumulating-spread off strings keeps this rule off them.
test('a two-stage chain on a STRING stays silent', () => {
  assert.deepStrictEqual(rules('trimTail'), []);
});

test('a two-stage chain fires', () => {
  assert.deepStrictEqual(rules('twoStages'), ['chained-allocation']);
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
  assert.throws(() => resolveDisabled(['not-a-real-rule']), /unknown rule or defect code/);
});

test('a TOML config disables a rule by name and by defect code', () => {
  const cfg = loadConfig(path.join(import.meta.dirname, 'fixtures', 'disable.toml'));
  assert.deepStrictEqual([...cfg.disabled].sort(), ['TC-9', 'delete-property']);
  assert.deepStrictEqual(
    [...resolveDisabled(cfg.disabled)].sort(),
    ['chained-allocation', 'delete-property', 'megamorphic-elements']
  );
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

test('a finding prints the defects its rule carries', () => {
  const out = render(root, [{ mark: markFor('drop'), findings: rawFindings('drop') }]);
  assert.match(out, /known defect: TC-9 — rules fire outside the conditions their own evidence establishes/);
});

// The published numbers. A ratio used to be typed into `EVIDENCE`, into a spec
// table and into README prose, and the three contradicted each other twice in
// one day. Now every one of them is derived from the `.jl` rows, and this test
// is what makes that true rather than intended: re-derive from the data, and
// fail if the generated module, the generated README block, or the prose that
// quotes a number has fallen behind it. `make numbers` is the fix.

test('every published number is what its own data file says', () => {
  assert.deepStrictEqual(derive(root), N, 'lib/numbers.ts is stale — run `make numbers`');

  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.ok(
    readme.includes(markdown(root)),
    "README.md's generated block is stale — run `make numbers`"
  );

  // The prose quotes some of these in sentences. Checked with the generated
  // block cut out, or the block would only be matching itself, and with the
  // typographic dash normalised, because prose uses one and code does not.
  const prose = withoutBlock(readme).replace(/[–—]/g, '-');
  // `N` is a literal object now, so a citation key that does not exist is a
  // compile error at every USE site — which is the point. This loop walks
  // CITATIONS at runtime, so it is the one place the cast is honest: derive()
  // and N are asserted equal three lines up.
  const table = N as Record<string, string>;
  for (const [key, c] of Object.entries(CITATIONS)) {
    if (!c.readme) continue;
    assert.ok(prose.includes(table[key]!), `README prose no longer quotes ${key} = ${table[key]}`);
  }
});

// The exit code is the contract a CI gate reads, so it is tested through the
// binary rather than through the library. A walk that hit the cap printed the
// warning and exited 0, which told the gate the opposite of what the text said
// (BUGS TC-17). `test/fixtures/deep` is a chain longer than the cap with no
// finding in it, so 1 here can only come from the truncation.

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
function writeProfile(target: string, frames: Array<{ line: number; column: number }>): string {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const url = `file://${path.join(root, 'test', 'fixtures', 'profile', 'work.ts')}`;
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
  assert.match(run.stdout, /1 hot frame matched no function in this program/);
  assert.match(run.stdout, /work\.ts:900:1/);
  assert.match(run.stdout, /this is not a clean run/);
  assert.strictEqual(run.status, 1);
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
  assert.match(run.stdout, /1 hot frame matched no function in this program/);
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
  assert.strictEqual(run.status, 0);
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
    assert.match(run.stdout, /0 errors, 1 warning/);
    assert.match(run.stdout, /2 calls into the platform, not listed/);
    assert.strictEqual(
      (run.stdout.match(/warn {2}closed-world/g) ?? []).length,
      1,
      `one finding for the opaque callee and none for the platform:\n${run.stdout}`
    );
    assert.match(run.stdout, /calls opaque/);
    assert.ok(!run.stdout.includes('path.join'), 'path.join was still reported');
    assert.ok(!run.stdout.includes('readFileSync'), 'readFileSync was still reported');
    // Math.max is not a platform CALL: TurboFan lowers it, so no call boundary
    // exists at the site — a version-specific claim, so the line names the V8
    // the list was derived from (BUGS TC-70).
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

// The lowered-builtin list itself. Derived, never hand-written (BUGS TC-70):
// lowering describes the CALL BOUNDARY, not the work — Array.prototype.sort is
// lowered and still O(n log n) — so the only claim the list may carry is
// membership, and these are the members TC-70 checked against the pinned tree.
test('the lowered list carries the known-lowered names and none of the known-not-lowered', () => {
  for (const name of ['ArrayPrototypeSort', 'MathMax', 'RegExpPrototypeTest']) {
    assert.ok(BUILTINS.lowered.includes(name), `${name} is lowered at the pin and must be listed`);
  }
  for (const name of ['JsonParse', 'ObjectKeys', 'RegExpPrototypeExec']) {
    assert.ok(!BUILTINS.lowered.includes(name), `${name} is not lowered at the pin`);
  }
  // The static spellings scan.ts matches by text, and the two TC-70 names most
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

// Severity is the exit-code contract, so it is tested through the binary too.
// `closed-world` fires on a callee with no readable body and no sweep measures
// that program, so it warns rather than erring — and a warning must not fail a
// build. It was 96.7% of every finding across the 22-codebase survey, so before
// this it decided nearly every exit code on evidence the project does not have
// (BUGS TC-52).

test('a run whose only finding is a warning exits 0', () => {
  const run = spawnSync(
    process.execPath,
    [path.join(root, 'bin', 'jitmax.ts'), path.join(root, 'test', 'fixtures', 'opaque')],
    { cwd: root, encoding: 'utf8' }
  );
  assert.match(run.stdout, /0 errors, 1 warning/);
  assert.match(run.stdout, /warn {2}closed-world/);
  assert.strictEqual(run.status, 0);
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

// Every rule states a severity, and only a rule with no benchmark of the
// program it fires on may warn. A rule added without one would default to
// `warn` in the reporter and gate nothing, silently — which is the same lie a
// missing key tells anywhere else in this project.
//
// The register is the two rules that SAY, in their own `source`, that no sweep
// ran the program they fire on. `megamorphic-dispatch` joined it on its own
// words: every family in bench/dispatch.jl varies key order, the call target or
// where the function is held, all over one property set, and this rule counts
// property SETS. It failed builds on that for as long as it shipped.
const UNMEASURED_TRIGGER = ['megamorphic-dispatch', 'closed-world'];

test('a rule warns exactly when no sweep ran the program it fires on', () => {
  for (const [name, e] of Object.entries(EVIDENCE)) {
    assert.ok(e.severity === 'error' || e.severity === 'warn', `${name} states no severity`);
  }
  assert.deepStrictEqual(
    Object.entries(EVIDENCE)
      .filter(([, e]) => e.severity === 'warn')
      .map(([name]) => name)
      .sort(),
    [...UNMEASURED_TRIGGER].sort()
  );
  // Not just the list: a warning has to carry the defect code that says WHY it
  // is one. TC-33 is the name of this gap — the rule fires on one program and
  // its benchmark measured another — and a rule that drops it has either gained
  // a sweep, and should be an error, or quietly stopped admitting the gap.
  for (const name of UNMEASURED_TRIGGER) {
    const e = EVIDENCE[name];
    assert.ok(e, `${name} is registered as unmeasured but is not a rule`);
    assert.ok(
      e.defects?.includes('TC-33'),
      `${name} warns, but no longer carries TC-33 to say why`
    );
  }
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
// was the only one where a number could go stale in silence. README's prose is
// checked above and `EVIDENCE` interpolates `N` directly; site/index.html had
// six figures typed by hand. That is the defect TC-28 was, on the page rather
// than in a clause.
//
// Every ratio on the page must BE a value in the derived table — not merely
// look like one. A sweep that moves therefore breaks the build instead of
// leaving the page quoting a measurement that no longer exists.
// README narrates history, so the page's rule — every ratio must BE a derived
// value — would fail on honest sentences: a superseded range quoted AS
// superseded, a withdrawn rule's cost, the three sweeps of a cell rule 13
// refuses. The register below is the shape that works. Every ratio in README
// prose is either derived or listed here with the reason it is not, so a NEW
// typed ratio fails the build while history stays sayable (BUGS TC-73).
const HISTORICAL: Record<string, string> = {
  // Superseded ranges, quoted as superseded.
  '4.42-4.79x': 'closed-world before three replications, quoted as what it used to read',
  '3.21-4.95x': 'closed-world before rule 13 withdrew its n=100000 cell',
  '6.48-7.51x': 'map-then-filter before rule 13 was enforced in lib/derive.ts',
  '1.00-1.15x': 'zod cleanEnum reads at 16 as they rejected before re-measurement',
  // Rules this project withdrew. Their costs are real and ship nothing.
  '1.39-1.66x': 'boxed-elements: a genuinely boxed array, the rule was withdrawn anyway',
  '1.58-1.69x': 'boxed-elements, the build half of the same withdrawn rule',
  '0.96-1.08x': 'the declared-type case boxed-elements fired on, which measured nothing',
  '1.21-1.34x': 'the post-construction property add, refuted and shipping no rule',
  '0x': 'the delete-on-a-singleton refutation this project published and then overturned',
  '6.17-6.34x': 'the 16-keyed-store dictionary effect: measured, no rule, BUGS TC-12',
  // The three sweeps of a cell rule 13 refuses, printed as the refutation.
  '1.64x': 'one of three disagreeing sweeps, quoted to show they disagree',
  '0.91x': 'one of three disagreeing sweeps, quoted to show they disagree',
  '0.89x': 'one of three disagreeing sweeps, quoted to show they disagree',
  '17.34x': 'one of three disagreeing sweeps of remeda mergeAll at n=64, before it was re-swept',
  '19.34x': 'one of three disagreeing sweeps of remeda mergeAll at n=64, before it was re-swept',
  '20.10x': 'one of three disagreeing sweeps of remeda mergeAll at n=64, before it was re-swept',
  '20.29x': 'one of the three fresh sweeps that do agree',
  '18.09x': 'one of the three fresh sweeps that do agree',
  '19.88x': 'one of the three fresh sweeps that do agree',
  '0.98-1.03x': 'the cleanEnum read cells, rejecting at a 256-member enum',
  '1.11x': 'one of three sweeps of zod cleanEnum reads at 16, the cell DISAGREE withdraws',
  '1.01x': 'one of three sweeps of zod cleanEnum reads at 16, the cell DISAGREE withdraws',
  // Ordinary prose, not a measurement of anything.
  '1.10x': "rule 6's broad-warning point-estimate bar, a protocol constant",
  '2x': "the calibration tolerance: a cell missing 120ms by more than this throws",
  '8x': 'a ratio of two published ratios, said in words',
  '200x': 'a round figure in a sentence about what a microbenchmark is not',
  '5x': 'an anecdote about what %GetOptimizationStatus reported during a slowdown',
};

test('every ratio in README prose is derived, or registered as history', () => {
  const prose = withoutBlock(fs.readFileSync(path.join(root, 'README.md'), 'utf8'))
    .replace(/[\u2013\u2014]/g, '-');
  const RATIO = /\b\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?x\b/g;
  const values = new Set<string>(Object.values(N));
  for (const v of Object.values(N)) for (const m of v.matchAll(RATIO)) values.add(m[0]);

  const quoted = [...new Set([...prose.matchAll(RATIO)].map((m) => m[0]))];
  assert.ok(quoted.length > 0, 'README quotes no ratios — the regex has stopped matching');

  const unexplained = quoted.filter((q) => !values.has(q) && !(q in HISTORICAL));
  assert.deepStrictEqual(
    unexplained,
    [],
    `README prose quotes ${unexplained.join(', ')}, which is neither a derived number nor ` +
      'registered as history. Derive it, or add it to HISTORICAL with the reason it cannot be.'
  );

  // The register may not outlive what it explains: an entry that becomes a
  // derived value, or stops appearing, is a line nobody will notice is stale.
  const dead = Object.keys(HISTORICAL).filter((h) => !quoted.includes(h) || values.has(h));
  assert.deepStrictEqual(dead, [], `HISTORICAL still lists ${dead.join(', ')}, which README no longer needs it for`);
});

// README's two end-to-end tables print every sweep of every example cell and
// the interval each cell's three sweeps share. The register above cannot see
// one of them: they are bare decimals with no trailing `x`, so `RATIO` never
// matched one, HISTORICAL never had to explain one, and `make test` stayed
// green whatever they said. All of them were right the day they were typed and
// nothing would ever have said otherwise again. This reads them back out of
// README and re-derives each from the rows.
//
// Read back rather than generated: the numbers are the half that drifts, and
// the rest of a row is editorial — which finding fired, REJECTED, DISAGREES,
// two sizes paired on one line — so generating them would move a page's layout
// into lib/derive.ts and both tables into the one generated block, 120 lines
// above the argument they belong to.
//
// README spells a library the way a reader says it and the sweep spells it the
// way `examples/` names the fixture. Neither derives from the other, so the
// pairing is written down; a wrong pairing fails below on every number in the
// row.
const EXAMPLE: Record<string, string> = {
  'radash `assign`': 'radash-assign',
  'remeda `mergeAll`': 'remeda-merge-all',
  'es-toolkit `omit`': 'estoolkit-omit',
  'zod `cleanEnum`': 'zod-clean-enum',
};

test('every number in the end-to-end tables is what bench/example.jl says', () => {
  const readme = fs
    .readFileSync(path.join(root, 'README.md'), 'utf8')
    .replace(/[\u2013\u2014]/g, '-');

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
    assert.notStrictEqual(at, -1, `README has lost the table headed ${header}`);
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
  const select = { runner: 'r2', variant: 'select', baseline: 'compare', mode: 'heap', protocol: 'replicated' };
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

  // The verdicts are output, not bookkeeping: the generated README block names
  // every planted cell with the rule that refused it.
  const block = markdown(tmp);
  assert.match(block, /withdrawn as unreplicable \(rule 13\): select\|compare\|heap\|555 \(1 sweep\)/);
  assert.match(block, /rejected under rule 6 \(the rule's bar\): select\|compare\|heap\|777/);
  assert.match(block, /rejected under rule 6 \(the broad-warning bar\): chained\|fused\|incl\|555\|dispatch-table/);
});

// Protocol rule 9's load gate, in the same shape as rule 13's register above:
// the known state is written down, a NEW violation fails the build, and a
// healed entry fails it too. Counts per file, because an appended row has no
// identity beyond its position.
//
// Every one of these 592 rows was written while its own recorded `load1`
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
  'example.jl': [45, 48],
  'inline.jl': [4, 6],
  'select.jl': [0, 18],
  'shape-sets.jl': [57, 72],
  'shapes-calibrated.jl': [64, 72],
  'spread.jl': [21, 24],
  'spread-object.jl': [23, 24],
  'strings.jl': [67, 81],
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

// README tells a reader the corpus number; this register IS the corpus number.
// Typing it into prose is the one way it can drift out of the rows, so the
// prose is read back and compared against the sum.
test('README quotes the over-gate register, not a number beside it', () => {
  const total = Object.values(OVER_GATE).reduce((a, [over]) => a + over, 0);
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.ok(
    readme.includes(`${total} published rows were measured under a load gate`),
    `README no longer quotes the over-gate total of ${total} rows`
  );
});
