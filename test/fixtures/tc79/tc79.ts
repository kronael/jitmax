// JSON.stringify omits an absent key AND a key holding undefined, so it cannot
// tell them apart and must not withdraw the rewrite. Everything below it can:
// one function per observer, because a list with no test per entry is how the
// first four drifted (BUGS TC-79).
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

/** mathjs `lruQueue`: the eviction scan skips freed slots with hasOwnProperty,
 * and a slot holding undefined answers true. */
/** @jitmax */
export function scanned(): number {
  delete o.secret;
  let base = 0;
  while (!Object.prototype.hasOwnProperty.call(o, ++base)) {
    /* empty */
  }
  return base;
}

/** @jitmax */
export function askedDirectly(): boolean {
  delete o.secret;
  return o.hasOwnProperty('k');
}

/** @jitmax */
export function askedStatically(): boolean {
  delete o.secret;
  return Object.hasOwn(o, 'k');
}

/** @jitmax */
export function valued(): number[] {
  delete o.secret;
  return Object.values(o);
}

/** @jitmax */
export function paired(): Array<[string, number]> {
  delete o.secret;
  return Object.entries(o);
}

/** @jitmax */
export function named(): string[] {
  delete o.secret;
  return Object.getOwnPropertyNames(o);
}

/** @jitmax */
export function reflected(): Array<string | symbol> {
  delete o.secret;
  return Reflect.ownKeys(o);
}

/** @jitmax */
export function copiedFrom(): Record<string, number> {
  delete o.secret;
  return Object.assign({}, o);
}

/** The other side of Object.assign: as the TARGET it is written, not read, and
 * an absent key and a key holding undefined are the same to it. */
/** @jitmax */
export function copiedInto(): Record<string, number> {
  delete o.secret;
  return Object.assign(o, { k: 1 });
}
