// es-toolkit's `isEqualWith` narrows on a tag string instead of on a type, so
// `a` and `b` stay `any` and `a.entries()` resolves to no declaration at all —
// not to lib.es2015's Map. The tool then knew nothing about the callee and said
// it knew one thing: that nobody can read its body (BUGS TC-129).
declare function opaque(n: number): number;

/** @jitmax */
export function equalTagged(a: any, b: any): boolean {
  if (Object.prototype.toString.call(a) !== '[object Map]') return opaque(1) > 0;
  for (const [k, v] of a.entries()) {
    if (!b.has(k)) return false;
    if (v !== b.get(k)) return false;
  }
  return true;
}
