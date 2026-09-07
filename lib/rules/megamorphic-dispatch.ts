import type * as TS from 'typescript';
import { at, unwrap, type Call } from '../scan.ts';
import { N } from '../numbers.ts';
import {
  arrayValues,
  cells,
  megamorphicCandidate,
  MAX_CACHED_MAPS,
  objectShapes,
  walk,
  type Add,
  type Evidence,
  type Rule,
  type RuleModule,
} from './shared.ts';

// The rule's name, once. It was a terminal string in the finding and a second
// terminal string in the exported rule below, and the pair that drifted was in
// interface-dispatch.ts, which reports a rule that is not its own.
const NAME = 'megamorphic-dispatch';

const evidence: Evidence = {
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
    `bench/dispatch.jl, ${cells(N['disp.cells'])}, 20 pairs each, every cell measured ` +
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
  // TC-33 on this rule's own words, and it is why this rule warned until
  // 2026-08-31: `source` above says every family in bench/dispatch.jl varies key
  // order, the call target or where the function is held, all over ONE property
  // set, that this rule counts property SETS and is therefore silent on all
  // four, and that "no sweep here varies the key set at a CALL site yet". It
  // fails a build now like every other rule, and TC-33 printed under each of its
  // findings is where a reader is told the sweep did not run this program.
  defects: ['TC-13', 'TC-33'],
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
const detect: Rule = (ts, checker, body, add) => {
  // A method called on the elements of an array parameter is one union reaching
  // one site, and `megamorphic-elements` already reports that parameter.
  // Reporting both bills one defect twice — the mistake chained-allocation's
  // `consumed` check exists to avoid. The shipped rule keeps the finding.
  const claimed = new Set<TS.Type>();
  for (const { element } of arrayValues(ts, checker, body)) {
    if (objectShapes(ts, checker, element) > MAX_CACHED_MAPS) claimed.add(element);
  }

  walk(ts, body.node, (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const recv = unwrap(ts, node.expression.expression);
      const t = checker.getTypeAtLocation(recv);
      const shapes = objectShapes(ts, checker, t);
      if (shapes > MAX_CACHED_MAPS && !claimed.has(t)) {
        add({
          ...at(body.sf, node),
          rule: NAME,
          // Counted the same way as megamorphic-elements, and for the same
          // reason: five names for one property set are one map (TC-42).
          message:
            `${recv.getText(body.sf)} has ${shapes} distinct property sets in its ` +
            `declared type and .${node.expression.name.text}() is called on it; ` +
            megamorphicCandidate('call'),
          fix:
            'inspect the receiver builders and profile this call. If a runtime guard ' +
            'can separate receiver kinds, test dedicated call sites; benchmark the ' +
            'full caller before keeping the change',
          note:
            'type assertions do not change runtime shapes. Splitting a call site can ' +
            'add branches and code size; a speedup is not established for this caller',
        });
      }
    }
  });
};

// The third detector reporting this rule, and the one both escape rules share.
// `interface-dispatch` and `closed-world` split every escape between them, and
// each has to ask this question first: five or more implementations reaching one
// receiver is V8's four-map budget exceeded at that call, which is THIS rule's
// claim carrying THIS rule's benchmark — the same site, whether or not the walk
// could read the callee's body. It was written out inside interface-dispatch.ts
// alone, so the other half reported a fourteen-implementation receiver in the
// same words as a receiver nothing reaches (BUGS TC-110).
//
// A DECLARED receiver, so `d.typed` has to hold. The walk is path-insensitive
// and counts what reaches the value; only a declared type checks that against
// what reaches this call, and es-toolkit's `isPlainObject(object?: any)` counted
// 42 shapes at an `object.toString()` a `typeof` guard three lines up admits one
// kind of value to. The count is still printed by the escape rule, and not acted
// on (BUGS TC-111).
//
// A RECEIVER, so `d.method` has to be there. `f()` where five functions reach
// `f` is call-target feedback, not a map at a load site, and bench/dispatch.jl
// varies the target only over one property set — this rule would be pricing a
// mechanism its sweep never isolated. The escape rules keep those in their own
// words, with their own count printed.
//
// Returns whether it reported, so the caller stops rather than saying it twice.
export function megamorphicCall(c: Call, add: Add): boolean {
  const d = c.dispatch;
  if (d.method === '' || d.count <= MAX_CACHED_MAPS || !d.typed) return false;
  const listed = d.names.slice(0, 5).join(', ');
  add({
    file: c.file,
    line: c.line,
    column: c.column,
    rule: NAME,
    message:
      `${d.recv} reaches this call as at least ${d.count} implementations built by ` +
      `this program (${listed}${d.count > 5 ? ', …' : ''}) and .${d.method}() is ` +
      `called on it; ${megamorphicCandidate('call')}`,
    fix:
      'inspect the named implementations and profile this call. If a runtime guard ' +
      'can separate receiver kinds, test dedicated call sites; benchmark the full caller',
    note:
      'the count is a static lower bound on implementations, not proof they all run ' +
      'in this workload. Type assertions do not specialize a call. Library callers ' +
      'may need an upstream change; splitting sites can add branches and code size',
  });
  return true;
}

export const megamorphicDispatch: RuleModule = {
  name: NAME,
  evidence,
  scope: 'body',
  detect,
};
