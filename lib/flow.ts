import type * as TS from 'typescript';
import type { Ts } from './ts.ts';
import { isFunctionLike, isOwnSource, isTestFile, symbolOf, targetsOf, unwrap } from './scan.ts';

// What actually reaches a receiver, by dataflow — not what could structurally
// fit its interface. Enumerating every type assignable to an interface is the
// wrong question: TypeScript is structural, so dozens of shapes in a checkout
// satisfy a two-method interface while never going anywhere near the call
// (BUGS TC-69, the owner's correction). From the call site this walks BACK:
// a receiver that is a parameter leads to every visible call site of its
// function; an argument is a local, a field or another parameter, and each is
// followed to an allocation — an object literal, a `new`, a factory return —
// to a fixpoint. Ordinary 0-CFA, rooted at the site being asked about.
//
// Two limits are load-bearing, not caveats:
//
// - Implementations are not maps (BUGS TC-60). Classes are therefore counted
//   by IDENTITY — two structurally identical classes have two prototypes and
//   two maps — and object literals by allocation-site shape. Both undercount
//   (key order is invisible, one class can build two maps), never overcount,
//   so a count of five here means at least five maps.
// - The enumeration is sound only for a closed program. A value whose origin
//   the walk cannot see — JSON.parse, a socket, a parameter no visible code
//   calls — lands in `unknown`, and one such source makes every count a lower
//   bound. The caller must SAY that rather than print a number it cannot
//   stand behind; this module only reports it.
const VISIT_BUDGET = 4000;
const MAX_DEPTH = 48;

export interface Origin {
  kind: 'class' | 'classobj' | 'literal' | 'array' | 'function';
  node: TS.Node;
  name: string;
  // Allocation sites retained within one counted literal property set.
  literalNodes?: readonly TS.ObjectLiteralExpression[];
}

export interface Res {
  origins: Map<string, Origin>;
  unknown: Set<string>;
  // Touched a node already on the query stack: a back-edge was cut, so
  // origins flowing around the cycle may be missing and the count is a lower
  // bound. Cached and reused — every user of a tainted result already treats
  // it as incomplete, and recomputing it per query made the walk quadratic on
  // code whose values cycle (zod's `_def` reaches itself through every
  // subclass).
  tainted: boolean;
  // Ran out of budget: partial in a way a FRESH query might not be, so it is
  // never cached.
  starved: boolean;
}

// What one receiver resolves to. `follow` is the one implementation's body
// when it exists and can be walked; `origins` and `unknown` are the counted
// answer either way.
export interface Traced {
  origins: Array<{ name: string; node: TS.Node; follow: TS.Node | undefined }>;
  unknown: string[];
  bodies: TS.Node[];
}

export interface Flow {
  receiver(call: {
    expression: TS.Expression;
    accessor?: 'get' | 'set';
    construct?: boolean;
    member?: string;
    binding?: BindingRead;
    rest?: boolean;
  }): Traced;
  sources(node: TS.Node, elements?: boolean): Res;
  bindingType(binding: BindingRead): TS.Type | undefined;
  constructedClasses(cls: TS.ClassLikeDeclaration): TS.ClassLikeDeclaration[];
}

export type BindingRead = TS.BindingElement | TS.PropertyAssignment |
  TS.ShorthandPropertyAssignment | TS.SpreadAssignment;

/** A fixed destructuring key denotes the same property as a dot read. */
export function bindingKey(ts: Ts, checker: TS.TypeChecker, name: TS.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name)) {
    const type = checker.getTypeAtLocation(name.expression);
    return type.isStringLiteral() ? type.value : type.isNumberLiteral() ? String(type.value) : undefined;
  }
  return undefined;
}

/** Object literals are patterns only on a destructuring assignment's left side. */
export function isBindingRead(ts: Ts, node: TS.Node): node is BindingRead {
  if (ts.isBindingElement(node)) return ts.isObjectBindingPattern(node.parent);
  if (!(ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node) ||
    ts.isSpreadAssignment(node)) || !ts.isObjectLiteralExpression(node.parent)) return false;
  let pattern: TS.Node = node.parent;
  while ((ts.isPropertyAssignment(pattern.parent) && pattern.parent.initializer === pattern) ||
    (ts.isBinaryExpression(pattern.parent) && pattern.parent.left === pattern &&
      pattern.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isArrayLiteralExpression(pattern.parent.parent)) ||
    ts.isArrayLiteralExpression(pattern.parent)) {
    pattern = ts.isPropertyAssignment(pattern.parent) ? pattern.parent.parent : pattern.parent;
  }
  const holder = pattern.parent;
  return (ts.isBinaryExpression(holder) && holder.left === pattern &&
    holder.operatorToken.kind === ts.SyntaxKind.EqualsToken) ||
    ((ts.isForOfStatement(holder) || ts.isForInStatement(holder)) && holder.initializer === pattern);
}

/** Assignment patterns take their property declarations from their source type. */
export function bindingType(ts: Ts, checker: TS.TypeChecker, d: BindingRead): TS.Type | undefined {
  if (ts.isBindingElement(d)) return checker.getTypeAtLocation(d.parent);
  return assignmentPatternType(d.parent);

  function assignmentPatternType(pattern: TS.Node): TS.Type | undefined {
    const holder = pattern.parent;
    if (ts.isBinaryExpression(holder) && holder.left === pattern &&
      holder.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isArrayLiteralExpression(holder.parent)) {
      const supplied = assignmentPatternType(holder);
      return supplied && !(supplied.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void))
        ? supplied : checker.getTypeAtLocation(holder.right);
    }
    if (ts.isBinaryExpression(holder)) return checker.getTypeAtLocation(holder.right);
    if (ts.isPropertyAssignment(holder) && isBindingRead(ts, holder)) {
      const type = bindingType(ts, checker, holder);
      const name = bindingKey(ts, checker, holder.name);
      const symbol = type && name !== undefined ? checker.getPropertyOfType(type, name) : undefined;
      return symbol ? checker.getTypeOfSymbolAtLocation(symbol, holder) : undefined;
    }
    if (ts.isForOfStatement(holder)) {
      return checker.getIndexTypeOfType(checker.getTypeAtLocation(holder.expression), ts.IndexKind.Number);
    }
    if (ts.isArrayLiteralExpression(holder)) {
      const index = holder.elements.indexOf(pattern as TS.Expression);
      const parent = holder.parent;
      const source = ts.isBinaryExpression(parent) ? unwrap(ts, parent.right) : undefined;
      if (source && ts.isArrayLiteralExpression(source) &&
        !source.elements.slice(0, index + 1).some(ts.isSpreadElement)) {
        const element = source.elements[index];
        return element ? checker.getTypeAtLocation(element) : checker.getUndefinedType();
      }
      const type = assignmentPatternType(holder);
      const symbol = type && checker.getPropertyOfType(type, String(index));
      return symbol ? checker.getTypeOfSymbolAtLocation(symbol, pattern) :
        type && checker.getIndexTypeOfType(type, ts.IndexKind.Number);
    }
    return undefined;
  }
}

export interface Query {
  budget: number;
  stack: Set<TS.Node>;
  // Property and element reads in flight, keyed by container and name.
  // `new ZodX({ ...this._def })` makes a literal whose spread resolves back to
  // the literal itself; without this the read chases its own tail off the
  // stack — valueOf's node guard cannot see it, because each hop lands on a
  // different node.
  reading: Set<string>;
}

// Reverse edges cannot be rooted at the call site — "every caller of f" and
// "every write to .f" need the program scanned once. Keyed by NAME, resolved
// by symbol only on demand, so the one pass stays a cheap AST walk and the
// checker is only asked about candidates a query actually pulls. In a test file
// the pass records only `constructions`: what a test passes, writes or declares
// never reaches production code, and vue's `watch.ts:161` counted seven
// implementations at `source.some()`, every one a value a `.spec.ts` passed
// (BUGS TC-150).
export type Write =
  | {
      kind: 'assign';
      access: TS.PropertyAccessExpression | TS.ElementAccessExpression;
      value: TS.Expression;
    }
  | { kind: 'propassign'; prop: TS.PropertyAssignment }
  | { kind: 'shorthand'; prop: TS.ShorthandPropertyAssignment }
  | { kind: 'propdecl'; member: TS.PropertyDeclaration };

export interface Index {
  calls: Map<string, Array<TS.CallExpression | TS.NewExpression>>;
  writes: Map<string, Write[]>;
  varWrites: Map<string, TS.BinaryExpression[]>;
  supers: Array<{ call: TS.CallExpression; cls: TS.ClassLikeDeclaration }>;
  classes: TS.ClassLikeDeclaration[];
  // Every `new`, test files included, for `constructed` alone: a test that
  // builds a class the program declares shows the class is built, as code
  // outside the program would. pixi's library builds none of its filters
  // itself. The arguments are never read from here.
  constructions: Map<string, TS.NewExpression[]>;
}

// Everything one program's walk shares: the two module handles, and the
// memoised answers every query must see the same of. It is the first parameter
// of every walker below, and that is the whole reason they are out here — a
// closure over `createFlow`'s locals can only ever be called through the whole
// pipeline, which is how `isElement` shipped as `t === element` for months.
// `makeWalk` builds one over a program; a test then calls a single walker on a
// node of its own.
export interface Walk {
  ts: Ts;
  checker: TS.TypeChecker;
  idOf(n: TS.Node): number;
  index(): Index;
  targets(e: TS.Expression): TS.Node[];
  childrenOf(): Map<TS.ClassLikeDeclaration, TS.ClassLikeDeclaration[]>;
  constructed(c: TS.ClassLikeDeclaration): boolean;
  returnsOf(fn: TS.SignatureDeclaration): TS.Expression[];
  writeDecls(w: Write, name: string): TS.Node[];
  valueOf(node: TS.Node, q: Query): Res;
  literalProperty(lit: TS.ObjectLiteralExpression, name: string, q: Query): Res;
  memberValue(cls: TS.ClassLikeDeclaration, name: string, wantStatic: boolean, q: Query): Res;
}

export const strip = (ts: Ts, e: TS.Expression): TS.Expression => unwrap(ts, e);

export const className = (c: TS.ClassLikeDeclaration): string => c.name?.text ?? '<anonymous class>';

export const where = (n: TS.Node): string => {
  const sf = n.getSourceFile();
  const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
  const base = sf.fileName.split('/').pop() ?? sf.fileName;
  return `${base}:${line + 1}`;
};

export const emptyRes = (): Res => ({
  origins: new Map(),
  unknown: new Set(),
  tainted: false,
  starved: false,
});

// Both sets are capped: past 64 origins every count reads "at least", and
// past 8 unknown reasons no ninth says anything new. Uncapped, zod's spread
// chains merged thousand-entry sets quadratically.
const literalNodes = (origin: Origin): readonly TS.ObjectLiteralExpression[] =>
  origin.literalNodes ?? [origin.node as TS.ObjectLiteralExpression];

export const merge = (into: Res, from: Res): void => {
  for (const [k, v] of from.origins) {
    if (into.origins.size >= 64 && !into.origins.has(k)) continue;
    const prior = into.origins.get(k);
    if (prior?.kind === 'literal' && v.kind === 'literal') {
      const nodes = [...new Set([...literalNodes(prior), ...literalNodes(v)])];
      if (nodes.length > 64 && into.unknown.size < 8) {
        into.unknown.add('more than 64 literal allocation sites share one property set');
      }
      into.origins.set(k, nodes.length === 1 ? v : {...v, literalNodes: nodes.slice(-64)});
    } else {
      into.origins.set(k, v);
    }
  }
  for (const u of from.unknown) {
    if (into.unknown.size >= 8) break;
    into.unknown.add(u);
  }
  into.tainted ||= from.tainted;
  into.starved ||= from.starved;
};

export const unknown = (why: string): Res => {
  const r = emptyRes();
  r.unknown.add(why);
  return r;
};

export const hasSpread = (ts: Ts, n: TS.Node): boolean =>
  ts.isObjectLiteralExpression(n) && n.properties.some((p) => ts.isSpreadAssignment(p));

// Same sorted-name key the rules use for a property set: names without
// order, because a type cannot see order, and two literals that agree on
// names are treated as one map rather than warned about (TC-42's direction).
export const literalShape = (w: Walk, n: TS.ObjectLiteralExpression): string =>
  n.properties
    .map((p) => (p.name && w.ts.isIdentifier(p.name) ? p.name.text : `#${w.idOf(p)}`))
    .sort()
    .join(',');

export const originOf = (w: Walk, o: Origin): Res => {
  const r = emptyRes();
  const key =
    o.kind === 'literal' && !hasSpread(w.ts, o.node)
      ? `L:${literalShape(w, o.node as TS.ObjectLiteralExpression)}`
      : // Every array literal is ONE key. An array's map is decided by its
        // elements kind — PACKED_SMI, PACKED, HOLEY — and not by where it was
        // allocated, so ten `[]` in ten files are one map and were counted as
        // ten. valibot has 34 sites calling `dataset.issues.push()` and the
        // count printed at each was 10, every one of them an `array` origin.
        // Nothing static reads an elements kind, so this collapses to one for
        // the same reason `literalShape` sorts names: where the walk cannot
        // tell two maps apart it counts one, rather than warning about a
        // program whose maps nobody has counted (TC-42's direction, BUGS
        // TC-111).
        o.kind === 'array'
        ? 'A'
        : `${o.kind}:${w.idOf(o.node)}`;
  r.origins.set(key, o);
  return r;
};

// Object.prototype's own members, which every object literal inherits. A
// literal that does not spell `toString` still answers a `.toString()` call.
const OBJECT_PROTOTYPE = new Set([
  'constructor',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
  'toString',
  'valueOf',
]);

// Whether this origin could be the receiver at a call of `method`. An origin
// that does not have the method never reaches that call — it would throw — and
// the walk is path-insensitive, so `if (isArray(source)) source.some(…)` is
// invisible to it: vue's `watch.ts:161` counted 34 object literals at a call
// only an array can make, every one of them from a `.spec.ts`.
//
// Object literals only. A literal without a spread carries exactly the names
// it spells plus Object.prototype's, which makes the test exact. A class can
// merge declarations, inherit from an unread base and carry an index
// signature, so classes are left alone rather than guessed at.
export const carries = (ts: Ts, o: Origin, method: string): boolean => {
  if (o.kind !== 'literal') return true;
  const lit = o.node as TS.ObjectLiteralExpression;
  if (hasSpread(ts, lit) || OBJECT_PROTOTYPE.has(method)) return true;
  return lit.properties.some((p) => {
    const n = p.name;
    if (!n) return true;
    if (ts.isIdentifier(n) || ts.isStringLiteral(n)) return n.text === method;
    // A computed name is a name the walk cannot read, so it could be this one.
    return true;
  });
};

// The canonical declarations behind a property symbol, so a write through an
// instantiated generic and a read through another still meet.
export const declsOf = (checker: TS.TypeChecker, sym: TS.Symbol | undefined): TS.Node[] => {
  if (!sym) return [];
  const roots = checker.getRootSymbols(sym);
  const out: TS.Node[] = [];
  for (const s of roots.length > 0 ? roots : [sym]) {
    for (const d of s.getDeclarations() ?? []) out.push(d);
  }
  return out;
};

export const sameProperty = (a: TS.Node[], b: TS.Node[]): boolean => a.some((d) => b.includes(d));

export const bodyOf = (ts: Ts, n: TS.Node): TS.Node | undefined => {
  if (isFunctionLike(ts, n) && (n as TS.FunctionLikeDeclaration).body) return n;
  return undefined;
};

export const subclassesOf = (w: Walk, cls: TS.ClassLikeDeclaration): TS.ClassLikeDeclaration[] => {
  const out: TS.ClassLikeDeclaration[] = [];
  const seen = new Set<TS.ClassLikeDeclaration>([cls]);
  const queue = [cls];
  for (let i = 0; i < queue.length && out.length < 128; i++) {
    for (const c of w.childrenOf().get(queue[i]!) ?? []) {
      if (seen.has(c)) continue;
      seen.add(c);
      out.push(c);
      queue.push(c);
    }
  }
  return out;
};

// `cls` and every subclass of it the program visibly constructs: what an
// instance typed as `cls` can have been built as. `this` in a method reads it,
// and so does megamorphic-elements for an element typed as a class, where the
// `extends` edges are shapes rather than call targets (BUGS TC-104).
export const constructedClasses = (
  w: Walk,
  cls: TS.ClassLikeDeclaration
): TS.ClassLikeDeclaration[] => [cls, ...subclassesOf(w, cls)].filter((c) => w.constructed(c));

export function compute(w: Walk, node: TS.Node, q: Query): Res {
  const ts = w.ts;
  const e = ts.isExpression(node) ? strip(ts, node) : node;
  if (e !== node) return w.valueOf(e, q);

  if (ts.isObjectLiteralExpression(e)) {
    // The dedup key is the full shape; the printed name is not — a field
    // object can carry thirty properties and the message needs a handle,
    // not an inventory.
    const names = e.properties
      .map((p) => (p.name && ts.isIdentifier(p.name) ? p.name.text : '…'))
      .slice(0, 3);
    const label = e.properties.length > 3 ? `${names.join(',')},…` : names.join(',');
    return originOf(w, { kind: 'literal', node: e, name: `{${label}} (${where(e)})` });
  }
  if (ts.isArrayLiteralExpression(e)) {
    return originOf(w, { kind: 'array', node: e, name: `array (${where(e)})` });
  }
  if (ts.isNewExpression(e)) {
    const out = emptyRes();
    for (const d of w.targets(e.expression)) {
      if (ts.isClassDeclaration(d) || ts.isClassExpression(d)) {
        merge(out, originOf(w, { kind: 'class', node: d, name: className(d) }));
      }
    }
    if (out.origins.size === 0) out.unknown.add(`new ${e.expression.getText()} resolves to no visible class`);
    return out;
  }
  if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) {
    return originOf(w, { kind: 'function', node: e, name: `function (${where(e)})` });
  }
  if (ts.isCallExpression(e)) return callResult(w, e, q);
  if (ts.isAwaitExpression(e)) return w.valueOf(e.expression, q);
  if (ts.isConditionalExpression(e)) {
    const out = emptyRes();
    merge(out, w.valueOf(e.whenTrue, q));
    merge(out, w.valueOf(e.whenFalse, q));
    return out;
  }
  if (ts.isBinaryExpression(e)) {
    const k = e.operatorToken.kind;
    if (
      k === ts.SyntaxKind.BarBarToken ||
      k === ts.SyntaxKind.QuestionQuestionToken ||
      k === ts.SyntaxKind.AmpersandAmpersandToken
    ) {
      const out = emptyRes();
      merge(out, w.valueOf(e.left, q));
      merge(out, w.valueOf(e.right, q));
      return out;
    }
    if (k === ts.SyntaxKind.EqualsToken || k === ts.SyntaxKind.CommaToken) {
      return w.valueOf(e.right, q);
    }
    return emptyRes();
  }
  if (ts.isPropertyAccessExpression(e)) return propRead(w, e, q);
  if (ts.isElementAccessExpression(e)) return elementsOf(w, w.valueOf(e.expression, q), q);
  if (e.kind === ts.SyntaxKind.ThisKeyword) return thisFlow(w, e, q);
  if (ts.isIdentifier(e)) return symbolFlow(w, e, q);
  // Literals, template strings, unary arithmetic: primitives, which are
  // never a dispatch receiver the escape test lets through.
  return emptyRes();
}

export function symbolFlow(w: Walk, id: TS.Identifier, q: Query): Res {
  const { ts, checker } = w;
  const sym = symbolOf(ts, checker, id);
  const decls = sym?.getDeclarations() ?? [];
  if (decls.length === 0) return unknown(`${id.text} resolves to nothing — an unresolved import, or untyped code`);
  const out = emptyRes();
  for (const d of decls.slice(0, 8)) {
    if (ts.isVariableDeclaration(d)) {
      if (d.initializer) merge(out, w.valueOf(d.initializer, q));
      const list = d.parent;
      if (
        !d.initializer &&
        ts.isVariableDeclarationList(list) &&
        ts.isForOfStatement(list.parent)
      ) {
        merge(out, elementsOf(w, w.valueOf(list.parent.expression, q), q));
      }
      for (const wr of w.index().varWrites.get(id.text) ?? []) {
        if (ts.isIdentifier(wr.left) && checker.getSymbolAtLocation(wr.left) === sym) {
          merge(out, w.valueOf(wr.right, q));
        }
      }
      if (out.origins.size === 0 && out.unknown.size === 0 && !d.initializer) {
        out.unknown.add(`${id.text} is never visibly assigned`);
      }
    } else if (ts.isParameter(d)) {
      merge(out, paramFlow(w, d, q));
    } else if (ts.isBindingElement(d)) {
      merge(out, bindingFlow(w, d, q));
    } else if (ts.isFunctionDeclaration(d)) {
      merge(out, originOf(w, { kind: 'function', node: d, name: `${id.text}()` }));
    } else if (ts.isClassDeclaration(d) || ts.isClassExpression(d)) {
      merge(out, originOf(w, { kind: 'classobj', node: d, name: className(d) }));
    } else if (ts.isEnumDeclaration(d) || ts.isNamespaceImport(d) || ts.isModuleDeclaration(d)) {
      merge(out, originOf(w, { kind: 'classobj', node: d, name: id.text }));
    } else {
      out.unknown.add(`${id.text} is declared as a ${ts.SyntaxKind[d.kind]} the walk does not model`);
    }
  }
  return out;
}

// `const { Fp } = CURVE` and `function f({ Fp }: Opts)` are field reads
// written as patterns: find what the pattern's source holds, then read the
// one property.
export function bindingFlow(w: Walk, d: BindingRead, q: Query): Res {
  const { ts, checker } = w;
  const pattern = d.parent;
  if (!ts.isObjectBindingPattern(pattern) && !ts.isObjectLiteralExpression(pattern)) {
    return unknown('an array-destructured value');
  }
  if (ts.isSpreadAssignment(d) || (ts.isBindingElement(d) && d.dotDotDotToken)) {
    return unknown('an object-rest value');
  }
  const key = ts.isBindingElement(d) ? d.propertyName ?? d.name : d.name;
  if (ts.isObjectBindingPattern(key) || ts.isArrayBindingPattern(key)) return unknown('a destructuring key');
  const name = bindingKey(ts, checker, key);
  if (name === undefined) return unknown('a computed destructuring key');
  const src = bindingSource(w, d, q);
  const out = readProperty(w, src, name, declsOf(checker, checker.getSymbolAtLocation(d.name)), q);
  if (ts.isBindingElement(d) && d.initializer) merge(out, w.valueOf(d.initializer, q));
  return out;
}

// The object consumed by a pattern, shared with the implicit getter walk.
function bindingSource(w: Walk, d: BindingRead, q: Query): Res {
  return patternSource(d.parent);

  function patternSource(pattern: TS.Node, fallback?: TS.Expression): Res {
    const holder = pattern.parent;
    if (w.ts.isBinaryExpression(holder) && holder.left === pattern &&
      holder.operatorToken.kind === w.ts.SyntaxKind.EqualsToken && w.ts.isArrayLiteralExpression(holder.parent)) {
      return patternSource(holder, holder.right);
    }
    if (w.ts.isVariableDeclaration(holder) && holder.initializer) {
      return w.valueOf(holder.initializer, q);
    }
    if (w.ts.isParameter(holder)) return paramFlow(w, holder, q);
    if (w.ts.isBindingElement(holder)) return bindingFlow(w, holder, q);
    if (w.ts.isArrayLiteralExpression(holder)) {
      const index = holder.elements.indexOf(pattern as TS.Expression);
      return elementsOf(w, patternSource(holder), q, index, fallback);
    }
    if (w.ts.isPropertyAssignment(holder) && isBindingRead(w.ts, holder)) {
      return bindingFlow(w, holder, q);
    }
    if (w.ts.isBinaryExpression(holder) && holder.operatorToken.kind === w.ts.SyntaxKind.EqualsToken) {
      return w.valueOf(holder.right, q);
    }
    const loop = w.ts.isVariableDeclaration(holder) && w.ts.isVariableDeclarationList(holder.parent)
      ? holder.parent.parent : holder;
    if (w.ts.isForOfStatement(loop)) return elementsOf(w, w.valueOf(loop.expression, q), q);
    if (w.ts.isForInStatement(loop)) return unknown('a string key from for-in iteration');
    return unknown('a destructuring the walk does not model');
  }
}

export function paramFlow(w: Walk, param: TS.ParameterDeclaration, q: Query): Res {
  const ts = w.ts;
  const fn = param.parent;
  if (!isFunctionLike(ts, fn)) return unknown('a parameter outside a function');
  if (param.dotDotDotToken) return unknown('a rest parameter');
  const params = fn.parameters.filter(
    (p) => !(ts.isIdentifier(p.name) && p.name.text === 'this')
  );
  const argIndex = params.indexOf(param);
  if (argIndex < 0) return unknown('a this-parameter');

  if (ts.isConstructorDeclaration(fn)) {
    const cls = fn.parent;
    if (!ts.isClassDeclaration(cls) && !ts.isClassExpression(cls)) {
      return unknown('a constructor outside a class');
    }
    return ctorArgFlow(w, cls, argIndex, param, q);
  }

  const names = new Set<string>();
  const fname = (fn as TS.NamedDeclaration).name;
  if (fname && ts.isIdentifier(fname)) names.add(fname.text);
  const p = fn.parent;
  if (p && (ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p)) && ts.isIdentifier(p.name)) {
    names.add(p.name.text);
  }
  if (names.size === 0) return unknown('a callback with no name to find callers by');

  const out = emptyRes();
  let callers = 0;
  let capped = false;
  for (const name of names) {
    for (const call of w.index().calls.get(name) ?? []) {
      if (!ts.isCallExpression(call)) continue;
      if (!w.targets(call.expression).some((t) => t === fn || t === p)) continue;
      if (callers >= 64) {
        capped = true;
        break;
      }
      callers++;
      merge(out, argAt(w, call, argIndex, param, q));
    }
  }
  // The cap is said, or the count reads complete when it is not. Stopping
  // silently at 64 callers let 64 `go(new A())` sites hide a 65th
  // `go(new B())`: the walk reported ONE implementation, scan.ts followed
  // A's body as the only one that runs, and the tool printed "every
  // annotated function is clean" at exit 0 for a call site where B also
  // runs and no rule ever saw it. That is the clean-run-that-checked-nothing
  // failure this project exists to prevent (BUGS TC-112).
  if (capped) {
    out.unknown.add(
      `more than 64 visible callers of ${[...names][0]} — not all of them were read`
    );
  }
  if (callers === 0) {
    out.unknown.add(
      `no visible caller of ${[...names][0]} — its arguments come from outside this program`
    );
  }
  return out;
}

// `new C(x)` runs C's constructor; so does `new D(x)` for a subclass D that
// declares none, and `super(x)` from a subclass constructor.
export function ctorArgFlow(
  w: Walk,
  cls: TS.ClassLikeDeclaration,
  argIndex: number,
  param: TS.ParameterDeclaration,
  q: Query
): Res {
  const ts = w.ts;
  const out = emptyRes();
  let sites = 0;
  const constructing = [cls];
  for (const sub of subclassesOf(w, cls)) {
    const ownCtor = sub.members.some((m) => ts.isConstructorDeclaration(m) && m.body);
    if (!ownCtor) constructing.push(sub);
  }
  for (const c of constructing) {
    const name = c.name?.text;
    if (name === undefined) continue;
    for (const call of w.index().calls.get(name) ?? []) {
      if (!ts.isNewExpression(call)) continue;
      if (!w.targets(call.expression).includes(c)) continue;
      sites++;
      merge(out, argAt(w, call, argIndex, param, q));
      if (sites >= 64) break;
    }
  }
  for (const s of w.index().supers) {
    for (const h of s.cls.heritageClauses ?? []) {
      if (h.token !== ts.SyntaxKind.ExtendsKeyword) continue;
      if (h.types.some((t) => w.targets(t.expression).includes(cls))) {
        sites++;
        merge(out, argAt(w, s.call, argIndex, param, q));
      }
    }
  }
  if (sites === 0) {
    out.unknown.add(`no visible construction of ${className(cls)}`);
  }
  return out;
}

export function argAt(
  w: Walk,
  call: TS.CallExpression | TS.NewExpression,
  argIndex: number,
  param: TS.ParameterDeclaration,
  q: Query
): Res {
  const args: readonly TS.Expression[] = call.arguments ?? [];
  if (args.slice(0, argIndex + 1).some((a) => w.ts.isSpreadElement(a))) {
    return unknown('a spread argument');
  }
  const arg = args[argIndex];
  if (arg) return w.valueOf(arg, q);
  if (param.initializer) return w.valueOf(param.initializer, q);
  return emptyRes();
}

// `this` in a method: every visible construction of the class or one of its
// subclasses can be the receiver. Context-insensitive, like the rest of the
// walk — an instance built anywhere may call any method.
export function thisFlow(w: Walk, node: TS.Node, q: Query): Res {
  const ts = w.ts;
  // An arrow's `this` is the one around it, and around a class field's
  // initializer that is the instance, or the class for a static field. The walk
  // climbed past the field to the file and said "`this` outside any method"
  // about arktype's `traverseApply = (data, ctx) => {…}` (BUGS TC-160).
  let fn: TS.Node | undefined = node;
  while (
    fn &&
    !(isFunctionLike(ts, fn) && !ts.isArrowFunction(fn)) &&
    !ts.isPropertyDeclaration(fn)
  ) {
    fn = fn.parent;
  }
  if (!fn) return unknown('`this` outside any method');
  const holder = fn.parent;
  if (holder && ts.isObjectLiteralExpression(holder)) return w.valueOf(holder, q);
  if (!holder || (!ts.isClassDeclaration(holder) && !ts.isClassExpression(holder))) {
    return unknown('`this` in a plain function, whose receiver the walk cannot see');
  }
  const isStatic = ts
    .getCombinedModifierFlags(fn as TS.Declaration)
    .valueOf() & ts.ModifierFlags.Static;
  if (isStatic) return originOf(w, { kind: 'classobj', node: holder, name: className(holder) });
  const out = emptyRes();
  for (const c of constructedClasses(w, holder)) {
    merge(out, originOf(w, { kind: 'class', node: c, name: className(c) }));
  }
  if (out.origins.size === 0) {
    out.unknown.add(`no visible construction of ${className(holder)} or a subclass`);
  }
  return out;
}

export function propRead(w: Walk, access: TS.PropertyAccessExpression, q: Query): Res {
  const base = w.valueOf(access.expression, q);
  const propDecls = declsOf(w.checker, w.checker.getSymbolAtLocation(access.name));
  return readProperty(w, base, access.name.text, propDecls, q);
}

export function readProperty(
  w: Walk,
  base: Res,
  name: string,
  propDecls: TS.Node[],
  q: Query
): Res {
  const out = emptyRes();
  out.tainted = base.tainted;
  out.starved = base.starved;
  for (const u of base.unknown) out.unknown.add(u);
  for (const o of base.origins.values()) {
    if (o.kind === 'literal') {
      for (const literal of literalNodes(o)) {
        merge(out, w.literalProperty(literal, name, q));
        if (o.literalNodes) {
          const declarations = declsOf(w.checker,
            w.checker.getPropertyOfType(w.checker.getTypeAtLocation(literal), name));
          if (declarations.length > 0) merge(out, writesTo(w, name, declarations, q));
        }
      }
    } else if (o.kind === 'class' || o.kind === 'classobj') {
      merge(out, w.memberValue(o.node as TS.ClassLikeDeclaration, name, o.kind === 'classobj', q));
    }
    // array and function origins hold no named field worth following.
  }
  // Writes anywhere in the program to the SAME declared property — `this.f =
  // v` in a constructor, `{ f: v }` under a contextual type — reach a read
  // the base origins cannot explain.
  if (propDecls.length > 0) merge(out, writesTo(w, name, propDecls, q));
  if (out.origins.size === 0 && out.unknown.size === 0) {
    out.unknown.add(`no visible write to .${name}`);
  }
  return out;
}

// Every value written to one declared property, wherever the write is.
// Matched by declaration, not by name, or every `.type` field in a program
// would pour into every other.
export function writesTo(w: Walk, name: string, decls: TS.Node[], q: Query): Res {
  const out = emptyRes();
  for (const wr of (w.index().writes.get(name) ?? []).slice(0, 128)) {
    if (!sameProperty(w.writeDecls(wr, name), decls)) continue;
    if (wr.kind === 'assign') merge(out, w.valueOf(wr.value, q));
    else if (wr.kind === 'propassign') merge(out, w.valueOf(wr.prop.initializer, q));
    else if (wr.kind === 'shorthand') merge(out, symbolFlow(w, wr.prop.name, q));
    else merge(out, w.valueOf(wr.member.initializer!, q));
  }
  return out;
}

export function literalPropertyInner(
  w: Walk,
  lit: TS.ObjectLiteralExpression,
  name: string,
  q: Query,
  out: Res
): Res {
  const ts = w.ts;
  let found = false;
  for (const p of lit.properties) {
    if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === name) {
      found = true;
      merge(out, w.valueOf(p.initializer, q));
    } else if (ts.isShorthandPropertyAssignment(p) && p.name.text === name) {
      found = true;
      merge(out, symbolFlow(w, p.name, q));
    } else if (ts.isMethodDeclaration(p) && ts.isIdentifier(p.name) && p.name.text === name) {
      found = true;
      merge(out, originOf(w, { kind: 'function', node: p, name: `${name}()` }));
    } else if (ts.isGetAccessorDeclaration(p) && ts.isIdentifier(p.name) && p.name.text === name) {
      found = true;
      for (const r of w.returnsOf(p)) merge(out, w.valueOf(r, q));
    }
  }
  if (!found) {
    for (const p of lit.properties) {
      if (ts.isSpreadAssignment(p)) {
        merge(out, readProperty(w, w.valueOf(p.expression, q), name, [], q));
      }
    }
  }
  return out;
}

export function memberValueInner(
  w: Walk,
  cls: TS.ClassLikeDeclaration,
  name: string,
  wantStatic: boolean,
  q: Query
): Res {
  const ts = w.ts;
  const out = emptyRes();
  let cur: TS.ClassLikeDeclaration | undefined = cls;
  for (let depth = 0; cur && depth < 8; depth++) {
    // A `classobj` origin can be an enum or a namespace object (symbolFlow
    // files both under it): neither has class members to walk.
    if (!ts.isClassDeclaration(cur) && !ts.isClassExpression(cur)) break;
    for (const m of cur.members) {
      // `#name` as well as `name`: a private field is a field, and its writes
      // are sources exactly as a public one's are. lru-cache holds every
      // policy hook in one, and each call through them read as dispatch
      // nothing could resolve where the public twin resolved (BUGS TC-159).
      if (!m.name || !(ts.isIdentifier(m.name) || ts.isPrivateIdentifier(m.name))) continue;
      if (m.name.text !== name) continue;
      const isStatic = Boolean(
        ts.getCombinedModifierFlags(m as TS.Declaration).valueOf() & ts.ModifierFlags.Static
      );
      if (isStatic !== wantStatic) continue;
      if (ts.isMethodDeclaration(m) && m.body) {
        merge(out, originOf(w, { kind: 'function', node: m, name: `${name}()` }));
      } else if (ts.isPropertyDeclaration(m)) {
        // What the field holds is its initializer AND every write to it. Read
        // as the initializer alone, `stale = () => false` that a constructor
        // replaces with `(i) => i > ttl` was followed into the stub as "the
        // one implementation this program builds", and the body that runs
        // was never checked (BUGS TC-159).
        if (m.initializer) merge(out, w.valueOf(m.initializer, q));
        merge(out, writesTo(w, name, [m], q));
      } else if (ts.isGetAccessorDeclaration(m) && m.body) {
        for (const r of w.returnsOf(m)) merge(out, w.valueOf(r, q));
      }
    }
    if (out.origins.size > 0 || out.unknown.size > 0) break;
    let base: TS.ClassLikeDeclaration | undefined;
    for (const h of cur.heritageClauses ?? []) {
      if (h.token !== ts.SyntaxKind.ExtendsKeyword) continue;
      for (const t of h.types) {
        const d = w.targets(t.expression).find(
          (x): x is TS.ClassLikeDeclaration => ts.isClassDeclaration(x) || ts.isClassExpression(x)
        );
        if (d) base = d;
      }
    }
    cur = base;
  }
  return out;
}

export function elementsOf(w: Walk, base: Res, q: Query, index?: number, fallback?: TS.Expression): Res {
  const ts = w.ts;
  const out = emptyRes();
  out.tainted = base.tainted;
  out.starved = base.starved;
  for (const o of base.origins.values()) {
    if (o.kind !== 'array') {
      out.unknown.add('an element of a collection the walk cannot enumerate');
      if (fallback) merge(out, w.valueOf(fallback, q));
      continue;
    }
    const key = `e${w.idOf(o.node)}:${index ?? '*'}`;
    if (q.reading.has(key)) {
      out.tainted = true;
      continue;
    }
    q.reading.add(key);
    try {
      const elements = (o.node as TS.ArrayLiteralExpression).elements;
      if (index !== undefined && elements.slice(0, index + 1).some(ts.isSpreadElement)) {
        out.unknown.add('an indexed element after an array spread');
        if (fallback) merge(out, w.valueOf(fallback, q));
        continue;
      }
      const selected = index === undefined ? elements : elements.slice(index, index + 1);
      if (fallback && selected.length === 0) merge(out, w.valueOf(fallback, q));
      for (const el of selected) {
        if (fallback) {
          const type = w.checker.getTypeAtLocation(el);
          const alternatives = type.isUnion() ? type.types : [type];
          const absent = (part: TS.Type) => !!(part.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void));
          if (ts.isOmittedExpression(el) || alternatives.every(absent)) {
            merge(out, w.valueOf(fallback, q));
            continue;
          }
          if (alternatives.some((part) => absent(part) ||
            !!(part.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)))) {
            merge(out, w.valueOf(fallback, q));
          }
        }
        if (ts.isSpreadElement(el)) merge(out, elementsOf(w, w.valueOf(el.expression, q), q));
        else merge(out, w.valueOf(el, q));
      }
    } finally {
      q.reading.delete(key);
    }
  }
  for (const u of base.unknown) out.unknown.add(u);
  if (fallback && (base.unknown.size > 0 || base.tainted || base.starved)) {
    merge(out, w.valueOf(fallback, q));
  }
  return out;
}

export function callResult(w: Walk, call: TS.CallExpression, q: Query): Res {
  const ts = w.ts;
  const callee = strip(ts, call.expression);
  // Object.freeze hands back the object it was given — ES semantics, not a
  // measurement. Without this the one literal @noble/curves builds its field
  // object from reads as "the result of Object.freeze", an unknown.
  if (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === 'Object' &&
    callee.name.text === 'freeze' &&
    call.arguments[0]
  ) {
    return w.valueOf(call.arguments[0], q);
  }
  const found = w.targets(call.expression);
  const out = emptyRes();
  let followed = 0;
  for (const d of found) {
    let fn: TS.Node | undefined;
    if (isFunctionLike(ts, d) && (d as TS.FunctionLikeDeclaration).body) fn = d;
    else if (ts.isVariableDeclaration(d) && d.initializer) {
      const init = strip(ts, d.initializer);
      if (isFunctionLike(ts, init) && (init as TS.FunctionLikeDeclaration).body) fn = init;
    }
    if (!fn) continue;
    followed++;
    for (const r of w.returnsOf(fn as TS.SignatureDeclaration)) merge(out, w.valueOf(r, q));
  }
  if (followed === 0) {
    const text = call.expression.getText();
    out.unknown.add(
      text === 'JSON.parse'
        ? 'a value from JSON.parse, which has no construction site to count'
        : `the result of ${text}(), whose body the walk cannot read`
    );
  }
  return out;
}

// The memoised answers, one factory each, so a test can build one over a tiny
// program and ask it directly rather than through the whole walk. Seven of the
// ten are here; `valueOf`, `literalProperty` and `memberValue` are not, because
// each calls a walker and every walker calls back into all three, so a whole
// Walk is the smallest thing their caches can belong to. Each cache is keyed on
// nodes of ONE program, so a Walk belongs to one program and is shared by every
// query against it.

export function makeIdOf(): Walk['idOf'] {
  const ids = new Map<TS.Node, number>();
  return (n) => {
    const have = ids.get(n);
    if (have !== undefined) return have;
    ids.set(n, ids.size + 1);
    return ids.size;
  };
}

export function makeIndex(ts: Ts, program: TS.Program): Walk['index'] {
  const own = (): TS.SourceFile[] =>
    program.getSourceFiles().filter((sf) => isOwnSource(program, sf));

  let index: Index | undefined;
  return () => {
    if (index) return index;
    const calls = new Map<string, Array<TS.CallExpression | TS.NewExpression>>();
    const writes = new Map<string, Write[]>();
    const varWrites = new Map<string, TS.BinaryExpression[]>();
    const supers: Array<{ call: TS.CallExpression; cls: TS.ClassLikeDeclaration }> = [];
    const classes: TS.ClassLikeDeclaration[] = [];
    const constructions = new Map<string, TS.NewExpression[]>();
    const push = <V>(m: Map<string, V[]>, k: string, v: V): void => {
      const at = m.get(k);
      if (at) at.push(v);
      else m.set(k, [v]);
    };
    const calleeName = (e: TS.Expression): string | undefined => {
      // The exported unwrap, for the reason receiver() takes it: this index is
      // what paramFlow reads to find a function's callers, and `(f as F)(x)`
      // never entered it. A caller the index cannot see is an origin the count
      // silently lacks (BUGS TC-113).
      const n = unwrap(ts, e);
      if (ts.isPropertyAccessExpression(n)) return n.name.text;
      if (ts.isElementAccessExpression(n)) {
        const key = unwrap(ts, n.argumentExpression);
        if (ts.isStringLiteralLike(key)) return key.text;
        if (ts.isNumericLiteral(key)) return String(Number(key.text));
      }
      if (ts.isIdentifier(n)) return n.text;
      return undefined;
    };
    const enclosingClass = (n: TS.Node): TS.ClassLikeDeclaration | undefined => {
      for (let p: TS.Node | undefined = n; p; p = p.parent) {
        if (ts.isClassDeclaration(p) || ts.isClassExpression(p)) return p;
      }
      return undefined;
    };
    const record = (node: TS.Node): void => {
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.SuperKeyword) {
          const cls = enclosingClass(node);
          if (cls) supers.push({ call: node, cls });
        } else {
          const name = calleeName(node.expression);
          if (name !== undefined) push(calls, name, node);
        }
      } else if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      ) {
        if (ts.isPropertyAccessExpression(node.left) ||
            ts.isElementAccessExpression(node.left)) {
          const name = calleeName(node.left);
          if (name !== undefined)
            push(writes, name, { kind: 'assign', access: node.left, value: node.right });
        } else if (ts.isIdentifier(node.left)) {
          push(varWrites, node.left.text, node);
        }
      } else if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
        push(writes, node.name.text, { kind: 'propassign', prop: node });
      } else if (ts.isShorthandPropertyAssignment(node)) {
        push(writes, node.name.text, { kind: 'shorthand', prop: node });
      } else if (
        ts.isPropertyDeclaration(node) &&
        node.initializer &&
        (ts.isIdentifier(node.name) || ts.isPrivateIdentifier(node.name))
      ) {
        push(writes, node.name.text, { kind: 'propdecl', member: node });
      } else if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
        classes.push(node);
      }
    };
    for (const sf of own()) {
      const test = isTestFile(sf);
      const visit = (node: TS.Node): void => {
        if (ts.isNewExpression(node)) {
          const name = calleeName(node.expression);
          if (name !== undefined) push(constructions, name, node);
        }
        if (!test) record(node);
        ts.forEachChild(node, visit);
      };
      ts.forEachChild(sf, visit);
    }
    index = { calls, writes, varWrites, supers, classes, constructions };
    return index;
  };
}

// Symbol resolution is pure per node and the checker is the whole cost of
// this analysis, so every resolved answer is kept: callee targets, write
// sites' property declarations, whether a class is ever constructed.
export function makeTargets(ts: Ts, checker: TS.TypeChecker): Walk['targets'] {
  const targetCache = new Map<TS.Node, TS.Node[]>();
  return (e) => {
    const have = targetCache.get(e);
    if (have) return have;
    const out = targetsOf(ts, checker, e);
    targetCache.set(e, out);
    return out;
  };
}

// extends edges, resolved once: which own-source classes derive from which.
export function makeChildren(
  ts: Ts,
  index: Walk['index'],
  targets: Walk['targets']
): Walk['childrenOf'] {
  let childrenMap: Map<TS.ClassLikeDeclaration, TS.ClassLikeDeclaration[]> | undefined;
  return () => {
    if (childrenMap) return childrenMap;
    childrenMap = new Map();
    for (const cls of index().classes) {
      for (const h of cls.heritageClauses ?? []) {
        if (h.token !== ts.SyntaxKind.ExtendsKeyword) continue;
        for (const t of h.types) {
          for (const d of targets(t.expression)) {
            if (!ts.isClassDeclaration(d) && !ts.isClassExpression(d)) continue;
            const at = childrenMap.get(d);
            if (at) at.push(cls);
            else childrenMap.set(d, [cls]);
          }
        }
      }
    }
    return childrenMap;
  };
}

// Whether the program visibly constructs a class, once per class.
export function makeConstructed(
  ts: Ts,
  index: Walk['index'],
  targets: Walk['targets']
): Walk['constructed'] {
  const constructedCache = new Map<TS.ClassLikeDeclaration, boolean>();
  return (c) => {
    const have = constructedCache.get(c);
    if (have !== undefined) return have;
    const name = c.name?.text;
    const built =
      name !== undefined &&
      (index().constructions.get(name) ?? []).some((call) => targets(call.expression).includes(c));
    constructedCache.set(c, built);
    return built;
  };
}

export function makeReturnsOf(ts: Ts): Walk['returnsOf'] {
  const returnsCache = new Map<TS.Node, TS.Expression[]>();
  return (fn) => {
    const have = returnsCache.get(fn);
    if (have) return have;
    const out: TS.Expression[] = [];
    const body = (fn as TS.FunctionLikeDeclaration).body;
    if (body && !ts.isBlock(body)) {
      out.push(body);
    } else if (body) {
      const visit = (n: TS.Node): void => {
        if (isFunctionLike(ts, n)) return;
        if (ts.isReturnStatement(n) && n.expression) out.push(n.expression);
        ts.forEachChild(n, visit);
      };
      visit(body);
    }
    returnsCache.set(fn, out);
    return out;
  };
}

// Which declared property a write site writes, resolved once per site: the
// checker's contextual-type answer is the expensive half of a field read,
// and it does not change between queries.
export function makeWriteDecls(ts: Ts, checker: TS.TypeChecker): Walk['writeDecls'] {
  const writeDeclCache = new Map<TS.Node, TS.Node[]>();
  return (w, name) => {
    const node =
      w.kind === 'assign' ? w.access : w.kind === 'propdecl' ? w.member : w.prop;
    const have = writeDeclCache.get(node);
    if (have) return have;
    let out: TS.Node[];
    if (w.kind === 'assign') {
      const key = ts.isPropertyAccessExpression(w.access)
        ? w.access.name : w.access.argumentExpression;
      out = declsOf(checker, checker.getSymbolAtLocation(key));
    } else if (w.kind === 'propdecl') out = declsOf(checker, checker.getSymbolAtLocation(w.member.name));
    else {
      const lit = w.prop.parent;
      out = ts.isObjectLiteralExpression(lit)
        ? declsOf(checker, checker.getContextualType(lit)?.getProperty(name))
        : [];
      // The literal's own property symbol as well: a read typed by the same
      // literal resolves there rather than at an interface.
      for (const d of declsOf(checker, checker.getSymbolAtLocation(w.prop.name))) out.push(d);
    }
    writeDeclCache.set(node, out);
    return out;
  };
}

// One program's walk: the seven factories above, plus the three memos that
// close the recursion with the walkers.
export function makeWalk(ts: Ts, program: TS.Program, checker: TS.TypeChecker): Walk {
  const idOf = makeIdOf();
  const index = makeIndex(ts, program);
  const targets = makeTargets(ts, checker);
  const childrenOf = makeChildren(ts, index, targets);
  const constructed = makeConstructed(ts, index, targets);
  const returnsOf = makeReturnsOf(ts);
  const writeDecls = makeWriteDecls(ts, checker);

  const memo = new Map<TS.Node, Res>();
  const dirty = new Map<TS.Node, Res>();

  function valueOf(node: TS.Node, q: Query): Res {
    const done = memo.get(node) ?? dirty.get(node);
    if (done) return done;
    if (q.stack.has(node)) {
      const r = emptyRes();
      r.tainted = true;
      return r;
    }
    if (--q.budget <= 0 || q.stack.size > MAX_DEPTH) {
      const r = unknown('the analysis budget ran out before the origin was found');
      r.starved = true;
      return r;
    }
    q.stack.add(node);
    const res = compute(walk, node, q);
    q.stack.delete(node);
    if (res.starved) return res;
    if (!res.tainted) memo.set(node, res);
    else dirty.set(node, res);
    return res;
  }

  // Memoized like valueOf, for the same reason: a spread chain re-expands the
  // same (literal, name) read from every site that can see it.
  const litPropCache = new Map<string, Res>();
  function literalProperty(lit: TS.ObjectLiteralExpression, name: string, q: Query): Res {
    const key = `p${idOf(lit)}:${name}`;
    const have = litPropCache.get(key);
    if (have) return have;
    const out = emptyRes();
    if (q.reading.has(key)) {
      out.tainted = true;
      return out;
    }
    q.reading.add(key);
    try {
      const res = literalPropertyInner(walk, lit, name, q, out);
      if (!res.starved) litPropCache.set(key, res);
      return res;
    } finally {
      q.reading.delete(key);
    }
  }

  const memberCache = new Map<string, Res>();
  function memberValue(
    cls: TS.ClassLikeDeclaration,
    name: string,
    wantStatic: boolean,
    q: Query
  ): Res {
    const key = `m${idOf(cls)}:${wantStatic ? 's' : 'i'}:${name}`;
    const have = memberCache.get(key);
    if (have) return have;
    const res = memberValueInner(walk, cls, name, wantStatic, q);
    if (!res.starved) memberCache.set(key, res);
    return res;
  }

  const walk: Walk = {
    ts,
    checker,
    idOf,
    index,
    targets,
    childrenOf,
    constructed,
    returnsOf,
    writeDecls,
    valueOf,
    literalProperty,
    memberValue,
  };
  return walk;
}

export function createFlow(ts: Ts, program: TS.Program, checker: TS.TypeChecker): Flow {
  const w = makeWalk(ts, program, checker);

  // The receiver of one call, traced to its origins. For `x.m()` the receiver
  // is x and `follow` is m's body on each origin; for a bare `f()` through a
  // call signature the receiver is f itself and `follow` is the function.
  const traced = new Map<TS.Node, Map<string, Traced>>();
  function receiver(call: Parameters<Flow['receiver']>[0]): Traced {
    const key = `${call.rest ? 'rest' : call.accessor ?? (call.construct ? 'new' : 'call')}:${call.member ?? ''}`;
    const site = call.binding ?? call.expression;
    const cache = traced.get(site);
    const have = cache?.get(key);
    if (have) return have;
    const q: Query = { budget: VISIT_BUDGET, stack: new Set(), reading: new Set() };
    // The exported unwrap, not a fourth parentheses-only loop. scan.ts unwraps
    // this same callee before it builds `Dispatch.recv` and `.method`, so two
    // walks that disagree about what the receiver is are two answers to one
    // question — the drift `unwrap`'s own comment records three earlier copies
    // of. `p.paint!()` loads `paint` off p's map exactly as `p.paint()` does,
    // and the `!` is erased before V8 sees anything; without this it took the
    // bare-call branch and a five-map site read as monomorphic-and-followed
    // (BUGS TC-113).
    const callee = unwrap(ts, call.expression);

    let res: Res;
    let method: string | undefined;
    if (call.binding) {
      res = bindingSource(w, call.binding, q);
      method = call.member;
    } else if (call.rest) {
      res = w.valueOf(callee, q);
    } else if (call.member !== undefined) {
      res = w.valueOf(callee, q);
      method = call.member;
    } else if (ts.isPropertyAccessExpression(callee)) {
      res = w.valueOf(callee.expression, q);
      method = callee.name.text;
    } else if (ts.isElementAccessExpression(callee)) {
      const key = checker.getTypeAtLocation(callee.argumentExpression);
      method = key.isStringLiteral() ? key.value :
        key.isNumberLiteral() ? String(key.value) : undefined;
      res = method === undefined ? w.valueOf(callee, q) :
        w.valueOf(callee.expression, q);
    } else {
      res = w.valueOf(callee, q);
    }

    const origins: Traced['origins'] = [];
    const bodies = new Set<TS.Node>();
    const unknowns = new Set(res.unknown);
    for (const o of res.origins.values()) {
      if (call.rest) {
        // Literal accessors are own and enumerable. Class accessors live on
        // the prototype (or are non-enumerable statics), so rest never reads them.
        if (o.kind === 'literal' && ts.isObjectLiteralExpression(o.node)) {
          const excluded = new Set<string>();
          if (call.binding) {
            const pattern = call.binding.parent;
            const members = ts.isObjectBindingPattern(pattern) ? pattern.elements :
              ts.isObjectLiteralExpression(pattern) ? pattern.properties : [];
            for (const member of members) {
              if (member === call.binding || !isBindingRead(ts, member) || ts.isSpreadAssignment(member)) continue;
              const name = ts.isBindingElement(member) ? member.propertyName ?? member.name : member.name;
              if (!ts.isObjectBindingPattern(name) && !ts.isArrayBindingPattern(name)) {
                const key = bindingKey(ts, checker, name);
                if (key !== undefined) excluded.add(key);
              }
            }
          }
          const getters = new Set<TS.GetAccessorDeclaration>();
          for (const literal of literalNodes(o)) {
            const seen = new Set(excluded);
            for (const property of [...literal.properties].reverse()) {
              if (ts.isSpreadAssignment(property)) {
                const spread = w.valueOf(property.expression, q);
                // Copying a known own property defines data on the destination,
                // even when that property's source is an accessor. Only keys
                // present on every visible origin definitely replace a getter.
                let definite: Set<string> | undefined;
                if (spread.unknown.size === 0 && !spread.tainted && !spread.starved) {
                  for (const source of spread.origins.values()) {
                    const keys = new Set<string>();
                    if (source.kind === 'literal' && ts.isObjectLiteralExpression(source.node)) {
                      for (const member of source.node.properties) {
                        if (!member.name) continue;
                        const key = bindingKey(ts, checker, member.name);
                        if (key !== undefined) keys.add(key);
                      }
                    }
                    definite = definite === undefined ? keys :
                      new Set([...definite].filter((key) => keys.has(key)));
                  }
                }
                for (const key of definite ?? []) seen.add(key);
                continue;
              }
              if (!property.name) continue;
              const name = bindingKey(ts, checker, property.name);
              if (name === undefined || seen.has(name) || ts.isSetAccessorDeclaration(property)) continue;
              seen.add(name);
              if (ts.isGetAccessorDeclaration(property) && property.body) {
                bodies.add(property);
                getters.add(property);
              }
            }
          }
          if (getters.size > 0) {
            origins.push({name: o.name, node: o.node,
              follow: getters.size === 1 ? [...getters][0] : undefined});
          }
        }
        continue;
      }
      if (method === undefined) {
        const follow = o.kind === 'function' ? bodyOf(ts, o.node) :
          call.construct && o.kind === 'classobj' ? o.node : undefined;
        if (follow) {
          origins.push({ name: o.name, node: o.node, follow });
          bodies.add(follow);
        }
        continue;
      }
      if (o.kind === 'function' || !carries(ts, o, method)) continue;
      const holder = methodBody(o, method, q, call.accessor);
      const targets = [...holder.origins.values()].flatMap((target) => {
        const body = target.kind === 'function' ? bodyOf(ts, target.node) :
          call.construct && target.kind === 'classobj' ? target.node : undefined;
        return body ? [body] : [];
      });
      for (const body of targets) bodies.add(body);
      for (const reason of holder.unknown) unknowns.add(reason);
      if (holder.tainted) unknowns.add('the member value flow is cyclic');
      if (holder.starved) unknowns.add('the member analysis budget ran out');
      const follow = targets.length === 1 && holder.unknown.size === 0 &&
        !holder.tainted && !holder.starved ? targets[0] : undefined;
      origins.push({ name: o.name, node: o.node, follow });
    }
    // A cycle-cut walk may have dropped origins flowing around the loop, so
    // its count is a lower bound like any other unknown — and a single origin
    // it reports is not proof of one implementation, so nothing is followed on
    // its word.
    if (res.tainted && unknowns.size === 0) {
      unknowns.add('the value flow is cyclic, so the count may be incomplete');
    }
    // The same statement for the other way origins go missing. `starved` is
    // set when a query ran out of budget, and `readProperty` drops the budget
    // MESSAGE as soon as the write channel yields any origin — so this flag is
    // the only survivor, and nothing read it. An alias chain longer than
    // MAX_DEPTH turned a two-implementation receiver into "the one
    // implementation this program builds, and followed": same program, longer
    // chain, stronger claim (BUGS TC-112).
    if (res.starved && unknowns.size === 0) {
      unknowns.add('the analysis budget ran out before every origin was found');
    }
    const out = { origins, unknown: [...unknowns], bodies: [...bodies] };
    if (cache) cache.set(key, out);
    else traced.set(site, new Map([[key, out]]));
    return out;
  }

  function methodBody(
    o: Origin,
    name: string,
    q: Query,
    accessor?: 'get' | 'set'
  ): Res {
    if (o.kind === 'literal' && o.literalNodes) {
      const out = emptyRes();
      for (const literal of o.literalNodes) {
        merge(out, methodBody({...o, node: literal, literalNodes: undefined}, name, q, accessor));
      }
      return out;
    }
    const type = originType(o);
    const declarations = checker.getPropertyOfType(type, name)?.getDeclarations() ?? [];
    if (accessor !== undefined) {
      const declaration = declarations.find((decl) => accessor === 'get'
        ? ts.isGetAccessorDeclaration(decl) : ts.isSetAccessorDeclaration(decl));
      if (!declaration) return emptyRes();
      const body = bodyOf(ts, declaration);
      return body ? originOf(w, { kind: 'function', node: body, name }) :
        unknown(`the ${accessor} accessor .${name} has no readable body`);
    }
    return readProperty(w, originOf(w, o), name, [...declarations], q);
  }

  function originType(o: Origin): TS.Type {
    let type = checker.getTypeAtLocation(o.node);
    if (o.kind === 'classobj' && ts.isClassLike(o.node) && o.node.name) {
      const symbol = symbolOf(ts, checker, o.node.name);
      if (symbol) type = checker.getTypeOfSymbolAtLocation(symbol, o.node);
    } else if (o.kind === 'class') {
      type = type.getConstructSignatures()[0]?.getReturnType() ?? type;
    }
    return type;
  }

  function sourceBindingType(binding: BindingRead): TS.Type | undefined {
    const q: Query = {budget: VISIT_BUDGET, stack: new Set(), reading: new Set()};
    const source = bindingSource(w, binding, q);
    const origin = source.origins.size === 1 ? [...source.origins.values()][0] : undefined;
    // A complete single allocation supplies the property declarations. The
    // static pattern type remains necessary for callers outside this program.
    if (origin && source.unknown.size === 0 && !source.tainted && !source.starved &&
      (origin.kind !== 'literal' || literalNodes(origin).length === 1)) return originType(origin);
    return bindingType(ts, checker, binding);
  }

  function sources(node: TS.Node, elements = false): Res {
    const q: Query = { budget: VISIT_BUDGET, stack: new Set(), reading: new Set() };
    const res = w.valueOf(node, q);
    return elements ? elementsOf(w, res, q) : res;
  }

  return { receiver, sources, bindingType: sourceBindingType,
    constructedClasses: (cls) => constructedClasses(w, cls) };
}

// Which parameter of an array callback holds an ELEMENT. Not shared.ts's
// `ITERATION`, which answers a different question — whether the callback is a
// loop body — and under that answer `reduce`'s first parameter belongs on the
// list, while the value it holds never came out of the array.
export const ELEMENT_PARAM = new Map<string, readonly number[]>([
  ['forEach', [0]],
  ['map', [0]],
  ['flatMap', [0]],
  ['filter', [0]],
  ['some', [0]],
  ['every', [0]],
  ['find', [0]],
  ['findIndex', [0]],
  ['findLast', [0]],
  ['findLastIndex', [0]],
  ['sort', [0, 1]],
  ['reduce', [1]],
  ['reduceRight', [1]],
]);

// The other half of the same table, keyed the same way: methods whose RETURN
// value is an element of the receiver. `at`, `find` and `findLast` return
// `T | undefined`, so the read normally sits behind a `!` or a guard — and
// narrowing changes the TYPE, never where the value came from, which is the
// distinction TC-94 turned on (BUGS TC-127).
const ELEMENT_RETURN = new Set<string>(['at', 'pop', 'shift', 'find', 'findLast']);

// Whether a value came OUT of one named collection. This is the second
// question this module answers and it is deliberately not `receiver`'s walk:
// `valueOf` above resolves a value to its ALLOCATION sites, and two values
// with the same origins are two values V8 gives the same maps — the question
// `interface-dispatch` asks. `megamorphic-elements` asks a different one, and
// the origin lattice cannot answer it: in `collect(src: U[], probe: U)` an
// exported function has no visible caller, so the origins of `src`'s elements
// and of `probe` are both the empty set plus one unknown, and nothing there
// separates a load off this array from a load off an unrelated parameter that
// merely shares its type. The rule compared TYPES instead and billed two
// collections nothing reads (BUGS TC-101, TC-94).
//
// So: the same hops as the walk above — an identifier to its declaration, a
// `for...of` or destructuring binding to the expression it takes apart, an
// element-returning method or an index to its receiver, a callback's element
// parameter to the call that runs it — run against a declaration instead of
// against an origin set. It errs the same way too. A value whose path here
// cannot be followed is NOT an element, so the rule loses loads it could have
// charged for and never invents one.
export interface ElementFlow {
  // An expression that holds an element of the collection.
  value(e: TS.Expression): boolean;
  // The same, for a declaration bound to one: a destructuring pattern's source
  // is a declaration rather than an expression.
  binding(d: TS.Node): boolean;
}

export function elementFlow(
  ts: Ts,
  checker: TS.TypeChecker,
  collection: TS.ParameterDeclaration | TS.VariableDeclaration,
  // The function that owns the collection — the same scope the caller searches
  // for loads. Two edges below are REVERSE edges, "every write to this local"
  // and "every call that names this callback", and a reverse edge needs
  // somewhere to look. `createFlow` answers both for the whole program, and
  // that index is a closure over a program this function is never handed.
  scope: TS.Node
): ElementFlow {
  // Cleared per query, not kept. It exists to cut a cycle, and a cut is a
  // reason to answer "not an element" HERE — never an answer to remember for
  // the next read, which may reach the same declaration by a path that ends.
  const seen = new Set<TS.Node>();

  const declarations = (id: TS.Identifier): readonly TS.Declaration[] =>
    symbolOf(ts, checker, id)?.getDeclarations() ?? [];

  interface Scoped {
    assigns: TS.BinaryExpression[];
    calls: TS.CallExpression[];
  }
  let scoped: Scoped | undefined;
  function inScope(): Scoped {
    if (scoped) return scoped;
    const assigns: TS.BinaryExpression[] = [];
    const calls: TS.CallExpression[] = [];
    const visit = (n: TS.Node): void => {
      if (
        ts.isBinaryExpression(n) &&
        n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(n.left)
      ) {
        assigns.push(n);
      }
      if (ts.isCallExpression(n)) calls.push(n);
      ts.forEachChild(n, visit);
    };
    visit(scope);
    scoped = { assigns, calls };
    return scoped;
  }

  // Every expression written into a binding, the declaration's initializer
  // aside. `let g = rows; g = other` puts both arrays behind `g`, and the load
  // site inside `for (const r of g)` sees the elements of both: the honest
  // answer is the union, and reading the declaration alone answers about one
  // collection while saying nothing about the other (BUGS TC-127).
  function writtenTo(id: TS.Identifier): TS.Expression[] {
    const sym = symbolOf(ts, checker, id);
    if (!sym) return [];
    return inScope()
      .assigns.filter(
        (a) =>
          ts.isIdentifier(a.left) && a.left.text === id.text && symbolOf(ts, checker, a.left) === sym
      )
      .map((a) => a.right);
  }

  // The collection itself, through aliases: `const rs = rows` holds the same
  // array, so `rs[i]` indexes the same elements — and so does a `let` any
  // write puts it into.
  function isCollection(e: TS.Expression): boolean {
    const u = unwrap(ts, e);
    if (!ts.isIdentifier(u) || seen.has(u)) return false;
    seen.add(u);
    return declarations(u).some(
      (d) =>
        d === collection ||
        (ts.isVariableDeclaration(d) &&
          ((d.initializer !== undefined && isCollection(d.initializer)) ||
            writtenTo(u).some((w) => isCollection(w))))
    );
  }

  // Whether this call runs a callback over the collection with an element in
  // the callback's parameter `idx`.
  function iterates(call: TS.CallExpression, idx: number): boolean {
    const callee = unwrap(ts, call.expression);
    if (!ts.isPropertyAccessExpression(callee)) return false;
    const holds = ELEMENT_PARAM.get(callee.name.text);
    if (!holds || !holds.includes(idx)) return false;
    return isCollection(callee.expression);
  }

  // The element parameter of a callback the collection is iterated with. The
  // callback is either written at the call — `rows.map(r => …)` — or named
  // there — `rows.map(byName)`. A named callback is reached from every other
  // call of it as well, and each of those calls contributes its own receiver's
  // elements to the one load site inside it, so every call in the scope that
  // names this function is asked and any one of them is enough. `targetsOf` is
  // the resolver from a callee expression to its declarations; a callback
  // argument is a callee written in argument position.
  function callbackElement(param: TS.ParameterDeclaration): boolean {
    const owner = param.parent;
    if (!isFunctionLike(ts, owner)) return false;
    const idx = owner.parameters.indexOf(param);
    if (idx < 0) return false;
    if (ts.isArrowFunction(owner) || ts.isFunctionExpression(owner)) {
      const call = owner.parent;
      if (ts.isCallExpression(call) && call.arguments.includes(owner)) return iterates(call, idx);
    }
    return callsNaming(owner).some((c) => iterates(c, idx));
  }

  // Which calls in the scope name this function as their callback. Resolving a
  // callee does not depend on the query, and re-resolving every call for every
  // read is quadratic on a body with many of both — which is the size the one
  // annotation on TypeScript's 50,000-line `createTypeChecker` has (TC-119).
  const named = new Map<TS.Node, TS.CallExpression[]>();
  function callsNaming(owner: TS.SignatureDeclaration): TS.CallExpression[] {
    const have = named.get(owner);
    if (have) return have;
    const out = inScope().calls.filter((c) => {
      const arg = c.arguments[0];
      return (
        arg !== undefined &&
        !ts.isArrowFunction(arg) &&
        !ts.isFunctionExpression(arg) &&
        targetsOf(ts, checker, arg).includes(owner)
      );
    });
    named.set(owner, out);
    return out;
  }

  // A declaration bound to one element: the `for...of` variable, a callback's
  // element parameter, an array-destructured binding, or a local initialized
  // from any of those.
  function bound(d: TS.Node): boolean {
    if (seen.has(d)) return false;
    seen.add(d);
    if (ts.isParameter(d)) return callbackElement(d);
    if (ts.isBindingElement(d)) return destructuredElement(d);
    if (!ts.isVariableDeclaration(d)) return false;
    const list = d.parent;
    if (ts.isVariableDeclarationList(list) && ts.isForOfStatement(list.parent)) {
      return isCollection(list.parent.expression);
    }
    return d.initializer !== undefined && isElement(d.initializer);
  }

  // `const [e] = rows` is the `for...of` edge on a different binding form. A
  // rest element is the exception: `const [...rest] = rows` binds an ARRAY.
  function destructuredElement(d: TS.BindingElement): boolean {
    if (d.dotDotDotToken !== undefined) return false;
    const pattern = d.parent;
    if (!ts.isArrayBindingPattern(pattern)) return false;
    const holder = pattern.parent;
    return (
      ts.isVariableDeclaration(holder) &&
      holder.initializer !== undefined &&
      isCollection(holder.initializer)
    );
  }

  function isElement(e: TS.Expression): boolean {
    const u = unwrap(ts, e);
    if (ts.isElementAccessExpression(u)) return isCollection(u.expression);
    if (ts.isCallExpression(u)) {
      const callee = unwrap(ts, u.expression);
      return (
        ts.isPropertyAccessExpression(callee) &&
        ELEMENT_RETURN.has(callee.name.text) &&
        isCollection(callee.expression)
      );
    }
    if (!ts.isIdentifier(u)) return false;
    return declarations(u).some(bound);
  }

  return {
    value: (e) => {
      seen.clear();
      return isElement(e);
    },
    binding: (d) => {
      seen.clear();
      return bound(d);
    },
  };
}
