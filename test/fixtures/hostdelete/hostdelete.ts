// The ways a `delete` reaches something with no hidden class to demote, and the
// two ways it reaches something with one. `globalThis` has no declaration that
// says "this is the host" — TypeScript synthesises its symbol from the global
// scope — and an identifier that binds to nothing at all is not a JS object
// this tool can price (BUGS TC-97, TC-121).
declare global {
  // eslint-disable-next-line no-var
  var hostSlot: number | undefined;
}
declare const el: HTMLElement;

/** @jitmax */
export function hosts(): void {
  delete globalThis.hostSlot;
  delete el.dataset.tag;
  delete process.env.TOKEN;
}

/** @jitmax */
export function objects(
  o: Record<string, number>,
  k: string,
  xs: number[],
  i: number,
  al: ArrayLike<number>,
  j: number
): void {
  delete o[k];
  delete (xs as any)[i];
  delete (al as any)[j];
}
