import type * as TS from 'typescript';
import { at } from '../scan.ts';
import { N } from '../numbers.ts';
import {
  arrayValues,
  cells,
  MAX_CACHED_MAPS,
  objectShapes,
  receiver,
  walk,
  type Evidence,
  type Rule,
} from './shared.ts';

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
  // `warn`, on this rule's own words. The contract in shared.ts is `error` when
  // a benchmark measures the program the rule FIRES on; `source` above says
  // every family in bench/dispatch.jl varies key order, the call target or where
  // the function is held, all over ONE property set, that this rule counts
  // property SETS and is therefore silent on all four, and that "no sweep here
  // varies the key set at a CALL site yet". A rule that says that about itself
  // and then fails a build charges a cost its evidence does not carry — which
  // is what closed-world was made a warning for (BUGS TC-33).
  severity: 'warn',
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
      const recv = receiver(ts, node.expression.expression);
      const t = checker.getTypeAtLocation(recv);
      const shapes = objectShapes(ts, checker, t);
      if (shapes > MAX_CACHED_MAPS && !claimed.has(t)) {
        add({
          ...at(body.sf, node),
          rule: 'megamorphic-dispatch',
          // Counted the same way as megamorphic-elements, and for the same
          // reason: five names for one property set are one map (TC-42).
          message:
            `${recv.getText(body.sf)} reaches this call as ${shapes} distinct property ` +
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

export const megamorphicDispatch = {
  name: 'megamorphic-dispatch',
  evidence,
  detect,
};
