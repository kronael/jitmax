import type * as TS from 'typescript';
import { at } from '../scan.ts';
import { N } from '../numbers.ts';
import {
  isArray,
  reassignedInLoop,
  walk,
  walkLoops,
  type Evidence,
  type Rule,
  type RuleModule,
} from './shared.ts';

// The rule's name, once. It was a terminal string in the finding and a second
// terminal string in the exported rule below, and the pair that drifted was in
// interface-dispatch.ts, which reports a rule that is not its own.
const NAME = 'accumulating-spread';

const evidence: Evidence = {
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
  defects: [],
};

// An accumulator is rebuilt as an array or as an object, and the fix for one is
// not the fix for the other.
type Form = 'array' | 'object';

// Rebuilding an array or an object from a copy of itself copies every element
// it already holds, so a loop that does it n times does quadratic work. Written
// as a spread or as a call, the mechanism is the same. This is the only
// rule here whose cost is a complexity class rather than a constant factor,
// which is why it is the largest effect in the project.
const detect: Rule = (ts, checker, body, add) => {
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
  const FIX: Record<Form, { fix: string; note: string }> = {
    array: {
      fix: 'push onto NAME instead of rebuilding it',
      note: `the finished array reads the same either way, ${N['spread.array.reads']}`,
    },
    // Not an instruction. Assigning the key on NAME is faster to BUILD and
    // slower to READ, both measured, and jitmax reports the mutating form
    // as clean — so a reader who takes the instruction and re-runs the tool
    // gets a green run on an 8x read regression (BUGS TC-38). The exit code
    // cannot say that, so the text does.
    object: {
      fix:
        'there is no rewrite here this project has measured as a win on both halves: ' +
        'mutate where the result is written more than it is read; keep the copy where it ' +
        'is read hot',
      note:
        `assigning the key on NAME instead builds faster, ${N['spread.object']} at n=500, ` +
        'and fills the result key by key, which normalizes the object: the SPREAD-built ' +
        `object reads ${N['ex.mergeall.reads']} of what the filled one costs (remeda ` +
        'mergeAll), so the copy you are being asked to delete is the cheaper one to read ' +
        'back. No rule here detects a dictionary-mode object, so the mutating form checks ' +
        'CLEAN',
    },
  };

  const report = (node: TS.Node, name: string, form: Form): void =>
    add({
      ...at(body.sf, node),
      rule: NAME,
      message: `${name} is rebuilt from a copy of itself; every pass copies everything it already holds`,
      fix: FIX[form].fix.replaceAll('NAME', name),
      note: FIX[form].note.replaceAll('NAME', name),
    });

  // The accumulator of a reduce is spread by the callback, so the loop that
  // re-runs it is inside reduce rather than in the annotated function.
  const reduceCallback = (node: TS.Node): void => {
    if (!ts.isCallExpression(node)) return;
    if (!ts.isPropertyAccessExpression(node.expression)) return;
    if (node.expression.name.text !== 'reduce' && node.expression.name.text !== 'reduceRight') {
      return;
    }
    // The RECEIVER has to be an array, for the reason the shared iteration set
    // says: a Result type's `reduce` runs its callback at most once, and a copy
    // no loop re-runs is this rule's own silent clause. TC-90 put this check on
    // the shared path and never reached this second copy of it, and the fixture
    // only exercised `map`.
    if (!isArray(checker, checker.getTypeAtLocation(node.expression.expression))) return;
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

  walkLoops(ts, checker, body.node, (node, inLoop) => {
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

export const accumulatingSpread: RuleModule = {
  name: NAME,
  evidence,
  scope: 'body',
  detect,
};
