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
      '177x at n=1000 and 2348x at n=10000 with construction counted ' +
      '(CI 157-202 and 1837-2892) — the ratio grows with n, because the work is quadratic',
    source: 'bench/spread.jsonl, 4 cells, 20 pairs each',
    silent:
      'reading the finished array costs nothing — 0.96x at n=1000 and 0.98x at n=10000 — ' +
      'so a spread no loop re-runs is not this rule',
  },
  'chained-allocation': {
    cost:
      '7.13x with construction counted at n=1000 (CI 6.64-7.64) — every stage ' +
      'allocates a whole array that the next stage immediately discards',
    source: 'bench/chained.jsonl, 4 cells, 20 pairs each',
    silent:
      'reading the result costs nothing (0.98x and 1.05x, both intervals include 1), and at ' +
      'n=100000 the effect falls to 1.45x, where memory bandwidth dominates the allocation',
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

const elementType = (ts: Ts, checker: TS.TypeChecker, t: TS.Type): TS.Type | undefined =>
  checker.getIndexTypeOfType(t, ts.IndexKind.Number);

const members = (t: TS.Type): readonly TS.Type[] => (t.isUnion() ? t.types : [t]);

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

// Rebuilding an array from a spread of itself copies every element it already
// holds, so a loop that does it n times does quadratic work. This is the only
// rule here whose cost is a complexity class rather than a constant factor,
// which is why it is the largest effect in the project.
const accumulatingSpread: Rule = (ts, _checker, body, add) => {
  const spreadsSelf = (name: string, node: TS.Node): boolean =>
    ts.isArrayLiteralExpression(node) &&
    node.elements.some(
      (e) => ts.isSpreadElement(e) && ts.isIdentifier(e.expression) && e.expression.text === name
    );

  const report = (node: TS.Node, name: string): void =>
    add({
      ...at(body.sf, node),
      rule: 'accumulating-spread',
      message: `${name} is rebuilt from a spread of itself; every pass copies every element it already holds`,
      fix: `push onto ${name} instead, or build the parts and concatenate once at the end`,
    });

  const isLoop = (n: TS.Node): boolean =>
    ts.isForStatement(n) ||
    ts.isForOfStatement(n) ||
    ts.isForInStatement(n) ||
    ts.isWhileStatement(n) ||
    ts.isDoStatement(n);

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
    ts.forEachChild(node, (c) => visit(c, inLoop || isLoop(node)));
  };
  ts.forEachChild(body.node, (c) => visit(c, false));
};

const CHAINABLE = new Set(['map', 'filter', 'flatMap', 'concat', 'slice', 'flat']);

// Each stage of a chain allocates a whole array that the next stage reads once
// and discards. Fusing the stages into one pass allocates once. The cost is
// allocation, which is why it shows up with construction counted and washes out
// at large n, where memory bandwidth dominates instead.
const chainedAllocation: Rule = (ts, _checker, body, add) => {
  const stage = (node: TS.Node): string | undefined => {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) {
      return undefined;
    }
    const name = node.expression.name.text;
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
          message: `.${inner}() then .${outer}() allocates a whole array between the stages`,
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
