import type * as TS from 'typescript';
import type { Ts } from './ts.ts';
import { at, type Body, type Mark, type Site } from './scan.ts';

export interface Evidence {
  cost: string;
  source: string;
  silent: string;
}

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
  'boxed-elements': {
    cost:
      '1.45-1.89x on reads, 2.36-3.28x with construction — ONE sweep, unreplicated, ' +
      'and inside the 1.0-1.7x band a second sweep showed this harness cannot resolve',
    source: 'bench-arrays.md round 2, suite A',
    silent:
      'holey arrays (0.94-1.09, interval includes 1); also silent on `any` and on an ' +
      'unresolved type parameter, neither of which says anything about representation',
  },
  'megamorphic-elements': {
    cost:
      '3.6-10.6x on reads across L1, L2 and L3; 1.1-3.5x once construction is counted, ' +
      'where allocation swamps the load',
    source: 'bench/shapes-calibrated.jsonl, 24 cells, 20 pairs each',
    silent:
      'two to four shapes cost 1.2-2.0x on reads — real, and measured, but an order of ' +
      'magnitude below the fifth, which is why the rule starts there and not earlier',
  },
  'accumulating-spread': {
    cost:
      'array spread 156-177x at n=1000 and 1877-2348x at n=10000 across two sweeps; ' +
      'acc.concat(v) 779x at n=1000 (CI 733-821); object spread 197-210x at n=500; ' +
      'Object.assign({}, acc, …) 815x at n=500 (CI 769-874) — the ratio grows with n, ' +
      'because the work is quadratic',
    source: 'bench/spread.jsonl and bench/spread-object.jsonl, 20 pairs per cell',
    silent:
      'a copy no loop re-runs is not this rule: with construction excluded the same four ' +
      'forms measure 0.03-1.73x, two to three orders of magnitude below the loop, so the ' +
      'cost is the re-copying and not the value it leaves behind; Object.assign(acc, …) ' +
      'mutates in place and is the fix rather than the defect, so it stays silent too; and ' +
      'a STRING is not this rule at any n — s = s + x, s += x and s = s.concat(x) build in ' +
      '0.27-0.54x of a push-and-join and 0.79-0.96x of it once the read back is counted, ' +
      'so all three BEAT the rewrite, because V8 appends into a cons-string',
  },
  'allocating-select': {
    cost:
      '2.65-2.73x when the chosen value is stored somewhere that outlives the loop ' +
      '(CI 2.48-2.81 at n=10000, 2.58-2.88 at n=100000)',
    source: 'bench/select.jsonl, 6 cells, 20 pairs each',
    silent:
      'on numbers there is no effect at all — 1.03x and 0.99x, both intervals spanning 1 — ' +
      'because Math.min allocates nothing; and escape analysis does not rescue the boxed ' +
      'form either: kept in a local the same loop still costs 1.72-2.28x',
  },
  'chained-allocation': {
    cost:
      'map then filter 7.64x and 7.89x with construction counted at n=1000 across two ' +
      'sweeps (CI 7.20-8.09 and 7.41-8.41); Object.entries(o).map(f) 3.59x at n=1000 ' +
      '(CI 3.44-3.77) and 2.65x at n=10000 (CI 2.56-2.74), where the waste is a ' +
      'two-element array per key on top of the array itself — every stage allocates a ' +
      'whole array that the next stage immediately discards',
    source: 'bench/chained.jsonl, 24 cells in the 0.3 sweep, 20 pairs each',
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
  },
  'closed-world': {
    cost:
      'an opaque call is an inlining boundary, and a callee V8 refuses to inline costs ' +
      '4.42-4.79x in a hot loop (CI 4.18-4.70 at n=100000, 4.56-5.05 at n=1000)',
    source:
      'bench/inline.jsonl, 2 cells, 20 pairs each; the inlining decision itself confirmed ' +
      'with --trace-turbo-inlining, which reports the padded callee as "cannot consider"',
    silent:
      'this bounds what ONE unchecked call can cost, not what any particular one does cost ' +
      '— a small callee is inlined and the boundary costs nothing',
  },
  'delete-property': {
    cost: '28-67x per property load once the object is in dictionary mode',
    source: 'options.md round 3b',
    silent: 'assigning a new property is not this; only delete demotes',
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

const elementType = (ts: Ts, checker: TS.TypeChecker, t: TS.Type): TS.Type | undefined =>
  checker.getIndexTypeOfType(t, ts.IndexKind.Number);

const members = (t: TS.Type): readonly TS.Type[] => (t.isUnion() ? t.types : [t]);

// Whether the value really is an array — which `elementType` cannot answer.
// lib.es5 gives String a `readonly [index: number]: string` of its own, so a
// string passes the numeric index-signature test every other rule uses. A rule
// whose evidence is about Array has to ask the question directly.
const isArray = (checker: TS.TypeChecker, t: TS.Type): boolean =>
  members(t).every((x) => checker.isArrayType(x) || checker.isTupleType(x));

const isNumeric = (ts: Ts, t: TS.Type): boolean =>
  Boolean(t.flags & (ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral));

function isFastElement(ts: Ts, t: TS.Type): boolean {
  const f = t.flags;
  // An unresolved type parameter is not evidence of anything. `readonly T[]`
  // says nothing about representation, and treating it as unfast fires this
  // rule on every function of every generic library.
  // Neither is an unresolved type parameter nor `any`. Absence of information
  // is not evidence of boxing, and firing on it buries a real finding under
  // one warning per generic function.
  if (f & (ts.TypeFlags.TypeParameter | ts.TypeFlags.TypeVariable)) return true;
  if (f & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return true;
  // An object type is one shape, which is the fast case. Divergence across
  // several object types is megamorphic-elements' job, not this rule's.
  return Boolean(
    f &
      (ts.TypeFlags.Number |
        ts.TypeFlags.NumberLiteral |
        ts.TypeFlags.String |
        ts.TypeFlags.StringLiteral |
        ts.TypeFlags.BooleanLike |
        ts.TypeFlags.Object)
  );
}

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

// A boxed element forces V8 out of PACKED_DOUBLE into a pointer array: every
// read becomes a load plus a dereference.
const boxedElements: Rule = (ts, checker, body, add) => {
  for (const { p, type, element } of arrayParams(ts, checker, body)) {
    const parts = members(element);
    const unfast = parts.some((x) => !isFastElement(ts, x));
    const mixed = parts.length > 1 && parts.some((x) => isNumeric(ts, x)) && parts.some((x) => !isNumeric(ts, x));
    if (!unfast && !mixed) continue;
    add({
      ...at(body.sf, p),
      rule: 'boxed-elements',
      message: `${p.name.getText(body.sf)} is ${checker.typeToString(type)}; its elements cannot stay unboxed`,
      fix: 'give the array one element type, or use a typed array',
    });
  }
};

// V8's inline cache holds four maps. The fifth costs 3.6-10.6x on reads. Two
// to four shapes cost 1.2-2.0x — measurable, and an order of magnitude
// smaller, which is why the rule starts at five rather than earlier.
const megamorphicElements: Rule = (ts, checker, body, add) => {
  for (const { p, element } of arrayParams(ts, checker, body)) {
    if (!element.isUnion()) continue;
    const shapes = element.types.filter((x) => x.flags & ts.TypeFlags.Object);
    if (shapes.length < 5) continue;
    add({
      ...at(body.sf, p),
      rule: 'megamorphic-elements',
      // A union member is not a V8 map. Five members reach a load site as five
      // maps only if they really are five shapes, so the finding says "unions",
      // states the mechanism, and lets the reader judge.
      message:
        `${p.name.getText(body.sf)} unions ${shapes.length} object types; V8 caches four maps ` +
        'per load site, so loads here go megamorphic unless some of them share a shape',
      fix: 'get the element type to four shapes or fewer, or give it one construction path',
    });
  }
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
    // measured at 778x and 815x.
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const callee = node.expression;
      // `.concat()` belongs to String as much as to Array, and on a string it
      // is not this defect: measured 0.27-0.54x to build and 0.79-0.96x to
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
      const returns = (n: TS.Node): void => {
        if (ts.isReturnStatement(n) && n.expression && spreadsSelf(name, n.expression)) {
          report(node, name);
        }
        ts.forEachChild(n, returns);
      };
      ts.forEachChild(arg.body, returns);
    }
  };

  const visit = (node: TS.Node, inLoop: boolean): void => {
    if (
      inLoop &&
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left) &&
      spreadsSelf(node.left.text, node.right)
    ) {
      report(node, node.left.text);
    }
    reduceCallback(node);
    ts.forEachChild(node, (c) => visit(c, inLoop || isLoop(ts, node)));
  };
  ts.forEachChild(body.node, (c) => visit(c, false));
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

  const visit = (node: TS.Node, inLoop: boolean): void => {
    if (
      inLoop &&
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isCallExpression(node.right)
    ) {
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
    ts.forEachChild(node, (c) => visit(c, inLoop || isLoop(ts, node)));
  };
  ts.forEachChild(body.node, (c) => visit(c, false));
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

  const visit = (node: TS.Node): void => {
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
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body.node, visit);
};

// delete is the one operation that moves an object to dictionary mode and does
// not move back.
const deleteProperty: Rule = (ts, _checker, body, add) => {
  const visit = (node: TS.Node): void => {
    if (ts.isDeleteExpression(node)) {
      add({
        ...at(body.sf, node),
        rule: 'delete-property',
        message: `delete ${node.expression.getText(body.sf)} puts its object in dictionary mode`,
        fix: 'assign undefined, or build the object without the property',
      });
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body.node, visit);
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
  boxedElements,
  megamorphicElements,
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
