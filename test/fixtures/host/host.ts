// The host, reached the three ways the callee's own declaration cannot see.
// `globalThis` is augmented from own source, so the callee resolves to a
// declaration this program wrote; `(0, eval)` resolves to a binary expression
// with no symbol at all. Neither is a body a reader can go and look at, and
// neither has a map to demote — the class TC-63 took out of `delete-property`
// (BUGS TC-110).
declare global {
  // eslint-disable-next-line no-var
  var hostHook: (n: number) => number;
}
declare function opaque(n: number): number;

/** @jitmax */
export function under(n: number): number {
  let t = 0;
  t += globalThis.hostHook(n);
  t += (0, eval)('1') as number;
  t += process.hrtime.bigint() > 0n ? 1 : 0;
  t += opaque(n);
  return t;
}
