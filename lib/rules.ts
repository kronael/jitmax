import type * as TS from 'typescript';
import type { Ts } from './ts.ts';
import { at, type Body, type Mark, type Site } from './scan.ts';
import { N } from './numbers.ts';

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
  // is what a CI user actually feels. `closed-world` is the only `warn`: it
  // fires on a callee with no readable body, and no sweep here measures that
  // program.
  severity: 'error' | 'warn';
  // BUGS.md issue numbers this rule is known to be wrong or unproven about.
  // Empty when the rule carries no open defect. This is the register a
  // config or an annotation disables by defect code instead of by name.
  defects: string[];
}

// One line per code in `defects`, taken from the BUGS.md heading. Keep in
// sync with BUGS.md: a code appears here only if a rule's `defects` cites it.
export const DEFECT: Record<string, string> = {
  'TC-2': 'a TypeScript union member is not a V8 map',
  'TC-9': 'rules fire outside the conditions their own evidence establishes',
  'TC-10': 'the walk follows calls but not constructors',
  'TC-13': 'a method in a field has no four-map budget',
  'TC-33': "closed-world's trigger and its benchmark measure different things",
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
//
// Every number in all three fields — `cost`, `source` AND `silent` — is
// interpolated from `lib/numbers.ts`, which `make numbers` derives from the
// `.jl` rows. `silent` was hand-typed until 2026-08-16 on the argument that a
// clause is prose; the consequence was that five clauses went on quoting sweeps
// that no longer existed while every other number in the repo moved with its
// data (BUGS TC-23, TC-26, TC-27, TC-28). Write the sentences here; never write
// a figure here.
export const EVIDENCE: Record<string, Evidence> = {
  'megamorphic-elements': {
    cost:
      `${N['elem.reads']} on reads across L1, L2 and L3 — five distinct property sets ` +
      `against one, three whole sweeps per cell; ${N['elem.constr.l1l2']} once construction ` +
      'is counted at L1, where allocation swamps the load, and the L2 cell there does not ' +
      `replicate and is withdrawn; ${N['elem.constr.l3']} at RAM size, where bandwidth ` +
      'dominates and the fifth shape costs nothing',
    source:
      `bench/shape-sets.jl, ${N['elem.cells']} cells, 20 pairs each. This rule quoted ` +
      'bench/shapes-calibrated.jl until 2026-08-19, and that sweep varies key ORDER — five ' +
      'builders over one key set, five V8 maps, and exactly ONE TypeScript type. It priced a ' +
      'program this rule is silent on (BUGS TC-42). bench/shape-sets.js sweeps the same cells ' +
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
      `bench/dispatch.jl, ${N['disp.cells']} cells, 20 pairs each, every cell measured ` +
      'three whole times. Read the kernel before the number, for the same reason ' +
      'megamorphic-elements had to (TC-42): every family in that sweep varies key ORDER, ' +
      'the call TARGET, or where the function is held — all of them over ONE property set. ' +
      'This rule counts distinct property SETS, so it is silent on all four families, and ' +
      'the figure above prices the mechanism rather than the trigger. No sweep here varies ' +
      'the key set at a CALL site yet',
    silent:
      `four shapes cost ${N['disp.silent.proto4']} on a prototype method and ` +
      `${N['disp.silent.shared4']} on a shared one — an order of magnitude below the fifth, ` +
      'which is why the rule starts there',
    unreported:
      'five classes with identical fields are five V8 maps and ONE property set, so this ' +
      'rule reports none of them — and that is what its own benchmark measures. Nothing ' +
      'static separates five classes that agree on their fields from one class used five ' +
      'times, which is the same limit as key order at a load site. Also: ' +
      'when every shape carries its OWN function the cost starts at the SECOND target ' +
      `(${N['disp.silent.own']}, flat from two to six, no threshold at all) — a cost the ` +
      'size of the one this rule exists to report, and the same sweep measured it. No ' +
      'declared type separates that form from a prototype method, so the rule misses it ' +
      'rather than guessing. This is a miss, not a refutation',
    severity: 'error',
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
      `forms measure ${N['spread.silent.reads']}, two to three orders of magnitude below ` +
      'the loop, so the cost is the re-copying and not the value it leaves behind — but ' +
      'read the bottom of that range the other way round, because it is the FIX being ' +
      'slower and not the defect being cheap: the SPREAD-built object reads ' +
      `${N['spread.object.reads']} of what the same object costs once it has been filled ` +
      'key by key, so the copy this rule reports leaves behind the cheaper object to read. ' +
      'That is why the object form of the fix line carries a condition and the array form ' +
      'does not (TC-16); ' +
      'Object.assign(acc, …) mutates in place and is the fix rather than the defect, so it ' +
      'stays silent too; and a STRING is not this rule at any n — s = s + x, s += x and ' +
      `s = s.concat(x) build in ${N['spread.silent.strings.build']} of a push-and-join, ` +
      'every one of those cells far below 1, because V8 appends into a cons-string. ' +
      `Counting the caller's read back they measure ${N['spread.silent.strings.incl']} ` +
      `(intervals ${N['spread.silent.strings.incl.ci']}), which is a weaker claim than it ` +
      'looks: most of those intervals span 1.0, so once the result is read back the string ' +
      'and the rewrite are indistinguishable rather than the string winning. Every cell is ' +
      'replicated three times and the ones whose sweeps disagree are in the file',
    severity: 'error',
    defects: [],
  },
  'allocating-select': {
    cost:
      `${N['select.heap']} when the chosen value is stored somewhere that outlives the loop ` +
      `(CI ${N['select.heap.ci10k']} at n=10000, ${N['select.heap.ci100k']} at n=100000)`,
    source: `bench/select.jl, ${N['select.cells']} cells, 20 pairs each`,
    silent:
      `on numbers the effect is small and changes sign with the working set — ` +
      `${N['select.silent.number']} across both sizes, intervals ` +
      `${N['select.silent.number.ci']}, above 1 at n=10000 and below it at n=100000 — ` +
      'because Math.min allocates nothing and what is left is the loop, not the rule. ' +
      'This clause said "no effect at all, both intervals spanning 1" until the cells were ' +
      'run three times each (BUGS TC-23); the rule still stays out, but on a smaller ' +
      'margin than it claimed',
    unreported:
      'escape analysis does not rescue the boxed form: kept in a local, where the compiler ' +
      `can see it, the same loop still costs ${N['select.silent.local']} — below the cell ` +
      'this rule fires on, and well above nothing. This clause said "the rule stays out of ' +
      'it", and the rule does not: nothing in it asks where the target lives, so a purely ' +
      `local accumulator is reported with the ${N['select.heap']} measured for a value that ` +
      'escapes. The cost is real either way and the printed figure is the wrong one of the ' +
      'two (BUGS TC-44)',
    severity: 'error',
    defects: [],
  },
  'chained-allocation': {
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
    source: `bench/chained.jl, ${N['chained.cells']} cells in the 0.3 sweep, 20 pairs each`,
    silent:
      `reading the finished array costs nothing (${N['chained.silent.reads']} across all ` +
      `six forms), and at n=100000 map-then-filter falls to ${N['chained.silent.big']}, ` +
      'where memory bandwidth dominates the allocation; Object.keys(o).map(f) is FASTER ' +
      `than the for-in loop that fuses it (${N['chained.silent.keys']}), so keys stays out ` +
      'and the rule would be wrong to ask for that rewrite; .sort() and .reverse() sort in ' +
      'place and hand back the same array, so xs.map(f).sort() allocates no more than ' +
      `xs.map(f) does and measured ${N['chained.silent.sort']} with every interval ` +
      `(${N['chained.silent.sort.ci']}) spanning 1; and the split chain ` +
      `s.split(sep).map(f).join(sep) measured ${N['chained.silent.split']} against two ` +
      'different fusions, which is at the 1.10x a broad warning needs rather than clear of ' +
      'it — the rule stays out and the margin is one hundredth',
    severity: 'error',
    defects: ['TC-9'],
  },
  'closed-world': {
    cost:
      'an opaque call is an inlining boundary, and a callee V8 refuses to inline costs ' +
      `${N['inline.reads']} in a hot loop at n=1000 (CI ${N['inline.ci1000']}). The ` +
      `n=100000 cell read ${N['inline.withdrawn.100k']} across its three sweeps, which have ` +
      'no value common to all three, so rule 13 withdraws it and this range no longer ' +
      'reaches down into it (TC-37)',
    source:
      `bench/inline.jl, ${N['inline.cells']} cells, 20 pairs each; the inlining decision ` +
      'itself confirmed with --trace-turbo-inlining, which reports the padded callee as ' +
      '"cannot consider"',
    severity: 'warn',
    silent:
      'this bounds what ONE unchecked call can cost, not what any particular one does cost ' +
      '— a small callee is inlined and the boundary costs nothing. The trigger and the ' +
      'benchmark are different programs: the rule fires on a callee with no readable body, ' +
      'and the sweep measures a readable one padded past the inlining budget, because a ' +
      'callee nobody can read is a callee nobody can size (TC-33)',
    defects: ['TC-10', 'TC-33'],
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
      `${N['delete.silent.undef.reads']} on reads, every interval ` +
      `(${N['delete.silent.undef.reads.ci']}) spanning 1; its construction-counted cell ` +
      `read ${N['delete.silent.undef.build.withdrawn']} and is withdrawn as unreplicable, ` +
      'so this clause claims the reads and not the build. So is adding a property, which ' +
      'never demotes at any count. The old ' +
      'singleton exception is withdrawn: it was measured on a probe whose fast side a ' +
      'loop-invariant load could serve, and a kernel that has to load the object every ' +
      'pass says a single delete costs the same as a hundred thousand of them',
    severity: 'error',
    defects: ['TC-9'],
  },
};

type Add = (f: Omit<Finding, 'evidence'>) => void;
type Rule = (ts: Ts, checker: TS.TypeChecker, body: Body, add: Add) => void;

// A function boundary, for walks that must not cross one.
const isFunctionLike = (ts: Ts, n: TS.Node): boolean =>
  ts.isFunctionDeclaration(n) ||
  ts.isFunctionExpression(n) ||
  ts.isArrowFunction(n) ||
  ts.isMethodDeclaration(n) ||
  ts.isGetAccessor(n) ||
  ts.isSetAccessor(n) ||
  ts.isConstructorDeclaration(n);

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

// A callback an array method re-runs per element is a loop the syntax does not
// spell. `reduce` was hand-special-cased for exactly this reason and `forEach`
// was not, so `xs.forEach(x => { acc = [...acc, x] })` — the same quadratic copy
// with the accumulator in a closure instead of a parameter — went unreported
// (BUGS TC-43). Only the callback ARGUMENTS count as the loop body: the
// receiver is evaluated once, so a spread there is not re-run.
const ITERATION = new Set(['forEach', 'map', 'flatMap', 'filter', 'some', 'every', 'find']);

const iterationCallbacks = (ts: Ts, n: TS.Node): TS.Node[] =>
  ts.isCallExpression(n) &&
  ts.isPropertyAccessExpression(n.expression) &&
  ITERATION.has(n.expression.name.text)
    ? n.arguments.filter((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a))
    : [];

// The same walk carrying whether a loop re-runs this node. Two rules price a
// statement per pass, so the enclosing loop is half of what they match: the
// same line outside one is a case their own benchmark rejected.
function walkLoops(ts: Ts, root: TS.Node, fn: (n: TS.Node, inLoop: boolean) => void): void {
  const visit = (node: TS.Node, inLoop: boolean): void => {
    fn(node, inLoop);
    const bodies = new Set(iterationCallbacks(ts, node));
    ts.forEachChild(node, (c) => visit(c, inLoop || isLoop(ts, node) || bodies.has(c)));
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
const objectShapes = (ts: Ts, checker: TS.TypeChecker, t: TS.Type): number =>
  t.isUnion()
    ? new Set(
        t.types
          .filter((x) => x.flags & ts.TypeFlags.Object)
          .map((x) => shapeKey(checker, x))
      ).size
    : 0;

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
  // only the plain assignment is excluded.
  const isStoreTarget = (node: TS.Node): boolean =>
    node.parent !== undefined &&
    ts.isBinaryExpression(node.parent) &&
    node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    node.parent.left === node;
  // `(iss as any).path` loads `path` off iss's map exactly as `iss.path` does —
  // the cast is a claim about the type checker, not about the object. zod's
  // `prefixIssues` is written that way and is the one true instance of this
  // rule twelve libraries contain; reading the type off the cast instead of off
  // the value silenced it.
  const receiver = (e: TS.Expression): TS.Expression => {
    let n = e;
    while (
      ts.isAsExpression(n) ||
      ts.isParenthesizedExpression(n) ||
      ts.isNonNullExpression(n) ||
      ts.isTypeAssertionExpression(n)
    ) {
      n = n.expression;
    }
    return n;
  };
  let found = false;
  walk(ts, body.node, (node) => {
    if (found) return;
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      if (!isStoreTarget(node) && isElement(checker.getTypeAtLocation(receiver(node.expression)))) {
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
const megamorphicElements: Rule = (ts, checker, body, add) => {
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
    if (objectShapes(ts, checker, element) > MAX_CACHED_MAPS) claimed.add(element);
  }

  walk(ts, body.node, (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const receiver = node.expression.expression;
      const t = checker.getTypeAtLocation(receiver);
      const shapes = objectShapes(ts, checker, t);
      if (shapes > MAX_CACHED_MAPS && !claimed.has(t)) {
        add({
          ...at(body.sf, node),
          rule: 'megamorphic-dispatch',
          // Counted the same way as megamorphic-elements, and for the same
          // reason: five names for one property set are one map (TC-42).
          message:
            `${receiver.getText(body.sf)} reaches this call as ${shapes} distinct property ` +
            `sets and .${node.expression.name.text}() is called on it; V8 caches four maps ` +
            'per call site, so a fifth makes every call here a lookup',
          fix:
            'get the receiver to four distinct property sets or fewer, or give the call ' +
            'site one shape',
        });
      }
    }
  });
};

// An accumulator is rebuilt as an array or as an object, and the fix for one is
// not the fix for the other.
type Form = 'array' | 'object';

// Rebuilding an array or an object from a copy of itself copies every element
// it already holds, so a loop that does it n times does quadratic work. Written
// as a spread or as a call, the mechanism is the same. This is the only
// rule here whose cost is a complexity class rather than a constant factor,
// which is why it is the largest effect in the project.
const accumulatingSpread: Rule = (ts, checker, body, add) => {
  // Four forms copy the accumulator on every pass: [...acc, v],
  // { ...acc, [k]: v }, acc.concat(v), and Object.assign({}, acc, …). Each was
  // measured separately, because the constants differ by an order of magnitude.
  //
  // Which form matched is carried out of here, because the FIX differs by form
  // and the measurement says so (BUGS TC-16). An array pushed to reads exactly
  // like an array spread into. An object filled key by key does not: V8
  // normalizes it, and remeda's mergeAll got a faster build and reads an order
  // of magnitude slower out of this rule's own advice.
  const spreadsSelf = (name: string, outer: TS.Node): Form | undefined => {
    // `(acc, x) => ({ ...acc, k: x })` wraps the literal in parentheses.
    let node = outer;
    while (ts.isParenthesizedExpression(node)) node = node.expression;
    // Compared as TEXT, not as an identifier. `this.acc = [...this.acc, x]` is
    // the measured defect with the accumulator on a field, and requiring an
    // identifier here silenced it completely (BUGS TC-43).
    const isAcc = (e: TS.Node): boolean => e.getText(body.sf) === name;
    if (ts.isArrayLiteralExpression(node)) {
      return node.elements.some((e) => ts.isSpreadElement(e) && isAcc(e.expression))
        ? 'array'
        : undefined;
    }
    if (ts.isObjectLiteralExpression(node)) {
      return node.properties.some((pr) => ts.isSpreadAssignment(pr) && isAcc(pr.expression))
        ? 'object'
        : undefined;
    }
    // The call forms. `acc.concat(v)` carries the accumulator as the RECEIVER
    // and `Object.assign({}, acc, …)` as an argument, so neither is visible to
    // the literal matching above — the rule walked past both until they were
    // measured (`spread.concat` and `spread.assign`, in the hundreds).
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const callee = node.expression;
      // `.concat()` belongs to String as much as to Array, and on a string it
      // is not this defect: it BUILDS faster than the push-and-join it would be
      // rewritten to, because V8 appends into a cons-string instead of copying.
      // The figures are `spread.silent.strings.build` and its read-back pair.
      // Matching the NAME alone indicted that, and every other class that owns
      // a `concat` — a persistent list shares structure and is not copying
      // either. The receiver's type is what separates them, and where the type
      // is `any` there is nothing to separate: two measured-opposite mechanisms
      // wear this syntax, so an unknown receiver stays silent.
      if (callee.name.text === 'concat') {
        return isAcc(callee.expression) &&
          isArray(checker, checker.getTypeAtLocation(callee.expression))
          ? 'array'
          : undefined;
      }
      // Object.assign(acc, …) mutates acc and returns it — that is the O(n)
      // fix, not the defect. Only a copy counts, and a copy is the accumulator
      // reaching Object.assign behind some other target.
      if (
        callee.name.text === 'assign' &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === 'Object'
      ) {
        return node.arguments.slice(1).some(isAcc) ? 'object' : undefined;
      }
    }
    return undefined;
  };

  // Where each half of the advice stops paying, in the words of the sweeps that
  // established it. The array half has no condition — the finished array reads
  // the same whichever way it was built. The object half does, and it is not a
  // caveat: taking it cost remeda's caller more on reads than the quadratic
  // build ever cost, and this rule shipped for months without saying so.
  const FIX: Record<Form, string> = {
    array: `push onto NAME instead of rebuilding it — the finished array reads the same either way, ${N['spread.array.reads']}`,
    // Not an instruction. Assigning the key on NAME is faster to BUILD and
    // slower to READ, both measured, and jitmax reports the mutating form
    // as clean — so a reader who takes the instruction and re-runs the tool
    // gets a green run on an 8x read regression (BUGS TC-38). The exit code
    // cannot say that, so the text does.
    object:
      'there is no rewrite here this project has measured as a win on both halves. Assigning ' +
      `the key on NAME instead builds faster, ${N['spread.object']} at n=500, and fills the ` +
      'result key by key, which normalizes the object: the SPREAD-built object reads ' +
      `${N['ex.mergeall.reads']} of what the filled one costs (remeda mergeAll), so the ` +
      'copy you are being asked to delete is the cheaper one to read back. Mutate where the ' +
      'result is written more than it is read; keep the copy where it is read hot. No rule ' +
      'here detects a dictionary-mode object, so the mutating form checks CLEAN',
  };

  const report = (node: TS.Node, name: string, form: Form): void =>
    add({
      ...at(body.sf, node),
      rule: 'accumulating-spread',
      message: `${name} is rebuilt from a copy of itself; every pass copies everything it already holds`,
      fix: FIX[form].replaceAll('NAME', name),
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
      const direct = spreadsSelf(name, arg.body);
      if (direct) {
        report(node, name, direct);
        continue;
      }
      walk(ts, arg.body, (n) => {
        if (!ts.isReturnStatement(n) || !n.expression) return;
        const form = spreadsSelf(name, n.expression);
        if (form) report(node, name, form);
      });
    }
  };

  walkLoops(ts, body.node, (node, inLoop) => {
    if (
      reassignedInLoop(ts, node, inLoop) &&
      (ts.isIdentifier(node.left) || ts.isPropertyAccessExpression(node.left))
    ) {
      const target = node.left.getText(body.sf);
      const form = spreadsSelf(target, node.right);
      if (form) report(node, target, form);
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

  // A return TYPE is not an allocation site. `pick(a, b) { return a }` returns
  // an object and allocates on no pass at all, and this rule asserted one on
  // every pass (BUGS TC-34). The benchmark measured `Box.min`, whose body runs
  // `new Box(...)`. So read the body the program already has, and require
  // something in it that builds an object. Where there is no body the rule
  // stays out: an unreadable callee is `closed-world`'s finding, not this one's.
  const builds = (call: TS.CallExpression): boolean => {
    const decl = checker.getResolvedSignature(call)?.declaration;
    if (!decl || !('body' in decl)) return false;
    const fnBody = (decl as { body?: TS.Node }).body;
    if (!fnBody) return false;
    // Two limits on where the allocation may sit, both of them cases the rule
    // fired on: it must be inside a `return`, because a scratch array the
    // callee keeps to itself is not the value the loop stores; and the walk
    // stops at a nested function, because an object literal inside a callback
    // the callee never invokes is not an allocation this call makes.
    let found = false;
    const visit = (n: TS.Node, returning: boolean): void => {
      if (found) return;
      if (n !== fnBody && isFunctionLike(ts, n)) return;
      const inReturn = returning || ts.isReturnStatement(n);
      if (
        inReturn &&
        (ts.isNewExpression(n) ||
          ts.isObjectLiteralExpression(n) ||
          ts.isArrayLiteralExpression(n))
      ) {
        found = true;
        return;
      }
      ts.forEachChild(n, (c) => visit(c, inReturn));
    };
    visit(fnBody, false);
    return found;
  };

  walkLoops(ts, body.node, (node, inLoop) => {
    if (reassignedInLoop(ts, node, inLoop) && ts.isCallExpression(node.right)) {
      const target = node.left.getText(body.sf);
      const call = node.right;
      if (
        call.arguments.some((a) => a.getText(body.sf) === target) &&
        allocates(call) &&
        builds(call)
      ) {
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
// The largest array a `.slice()` in the chain can hand on, when both of its
// arguments are integer literals. `xs.slice(0, 10)` is ten elements whatever
// `xs` is, and the intermediate array the rule wants removed is ten elements
// too. Undefined when nothing in the chain bounds it — the ordinary case, and
// the one TC-9 is about.
function literalBound(ts: Ts, node: TS.Node): number | undefined {
  const int = (a: TS.Node | undefined): number | undefined =>
    a && ts.isNumericLiteral(a) ? Number(a.text) : undefined;
  let best: number | undefined;
  for (let n: TS.Node = node; ts.isCallExpression(n); n = n.expression.expression) {
    if (!ts.isPropertyAccessExpression(n.expression)) break;
    if (n.expression.name.text === 'slice') {
      const [from, to] = [int(n.arguments[0]), int(n.arguments[1])];
      // `slice(0, 10)` bounds to 10, `slice(-10)` to 10. `slice(10)` bounds
      // nothing: it drops a prefix of an array of unknown length.
      const bound = from !== undefined && from < 0 ? -from
        : from !== undefined && to !== undefined ? Math.max(0, to - from)
        : undefined;
      if (bound !== undefined) best = best === undefined ? bound : Math.min(best, bound);
    }
  }
  return best;
}

// Below the smallest n this rule's own sweep covers, it says nothing. TC-9 says
// a rule cannot know n; here n is written in the chain as an integer literal
// argument to a stage the rule already matched, and the rule walked over it.
// `bench/chained.jl` starts at this size, so under it the rule is quoting a
// sweep that never went there (BUGS TC-54).
const CHAINED_MIN_N = Number(N['chained.n.min']);

const chainedAllocation: Rule = (ts, checker, body, add) => {
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
      const bound = literalBound(ts, node);
      if (inner && !consumed && onArray && !(bound !== undefined && bound < CHAINED_MIN_N)) {
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
//
// The second half of the fix has a width, measured (BUGS TC-16). Applied to
// es-toolkit's `omit`, building the object without the property made the
// caller's reads 11x faster on a 12-key record and nothing at all on a 48-key
// one — `%HasFastProperties` is false on BOTH sides there, because a wide
// object filled key by key normalizes exactly as `delete` does. The rule cannot
// see the width, so the fix line states it instead of pretending it away.
const deleteProperty: Rule = (ts, checker, body, add) => {
  // Deleting an array ELEMENT does not put the array in dictionary mode. It
  // makes the elements backing store holey — PACKED_DOUBLE to HOLEY_DOUBLE, a
  // different representation in a different part of V8, and a cost nobody
  // measured here. The printed fix made it worse: assigning undefined turns
  // PACKED_DOUBLE_ELEMENTS into PACKED_ELEMENTS, which is the boxing
  // bench/arrays.jl priced at 1.39-1.66x and over which `boxed-elements` was
  // withdrawn — and on `number[]` it does not even typecheck (BUGS TC-36).
  // The rule fires where its benchmark measured: a property on something that
  // is not an array.
  const onArray = (node: TS.Expression): boolean =>
    (ts.isElementAccessExpression(node) || ts.isPropertyAccessExpression(node)) &&
    isArray(checker, checker.getTypeAtLocation(node.expression));

  walk(ts, body.node, (node) => {
    if (ts.isDeleteExpression(node) && !onArray(node.expression)) {
      add({
        ...at(body.sf, node),
        rule: 'delete-property',
        message: `delete ${node.expression.getText(body.sf)} puts its object in dictionary mode`,
        fix:
          'assign undefined where the key may stay present, or build the object without it — ' +
          'the rebuild helps at 12 keys and not at 48, where filling it key by key normalizes it too',
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
