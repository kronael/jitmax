// A callee whose body nobody here can read: `typescript` ships a `.d.ts`, so
// the signature is available and not one line of the body. `closed-world`
// fires, no other rule does, and the rule carries no benchmark of this program
// — so the finding is a warning, the run exits 0, and a CI gate stops failing
// on a claim this project cannot support (BUGS TC-52).
//
// Not a Node builtin on purpose. `path.join` is counted and never listed,
// because its body is native and no reader can go and look at it (BUGS TC-55).
import type * as TS from 'typescript';
import ts from 'typescript';

/** @jitmax */
export function firstStatement(sf: TS.SourceFile): boolean {
  return ts.isExpressionStatement(sf.statements[0]!);
}
