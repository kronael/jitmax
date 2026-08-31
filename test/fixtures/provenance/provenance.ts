// `elementFlow` binds a read to a collection by PROVENANCE. Every function here
// is one form of "this value came out of that array" written a way the walk
// once could not follow, and every one has a sibling where the SAME form must
// not reach the collection asked about (BUGS TC-127).
interface A { kind: string; a: number }
interface B { kind: string; b: number }
interface C { kind: string; c: number }
interface D { kind: string; d: number }
interface E { kind: string; e: number }
type Five = A | B | C | D | E;

// `.at()` returns an element of the receiver.
/** @jitmax */
export function atElement(atRows: Five[]): number {
  const r = atRows.at(0)!;
  return r.kind.length;
}

/** @jitmax */
export function atOther(atSpare: Five[], atUsed: Five[]): number {
  const r = atUsed.at(0)!;
  return r.kind.length + atSpare.length;
}

// `.pop()` and `.shift()` return one too, off the same table.
/** @jitmax */
export function popElement(popRows: Five[]): number {
  const last = popRows.pop()!;
  const first = popRows.shift()!;
  return last.kind.length + first.kind.length;
}

/** @jitmax */
export function popOther(popSpare: Five[], popUsed: Five[]): number {
  const last = popUsed.pop()!;
  return last.kind.length + popSpare.length;
}

// `.find()` returns `T | undefined`, so the read is behind a `!`. The `!` is
// erased before V8 sees anything; the value still came out of the receiver.
/** @jitmax */
export function findElement(findRows: Five[]): number {
  const hit = findRows.find(() => true)!;
  return hit.kind.length;
}

/** @jitmax */
export function findOther(findSpare: Five[], findUsed: Five[]): number {
  const hit = findUsed.find(() => true)!;
  return hit.kind.length + findSpare.length;
}

// The same value behind a GUARD instead of a `!`. Narrowing removes
// `undefined` from the type and moves nothing about where the value came from.
/** @jitmax */
export function findGuarded(guardRows: Five[]): number {
  const hit = guardRows.find(() => true);
  if (hit === undefined) return 0;
  return hit.kind.length;
}

// An array destructuring binds an element, the edge `for...of` already draws.
/** @jitmax */
export function destructured(destRows: Five[]): number {
  const [head] = destRows;
  return head.kind.length;
}

/** @jitmax */
export function destructuredOther(destSpare: Five[], destUsed: Five[]): number {
  const [head] = destUsed;
  return head.kind.length + destSpare.length;
}

// The callback named at the call rather than written there.
/** @jitmax */
export function byName(nameRows: Five[]): number {
  let n = 0;
  function each(r: Five): void {
    n += r.kind.length;
  }
  nameRows.forEach(each);
  return n;
}

/** @jitmax */
export function byNameOther(nameSpare: Five[], nameUsed: Five[]): number {
  let n = 0;
  function each(r: Five): void {
    n += r.kind.length;
  }
  nameUsed.forEach(each);
  return n + nameSpare.length;
}

// The callback named through a `const`, which `targetsOf` follows to the arrow
// it holds.
/** @jitmax */
export function byNameArrow(arrowRows: Five[]): number {
  let n = 0;
  const each = (r: Five): void => {
    n += r.kind.length;
  };
  arrowRows.forEach(each);
  return n;
}

// A reassigned local holds BOTH collections at the load site, and both pay.
/** @jitmax */
export function reassigned(letRows: Five[], letOther: Five[], flag: boolean): number {
  let g = letRows;
  if (flag) g = letOther;
  let n = 0;
  for (const r of g) n += r.kind.length;
  return n;
}

// The same local, with a MONOMORPHIC other branch and a third array that is
// never written into it: `letA` has one property set and is under the budget,
// `letSpare` never reaches `g` at all.
/** @jitmax */
export function reassignedMono(letSpare: Five[], letFive: Five[], letA: A[], flag: boolean): number {
  let g: Five[] = letFive;
  if (flag) g = letA;
  let n = 0;
  for (const r of g) n += r.kind.length;
  return n + letSpare.length;
}
