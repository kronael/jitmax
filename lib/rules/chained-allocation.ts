import type * as TS from 'typescript';
import type { Ts } from '../ts.ts';
import { at, unwrap } from '../scan.ts';
import { N } from '../numbers.ts';
import { cells, isArray, walk, type Evidence, type Rule, type RuleModule } from './shared.ts';

// The rule's name, once. It was a terminal string in the finding and a second
// terminal string in the exported rule below, and the pair that drifted was in
// interface-dispatch.ts, which reports a rule that is not its own.
const NAME = 'chained-allocation';

const evidence: Evidence = {
  // The 0.2 sweep read this cell at 7.64x and that number is not quoted here.
  // It was measured under the single cold calibration probe TC-5 rejected,
  // and its rows are in bench/chained-oldcal.jl as history, not as evidence.
  cost:
    `map then filter ${N['chained.mapfilter']} with construction counted ` +
    `(CI ${N['chained.mapfilter.ci']}) — this rule headlined ` +
    `${N['chained.mapfilter.withdrawn']} until rule 13 was enforced where the numbers are ` +
    'made, and those three are one cell measured three times with no value common to all ' +
    `three, so the cell is withdrawn and ${N['chained.mapfilter']} is the size that ` +
    'replicates (TC-37); Object.entries(o).map(f) ' +
    `${N['chained.entries.n1000']} at n=1000 (CI ${N['chained.entries.n1000.ci']}) and ` +
    `${N['chained.entries.n10000']} at n=10000 (CI ${N['chained.entries.n10000.ci']}), ` +
    'where the waste is a two-element array per key on top of the array itself — every ' +
    'stage allocates a whole array that the next stage immediately discards',
  source: `bench/chained.jl, ${cells(N['chained.cells'])} in the 0.3 sweep, 20 pairs each`,
  silent:
    `reading the finished array costs nothing (${N['chained.silent.reads']} across all ` +
    'six forms), so a chain built once and read many times is not what this sweep ' +
    'measured. This clause used to add "and at n=100000 map-then-filter falls to" a ' +
    'figure that is the SAME figure the cost above quotes: the n=1000 cell it fell FROM ' +
    'was withdrawn under rule 13 (TC-37), and the sentence outlived its comparator. ' +
    'map-then-filter now has no measured silence at any size, which is half of what ' +
    'TC-9 is about for this rule; Object.keys(o).map(f) is FASTER ' +
    `than the for-in loop that fuses it (${N['chained.silent.keys']}), so keys stays out ` +
    'and the rule would be wrong to ask for that rewrite; .sort() and .reverse() sort in ' +
    'place and hand back the same array, so xs.map(f).sort() allocates no more than ' +
    `xs.map(f) does and measured ${N['chained.silent.sort']} with every interval ` +
    `(${N['chained.silent.sort.ci']}) spanning 1; and the split chain ` +
    `s.split(sep).map(f).join(sep) measured ${N['chained.silent.split']} against two ` +
    'different fusions, which is at the 1.10x a broad warning needs rather than clear of ' +
    'it — the rule stays out and the margin is one hundredth',
  defects: ['TC-9'],
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
// The largest array a `.slice()` in the chain can hand on, when both of its
// arguments are integer literals. `xs.slice(0, 10)` is ten elements whatever
// `xs` is, and the intermediate array the rule wants removed is ten elements
// too. Undefined when nothing in the chain bounds it — the ordinary case, and
// the one TC-9 is about.
function literalBound(ts: Ts, node: TS.Node): number | undefined {
  const int = (a: TS.Node | undefined): number | undefined =>
    a && ts.isNumericLiteral(a) ? Number(a.text) : undefined;
  let best: number | undefined;
  // The exported unwrap at every hop. This walked raw nodes, so one erased
  // token defeated the whole gate: `(['a','b','c'] as const).map(f).filter(g)`
  // stopped at the AsExpression and failed the build over a three-element
  // intermediate. TC-54 recorded "no chain in the survey carries a literal
  // bound", which was true only of the spelling it checked — typescript-eslint's
  // `member-ordering.ts:320` carries a four-element one behind `as const`
  // (BUGS TC-116).
  let n: TS.Node = unwrap(ts, node as TS.Expression);
  for (; ts.isCallExpression(n); n = unwrap(ts, n.expression.expression)) {
    if (!ts.isPropertyAccessExpression(n.expression)) break;
    if (n.expression.name.text === 'slice') {
      const [from, to] = [int(n.arguments[0]), int(n.arguments[1])];
      // `slice(0, 10)` and `slice(-10, -5)` both bound to `to - from`, because
      // two indices of the same sign are the same distance apart either way.
      // `slice(-10)` bounds to 10. `slice(10)` and `slice(2, -3)` bound
      // nothing: both depend on a length the tool cannot see.
      const sameSign = from !== undefined && to !== undefined && from < 0 === to < 0;
      const bound = sameSign ? Math.max(0, to! - from!)
        : from !== undefined && from < 0 && to === undefined ? -from
        : undefined;
      if (bound !== undefined) best = best === undefined ? bound : Math.min(best, bound);
    }
  }
  // The base of the chain bounds it too. `[1, 2, 3].map(f).filter(g)` allocates
  // a three-element intermediate, and the rule failed the build over it. TC-54
  // named a literal-length array beside `.slice`; only `.slice` was shipped. A
  // spread element puts the length back out of reach.
  if (ts.isArrayLiteralExpression(n) && !n.elements.some((e) => ts.isSpreadElement(e))) {
    const len = n.elements.length;
    best = best === undefined ? len : Math.min(best, len);
  }
  return best;
}

// Below the smallest n this rule's own sweep covers, it says nothing. TC-9 says
// a rule cannot know n; here n is written in the chain as an integer literal
// argument to a stage the rule already matched, and the rule walked over it.
// `bench/chained.jl` starts at this size, so under it the rule is quoting a
// sweep that never went there (BUGS TC-54).
const CHAINED_MIN_N = Number(N['chained.n.min']);

const detect: Rule = (ts, checker, body, add) => {
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
      // The receiver has to BE an array. The rule paired call names and never
      // read the type, so `str.concat("x").slice(1)` — a string, no array
      // allocated anywhere in it — was reported as allocating one between the
      // stages (BUGS TC-35). `accumulating-spread` reads the receiver's type
      // for the same reason and against the same measurement: on a string,
      // `concat` is faster than the rewrite this rule would ask for.
      const onArray = isArray(checker, checker.getTypeAtLocation(node.expression.expression));
      // Read from the INNER stage, not from the whole chain: a bound only binds
      // what comes after it. `xs.map(f).slice(0, 10)` slices the RESULT, and the
      // `.map()` before it still allocated one element per element of `xs` —
      // the allocation this rule exists for, which a trailing `.slice()` was
      // silencing. `xs.slice(0, 10).map(f)` is the case TC-54 fixed, and the
      // bound is real there because the slice runs first.
      const bound = literalBound(ts, node.expression.expression);
      if (inner && !consumed && onArray && !(bound !== undefined && bound < CHAINED_MIN_N)) {
        add({
          ...at(body.sf, node),
          rule: NAME,
          message:
            `${stageText(inner)} then ${stageText(outer)} allocates a whole array ` +
            'between the stages',
          fix: 'do the stages in one pass, or one loop',
        });
      }
    }
  });
};

export const chainedAllocation: RuleModule = {
  name: NAME,
  evidence,
  scope: 'body',
  detect,
};
