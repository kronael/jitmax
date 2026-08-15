import type * as TS from 'typescript';
import type { Ts } from './ts.ts';
import { at, type Body, type Mark, type Site } from './scan.ts';
import { N } from './numbers.ts';

export interface Evidence {
  cost: string;
  source: string;
  silent: string;
  // BUGS.md issue numbers this rule is known to be wrong or unproven about.
  // Empty when the rule carries no open defect. This is the register a
  // config or an annotation disables by defect code instead of by name.
  defects: string[];
}

// One line per code in `defects`, taken from the BUGS.md heading. Keep in
// sync with BUGS.md: a code appears here only if a rule's `defects` cites it.
export const DEFECT: Record<string, string> = {
  'TC-2': 'a TypeScript union member is not a V8 map',
  'TC-8': 'megamorphic-elements fires without a property load',
  'TC-9': 'rules fire outside the conditions their own evidence establishes',
  'TC-10': 'the walk follows calls but not constructors',
  'TC-13': 'a method in a field has no four-map budget',
};

export interface Finding extends Site {
  rule: string;
  message: string;
  fix: string;
  evidence: Evidence | null;
}

// Every rule cites a measurement, and the measurement also says where the rule
// must stay quiet. `silent` is not a caveat, it is a test: a rule that fires
// there is contradicting this project's own evidence.
export const EVIDENCE: Record<string, Evidence> = {
  'megamorphic-elements': {
    cost:
      `${N['elem.reads']} on reads across L1, L2 and L3; ${N['elem.constr.l1l2']} once ` +
      'construction is counted at L1 and L2, where allocation swamps the load, and nothing ' +
      `at RAM size — ${N['elem.constr.l3']} there, flat from two shapes to five, each cell ` +
      'replicated three times',
    source:
      `bench/shapes-calibrated.jl, ${N['elem.cells']} cells, 20 pairs each, the four at RAM ` +
      'size replicated three times',
    silent:
      'two to four shapes cost 1.2-2.0x on reads — real, and measured, but an order of ' +
      'magnitude below the fifth, which is why the rule starts there and not earlier',
    defects: ['TC-8', 'TC-2', 'TC-9'],
  },
  'megamorphic-dispatch': {
    cost:
      `${N['disp.proto.reads']} on reads across L1, L2 and L3 when the method is on a ` +
      `prototype — the sharpest threshold in the project, ${N['disp.proto.four']} at four ` +
      `shapes and ${N['disp.proto.five']} at five; ${N['disp.shared.reads']} when the method ` +
      `is one shared function held as an own property; ${N['disp.constr.l1l2']} at L1 and L2 ` +
      'once construction is counted, where the constructor is a second polymorphic site both ' +
      `sides pay, and ${N['disp.constr.l3.five']} at RAM size against ` +
      `${N['disp.constr.l3.four']} at two to four shapes, each of those cells replicated ` +
      'three times',
    source:
      `bench/dispatch.jl, ${N['disp.cells']} cells, 20 pairs each, the ten at RAM size ` +
      'replicated three times',
    silent:
      'four shapes cost 1.16-1.56x on a prototype method and 1.29-2.21x on a shared one — ' +
      'an order of magnitude below the fifth, which is why the rule starts there; and the ' +
      'threshold is wrong in the direction of silence for one form the same sweep measured: ' +
      'when every shape carries its OWN function the cost starts at the SECOND target ' +
      '(7.7-11.9x, flat from two to six, no threshold at all), and no declared type ' +
      'separates that from a prototype method, so the rule misses it rather than guessing',
    defects: ['TC-13'],
  },
  'accumulating-spread': {
    cost:
      `array spread ${N['spread.array.n1000']} at n=1000 and ${N['spread.array.n10000']} at ` +
      'n=10000 over three replications (two earlier sweeps read ' +
      `${N['spread.array.n10000.earlier']}); acc.concat(v) ${N['spread.concat']} at n=1000 ` +
      `(CI ${N['spread.concat.ci']}); object spread ${N['spread.object']} and ` +
      `Object.assign({}, acc, …) ${N['spread.assign']} at n=500, three replications each — ` +
      'the ratio grows with n, because the work is quadratic',
    source:
      'bench/spread.jl and bench/spread-object.jl, 20 pairs per cell, the three ' +
      'cells quoted as ranges replicated three times',
    silent:
      'a copy no loop re-runs is not this rule: with construction excluded the same four ' +
      'forms measure 0.03-1.73x, two to three orders of magnitude below the loop, so the ' +
      'cost is the re-copying and not the value it leaves behind; Object.assign(acc, …) ' +
      'mutates in place and is the fix rather than the defect, so it stays silent too; and ' +
      'a STRING is not this rule at any n — s = s + x, s += x and s = s.concat(x) build in ' +
      '0.27-0.56x of a push-and-join and 0.74-0.97x of it once the read back is counted, ' +
      'so all three BEAT the rewrite, because V8 appends into a cons-string (the n=100000 ' +
      'cells are replicated three times; one of the nine, s += x at construction, spread ' +
      '0.40-0.54x across the three and is withdrawn as unreplicable)',
    defects: [],
  },
  'allocating-select': {
    cost:
      `${N['select.heap']} when the chosen value is stored somewhere that outlives the loop ` +
      `(CI ${N['select.heap.ci10k']} at n=10000, ${N['select.heap.ci100k']} at n=100000)`,
    source: `bench/select.jl, ${N['select.cells']} cells, 20 pairs each`,
    silent:
      'on numbers there is no effect at all — 1.03x and 0.99x, both intervals spanning 1 — ' +
      'because Math.min allocates nothing; and escape analysis does not rescue the boxed ' +
      'form either: kept in a local the same loop still costs 1.72-2.28x',
    defects: [],
  },
  'chained-allocation': {
    // The 0.2 sweep read this cell at 7.64x and that number is not quoted here.
    // It was measured under the single cold calibration probe TC-5 rejected,
    // and its rows are in bench/chained-oldcal.jl as history, not as evidence.
    cost:
      `map then filter ${N['chained.mapfilter']} with construction counted at n=1000 ` +
      `(CI ${N['chained.mapfilter.ci']}); Object.entries(o).map(f) ` +
      `${N['chained.entries.n1000']} at n=1000 (CI ${N['chained.entries.n1000.ci']}) and ` +
      `${N['chained.entries.n10000']} at n=10000 (CI ${N['chained.entries.n10000.ci']}), ` +
      'where the waste is a two-element array per key on top of the array itself — every ' +
      'stage allocates a whole array that the next stage immediately discards',
    source: `bench/chained.jl, ${N['chained.cells']} cells in the 0.3 sweep, 20 pairs each`,
    silent:
      'reading the finished array costs nothing (0.94-1.03x across all six forms), and at ' +
      'n=100000 map-then-filter falls to 1.47x, where memory bandwidth dominates the ' +
      'allocation; Object.keys(o).map(f) is FASTER than the for-in loop that fuses it ' +
      '(0.94x and 0.95x), so keys stays out and the rule would be wrong to ask for that ' +
      'rewrite; .sort() and .reverse() sort in place and hand back the same array, so ' +
      'xs.map(f).sort() allocates no more than xs.map(f) does and measured 1.04-1.05x, ' +
      'both intervals spanning 1; and the split chain s.split(sep).map(f).join(sep) ' +
      'measured 1.06-1.09x against two different fusions, every point estimate under the ' +
      '1.10x a broad warning needs',
    defects: ['TC-9'],
  },
  'closed-world': {
    cost:
      'an opaque call is an inlining boundary, and a callee V8 refuses to inline costs ' +
      `${N['inline.reads']} in a hot loop (CI ${N['inline.ci100k']} at n=100000, ` +
      `${N['inline.ci1000']} at n=1000)`,
    source:
      `bench/inline.jl, ${N['inline.cells']} cells, 20 pairs each; the inlining decision ` +
      'itself confirmed with --trace-turbo-inlining, which reports the padded callee as ' +
      '"cannot consider"',
    silent:
      'this bounds what ONE unchecked call can cost, not what any particular one does cost ' +
      '— a small callee is inlined and the boundary costs nothing',
    defects: ['TC-10'],
  },
  'delete-property': {
    cost:
      `${N['delete.rows']} per property load once the object is in dictionary mode (n=16384 ` +
      `and n=262144, three replications each), and ${N['delete.vs.undefined']} against ` +
      `assigning undefined instead — and ${N['delete.single']} for ONE object with a single ` +
      'delete, at every working set and in all nine of its sweeps, which overturns the 0x ' +
      'this project published for that case since round 1; with construction counted ' +
      `${N['delete.rows.constr']} at n=256, where the delete is paid on every object built, ` +
      `and ${N['delete.single.constr']} for the single object`,
    source:
      `bench/delete.jl, ${N['delete.cells']} cells, 20 pairs each, every cell replicated ` +
      'three times; three cells disagree across sweeps and one is void, and all four are in ' +
      'the file',
    silent:
      'assigning undefined instead of deleting is the fix and not the defect — it costs ' +
      '1.01-1.10x on reads with two of three intervals spanning 1, and 1.07-1.19x to ' +
      'build; so is adding a property, which never demotes at any count. The old ' +
      'singleton exception is withdrawn: it was measured on a probe whose fast side a ' +
      'loop-invariant load could serve, and a kernel that has to load the object every ' +
      'pass says a single delete costs the same as a hundred thousand of them',
    defects: ['TC-9'],
  },
};

type Add = (f: Omit<Finding, 'evidence'>) => void;
type Rule = (ts: Ts, checker: TS.TypeChecker, body: Body, add: Add) => void;

const isLoop = (ts: Ts, n: TS.Node): boolean =>
  ts.isForStatement(n) ||
  ts.isForOfStatement(n) ||
  ts.isForInStatement(n) ||
  ts.isWhileStatement(n) ||
  ts.isDoStatement(n);

// Every node under `root`, root excluded: a rule is about what a body contains.
function walk(ts: Ts, root: TS.Node, fn: (n: TS.Node) => void): void {
  const visit = (node: TS.Node): void => {
    fn(node);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(root, visit);
}

// The same walk carrying whether a loop re-runs this node. Two rules price a
// statement per pass, so the enclosing loop is half of what they match: the
// same line outside one is a case their own benchmark rejected.
function walkLoops(ts: Ts, root: TS.Node, fn: (n: TS.Node, inLoop: boolean) => void): void {
  const visit = (node: TS.Node, inLoop: boolean): void => {
    fn(node, inLoop);
    ts.forEachChild(node, (c) => visit(c, inLoop || isLoop(ts, node)));
  };
  ts.forEachChild(root, (c) => visit(c, false));
}

// `x = …` that a loop re-runs — the shape both per-pass rules start from,
// before each asks its own question about the right-hand side.
const reassignedInLoop = (ts: Ts, node: TS.Node, inLoop: boolean): node is TS.BinaryExpression =>
  inLoop &&
  ts.isBinaryExpression(node) &&
  node.operatorToken.kind === ts.SyntaxKind.EqualsToken;

// DEFAULT_MAX_POLYMORPHIC_MAP_COUNT, the constant README's V8 table cites. Both
// megamorphic rules fire on the fifth map, from one threshold rather than two.
const MAX_CACHED_MAPS = 4;

// Members that could reach a site as distinct maps; a non-union answers 0,
// which is under every threshold, so callers only ask whether there are too many.
const objectShapes = (ts: Ts, t: TS.Type): number =>
  t.isUnion() ? t.types.filter((x) => x.flags & ts.TypeFlags.Object).length : 0;

const elementType = (ts: Ts, checker: TS.TypeChecker, t: TS.Type): TS.Type | undefined =>
  checker.getIndexTypeOfType(t, ts.IndexKind.Number);

const members = (t: TS.Type): readonly TS.Type[] => (t.isUnion() ? t.types : [t]);

// Whether the value really is an array — which `elementType` cannot answer.
// lib.es5 gives String a `readonly [index: number]: string` of its own, so a
// string passes the numeric index-signature test every other rule uses. A rule
// whose evidence is about Array has to ask the question directly.
const isArray = (checker: TS.TypeChecker, t: TS.Type): boolean =>
  members(t).every((x) => checker.isArrayType(x) || checker.isTupleType(x));

// Parameters of every body in the closed world, not just the annotated root.
// A helper three calls deep receives the same arrays and pays the same costs,
// which is the entire reason the walk recurses.
function arrayParams(
  ts: Ts,
  checker: TS.TypeChecker,
  body: Body
): Array<{ p: TS.ParameterDeclaration; type: TS.Type; element: TS.Type }> {
  const out = [];
  for (const p of body.node.parameters) {
    const type = checker.getTypeAtLocation(p);
    const element = elementType(ts, checker, type);
    if (element) out.push({ p, type, element });
  }
  return out;
}

// `boxed-elements` was here, and `bench/arrays.jl` withdrew it. A genuinely
// boxed array does cost 1.39-1.66x to read — but the rule fired on the DECLARED
// element type, and V8 picks the elements kind from the values actually stored
// (`src/objects/objects-inl.h:700`). A `(number | string)[]` holding only
// numbers is PACKED_DOUBLE_ELEMENTS, byte for byte the array `number[]` builds,
// and it measured 0.96-1.08x over six cells and eighteen sweeps with seventeen
// intervals spanning 1.0. Nothing static separates the array that will hold a
// string from the one that will not, so there is no narrower trigger to retreat
// to. bench/arrays.jl keeps the effect; the tool no longer reports it.

// V8's inline cache holds four maps. The fifth costs 3.6-10.6x on reads. Two
// to four shapes cost 1.2-2.0x — measurable, and an order of magnitude
// smaller, which is why the rule starts at five rather than earlier.
const megamorphicElements: Rule = (ts, checker, body, add) => {
  for (const { p, element } of arrayParams(ts, checker, body)) {
    const shapes = objectShapes(ts, element);
    if (shapes <= MAX_CACHED_MAPS) continue;
    add({
      ...at(body.sf, p),
      rule: 'megamorphic-elements',
      // A union member is not a V8 map. Five members reach a load site as five
      // maps only if they really are five shapes, so the finding says "unions",
      // states the mechanism, and lets the reader judge.
      message:
        `${p.name.getText(body.sf)} unions ${shapes} object types; V8 caches four maps ` +
        'per load site, so loads here go megamorphic unless some of them share a shape',
      fix: 'get the element type to four shapes or fewer, or give it one construction path',
    });
  }
};

// The same four maps govern a CALL site. `x.step()` where x is one of five
// classes is the form real TypeScript reaches this in — far more common than an
// array of a five-way union — and the cliff is sharper there than at a load
// site, because the fifth map costs the inlining as well as the cached lookup.
//
// This rule requires the CALL. TC-8 is the flagship rule reporting a
// megamorphic load from the type of a parameter without checking that anything
// is loaded, and the fixture that proves it reads `rows.length` and nothing
// else. A rule with the same hole in it would be the same defect twice.
const megamorphicDispatch: Rule = (ts, checker, body, add) => {
  // A method called on the elements of an array parameter is one union reaching
  // one site, and `megamorphic-elements` already reports that parameter.
  // Reporting both bills one defect twice — the mistake chained-allocation's
  // `consumed` check exists to avoid. The shipped rule keeps the finding.
  const claimed = new Set<TS.Type>();
  for (const { element } of arrayParams(ts, checker, body)) {
    if (objectShapes(ts, element) > MAX_CACHED_MAPS) claimed.add(element);
  }

  walk(ts, body.node, (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const receiver = node.expression.expression;
      const t = checker.getTypeAtLocation(receiver);
      const shapes = objectShapes(ts, t);
      if (shapes > MAX_CACHED_MAPS && !claimed.has(t)) {
        add({
          ...at(body.sf, node),
          rule: 'megamorphic-dispatch',
          // Same care as megamorphic-elements: a union member is not a V8 map
          // (TC-2). State the count, state the mechanism, leave the judgement.
          message:
            `${receiver.getText(body.sf)} unions ${shapes} object types and ` +
            `.${node.expression.name.text}() is called on it; V8 caches four maps per call ` +
            'site, so this call goes megamorphic unless some of them share a shape',
          fix: 'get the receiver to four object types or fewer, or give the call site one shape',
        });
      }
    }
  });
};

// Rebuilding an array or an object from a copy of itself copies every element
// it already holds, so a loop that does it n times does quadratic work. Written
// as a spread or as a call, the mechanism is the same. This is the only
// rule here whose cost is a complexity class rather than a constant factor,
// which is why it is the largest effect in the project.
const accumulatingSpread: Rule = (ts, checker, body, add) => {
  // Four forms copy the accumulator on every pass: [...acc, v],
  // { ...acc, [k]: v }, acc.concat(v), and Object.assign({}, acc, …). Each was
  // measured separately, because the constants differ by an order of magnitude.
  const spreadsSelf = (name: string, outer: TS.Node): boolean => {
    // `(acc, x) => ({ ...acc, k: x })` wraps the literal in parentheses.
    let node = outer;
    while (ts.isParenthesizedExpression(node)) node = node.expression;
    const isAcc = (e: TS.Node): boolean => ts.isIdentifier(e) && e.text === name;
    if (ts.isArrayLiteralExpression(node)) {
      return node.elements.some((e) => ts.isSpreadElement(e) && isAcc(e.expression));
    }
    if (ts.isObjectLiteralExpression(node)) {
      return node.properties.some((pr) => ts.isSpreadAssignment(pr) && isAcc(pr.expression));
    }
    // The call forms. `acc.concat(v)` carries the accumulator as the RECEIVER
    // and `Object.assign({}, acc, …)` as an argument, so neither is visible to
    // the literal matching above — the rule walked past both until it was
    // measured at 778x and 846-875x.
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const callee = node.expression;
      // `.concat()` belongs to String as much as to Array, and on a string it
      // is not this defect: measured 0.27-0.56x to build and 0.74-0.97x to
      // build and read back, FASTER than the push-and-join it would be
      // rewritten to, because V8 appends into a cons-string instead of copying.
      // Matching the NAME alone indicted that, and every other class that owns
      // a `concat` — a persistent list shares structure and is not copying
      // either. The receiver's type is what separates them, and where the type
      // is `any` there is nothing to separate: two measured-opposite mechanisms
      // wear this syntax, so an unknown receiver stays silent.
      if (callee.name.text === 'concat') {
        return (
          isAcc(callee.expression) &&
          isArray(checker, checker.getTypeAtLocation(callee.expression))
        );
      }
      // Object.assign(acc, …) mutates acc and returns it — that is the O(n)
      // fix, not the defect. Only a copy counts, and a copy is the accumulator
      // reaching Object.assign behind some other target.
      if (
        callee.name.text === 'assign' &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === 'Object'
      ) {
        return node.arguments.slice(1).some(isAcc);
      }
    }
    return false;
  };

  const report = (node: TS.Node, name: string): void =>
    add({
      ...at(body.sf, node),
      rule: 'accumulating-spread',
      message: `${name} is rebuilt from a copy of itself; every pass copies everything it already holds`,
      fix: `mutate ${name} in place — push, or assign the key — instead of rebuilding it`,
    });

  // The accumulator of a reduce is spread by the callback, so the loop that
  // re-runs it is inside reduce rather than in the annotated function.
  const reduceCallback = (node: TS.Node): void => {
    if (!ts.isCallExpression(node)) return;
    if (!ts.isPropertyAccessExpression(node.expression)) return;
    if (node.expression.name.text !== 'reduce') return;
    for (const arg of node.arguments) {
      if (!ts.isArrowFunction(arg) && !ts.isFunctionExpression(arg)) continue;
      const acc = arg.parameters[0];
      if (!acc || !ts.isIdentifier(acc.name)) continue;
      const name = acc.name.text;
      if (spreadsSelf(name, arg.body)) {
        report(node, name);
        continue;
      }
      walk(ts, arg.body, (n) => {
        if (ts.isReturnStatement(n) && n.expression && spreadsSelf(name, n.expression)) {
          report(node, name);
        }
      });
    }
  };

  walkLoops(ts, body.node, (node, inLoop) => {
    if (
      reassignedInLoop(ts, node, inLoop) &&
      ts.isIdentifier(node.left) &&
      spreadsSelf(node.left.text, node.right)
    ) {
      report(node, node.left.text);
    }
    reduceCallback(node);
  });
};

// Choosing between two boxed values with a call that returns a new one
// allocates on every pass, including every pass that chooses the value the
// target already held — which, for anything ordered, is nearly all of them. The
// predicate form compares and stores only on a real change.
//
// The target has to appear among the arguments. That is what makes the call a
// choice rather than arithmetic: `x = x.plus(1)` also allocates, but the value
// genuinely changed, and an immutable type has no cheaper way to say so.
const allocatingSelect: Rule = (ts, checker, body, add) => {
  const allocates = (call: TS.CallExpression): boolean => {
    const t = checker.getTypeAtLocation(call);
    // A primitive result is not an allocation. This is the whole reason
    // Math.min stays silent: it returns a number, and TurboFan lowers it to a
    // machine instruction. An array result belongs to the other rules.
    if (elementType(ts, checker, t)) return false;
    return members(t).every((x) => Boolean(x.flags & ts.TypeFlags.Object));
  };

  walkLoops(ts, body.node, (node, inLoop) => {
    if (reassignedInLoop(ts, node, inLoop) && ts.isCallExpression(node.right)) {
      const target = node.left.getText(body.sf);
      const call = node.right;
      if (call.arguments.some((a) => a.getText(body.sf) === target) && allocates(call)) {
        add({
          ...at(body.sf, node),
          rule: 'allocating-select',
          message:
            `${target} is replaced by ${call.expression.getText(body.sf)}(...), which returns a new ` +
            'object every pass, including the passes that choose the value it already held',
          fix: `compare first and assign only when ${target} really changes`,
        });
      }
    }
  });
};

const CHAINABLE = new Set(['map', 'filter', 'flatMap', 'concat', 'slice', 'flat']);

// A chain can also START at a call rather than at a value, and the one that was
// measured is Object.entries: it allocates the array AND a two-element array
// per key, all of it read once by the next stage. It is a call on the Object
// namespace, not a method on the chain's value, so the property-access matching
// below cannot see it without being told.
//
// Object.keys and Object.values are deliberately absent. keys was measured, and
// the chain BEAT the for-in loop that fuses it away — 0.94x and 0.95x — so the
// rewrite this rule asks for is a pessimization there. values was never
// measured. `sort`, `reverse` and `reduce` are absent for their own reasons,
// recorded in EVIDENCE.
const OBJECT_SOURCE = new Set(['entries']);

const stageText = (name: string): string =>
  name.startsWith('Object.') ? `${name}()` : `.${name}()`;

// Each stage of a chain allocates a whole array that the next stage reads once
// and discards. Fusing the stages into one pass allocates once. The cost is
// allocation, which is why it shows up with construction counted and washes out
// at large n, where memory bandwidth dominates instead.
const chainedAllocation: Rule = (ts, _checker, body, add) => {
  const stage = (node: TS.Node): string | undefined => {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) {
      return undefined;
    }
    const callee = node.expression;
    const name = callee.name.text;
    // Object.entries(o) is a namespace call. Reaching it through the same
    // helper is what keeps a three-stage chain one finding: the consumed check
    // below asks this function what the neighbouring calls are.
    if (ts.isIdentifier(callee.expression) && callee.expression.text === 'Object') {
      return OBJECT_SOURCE.has(name) ? `Object.${name}` : undefined;
    }
    return CHAINABLE.has(name) ? name : undefined;
  };

  walk(ts, body.node, (node) => {
    const outer = stage(node);
    if (outer && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const inner = stage(node.expression.expression);
      // A three-stage chain is one finding, not two: report only where the
      // chain ends, which is the call nothing further consumes.
      const consumed =
        node.parent &&
        ts.isPropertyAccessExpression(node.parent) &&
        Boolean(stage(node.parent.parent));
      if (inner && !consumed) {
        add({
          ...at(body.sf, node),
          rule: 'chained-allocation',
          message:
            `${stageText(inner)} then ${stageText(outer)} allocates a whole array ` +
            'between the stages',
          fix: 'do the stages in one pass, or one loop',
        });
      }
    }
  });
};

// delete is the one operation that moves an object to dictionary mode and does
// not move back.
const deleteProperty: Rule = (ts, _checker, body, add) => {
  walk(ts, body.node, (node) => {
    if (ts.isDeleteExpression(node)) {
      add({
        ...at(body.sf, node),
        rule: 'delete-property',
        message: `delete ${node.expression.getText(body.sf)} puts its object in dictionary mode`,
        fix: 'assign undefined, or build the object without the property',
      });
    }
  });
};

// The closed-world rule, and the only one that is about the mark rather than a
// body: the walk already followed every callee whose source we have, so what is
// left is a dependency we cannot read. That is where the promise stops.
function closedWorld(mark: Mark, add: Add): void {
  for (const c of mark.escapes) {
    add({
      file: c.file,
      line: c.line,
      column: c.column,
      rule: 'closed-world',
      message: `calls ${c.text}, which we have no body for; the promise stops here`,
      fix: `inline what you need from ${c.text}, or accept that this call is unchecked`,
    });
  }
}

const RULES: Rule[] = [
  megamorphicElements,
  megamorphicDispatch,
  accumulatingSpread,
  allocatingSelect,
  chainedAllocation,
  deleteProperty,
];

export function check(ts: Ts, checker: TS.TypeChecker, mark: Mark): Finding[] {
  const findings: Finding[] = [];
  const add: Add = (f) => findings.push({ ...f, evidence: EVIDENCE[f.rule] ?? null });
  // Every rule over every body the annotation reaches. njit compiles the call
  // tree; we check the call tree.
  for (const body of mark.reached) {
    for (const rule of RULES) rule(ts, checker, body, add);
  }
  closedWorld(mark, add);
  return findings;
}

// A disable key is either a rule name, or a defect code that names every rule
// carrying it — a config's [rules] table and an annotation's `-key` both go
// through here. An unknown key is not disabling anything, silently, which is
// the same lie a typo tells anywhere else in this project: it throws instead.
export function resolveDisabled(keys: Iterable<string>): Set<string> {
  const rules = new Set<string>();
  for (const key of keys) {
    if (key in EVIDENCE) {
      rules.add(key);
      continue;
    }
    const byDefect = Object.entries(EVIDENCE).filter(([, e]) => e.defects.includes(key));
    if (byDefect.length === 0) {
      throw new Error(`unknown rule or defect code: ${key}`);
    }
    for (const [name] of byDefect) rules.add(name);
  }
  return rules;
}
