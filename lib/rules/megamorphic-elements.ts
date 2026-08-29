import type * as TS from 'typescript';
import type { Ts } from '../ts.ts';
import { at, type Body } from '../scan.ts';
import { N } from '../numbers.ts';
import {
  arrayParams,
  cells,
  MAX_CACHED_MAPS,
  members,
  objectShapes,
  receiver,
  walk,
  type Evidence,
  type Rule,
} from './shared.ts';

const evidence: Evidence = {
  cost:
    `${N['elem.reads']} on reads across L1, L2 and L3 — five distinct property sets ` +
    `against one, three whole sweeps per cell; ${N['elem.constr.l1l2']} once construction ` +
    'is counted at L1, where allocation swamps the load, and the L2 cell there does not ' +
    `replicate and is withdrawn; ${N['elem.constr.l3']} at RAM size, where bandwidth ` +
    'dominates and the fifth shape costs nothing',
  source:
    `bench/shape-sets.jl, ${cells(N['elem.cells'])}, 20 pairs each. This rule quoted ` +
    'bench/shapes-calibrated.jl until 2026-08-19, and that sweep varies key ORDER — five ' +
    'builders over one key set, five V8 maps, and exactly ONE TypeScript type. It priced a ' +
    'program this rule is silent on (BUGS TC-42). bench/shape-sets.ts sweeps the same cells ' +
    'over five key SETS, which is the shape a declared type can express and this rule counts',
  silent:
    `two to four property sets cost ${N['elem.silent.24']} on reads — real at L1, nothing ` +
    'at RAM size, and an order of magnitude below the fifth, which is why the rule starts ' +
    'there and not earlier',
  unreported:
    'five key ORDERS of one key set are five maps at the same load site and cost ' +
    `${N['elem.keyorder.reads']} on reads — the same order as the case this rule does ` +
    'report. Key order is not part of a TypeScript type, so nothing static separates that ' +
    'program from one where the five builders agree. The rule misses it rather than ' +
    'guessing, and bench/shapes-calibrated.jl is what it misses',
  severity: 'error',
  defects: ['TC-2', 'TC-9'],
};

// Whether this body READS a property off an element of the array. What goes
// megamorphic is not a load specifically, it is a map-keyed inline cache site,
// and V8 has several: LoadIC, StoreIC, the call site's own, KeyedHasIC for
// `in`. Each carries the same four-map budget. TypeScript writes the first
// three as one AST node, so one check finds them all.
//
// It is narrowed to a READ anyway, because the benchmark measured one — the
// kernel is `s += r.x + r.y`. A body whose only contact with the element is
// `r.x = v` pays a StoreIC that nothing in bench/shape-sets.jl priced, and
// firing there would quote a read's number for a write. `in` is left out for
// the same reason and is the known gap.
//
// A method call counts: `r.area()` loads `area` off r's map before calling it.
// So does a destructure, which is the same read written without a dot.
function readsFromElement(
  ts: Ts,
  checker: TS.TypeChecker,
  body: Body,
  element: TS.Type
): boolean {
  const isElement = (t: TS.Type): boolean =>
    t === element || members(element).includes(t);
  // `r.x = v` writes and never reads. `r.x += v` and `r.x++` read first, so
  // only the plain assignment is excluded — and a destructuring assignment is
  // one: `[r.x] = [5]` and `({ x: r.x } = src)` store without loading, and the
  // access sits under a literal rather than directly under the `=`. Matching
  // only the direct parent counted those as reads and fired the rule on a body
  // that never loads anything, which is TC-8 again in the shape its fix missed.
  const isStoreTarget = (node: TS.Node): boolean => {
    let n: TS.Node = node;
    while (
      n.parent !== undefined &&
      (ts.isArrayLiteralExpression(n.parent) ||
        ts.isObjectLiteralExpression(n.parent) ||
        ts.isPropertyAssignment(n.parent) ||
        ts.isSpreadElement(n.parent) ||
        ts.isSpreadAssignment(n.parent))
    ) {
      n = n.parent;
    }
    return (
      n.parent !== undefined &&
      ts.isBinaryExpression(n.parent) &&
      n.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      n.parent.left === n
    );
  };
  let found = false;
  walk(ts, body.node, (node) => {
    if (found) return;
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      if (
        !isStoreTarget(node) &&
        isElement(checker.getTypeAtLocation(receiver(ts, node.expression)))
      ) {
        found = true;
      }
      return;
    }
    if (ts.isObjectBindingPattern(node) && isElement(checker.getTypeAtLocation(node))) {
      found = true;
    }
  });
  return found;
}

// V8's inline cache holds four maps, and the fifth is an order of magnitude
// past the fourth, which is why the rule starts at five rather than earlier.
// The two figures are `elem.reads` and `elem.silent.24`; they are not repeated
// here, because a comment quoting a measurement is a fourth copy of it and
// this file has already had three drift (BUGS TC-28).
const detect: Rule = (ts, checker, body, add) => {
  for (const { p, element } of arrayParams(ts, checker, body)) {
    const shapes = objectShapes(ts, checker, element);
    if (shapes <= MAX_CACHED_MAPS) continue;
    // The load has to be there. This rule read the parameter's type and
    // inferred a megamorphic load site from it, so a function whose whole body
    // is `return rows.length` was billed the fifth map's cost — and
    // `rows.length` loads off the ARRAY, which has one shape whatever the
    // elements are. The benchmark's kernel is `s += r.x + r.y`; with no load
    // off an element there is no site to go megamorphic, and the annotation
    // cannot rescue it, because hot code that never reads a property still
    // never reads a property (BUGS TC-8).
    if (!readsFromElement(ts, checker, body, element)) continue;
    add({
      ...at(body.sf, p),
      rule: 'megamorphic-elements',
      // What the count is, said in the words of the thing counted. It read
      // "unions N object types" while counting union members, and a reader who
      // took that literally could satisfy the fix by renaming a member (TC-42).
      // Distinct property sets cannot be merged by a rename.
      message:
        `${p.name.getText(body.sf)} reaches this line as ${shapes} distinct property sets; ` +
        'V8 caches four maps per load site, so a fifth makes every load here a lookup',
      fix:
        'get the element type to four distinct property sets or fewer, or give it one ' +
        'construction path — renaming a member does not merge two shapes',
    });
  }
};

export const megamorphicElements = {
  name: 'megamorphic-elements',
  evidence,
  detect,
};
