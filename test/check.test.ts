import { test } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { load, program } from '../lib/ts.ts';
import { scan, type Mark } from '../lib/scan.ts';
import { check, resolveDisabled } from '../lib/rules.ts';
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
      'addField',
      'appendOnce',
      'areaOfFive',
      'areaOfFour',
      'collect',
      'collectByAssign',
      'collectByConcat',
      'collectByReduce',
      'collectObject',
      'drop',
      'dropQuiet',
      'entriesMap',
      'fiveShapes',
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
      'oneStage',
      'optionalField',
      'sortedStages',
      'splitJoin',
      'total',
      'totalArea',
      'twoStages',
      'usesDependency',
      'usesHelper',
      'viaCallee',
      'viaCalleeQuiet',
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

test('the fifth shape fires: 3.6-10.6x on reads, the cliff', () => {
  assert.deepStrictEqual(rules('fiveShapes'), ['megamorphic-elements']);
});

// The same V8 constant at a call site, found from the other end. Four shapes
// cost 1.16-1.56x — the band four shapes cost at a load site — and the fifth
// costs 14.6-20.0x, because it loses the inlining as well as the cached lookup.
test('four shapes at a call site stay silent', () => {
  assert.deepStrictEqual(rules('areaOfFour'), []);
});

test('the fifth shape at a call site fires: 14.6-20.0x on reads', () => {
  assert.deepStrictEqual(rules('areaOfFive'), ['megamorphic-dispatch']);
});

// TC-8 is the flagship rule reporting a megamorphic load from a parameter's
// type without checking that anything is loaded. This rule requires the call,
// so five object types with nothing called on them is not a finding.
test('five object types with no method call stay silent', () => {
  assert.deepStrictEqual(rules('idOfFive'), []);
});

// One union reaching one site is one finding. megamorphic-elements has the
// array parameter, so the dispatch rule steps aside rather than billing it
// twice.
test('an array of a five-way union with method calls reports once', () => {
  assert.deepStrictEqual(rules('totalArea'), ['megamorphic-elements']);
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

test('a two-stage chain fires', () => {
  assert.deepStrictEqual(rules('twoStages'), ['chained-allocation']);
});

// One stage allocates once. That is the baseline the 7.64x was measured
// against, so firing here would contradict the measurement.
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
// inside the 1.0-1.7x band SPEC §11 records this harness cannot replicate.
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

// The same place the promise is made: `@turbocharge -key` disables a rule for
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
    }
  );
});
