import type * as TS from 'typescript';
import { at } from '../scan.ts';
import { N } from '../numbers.ts';
import { cells, isArray, walk, type Evidence, type Rule } from './shared.ts';

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
  severity: 'error',
  defects: ['TC-9'],
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
const detect: Rule = (ts, checker, body, add) => {
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
  const onHostObject = (node: TS.Expression): boolean => {
    if (!ts.isElementAccessExpression(node) && !ts.isPropertyAccessExpression(node)) return false;
    const sym = checker.getTypeAtLocation(node.expression).getSymbol();
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

  walk(ts, body.node, (node) => {
    if (
      ts.isDeleteExpression(node) &&
      !onArray(node.expression) &&
      !onHostObject(node.expression)
    ) {
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

export const deleteProperty = {
  name: 'delete-property',
  evidence,
  detect,
};
