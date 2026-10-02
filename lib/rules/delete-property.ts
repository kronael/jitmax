import type * as TS from 'typescript';
import type { Ts } from '../ts.ts';
import { at, isFunctionLike, symbolOf, targetsOf, unwrap, type Mark, type Site } from '../scan.ts';
import { N } from '../numbers.ts';
import { cells, isArray, walk, type Evidence, type Rule, type RuleModule } from './shared.ts';

// The rule's name, once. It was a terminal string in the finding and a second
// terminal string in the exported rule below, and the pair that drifted was in
// interface-dispatch.ts, which reports a rule that is not its own.
const NAME = 'delete-property';

const evidence: Evidence = {
  cost:
    `${N['delete.rows']} per property load once the object is in dictionary mode ` +
    `(${N['delete.rows.sizes']}, three replications each), and ` +
    `${N['delete.vs.undefined']} against ` +
    `assigning undefined instead — and ${N['delete.single']} for ONE object with a single ` +
    'delete, at every working set and in all nine of its sweeps, which overturns the 0x ' +
    'this project published for that case since round 1; with construction counted ' +
    `${N['delete.rows.constr']} at n=256, where the delete is paid on every object built, ` +
    `and ${N['delete.single.constr']} for the single object`,
  source:
    `bench/delete.jl, ${cells(N['delete.cells'])}, 20 pairs each, every cell replicated ` +
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
  defects: ['TC-9'],
};

// "Assign undefined" is correct about V8 — `{b: undefined}` shares the map of
// `{b: 1}` — and not always correct about the program: an absent key and a key
// holding undefined differ to spread (which copies it), to `in`, and to
// Object.keys and its for-in twin.
//
// NOT to JSON.stringify, which TC-79 listed and which omits BOTH:
// `JSON.stringify({x:1}) === JSON.stringify({x:1, k: undefined})` is true. It
// was an arm here, so the tool withdrew a safe rewrite and asserted a false
// fact about JavaScript at the same time. TC-79's list is wrong on that member
// and the entry is amended rather than implemented as written. Immich's
// `removeUndefinedKeys` exists to OMIT keys from a database SET clause, and
// the printed rewrite would have written NULL to columns meant to be left
// alone (BUGS TC-79). The tree is already walked, so this checks: it follows
// the deleted object through aliases, arguments and returns across every body
// the mark reaches, and looks for the observers below. Order-insensitive on
// purpose — proving an observer runs only before the delete is control flow
// this walk does not do, so a hit anywhere drops the rewrite, which errs
// toward the fix that is always sound.
interface Observed extends Site {
  op: string;
}

// The observers that take the object as their first argument. `in`, for-in and
// spread are syntax and are matched in the walk; `hasOwnProperty` reaches the
// object through three shapes and is matched there too. The list shipped four
// entries long and the first JavaScript corpus it met held a fifth — mathjs
// `lruQueue` deletes a slot and rescans for the next live one with
// `Object.prototype.hasOwnProperty.call` nine lines below, where assigning
// undefined stops the scan on the hole it was written to skip (BUGS TC-79).
const ARG0_OBSERVERS = new Map<string, ReadonlySet<string>>([
  ['Object', new Set(['keys', 'values', 'entries', 'getOwnPropertyNames', 'hasOwn'])],
  ['Reflect', new Set(['ownKeys'])],
]);

interface ObjectUses {
  // Undirected alias edges: an argument and its parameter, both ends of a
  // `const y = x`, a returned local and the variable the call fills. The
  // object is one object however it is named, which is why the edges have no
  // direction.
  edges: Map<TS.Symbol, Set<TS.Symbol>>;
  observed: Map<TS.Symbol, Observed>;
}

// The symbol a value expression is known by: the identifier's, or the
// property's for `this.cache` — the same symbol every other reference to that
// name resolves to, which is what lets one object be tracked across bodies.
function symAt(ts: Ts, checker: TS.TypeChecker, e: TS.Expression): TS.Symbol | undefined {
  const n = unwrap(ts, e);
  if (ts.isIdentifier(n) || ts.isPropertyAccessExpression(n)) {
    return checker.getSymbolAtLocation(ts.isIdentifier(n) ? n : n.name);
  }
  return undefined;
}

const usesCache = new WeakMap<Mark, ObjectUses>();

function objectUses(ts: Ts, checker: TS.TypeChecker, mark: Mark): ObjectUses {
  const have = usesCache.get(mark);
  if (have) return have;
  const edges = new Map<TS.Symbol, Set<TS.Symbol>>();
  const observed = new Map<TS.Symbol, Observed>();
  const edge = (a: TS.Symbol | undefined, b: TS.Symbol | undefined): void => {
    if (!a || !b || a === b) return;
    (edges.get(a) ?? edges.set(a, new Set()).get(a)!).add(b);
    (edges.get(b) ?? edges.set(b, new Set()).get(b)!).add(a);
  };
  const see = (sym: TS.Symbol | undefined, op: string, node: TS.Node, sf: TS.SourceFile): void => {
    if (!sym || observed.has(sym)) return;
    observed.set(sym, { op, ...at(sf, node) });
  };
  const bodies = new Set(mark.reached.map((b) => b.node));
  const returnsOf = new Map<TS.Node, Set<TS.Symbol>>();
  const links: Array<{ call: TS.CallExpression; decl: TS.Node }> = [];

  for (const body of mark.reached) {
    const sf = body.sf;
    const visit = (node: TS.Node): void => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        edge(checker.getSymbolAtLocation(node.name), symAt(ts, checker, node.initializer));
      } else if (ts.isBinaryExpression(node)) {
        if (node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
          edge(symAt(ts, checker, node.left), symAt(ts, checker, node.right));
        } else if (node.operatorToken.kind === ts.SyntaxKind.InKeyword) {
          see(symAt(ts, checker, node.right), '`in`', node, sf);
        }
      } else if (ts.isForInStatement(node)) {
        see(symAt(ts, checker, node.expression), 'for-in', node, sf);
      } else if (ts.isSpreadElement(node) || ts.isSpreadAssignment(node)) {
        see(symAt(ts, checker, node.expression), 'a spread', node, sf);
      } else if (ts.isCallExpression(node)) {
        const callee = node.expression;
        if (ts.isPropertyAccessExpression(callee)) {
          const m = callee.name.text;
          const recv = callee.expression;
          if (m === 'hasOwnProperty') {
            see(symAt(ts, checker, recv), 'hasOwnProperty', node, sf);
          } else if (
            (m === 'call' || m === 'apply') &&
            ts.isPropertyAccessExpression(recv) &&
            recv.name.text === 'hasOwnProperty'
          ) {
            // `Object.prototype.hasOwnProperty.call(o, k)`: the object is the
            // first argument and the receiver is the borrowed method.
            if (node.arguments[0]) {
              see(symAt(ts, checker, node.arguments[0]), 'hasOwnProperty', node, sf);
            }
          } else if (ts.isIdentifier(recv)) {
            const ns = recv.text;
            if (ns === 'Object' && m === 'assign') {
              // The SOURCES only. `Object.assign(t, o)` copies o's own
              // enumerable keys, so a key holding undefined overwrites t's
              // value where an absent key leaves it alone; `Object.assign(o,
              // x)` reads none of o's keys and tells the two apart no better
              // than JSON.stringify does.
              for (const arg of node.arguments.slice(1)) {
                see(symAt(ts, checker, arg), 'Object.assign', node, sf);
              }
            } else if (ARG0_OBSERVERS.get(ns)?.has(m) === true && node.arguments[0]) {
              see(symAt(ts, checker, node.arguments[0]), `${ns}.${m}`, node, sf);
            }
          }
        }
        for (const decl of targetsOf(ts, checker, node.expression)) {
          const target = bodies.has(decl) ? decl : undefined;
          if (!target || !isFunctionLike(ts, target)) continue;
          links.push({ call: node, decl: target });
          target.parameters.forEach((p, i) => {
            const arg = node.arguments[i];
            if (arg && ts.isIdentifier(p.name)) {
              edge(checker.getSymbolAtLocation(p.name), symAt(ts, checker, arg));
            }
          });
        }
      } else if (ts.isReturnStatement(node) && node.expression) {
        let fn: TS.Node | undefined = node.parent;
        while (fn && !isFunctionLike(ts, fn)) fn = fn.parent;
        const sym = fn && symAt(ts, checker, node.expression);
        if (fn && sym) (returnsOf.get(fn) ?? returnsOf.set(fn, new Set()).get(fn)!).add(sym);
      }
      ts.forEachChild(node, visit);
    };
    visit(body.node);
  }

  // A returned alias flows into whatever holds the call's value.
  for (const { call, decl } of links) {
    const returned = returnsOf.get(decl);
    if (!returned) continue;
    const p = call.parent;
    const holder =
      p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)
        ? checker.getSymbolAtLocation(p.name)
        : p && ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.EqualsToken
        ? symAt(ts, checker, p.left)
        : undefined;
    for (const r of returned) edge(holder, r);
  }

  const uses = { edges, observed };
  usesCache.set(mark, uses);
  return uses;
}

// The first observer reachable from the deleted object, or undefined when the
// walk finds none — in which case the rewrite stands, with its precondition.
function distinguisher(
  ts: Ts,
  checker: TS.TypeChecker,
  mark: Mark,
  target: TS.Expression
): Observed | undefined {
  const seed = symAt(ts, checker, target);
  if (!seed) return undefined;
  const { edges, observed } = objectUses(ts, checker, mark);
  const queue = [seed];
  const seen = new Set(queue);
  for (let i = 0; i < queue.length; i++) {
    const hit = observed.get(queue[i]!);
    if (hit) return hit;
    for (const next of edges.get(queue[i]!) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return undefined;
}

// delete is the one operation that moves an object to dictionary mode and does
// not move back.
//
const detect: Rule = (ts, checker, body, add, mark) => {
  // Deleting an array ELEMENT does not put the array in dictionary mode. It
  // makes the elements backing store holey — PACKED_DOUBLE to HOLEY_DOUBLE, a
  // different representation in a different part of V8, and a cost nobody
  // measured here. The printed fix made it worse: assigning undefined turns
  // PACKED_DOUBLE_ELEMENTS into PACKED_ELEMENTS, which is the boxing
  // bench/arrays.jl priced at 1.39-1.66x and over which `boxed-elements` was
  // withdrawn — and on `number[]` it does not even typecheck (BUGS TC-36).
  // The rule fires where its benchmark measured: a property on something that
  // is not an array.
  // Array-LIKE, and the receiver UNWRAPPED. es-toolkit's compat layer writes
  // `delete (array as any)[i]` over an `ArrayLike<T>`, in functions whose
  // neighbours call `Array.prototype.splice` on the same value and whose comment
  // reads "For handling sparse arrays". The cast made the type `any`, `isArray`
  // wants a real Array or Tuple, and the rule fired on an array delete and told
  // the author to box it — assigning undefined turns PACKED_DOUBLE_ELEMENTS
  // into PACKED_ELEMENTS, the 1.39-1.66x boxing `boxed-elements` was withdrawn
  // over (TC-36). A cast is a claim about the type checker, not about the
  // object: the lesson megamorphic-elements learned in TC-8 (BUGS TC-121).
  //
  // Array-like and not merely numeric-indexed: `Record<PropertyKey, unknown>`
  // carries a numeric index signature and is an ordinary object with a real map.
  // A number-typed `length` beside the index signature is what separates
  // typebox's `delete value[key]`, which stays a finding, from `ArrayLike<T>`,
  // which does not.
  const arrayLike = (t: TS.Type): boolean => {
    if (!checker.getIndexTypeOfType(t, ts.IndexKind.Number)) return false;
    const len = checker.getPropertyOfType(t, 'length');
    const decl = len?.valueDeclaration ?? len?.declarations?.[0];
    if (!len || !decl) return false;
    return (checker.getTypeOfSymbolAtLocation(len, decl).flags & ts.TypeFlags.NumberLike) !== 0;
  };
  const onArray = (node: TS.Expression): boolean => {
    if (!ts.isElementAccessExpression(node) && !ts.isPropertyAccessExpression(node)) return false;
    const t = checker.getTypeAtLocation(unwrap(ts, node.expression));
    return isArray(checker, t) || arrayLike(t);
  };

  // `delete process.env.X` deletes nothing V8 owns. Node implements
  // `process.env` with a named-property interceptor: the get, set and delete
  // are C++ callbacks reaching `getenv` and `unsetenv`, and the object has no
  // hidden class to demote. Same for `globalThis`, a DOM node, and anything
  // behind a Proxy — a JS-level delete does not transition a JS map on any of
  // them. This is not TC-9's "the number is the wrong size": the mechanism the
  // finding names does not exist at the site (BUGS TC-63).
  //
  // The test is the type's own declaration file, which is the same
  // platform-versus-application question `closed-world` asks in scan.ts.
  //
  // Three arms, because the type test alone answers false in two cases it must
  // not. `delete globalThis.gz` fired even with `@types/node` installed —
  // TypeScript synthesises `globalThis` from the global scope and no
  // declaration says "this is the host". And with no `node_modules`, `process`
  // resolves to NOTHING at all, so the type has no declarations and the rule
  // claimed a hidden class for an object it cannot even name (BUGS TC-97). An
  // identifier this tool cannot bind is not a JS object it can price.
  //
  // That third arm stays HERE and does not move into scan.ts's `intoHost`,
  // which `closed-world` reads: that rule asks whether there is a body a reader
  // could go and look at, and an unresolvable callee in somebody's package
  // still is one.
  const onHostObject = (node: TS.Expression): boolean => {
    if (!ts.isElementAccessExpression(node) && !ts.isPropertyAccessExpression(node)) return false;
    let base: TS.Expression = unwrap(ts, node.expression);
    while (ts.isPropertyAccessExpression(base) || ts.isElementAccessExpression(base)) {
      base = unwrap(ts, base.expression);
    }
    if (ts.isIdentifier(base)) {
      if (base.text === 'globalThis') return true;
      if ((symbolOf(ts, checker, base)?.getDeclarations() ?? []).length === 0) return true;
    }
    const sym = checker.getTypeAtLocation(unwrap(ts, node.expression)).getSymbol();
    return (sym?.declarations ?? []).some((d) => {
      const file = d.getSourceFile()?.fileName ?? '';
      // `@types/node` and the DOM, and NOT the language libs. `Record`,
      // `Object` and `Array` are declared in lib.es5.d.ts and describe ordinary
      // JS objects with real maps; testing for any lib.*.d.ts silenced
      // `delete o[k]` on a `Record<string, number>`, which is the case the
      // benchmark measured.
      return file.includes('/@types/node/') || file.includes('lib.dom.');
    });
  };

  // `Object.create(null)` returns an object that is ALREADY in dictionary mode.
  // V8 builds it from `slow_object_with_null_prototype_map` in `factory.cc`, and
  // `%HasFastProperties(Object.create(null))` is false the instant it exists. A
  // `delete` cannot demote what was never promoted, so bench/delete.jl's
  // per-property-load cost prices a transition that does not happen at this
  // site — the same shape of defect as `process.env` above, and it arrives
  // through the initializer rather than through the type, because TypeScript
  // records no prototype (BUGS TC-105).
  //
  // The initializer and not the type: `Object.create` is declared to return
  // `any`, so nothing about the checker's answer separates the null-prototype
  // object from a plain one. What the rule reads is where the receiver was
  // built — a `const`/`let` initializer or a class field's, which is every
  // shape mathjs `lruQueue` uses.
  const madeWithNullPrototype = (e: TS.Expression): boolean => {
    const call = unwrap(ts, e);
    if (!ts.isCallExpression(call) || !ts.isPropertyAccessExpression(call.expression)) return false;
    const owner = unwrap(ts, call.expression.expression);
    return (
      call.expression.name.text === 'create' &&
      ts.isIdentifier(owner) &&
      owner.text === 'Object' &&
      call.arguments.length === 1 &&
      call.arguments[0]!.kind === ts.SyntaxKind.NullKeyword
    );
  };
  const onNullPrototype = (node: TS.Expression): boolean => {
    if (!ts.isElementAccessExpression(node) && !ts.isPropertyAccessExpression(node)) return false;
    const sym = symAt(ts, checker, node.expression);
    return (sym?.declarations ?? []).some(
      (d) =>
        (ts.isVariableDeclaration(d) || ts.isPropertyDeclaration(d)) &&
        d.initializer !== undefined &&
        madeWithNullPrototype(d.initializer)
    );
  };

  walk(ts, body.node, (node) => {
    if (
      ts.isDeleteExpression(node) &&
      !onArray(node.expression) &&
      !onHostObject(node.expression) &&
      !onNullPrototype(node.expression)
    ) {
      // The rewrite half of the fix is conditional on the program, and the
      // tree is checked rather than caveated (BUGS TC-79): where the deleted
      // object reaches one of the observers above anywhere in the annotated
      // tree, a key holding undefined is not an absent key and the
      // rewrite is dropped. Where it reaches none, the rewrite stands and
      // states its precondition — the tree is not the whole program, and the
      // object may still escape to a reader the walk cannot see.
      const object = (ts.isPropertyAccessExpression(node.expression) ||
        ts.isElementAccessExpression(node.expression))
        ? node.expression.expression
        : node.expression;
      const seen = distinguisher(ts, checker, mark, object);
      // The two key counts come from the rows es-toolkit omit was swept at, not
      // from this string: they were the last user-facing integers in this rule
      // typed by hand, and the test asserted the sentence still said 12 and 48
      // rather than that the data still did (the re-aimed BUGS TC-48).
      const rebuildSafety =
        'Rebuilding changes object identity; preserve aliases, prototypes and property ' +
        'semantics. Benchmark construction and reads together: the rebuild can cost more ' +
        'than it saves';
      const rebuildCost =
        `the own-property rebuild improves reads at ${N['ex.omit.sizes']}, but the whole ` +
        `call is slower (${N['ex.omit.whole']}, before/after time)`;
      add({
        ...at(body.sf, node),
        rule: NAME,
        message:
          `delete ${node.expression.getText(body.sf)} can move an ordinary object ` +
          'into dictionary mode',
        fix: seen
          ? 'build the object without the key'
          : 'assign undefined where the key may stay present, or build the object without the key',
        note: seen
          ? `${seen.op} observes this object and tells an ` +
            `absent key from one holding undefined, so assigning undefined is not a rewrite ` +
            `here. ${rebuildSafety}`
          : 'assigning undefined is equivalent only while nothing downstream tells an absent ' +
            'key from one holding undefined: spread and Object.assign copy it; `in`, for-in, ' +
            'hasOwnProperty, Object.keys, Object.values, Object.entries, ' +
            'Object.getOwnPropertyNames and Reflect.ownKeys see it; JSON.stringify does not, ' +
            `it omits both. ${rebuildSafety}`,
        background: rebuildCost,
        related: seen ? [{ ...seen, name: `${seen.op} observes key presence` }] : undefined,
      });
    }
  });
};

export const deleteProperty: RuleModule = {
  name: NAME,
  evidence,
  scope: 'body',
  detect,
};
