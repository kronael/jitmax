import type * as TS from 'typescript';
import { at, isFunctionLike, unwrap } from '../scan.ts';
import { N } from '../numbers.ts';
import {
  cells,
  elementType,
  isLoop,
  members,
  reassignedInLoop,
  walkLoops,
  type Evidence,
  type Rule,
  type RuleModule,
} from './shared.ts';

// The rule's name, once. It was a terminal string in the finding and a second
// terminal string in the exported rule below, and the pair that drifted was in
// interface-dispatch.ts, which reports a rule that is not its own.
const NAME = 'allocating-select';

const evidence: Evidence = {
  cost:
    `${N['select.heap']} when the chosen value is stored somewhere that outlives the loop ` +
    `(CI ${N['select.heap.ci10k']} at n=10000, ${N['select.heap.ci100k']} at n=100000)`,
  source: `bench/select.jl, ${cells(N['select.cells'])}, 20 pairs each`,
  silent:
    'on numbers the rule stays out, and the two sizes say so differently. At n=10000 ' +
    `the same loop costs ${N['select.silent.number']}, interval ` +
    `${N['select.silent.number.ci']} — a lower bound under the broad-warning bar, so ` +
    'there is an effect and it is not one this rule may warn about. At n=100000 there ' +
    `is no measurement to warn from: three sweeps read ` +
    `${N['select.silent.number.withdrawn']} and rule 13 withdraws the cell. Math.min ` +
    'allocates nothing and what is left is the loop, not the rule. This clause claimed ' +
    '"no effect at all, both intervals spanning 1" until the cells were run three times ' +
    'each (BUGS TC-23), and rested on eighteen rows stamped with one frozen reading of ' +
    'the machine until they were re-measured with a reading per row (TC-134). The rule ' +
    'stays out through all three tellings, on a smaller margin each time',
  unreported:
    'escape analysis does not rescue the boxed form: kept in a local, where the compiler ' +
    `can see it, the same loop still costs ${N['select.silent.local']} — below the cell ` +
    'this rule fires on, and well above nothing. This clause said "the rule stays out of ' +
    'it", and the rule does not: nothing in it asks where the target lives, so a purely ' +
    `local accumulator is reported with the ${N['select.heap']} measured for a value that ` +
    'escapes. The cost is real either way and the printed figure is the wrong one of the ' +
    'two (BUGS TC-44)',
  defects: ['TC-44'],
};

// Choosing between two boxed values with a call that returns a new one
// allocates on every pass, including every pass that chooses the value the
// target already held — which, for anything ordered, is nearly all of them. The
// predicate form compares and stores only on a real change.
//
// The target has to appear among the arguments. That is what makes the call a
// choice rather than arithmetic: `x = x.plus(1)` also allocates, but the value
// genuinely changed, and an immutable type has no cheaper way to say so.
const detect: Rule = (ts, checker, body, add) => {
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
  // that what it RETURNS is something it builds. Where there is no body the
  // rule stays out: an unreadable callee is `closed-world`'s finding, not
  // this one's.
  const bodyOf = (call: TS.CallExpression): TS.Node | undefined => {
    const decl = checker.getResolvedSignature(call)?.declaration;
    return decl && 'body' in decl ? (decl as { body?: TS.Node }).body : undefined;
  };

  // Two limits on where the allocation may sit, both of them cases the rule
  // fired on: it must reach a `return`, because a scratch array the callee
  // keeps to itself is not the value the loop stores; and the walk stops at a
  // nested function, because an object literal inside a callback the callee
  // never invokes is not an allocation this call makes.
  //
  // "Reach" and not "sit inside": the search read the return statement's own
  // text, and real code does not write `return new Vector3(…)`. Babylon.js's
  // `Vector3.Minimize` writes `const min = new Vector3(); …; return min`, and
  // its `clone()` puts the `new` one body further on — so the rule fired at 0
  // of 2,953 annotated functions in 22 codebases while the loops it was
  // written for were there (BUGS TC-148). A returned local is followed to
  // every value this body writes to it, and a returned call into the body it
  // resolves to, HOPS bodies deep. A parameter or an outer binding is not
  // followed: `return a` is a candidate, and a module-level constant is built
  // once, not per pass.
  const within = (n: TS.Node, root: TS.Node): boolean => {
    for (let p: TS.Node | undefined = n; p; p = p.parent) if (p === root) return true;
    return false;
  };
  const HOPS = 3;
  const builds = (call: TS.CallExpression): TS.Node | undefined => {
    const seen = new Set<TS.Node>();
    const writes = (fnBody: TS.Node, id: TS.Identifier): TS.Expression[] => {
      const sym = checker.getSymbolAtLocation(id);
      const decl = sym?.valueDeclaration;
      if (!decl || !ts.isVariableDeclaration(decl) || !within(decl, fnBody)) return [];
      if (seen.has(decl)) return [];
      seen.add(decl);
      const out: TS.Expression[] = [];
      if (decl.initializer) out.push(decl.initializer);
      const visit = (n: TS.Node): void => {
        if (n !== fnBody && isFunctionLike(ts, n)) return;
        if (
          ts.isBinaryExpression(n) &&
          n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isIdentifier(n.left) &&
          checker.getSymbolAtLocation(n.left) === sym
        ) {
          out.push(n.right);
        }
        ts.forEachChild(n, visit);
      };
      visit(fnBody);
      return out;
    };
    const returned = (fnBody: TS.Node, hops: number): TS.Node | undefined => {
      let found: TS.Node | undefined;
      const visit = (n: TS.Node, returning: boolean): void => {
        if (found) return;
        if (n !== fnBody && isFunctionLike(ts, n)) return;
        const inReturn = returning || ts.isReturnStatement(n);
        if (inReturn) {
          if (
            ts.isNewExpression(n) ||
            ts.isObjectLiteralExpression(n) ||
            ts.isArrayLiteralExpression(n)
          ) {
            found = n;
            return;
          }
          if (ts.isIdentifier(n)) for (const v of writes(fnBody, n)) visit(v, true);
          if (ts.isCallExpression(n) && hops > 1) {
            const next = bodyOf(n);
            if (next && !seen.has(next)) {
              seen.add(next);
              found = returned(next, hops - 1);
            }
          }
        }
        ts.forEachChild(n, (c) => visit(c, inReturn));
      };
      // A concise arrow body IS the returned expression — there is no
      // ReturnStatement to find, so `(a, b) => (a.lt(b) ? a : new Money(b.v))`
      // allocated on every pass and this rule stayed silent on it.
      visit(fnBody, !ts.isBlock(fnBody));
      return found;
    };
    const fnBody = bodyOf(call);
    if (!fnBody) return undefined;
    seen.add(fnBody);
    return returned(fnBody, HOPS);
  };

  // The benchmark measured a CHOICE between two values of ONE type:
  // `b.lo = Box.min(b.lo, items[i])`, where the result is one of the candidates
  // and the incumbent wins nearly every pass. Skipping the store on those passes
  // is the whole of what "compare first" saves.
  //
  // Nothing in this rule asked for the choice, and the 22-codebase survey fired
  // at 29 sites without hitting one. Every one advances or wraps the value —
  // `scope = createChildScope(scope)`, `value = b.call('$.proxy', value)`,
  // `spread = getSpreadType(spread, other, sym, flags, ro)`. There the value
  // changes on every pass, a compare skips no store, and the printed fix is not
  // a rewrite: it changes what the program computes (BUGS TC-18).
  //
  // The test is that the call takes nothing but candidates, and hands one back.
  // `Box.min(a, b)`, `Decimal.min(a, b)` and `clamp(x, lo, hi)` pass;
  // `b.call(name, node)` and `getSpreadType(left, right, symbol, flags, ro)` do
  // not. It is necessary and not sufficient — `union(a, b)` over two Sets is a
  // merge and still reports — but it moves the rule strictly quieter, which is
  // the only safe direction for a rule that fails a build.
  const anyish = ts.TypeFlags.Any | ts.TypeFlags.Unknown;
  const selectsAmongPeers = (target: TS.Expression, call: TS.CallExpression): boolean => {
    if (call.arguments.length < 2) return false;
    const held = checker.getTypeAtLocation(target);
    // No declared type is no evidence of a choice, and `any` matches every
    // argument there is. Sixteen of the survey's 29 sites are JSDoc-typed .js
    // whose annotations resolve to `any`, which is where a vacuous test does
    // the most damage.
    if (held.flags & anyish) return false;
    const name = (t: TS.Type): string =>
      checker.typeToString(t, undefined, ts.TypeFormatFlags.NoTruncation);
    const heldName = name(held);
    const candidate = (t: TS.Type): boolean =>
      t === held || (!(t.flags & anyish) && name(t) === heldName);
    const sig = checker.getResolvedSignature(call);
    // The result has to be another candidate, or the loop carries no single
    // value forward and there is nothing for a compare to test.
    if (!sig || !candidate(checker.getReturnTypeOfSignature(sig))) return false;
    return call.arguments.every((a) => candidate(checker.getTypeAtLocation(a)));
  };

  // The benchmark's loop CARRIES one value forward, and the incumbent wins
  // nearly every pass. A holder the pass itself builds carries nothing: the
  // TypeScript compiler writes `const context = createInferenceContext(…)` and
  // then `context.nonFixingMapper = combineTypeMappers(context.nonFixingMapper,
  // mapper)` in the same pass, which is a store into an object that did not
  // exist on the pass before, so there is no incumbent a compare could keep.
  // The target's root binding has to be declared outside the innermost loop,
  // or the callback an array method re-runs, that re-runs the store. A
  // parameter is outside by definition — `reduce`'s accumulator is one. A
  // `for (let acc = …; …)` initializer runs once, so only the statement it
  // re-runs counts as the pass; a `for (const p of …)` binding is per pass and
  // the whole statement does.
  const carried = (target: TS.Expression, assignment: TS.Node): boolean => {
    let root = unwrap(ts, target);
    while (ts.isPropertyAccessExpression(root) || ts.isElementAccessExpression(root)) {
      root = unwrap(ts, root.expression);
    }
    if (!ts.isIdentifier(root)) return true;
    const decl = checker.getSymbolAtLocation(root)?.valueDeclaration;
    if (!decl || !ts.isVariableDeclaration(decl)) return true;
    let pass: TS.Node | undefined = assignment.parent;
    while (pass && !isLoop(ts, pass) && !isFunctionLike(ts, pass)) pass = pass.parent;
    if (!pass) return true;
    return !within(decl, ts.isForStatement(pass) ? pass.statement : pass);
  };

  walkLoops(ts, checker, body.node, (node, inLoop) => {
    if (reassignedInLoop(ts, node, inLoop) && ts.isCallExpression(node.right)) {
      const target = node.left.getText(body.sf);
      const call = node.right;
      if (
        call.arguments.some((a) => a.getText(body.sf) === target) &&
        // A second, DIFFERENT argument, or there is nothing to choose between.
        call.arguments.some((a) => a.getText(body.sf) !== target) &&
        carried(node.left, node) &&
        allocates(call) &&
        selectsAmongPeers(node.left, call)
      ) {
        const allocation = builds(call);
        if (!allocation) return;
        add({
          ...at(body.sf, node),
          rule: NAME,
          message:
            `${target} is replaced by ${call.expression.getText(body.sf)}(...) in a loop; ` +
            'the callee returns an object it allocates',
          fix:
            `if this call only selects a candidate, compare first and assign ${target} ` +
            'only when the chosen value changes',
          note:
            'matching argument types do not prove selection or allocation on every path. ' +
            'Preserve ties, comparison edge cases, object identity and call side effects; ' +
            'keep the call if it merges, transforms or must return a fresh object',
          related: [{
            ...at(allocation.getSourceFile(), allocation),
            name: 'the allocation the callee returns',
          }],
        });
      }
    }
  });
};

export const allocatingSelect: RuleModule = {
  name: NAME,
  evidence,
  scope: 'body',
  detect,
};
