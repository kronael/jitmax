import type * as TS from 'typescript';
import type { Ts } from './ts.ts';
import { isFunctionLike, isOwnSource, symbolOf, targetsOf, unwrap } from './scan.ts';

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

interface Origin {
  kind: 'class' | 'classobj' | 'literal' | 'array' | 'function';
  node: TS.Node;
  name: string;
}

interface Res {
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
  origins: Array<{ name: string; follow: TS.Node | undefined }>;
  unknown: string[];
}

export interface Flow {
  receiver(call: TS.CallExpression | TS.NewExpression): Traced;
}

interface Query {
  budget: number;
  stack: Set<TS.Node>;
  // Property and element reads in flight, keyed by container and name.
  // `new ZodX({ ...this._def })` makes a literal whose spread resolves back to
  // the literal itself; without this the read chases its own tail off the
  // stack — valueOf's node guard cannot see it, because each hop lands on a
  // different node.
  reading: Set<string>;
}

export function createFlow(ts: Ts, program: TS.Program, checker: TS.TypeChecker): Flow {
  const ids = new Map<TS.Node, number>();
  const idOf = (n: TS.Node): number => {
    const have = ids.get(n);
    if (have !== undefined) return have;
    ids.set(n, ids.size + 1);
    return ids.size;
  };

  const own = (): TS.SourceFile[] =>
    program.getSourceFiles().filter((sf) => isOwnSource(program, sf));

  // Reverse edges cannot be rooted at the call site — "every caller of f" and
  // "every write to .f" need the program scanned once. Keyed by NAME, resolved
  // by symbol only on demand, so the one pass stays a cheap AST walk and the
  // checker is only asked about candidates a query actually pulls.
  type Write =
    | { kind: 'assign'; access: TS.PropertyAccessExpression; value: TS.Expression }
    | { kind: 'propassign'; prop: TS.PropertyAssignment }
    | { kind: 'shorthand'; prop: TS.ShorthandPropertyAssignment }
    | { kind: 'propdecl'; member: TS.PropertyDeclaration };
  interface Index {
    calls: Map<string, Array<TS.CallExpression | TS.NewExpression>>;
    writes: Map<string, Write[]>;
    varWrites: Map<string, TS.BinaryExpression[]>;
    supers: Array<{ call: TS.CallExpression; cls: TS.ClassLikeDeclaration }>;
    classes: TS.ClassLikeDeclaration[];
  }
  let index: Index | undefined;
  const buildIndex = (): Index => {
    if (index) return index;
    const calls = new Map<string, Array<TS.CallExpression | TS.NewExpression>>();
    const writes = new Map<string, Write[]>();
    const varWrites = new Map<string, TS.BinaryExpression[]>();
    const supers: Array<{ call: TS.CallExpression; cls: TS.ClassLikeDeclaration }> = [];
    const classes: TS.ClassLikeDeclaration[] = [];
    const push = <V>(m: Map<string, V[]>, k: string, v: V): void => {
      const at = m.get(k);
      if (at) at.push(v);
      else m.set(k, [v]);
    };
    const calleeName = (e: TS.Expression): string | undefined => {
      let n = e;
      while (ts.isParenthesizedExpression(n)) n = n.expression;
      if (ts.isPropertyAccessExpression(n)) return n.name.text;
      if (ts.isIdentifier(n)) return n.text;
      return undefined;
    };
    const enclosingClass = (n: TS.Node): TS.ClassLikeDeclaration | undefined => {
      for (let p: TS.Node | undefined = n; p; p = p.parent) {
        if (ts.isClassDeclaration(p) || ts.isClassExpression(p)) return p;
      }
      return undefined;
    };
    for (const sf of own()) {
      const visit = (node: TS.Node): void => {
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
          if (ts.isPropertyAccessExpression(node.left)) {
            push(writes, node.left.name.text, { kind: 'assign', access: node.left, value: node.right });
          } else if (ts.isIdentifier(node.left)) {
            push(varWrites, node.left.text, node);
          }
        } else if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
          push(writes, node.name.text, { kind: 'propassign', prop: node });
        } else if (ts.isShorthandPropertyAssignment(node)) {
          push(writes, node.name.text, { kind: 'shorthand', prop: node });
        } else if (ts.isPropertyDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) {
          push(writes, node.name.text, { kind: 'propdecl', member: node });
        } else if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
          classes.push(node);
        }
        ts.forEachChild(node, visit);
      };
      ts.forEachChild(sf, visit);
    }
    index = { calls, writes, varWrites, supers, classes };
    return index;
  };

  // extends edges, resolved once: which own-source classes derive from which.
  let childrenMap: Map<TS.ClassLikeDeclaration, TS.ClassLikeDeclaration[]> | undefined;
  const childrenOf = (): Map<TS.ClassLikeDeclaration, TS.ClassLikeDeclaration[]> => {
    if (childrenMap) return childrenMap;
    childrenMap = new Map();
    for (const cls of buildIndex().classes) {
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
  const subclassesOf = (cls: TS.ClassLikeDeclaration): TS.ClassLikeDeclaration[] => {
    const out: TS.ClassLikeDeclaration[] = [];
    const seen = new Set<TS.ClassLikeDeclaration>([cls]);
    const queue = [cls];
    for (let i = 0; i < queue.length && out.length < 128; i++) {
      for (const c of childrenOf().get(queue[i]!) ?? []) {
        if (seen.has(c)) continue;
        seen.add(c);
        out.push(c);
        queue.push(c);
      }
    }
    return out;
  };

  // Symbol resolution is pure per node and the checker is the whole cost of
  // this analysis, so every resolved answer is kept: callee targets, write
  // sites' property declarations, whether a class is ever constructed.
  const targetCache = new Map<TS.Node, TS.Node[]>();
  const targets = (e: TS.Expression): TS.Node[] => {
    const have = targetCache.get(e);
    if (have) return have;
    const out = targetsOf(ts, checker, e);
    targetCache.set(e, out);
    return out;
  };

  const strip = (e: TS.Expression): TS.Expression => unwrap(ts, e);

  const className = (c: TS.ClassLikeDeclaration): string =>
    c.name?.text ?? '<anonymous class>';
  const where = (n: TS.Node): string => {
    const sf = n.getSourceFile();
    const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
    const base = sf.fileName.split('/').pop() ?? sf.fileName;
    return `${base}:${line + 1}`;
  };

  const emptyRes = (): Res => ({
    origins: new Map(),
    unknown: new Set(),
    tainted: false,
    starved: false,
  });
  // Both sets are capped: past 64 origins every count reads "at least", and
  // past 8 unknown reasons no ninth says anything new. Uncapped, zod's spread
  // chains merged thousand-entry sets quadratically.
  const merge = (into: Res, from: Res): void => {
    for (const [k, v] of from.origins) {
      if (into.origins.size >= 64 && !into.origins.has(k)) continue;
      into.origins.set(k, v);
    }
    for (const u of from.unknown) {
      if (into.unknown.size >= 8) break;
      into.unknown.add(u);
    }
    into.tainted ||= from.tainted;
    into.starved ||= from.starved;
  };
  const unknown = (why: string): Res => {
    const r = emptyRes();
    r.unknown.add(why);
    return r;
  };
  const originOf = (o: Origin): Res => {
    const r = emptyRes();
    const key =
      o.kind === 'literal' && !hasSpread(o.node)
        ? `L:${literalShape(o.node as TS.ObjectLiteralExpression)}`
        : // Every array literal is ONE key. An array's map is decided by its
          // elements kind — PACKED_SMI, PACKED, HOLEY — and not by where it was
          // allocated, so ten `[]` in ten files are one map and were counted as
          // ten. valibot has 34 sites calling `dataset.issues.push()` and the
          // count printed at each was 10, every one of them an `array` origin.
          // Nothing static reads an elements kind, so this collapses to one for
          // the same reason `literalShape` sorts names: where the walk cannot
          // tell two maps apart it counts one, rather than warning about a
          // program whose maps nobody has counted (TC-42's direction, BUGS
          // TC-99).
          o.kind === 'array'
          ? 'A'
          : `${o.kind}:${idOf(o.node)}`;
    r.origins.set(key, o);
    return r;
  };
  const hasSpread = (n: TS.Node): boolean =>
    ts.isObjectLiteralExpression(n) && n.properties.some((p) => ts.isSpreadAssignment(p));
  // Same sorted-name key the rules use for a property set: names without
  // order, because a type cannot see order, and two literals that agree on
  // names are treated as one map rather than warned about (TC-42's direction).
  const literalShape = (n: TS.ObjectLiteralExpression): string =>
    n.properties
      .map((p) => (p.name && ts.isIdentifier(p.name) ? p.name.text : `#${idOf(p)}`))
      .sort()
      .join(',');

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
  const carries = (o: Origin, method: string): boolean => {
    if (o.kind !== 'literal') return true;
    const lit = o.node as TS.ObjectLiteralExpression;
    if (hasSpread(lit) || OBJECT_PROTOTYPE.has(method)) return true;
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
  const declsOf = (sym: TS.Symbol | undefined): TS.Node[] => {
    if (!sym) return [];
    const roots = checker.getRootSymbols(sym);
    const out: TS.Node[] = [];
    for (const s of roots.length > 0 ? roots : [sym]) {
      for (const d of s.getDeclarations() ?? []) out.push(d);
    }
    return out;
  };
  const sameProperty = (a: TS.Node[], b: TS.Node[]): boolean =>
    a.some((d) => b.includes(d));

  // Which declared property a write site writes, resolved once per site: the
  // checker's contextual-type answer is the expensive half of a field read,
  // and it does not change between queries.
  const writeDeclCache = new Map<TS.Node, TS.Node[]>();
  const writeDecls = (
    w:
      | { kind: 'assign'; access: TS.PropertyAccessExpression; value: TS.Expression }
      | { kind: 'propassign'; prop: TS.PropertyAssignment }
      | { kind: 'shorthand'; prop: TS.ShorthandPropertyAssignment }
      | { kind: 'propdecl'; member: TS.PropertyDeclaration },
    name: string
  ): TS.Node[] => {
    const node =
      w.kind === 'assign' ? w.access : w.kind === 'propdecl' ? w.member : w.prop;
    const have = writeDeclCache.get(node);
    if (have) return have;
    let out: TS.Node[];
    if (w.kind === 'assign') out = declsOf(checker.getSymbolAtLocation(w.access.name));
    else if (w.kind === 'propdecl') out = declsOf(checker.getSymbolAtLocation(w.member.name));
    else {
      const lit = w.prop.parent;
      out = ts.isObjectLiteralExpression(lit)
        ? declsOf(checker.getContextualType(lit)?.getProperty(name))
        : [];
      // The literal's own property symbol as well: a read typed by the same
      // literal resolves there rather than at an interface.
      for (const d of declsOf(checker.getSymbolAtLocation(w.prop.name))) out.push(d);
    }
    writeDeclCache.set(node, out);
    return out;
  };

  // Whether the program visibly constructs a class, once per class.
  const constructedCache = new Map<TS.ClassLikeDeclaration, boolean>();
  const constructed = (c: TS.ClassLikeDeclaration): boolean => {
    const have = constructedCache.get(c);
    if (have !== undefined) return have;
    const name = c.name?.text;
    const built =
      name !== undefined &&
      (buildIndex().calls.get(name) ?? []).some(
        (call) => ts.isNewExpression(call) && targets(call.expression).includes(c)
      );
    constructedCache.set(c, built);
    return built;
  };

  const returnsCache = new Map<TS.Node, TS.Expression[]>();
  const returnsOf = (fn: TS.SignatureDeclaration): TS.Expression[] => {
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
    const res = compute(node, q);
    q.stack.delete(node);
    if (res.starved) return res;
    if (!res.tainted) memo.set(node, res);
    else dirty.set(node, res);
    return res;
  }

  function compute(node: TS.Node, q: Query): Res {
    const e = ts.isExpression(node) ? strip(node) : node;
    if (e !== node) return valueOf(e, q);

    if (ts.isObjectLiteralExpression(e)) {
      // The dedup key is the full shape; the printed name is not — a field
      // object can carry thirty properties and the message needs a handle,
      // not an inventory.
      const names = e.properties
        .map((p) => (p.name && ts.isIdentifier(p.name) ? p.name.text : '…'))
        .slice(0, 3);
      const label = e.properties.length > 3 ? `${names.join(',')},…` : names.join(',');
      return originOf({ kind: 'literal', node: e, name: `{${label}} (${where(e)})` });
    }
    if (ts.isArrayLiteralExpression(e)) {
      return originOf({ kind: 'array', node: e, name: `array (${where(e)})` });
    }
    if (ts.isNewExpression(e)) {
      const out = emptyRes();
      for (const d of targets(e.expression)) {
        if (ts.isClassDeclaration(d) || ts.isClassExpression(d)) {
          merge(out, originOf({ kind: 'class', node: d, name: className(d) }));
        }
      }
      if (out.origins.size === 0) out.unknown.add(`new ${e.expression.getText()} resolves to no visible class`);
      return out;
    }
    if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) {
      return originOf({ kind: 'function', node: e, name: `function (${where(e)})` });
    }
    if (ts.isCallExpression(e)) return callResult(e, q);
    if (ts.isAwaitExpression(e)) return valueOf(e.expression, q);
    if (ts.isConditionalExpression(e)) {
      const out = emptyRes();
      merge(out, valueOf(e.whenTrue, q));
      merge(out, valueOf(e.whenFalse, q));
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
        merge(out, valueOf(e.left, q));
        merge(out, valueOf(e.right, q));
        return out;
      }
      if (k === ts.SyntaxKind.EqualsToken || k === ts.SyntaxKind.CommaToken) {
        return valueOf(e.right, q);
      }
      return emptyRes();
    }
    if (ts.isPropertyAccessExpression(e)) return propRead(e, q);
    if (ts.isElementAccessExpression(e)) return elementsOf(valueOf(e.expression, q), q);
    if (e.kind === ts.SyntaxKind.ThisKeyword) return thisFlow(e, q);
    if (ts.isIdentifier(e)) return symbolFlow(e, q);
    // Literals, template strings, unary arithmetic: primitives, which are
    // never a dispatch receiver the escape test lets through.
    return emptyRes();
  }

  function symbolFlow(id: TS.Identifier, q: Query): Res {
    const sym = symbolOf(ts, checker, id);
    const decls = sym?.getDeclarations() ?? [];
    if (decls.length === 0) return unknown(`${id.text} resolves to nothing — an unresolved import, or untyped code`);
    const out = emptyRes();
    for (const d of decls.slice(0, 8)) {
      if (ts.isVariableDeclaration(d)) {
        if (d.initializer) merge(out, valueOf(d.initializer, q));
        const list = d.parent;
        if (
          !d.initializer &&
          ts.isVariableDeclarationList(list) &&
          ts.isForOfStatement(list.parent)
        ) {
          merge(out, elementsOf(valueOf(list.parent.expression, q), q));
        }
        for (const w of buildIndex().varWrites.get(id.text) ?? []) {
          if (ts.isIdentifier(w.left) && checker.getSymbolAtLocation(w.left) === sym) {
            merge(out, valueOf(w.right, q));
          }
        }
        if (out.origins.size === 0 && out.unknown.size === 0 && !d.initializer) {
          out.unknown.add(`${id.text} is never visibly assigned`);
        }
      } else if (ts.isParameter(d)) {
        merge(out, paramFlow(d, q));
      } else if (ts.isBindingElement(d)) {
        merge(out, bindingFlow(d, q));
      } else if (ts.isFunctionDeclaration(d)) {
        merge(out, originOf({ kind: 'function', node: d, name: `${id.text}()` }));
      } else if (ts.isClassDeclaration(d) || ts.isClassExpression(d)) {
        merge(out, originOf({ kind: 'classobj', node: d, name: className(d) }));
      } else if (ts.isEnumDeclaration(d) || ts.isNamespaceImport(d) || ts.isModuleDeclaration(d)) {
        merge(out, originOf({ kind: 'classobj', node: d, name: id.text }));
      } else {
        out.unknown.add(`${id.text} is declared as a ${ts.SyntaxKind[d.kind]} the walk does not model`);
      }
    }
    return out;
  }

  // `const { Fp } = CURVE` and `function f({ Fp }: Opts)` are field reads
  // written as patterns: find what the pattern's source holds, then read the
  // one property.
  function bindingFlow(d: TS.BindingElement, q: Query): Res {
    const pattern = d.parent;
    if (!ts.isObjectBindingPattern(pattern)) return unknown('an array-destructured value');
    const holder = pattern.parent;
    const name = ts.isIdentifier(d.propertyName ?? d.name) ? (d.propertyName ?? d.name) : undefined;
    if (!name || !ts.isIdentifier(name)) return unknown('a computed destructuring key');
    let src: Res;
    if (ts.isVariableDeclaration(holder) && holder.initializer) {
      src = valueOf(holder.initializer, q);
    } else if (ts.isParameter(holder)) {
      src = paramFlow(holder, q);
    } else {
      return unknown('a destructuring the walk does not model');
    }
    const out = readProperty(src, name.text, declsOf(checker.getSymbolAtLocation(d.name)), q);
    if (d.initializer) merge(out, valueOf(d.initializer, q));
    return out;
  }

  function paramFlow(param: TS.ParameterDeclaration, q: Query): Res {
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
      return ctorArgFlow(cls, argIndex, param, q);
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
    for (const name of names) {
      for (const call of buildIndex().calls.get(name) ?? []) {
        if (!ts.isCallExpression(call)) continue;
        if (!targets(call.expression).some((t) => t === fn || t === p)) continue;
        callers++;
        merge(out, argAt(call, argIndex, param, q));
        if (callers >= 64) break;
      }
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
  function ctorArgFlow(
    cls: TS.ClassLikeDeclaration,
    argIndex: number,
    param: TS.ParameterDeclaration,
    q: Query
  ): Res {
    const out = emptyRes();
    let sites = 0;
    const constructing = [cls];
    for (const sub of subclassesOf(cls)) {
      const ownCtor = sub.members.some((m) => ts.isConstructorDeclaration(m) && m.body);
      if (!ownCtor) constructing.push(sub);
    }
    for (const c of constructing) {
      const name = c.name?.text;
      if (name === undefined) continue;
      for (const call of buildIndex().calls.get(name) ?? []) {
        if (!ts.isNewExpression(call)) continue;
        if (!targets(call.expression).includes(c)) continue;
        sites++;
        merge(out, argAt(call, argIndex, param, q));
        if (sites >= 64) break;
      }
    }
    for (const s of buildIndex().supers) {
      for (const h of s.cls.heritageClauses ?? []) {
        if (h.token !== ts.SyntaxKind.ExtendsKeyword) continue;
        if (h.types.some((t) => targets(t.expression).includes(cls))) {
          sites++;
          merge(out, argAt(s.call, argIndex, param, q));
        }
      }
    }
    if (sites === 0) {
      out.unknown.add(`no visible construction of ${className(cls)}`);
    }
    return out;
  }

  function argAt(
    call: TS.CallExpression | TS.NewExpression,
    argIndex: number,
    param: TS.ParameterDeclaration,
    q: Query
  ): Res {
    const args: readonly TS.Expression[] = call.arguments ?? [];
    if (args.slice(0, argIndex + 1).some((a) => ts.isSpreadElement(a))) {
      return unknown('a spread argument');
    }
    const arg = args[argIndex];
    if (arg) return valueOf(arg, q);
    if (param.initializer) return valueOf(param.initializer, q);
    return emptyRes();
  }

  // `this` in a method: every visible construction of the class or one of its
  // subclasses can be the receiver. Context-insensitive, like the rest of the
  // walk — an instance built anywhere may call any method.
  function thisFlow(node: TS.Node, q: Query): Res {
    let fn: TS.Node | undefined = node;
    while (fn && !(isFunctionLike(ts, fn) && !ts.isArrowFunction(fn))) fn = fn.parent;
    if (!fn) return unknown('`this` outside any method');
    const holder = fn.parent;
    if (holder && ts.isObjectLiteralExpression(holder)) return valueOf(holder, q);
    if (!holder || (!ts.isClassDeclaration(holder) && !ts.isClassExpression(holder))) {
      return unknown('`this` in a plain function, whose receiver the walk cannot see');
    }
    const isStatic = ts
      .getCombinedModifierFlags(fn as TS.Declaration)
      .valueOf() & ts.ModifierFlags.Static;
    if (isStatic) return originOf({ kind: 'classobj', node: holder, name: className(holder) });
    const out = emptyRes();
    for (const c of [holder, ...subclassesOf(holder)]) {
      if (constructed(c)) merge(out, originOf({ kind: 'class', node: c, name: className(c) }));
    }
    if (out.origins.size === 0) {
      out.unknown.add(`no visible construction of ${className(holder)} or a subclass`);
    }
    return out;
  }

  function propRead(access: TS.PropertyAccessExpression, q: Query): Res {
    const base = valueOf(access.expression, q);
    const propDecls = declsOf(checker.getSymbolAtLocation(access.name));
    return readProperty(base, access.name.text, propDecls, q);
  }

  function readProperty(base: Res, name: string, propDecls: TS.Node[], q: Query): Res {
    const out = emptyRes();
    out.tainted = base.tainted;
    out.starved = base.starved;
    for (const o of base.origins.values()) {
      if (o.kind === 'literal') {
        merge(out, literalProperty(o.node as TS.ObjectLiteralExpression, name, q));
      } else if (o.kind === 'class' || o.kind === 'classobj') {
        merge(out, memberValue(o.node as TS.ClassLikeDeclaration, name, o.kind === 'classobj', q));
      }
      // array and function origins hold no named field worth following.
    }
    // Writes anywhere in the program to the SAME declared property — `this.f =
    // v` in a constructor, `{ f: v }` under a contextual type — reach a read
    // the base origins cannot explain. Matched by declaration, not by name, or
    // every `.type` field in a program would pour into every other.
    if (propDecls.length > 0) {
      for (const w of (buildIndex().writes.get(name) ?? []).slice(0, 128)) {
        if (!sameProperty(writeDecls(w, name), propDecls)) continue;
        if (w.kind === 'assign') merge(out, valueOf(w.value, q));
        else if (w.kind === 'propassign') merge(out, valueOf(w.prop.initializer, q));
        else if (w.kind === 'shorthand') merge(out, symbolFlow(w.prop.name, q));
        else merge(out, valueOf(w.member.initializer!, q));
      }
    }
    if (out.origins.size === 0 && out.unknown.size === 0) {
      if (base.unknown.size > 0) for (const u of base.unknown) out.unknown.add(u);
      else out.unknown.add(`no visible write to .${name}`);
    }
    return out;
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
      const res = literalPropertyInner(lit, name, q, out);
      if (!res.starved) litPropCache.set(key, res);
      return res;
    } finally {
      q.reading.delete(key);
    }
  }

  function literalPropertyInner(
    lit: TS.ObjectLiteralExpression,
    name: string,
    q: Query,
    out: Res
  ): Res {
    let found = false;
    for (const p of lit.properties) {
      if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === name) {
        found = true;
        merge(out, valueOf(p.initializer, q));
      } else if (ts.isShorthandPropertyAssignment(p) && p.name.text === name) {
        found = true;
        merge(out, symbolFlow(p.name, q));
      } else if (ts.isMethodDeclaration(p) && ts.isIdentifier(p.name) && p.name.text === name) {
        found = true;
        merge(out, originOf({ kind: 'function', node: p, name: `${name}()` }));
      } else if (ts.isGetAccessorDeclaration(p) && ts.isIdentifier(p.name) && p.name.text === name) {
        found = true;
        for (const r of returnsOf(p)) merge(out, valueOf(r, q));
      }
    }
    if (!found) {
      for (const p of lit.properties) {
        if (ts.isSpreadAssignment(p)) {
          merge(out, readProperty(valueOf(p.expression, q), name, [], q));
        }
      }
    }
    return out;
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
    const res = memberValueInner(cls, name, wantStatic, q);
    if (!res.starved) memberCache.set(key, res);
    return res;
  }

  function memberValueInner(
    cls: TS.ClassLikeDeclaration,
    name: string,
    wantStatic: boolean,
    q: Query
  ): Res {
    const out = emptyRes();
    let cur: TS.ClassLikeDeclaration | undefined = cls;
    for (let depth = 0; cur && depth < 8; depth++) {
      // A `classobj` origin can be an enum or a namespace object (symbolFlow
      // files both under it): neither has class members to walk.
      if (!ts.isClassDeclaration(cur) && !ts.isClassExpression(cur)) break;
      for (const m of cur.members) {
        if (!m.name || !ts.isIdentifier(m.name) || m.name.text !== name) continue;
        const isStatic = Boolean(
          ts.getCombinedModifierFlags(m as TS.Declaration).valueOf() & ts.ModifierFlags.Static
        );
        if (isStatic !== wantStatic) continue;
        if (ts.isMethodDeclaration(m) && m.body) {
          merge(out, originOf({ kind: 'function', node: m, name: `${name}()` }));
        } else if (ts.isPropertyDeclaration(m) && m.initializer) {
          merge(out, valueOf(m.initializer, q));
        } else if (ts.isGetAccessorDeclaration(m) && m.body) {
          for (const r of returnsOf(m)) merge(out, valueOf(r, q));
        }
      }
      if (out.origins.size > 0 || out.unknown.size > 0) break;
      let base: TS.ClassLikeDeclaration | undefined;
      for (const h of cur.heritageClauses ?? []) {
        if (h.token !== ts.SyntaxKind.ExtendsKeyword) continue;
        for (const t of h.types) {
          const d = targets(t.expression).find(
            (x): x is TS.ClassLikeDeclaration => ts.isClassDeclaration(x) || ts.isClassExpression(x)
          );
          if (d) base = d;
        }
      }
      cur = base;
    }
    return out;
  }

  function elementsOf(base: Res, q: Query): Res {
    const out = emptyRes();
    out.tainted = base.tainted;
    out.starved = base.starved;
    for (const o of base.origins.values()) {
      if (o.kind !== 'array') {
        out.unknown.add('an element of a collection the walk cannot enumerate');
        continue;
      }
      const key = `e${idOf(o.node)}`;
      if (q.reading.has(key)) {
        out.tainted = true;
        continue;
      }
      q.reading.add(key);
      try {
        for (const el of (o.node as TS.ArrayLiteralExpression).elements) {
          if (ts.isSpreadElement(el)) merge(out, elementsOf(valueOf(el.expression, q), q));
          else merge(out, valueOf(el, q));
        }
      } finally {
        q.reading.delete(key);
      }
    }
    for (const u of base.unknown) out.unknown.add(u);
    return out;
  }

  function callResult(call: TS.CallExpression, q: Query): Res {
    const callee = strip(call.expression);
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
      return valueOf(call.arguments[0], q);
    }
    const found = targets(call.expression);
    const out = emptyRes();
    let followed = 0;
    for (const d of found) {
      let fn: TS.Node | undefined;
      if (isFunctionLike(ts, d) && (d as TS.FunctionLikeDeclaration).body) fn = d;
      else if (ts.isVariableDeclaration(d) && d.initializer) {
        const init = strip(d.initializer);
        if (isFunctionLike(ts, init) && (init as TS.FunctionLikeDeclaration).body) fn = init;
      }
      if (!fn) continue;
      followed++;
      for (const r of returnsOf(fn as TS.SignatureDeclaration)) merge(out, valueOf(r, q));
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

  // The receiver of one call, traced to its origins. For `x.m()` the receiver
  // is x and `follow` is m's body on each origin; for a bare `f()` through a
  // call signature the receiver is f itself and `follow` is the function.
  const traced = new Map<TS.Node, Traced>();
  function receiver(call: TS.CallExpression | TS.NewExpression): Traced {
    const have = traced.get(call);
    if (have) return have;
    const q: Query = { budget: VISIT_BUDGET, stack: new Set(), reading: new Set() };
    let callee: TS.Expression = call.expression;
    while (ts.isParenthesizedExpression(callee)) callee = callee.expression;

    let res: Res;
    let method: string | undefined;
    if (ts.isPropertyAccessExpression(callee)) {
      res = valueOf(callee.expression, q);
      method = callee.name.text;
    } else {
      res = valueOf(callee, q);
    }

    const origins: Array<{ name: string; follow: TS.Node | undefined }> = [];
    for (const o of res.origins.values()) {
      if (method === undefined) {
        // A bare call: only a function origin is a body to follow, and a
        // non-function origin says nothing about the call target.
        if (o.kind === 'function') origins.push({ name: o.name, follow: bodyOf(o.node) });
        continue;
      }
      if (o.kind === 'function') continue;
      if (!carries(o, method)) continue;
      origins.push({ name: o.name, follow: methodBody(o, method, q) });
    }
    const unknowns = [...res.unknown];
    // A cycle-cut walk may have dropped origins flowing around the loop, so
    // its count is a lower bound like any other unknown — and a single origin
    // it reports is not proof of one implementation, so nothing is followed on
    // its word.
    if (res.tainted && unknowns.length === 0) {
      unknowns.push('the value flow is cyclic, so the count may be incomplete');
    }
    const out = { origins, unknown: unknowns };
    traced.set(call, out);
    return out;
  }

  function bodyOf(n: TS.Node): TS.Node | undefined {
    if (isFunctionLike(ts, n) && (n as TS.FunctionLikeDeclaration).body) return n;
    return undefined;
  }

  function methodBody(o: Origin, name: string, q: Query): TS.Node | undefined {
    let holder: Res;
    if (o.kind === 'literal') holder = literalProperty(o.node as TS.ObjectLiteralExpression, name, q);
    else if (o.kind === 'class' || o.kind === 'classobj') {
      holder = memberValue(o.node as TS.ClassLikeDeclaration, name, o.kind === 'classobj', q);
    } else return undefined;
    const fns = [...holder.origins.values()].filter((x) => x.kind === 'function');
    if (fns.length !== 1 || holder.unknown.size > 0) return undefined;
    return bodyOf(fns[0]!.node);
  }

  return { receiver };
}
