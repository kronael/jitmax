import type * as TS from 'typescript';
import type { Ts } from '../ts.ts';
import { isFunctionLike, type Body, type Dispatch, type Mark, type Site } from '../scan.ts';

export interface Evidence {
  cost: string;
  source: string;
  // Where the same benchmark measured the pattern and found nothing worth
  // warning about. A rule that fires here contradicts its own evidence, and a
  // test asserts it stays quiet.
  silent: string;
  // Where the same benchmark found a REAL cost that this rule deliberately does
  // not report, because no declared type separates that case from one it would
  // be wrong to warn about. Split out of `silent` because the two were being
  // summarised as one thing — "where the benchmark found nothing" — and for two
  // rules that summary was false (BUGS TC-39). A rule with nothing to say here
  // leaves it out.
  unreported?: string;
  // `error` when a benchmark measures the program this rule fires on, `warn`
  // when none does. Only an error sets the exit code; a warning is printed and
  // does not fail a build. Stated per rule and not per finding, because what
  // separates the two is the evidence and not the site.
  //
  // This replaces the `bound` flag, which existed so the report could print the
  // word `bound` instead of `measured` beside a number (BUGS TC-33). The report
  // prints no number now, so that flag had no reader left. Severity is the
  // stronger form of the same distinction and it reaches the exit code, which
  // is what a CI user actually feels. Two rules are `warn`: `closed-world`,
  // which fires on a callee with no readable body, and `megamorphic-dispatch`,
  // whose own `source` says no sweep varies the key set at a call site. Neither
  // has a benchmark that ran the program it fires on.
  severity: 'error' | 'warn';
  // BUGS.md issue numbers this rule is known to be wrong or unproven about.
  // Empty when the rule carries no open defect. This is the register a
  // config or an annotation disables by defect code instead of by name.
  defects: string[];
}

export interface Finding extends Site {
  rule: string;
  message: string;
  fix: string;
  evidence: Evidence | null;
}

// A derived count reaching prose that assumes it is plural. `inline.cells` is
// 1, and the sentence read "bench/inline.jl, 1 cells" — the numeral is right
// and the word beside it was hand-written and fixed. Any sweep rule 13 withdraws
// down to one cell reaches the same sentence (BUGS TC-70).
export const cells = (n: string): string => `${n} cell${n === '1' ? '' : 's'}`;

export type Add = (f: Omit<Finding, 'evidence'>) => void;
// The mark is the whole annotated call tree. Most rules are about one body and
// ignore it; `delete-property` reads it, because whether "assign undefined" is
// a rewrite or a data corruption depends on what the REST of the tree does
// with the deleted object (BUGS TC-79).
export type Rule = (ts: Ts, checker: TS.TypeChecker, body: Body, add: Add, mark: Mark) => void;
// The rules that read `mark.escapes` instead — the calls the walk could NOT
// follow, which are a property of the whole mark and not of any one body.
export type EscapeRule = (mark: Mark, add: Add) => void;

// What every file in lib/rules/ exports, and the only thing lib/rules/index.ts
// registers. `scope` is on the rule because it used to be at the call site: a
// hand-written array held the six body rules, a hand-written map held all eight
// evidences, and two detectors were called by name below both — three registers
// a new rule had to reach, and a rule that reached only two lost its evidence
// silently and downgraded itself to a warning.
export type RuleModule =
  | { name: string; evidence: Evidence; scope: 'body'; detect: Rule }
  | { name: string; evidence: Evidence; scope: 'escapes'; detect: EscapeRule };

const isLoop = (ts: Ts, n: TS.Node): boolean =>
  ts.isForStatement(n) ||
  ts.isForOfStatement(n) ||
  ts.isForInStatement(n) ||
  ts.isWhileStatement(n) ||
  ts.isDoStatement(n);

// Every node under `root`, root excluded: a rule is about what a body contains.
export function walk(ts: Ts, root: TS.Node, fn: (n: TS.Node) => void): void {
  const visit = (node: TS.Node): void => {
    fn(node);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(root, visit);
}

// A callback an array method re-runs per element is a loop the syntax does not
// spell. `reduce` was hand-special-cased for exactly this reason and `forEach`
// was not, so `xs.forEach(x => { acc = [...acc, x] })` — the same quadratic copy
// with the accumulator in a closure instead of a parameter — went unreported
// (BUGS TC-43). Only the callback ARGUMENTS count as the loop body: the
// receiver is evaluated once, so a spread there is not re-run.
//
// `reduce` and `reduceRight` are here as well as in accumulating-spread's own
// handler, which sees only a callback that RETURNS the copy. The assigning form
// — `(acc, x) => { acc = [...acc, x]; return acc }` — is an assignment inside a
// re-run body, which is what this set is for, and it went unreported while
// `reduce` was absent from it. `reduceRight` was named nowhere at all.
const ITERATION = new Set([
  'forEach', 'map', 'flatMap', 'filter', 'some', 'every', 'find', 'reduce', 'reduceRight',
]);

// The RECEIVER has to be an array, not just the method name an array's. A
// Result type's `map` runs its callback at most once, and matching the name
// alone made that a loop — so `accumulating-spread` claimed quadratic copying
// on a body nothing re-runs, which is its own silent clause. TC-35 was this
// defect in `chained-allocation`; this is the same one in the helper TC-43's
// fix introduced.
const iterationCallbacks = (ts: Ts, checker: TS.TypeChecker, n: TS.Node): TS.Node[] =>
  ts.isCallExpression(n) &&
  ts.isPropertyAccessExpression(n.expression) &&
  ITERATION.has(n.expression.name.text) &&
  isArray(checker, checker.getTypeAtLocation(n.expression.expression))
    ? n.arguments.filter((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a))
    : [];

// The same walk carrying whether a loop re-runs this node. Two rules price a
// statement per pass, so the enclosing loop is half of what they match: the
// same line outside one is a case their own benchmark rejected.
export function walkLoops(
  ts: Ts,
  checker: TS.TypeChecker,
  root: TS.Node,
  fn: (n: TS.Node, inLoop: boolean) => void
): void {
  const visit = (node: TS.Node, inLoop: boolean): void => {
    fn(node, inLoop);
    const bodies = new Set(iterationCallbacks(ts, checker, node));
    ts.forEachChild(node, (c) => visit(c, inLoop || isLoop(ts, node) || bodies.has(c)));
  };
  ts.forEachChild(root, (c) => visit(c, false));
}

// `x = …` that a loop re-runs — the shape both per-pass rules start from,
// before each asks its own question about the right-hand side.
export const reassignedInLoop = (ts: Ts, node: TS.Node, inLoop: boolean): node is TS.BinaryExpression =>
  inLoop &&
  ts.isBinaryExpression(node) &&
  node.operatorToken.kind === ts.SyntaxKind.EqualsToken;

// DEFAULT_MAX_POLYMORPHIC_MAP_COUNT, the constant README's V8 table cites. Both
// megamorphic rules fire on the fifth map, from one threshold rather than two.
export const MAX_CACHED_MAPS = 4;

// What the fifth map costs, in one sentence. Three findings end with it —
// `megamorphic-elements` at a load site, and both detectors that report
// `megamorphic-dispatch` at a call site — and each carried its own copy of a
// claim about V8 that has to be the same claim.
export const fifthMap = (site: 'load' | 'call'): string =>
  `V8 caches four maps per ${site} site, so a fifth makes every ${site} here a lookup`;

// What the dataflow walk counted, in one clause, for a finding that is NOT
// reporting a megamorphic site. Both escape rules print it and each had its own
// wording for the half it could reach.
//
// Three shapes, because a count over the budget that did NOT route to
// `megamorphic-dispatch` has a reason it did not, and printing "inside V8's
// four-map budget" over 37 of them would be the rule contradicting its own
// threshold. The walk is 0-CFA: it counts what reaches the VALUE, and only a
// declared type checks that against what reaches this CALL (BUGS TC-111).
export function reached(d: Dispatch): string {
  if (d.count === 0) return '';
  const names = d.names.join(', ');
  if (d.count <= MAX_CACHED_MAPS) {
    return (
      `; ${d.count} implementation${d.count === 1 ? '' : 's'} reach${d.count === 1 ? 'es' : ''} ` +
      `this receiver (${names}) — inside V8's four-map budget`
    );
  }
  return (
    `; the receiver has no declared type, and ${d.count} shapes reach the value across this ` +
    `program (${names}) — which is not a count of what reaches this call`
  );
}

// The property names a member carries, sorted. V8 keys a map on the property
// names AND the order they were added, and a TypeScript type records neither
// order nor identity — so a type can only ever answer the first half. Sorting
// is the answer that keeps the rule quiet where it cannot tell: two members
// with the same names are treated as one map even if a program could build them
// in two orders, because the alternative is warning about a program whose maps
// nobody has counted.
const shapeKey = (checker: TS.TypeChecker, t: TS.Type): string =>
  checker
    .getPropertiesOfType(t)
    .map((sym) => sym.getName())
    .sort()
    .join(',');

// Shapes that could reach a site as DISTINCT maps; a non-union answers 0, which
// is under every threshold, so callers only ask whether there are too many.
//
// This counted union MEMBERS until 2026-08-19, and a member is not a map (BUGS
// TC-42). Five aliases of one type share one map — `%HaveSameMap` says true —
// and so do five variants of a discriminated union over the same key set, and
// the rule fired on both while quoting a benchmark that measured neither. The
// count is over distinct property-name sets, so a rename cannot make a shape
// and the printed fix cannot be satisfied by one.
export const objectShapes = (ts: Ts, checker: TS.TypeChecker, t: TS.Type): number =>
  t.isUnion()
    ? new Set(
        t.types
          // Intersection as well as Object: a branded type `T & {__tag?: K}` is
          // an Intersection, so five branded object types behind one receiver —
          // the 3.4-11.3x program bench/shape-sets.jl measures — counted zero
          // shapes and reported clean. `getPropertiesOfType` resolves an
          // intersection already, so shapeKey needs nothing (TC-95).
          .filter((x) => x.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection))
          .map((x) => shapeKey(checker, x))
      ).size
    : 0;

export const elementType = (ts: Ts, checker: TS.TypeChecker, t: TS.Type): TS.Type | undefined =>
  checker.getIndexTypeOfType(t, ts.IndexKind.Number);

export const members = (t: TS.Type): readonly TS.Type[] => (t.isUnion() ? t.types : [t]);

// Whether the value really is an array — which `elementType` cannot answer.
// lib.es5 gives String a `readonly [index: number]: string` of its own, so a
// string passes the numeric index-signature test every other rule uses. A rule
// whose evidence is about Array has to ask the question directly.
export const isArray = (checker: TS.TypeChecker, t: TS.Type): boolean =>
  members(t).every((x) => checker.isArrayType(x) || checker.isTupleType(x));

// Array-typed values in every body in the closed world, not just the annotated
// root. A helper three calls deep receives the same arrays and pays the same
// costs, which is the entire reason the walk recurses.
//
// Locals as well as parameters. This read parameter declarations only, so the
// union array had to ARRIVE as an argument: `const rows = [...as, ...bs, ...cs,
// ...ds, ...es]` followed by a loop reading a property off an element is the
// same maps reaching the same load site, and it reported clean (TC-95).
export interface ArrayValue {
  p: TS.ParameterDeclaration | TS.VariableDeclaration;
  type: TS.Type;
  element: TS.Type;
}

export function arrayValues(ts: Ts, checker: TS.TypeChecker, body: Body): ArrayValue[] {
  const out: ArrayValue[] = [];
  const take = (p: TS.ParameterDeclaration | TS.VariableDeclaration): void => {
    const type = checker.getTypeAtLocation(p);
    const element = elementType(ts, checker, type);
    if (element) out.push({ p, type, element });
  };
  // A body is not always a signature — a class field initializer is a body too
  // and has no parameter list.
  if (isFunctionLike(ts, body.node)) for (const p of body.node.parameters) take(p);
  walk(ts, body.node, (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) take(n);
  });
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
