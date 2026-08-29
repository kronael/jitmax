// JSON.stringify omits an absent key AND a key holding undefined, so it cannot
// tell them apart and must not withdraw the rewrite. The other three can.
declare const o: Record<string, number>;

/** @jitmax */
export function stringified(): string {
  delete o.secret;
  return JSON.stringify(o);
}

/** @jitmax */
export function enumerated(): string[] {
  delete o.secret;
  return Object.keys(o);
}
