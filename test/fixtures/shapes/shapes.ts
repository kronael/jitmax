// Five distinct property SETS behind one receiver is five V8 maps at a load
// site that caches four. Every member carries `kind`, so the read below needs
// no narrowing and happens on the union itself.
interface A { kind: string; a: number }
interface B { kind: string; b: number }
interface C { kind: string; c: number }
interface D { kind: string; d: number }
interface E { kind: string; e: number }
type Five = A | B | C | D | E;

// A branded type is an INTERSECTION, and intersections were filtered out of the
// shape count entirely, so five branded types counted as no shapes at all.
type Brand<T, K extends string> = T & { readonly tag?: K };
type Branded =
  | Brand<{ kind: string; a: number }, 'a'>
  | Brand<{ kind: string; b: number }, 'b'>
  | Brand<{ kind: string; c: number }, 'c'>
  | Brand<{ kind: string; d: number }, 'd'>
  | Brand<{ kind: string; e: number }, 'e'>;

declare const as: A[];
declare const bs: B[];
declare const cs: C[];
declare const ds: D[];
declare const es: E[];

// The union array is built HERE, so it never arrives as a parameter.
/** @jitmax */
export function fromLocal(): number {
  const rows = [...as, ...bs, ...cs, ...ds, ...es];
  let n = 0;
  for (const r of rows) n += r.kind.length;
  return n;
}

/** @jitmax */
export function branded(rows: Branded[]): number {
  let n = 0;
  for (const r of rows) n += r.kind.length;
  return n;
}

// The load has to be off the ELEMENT. `fallback.a` is a monomorphic load off an
// unrelated parameter, and `rows.length` loads off the array, which has one
// shape whatever its elements are.
/** @jitmax */
export function otherReceiver(rows: Five[], fallback: A): number {
  return rows.length + fallback.a;
}

// The load has to be in the array's OWN function. `walk` recurses with
// `ts.forEachChild` and does not stop at a function boundary, so a write-only
// array in one nested function borrowed the read in a sibling that never sees
// it. Six of TypeScript's eight findings were this, under one annotation on a
// 50,000-line function (BUGS TC-119).
/** @jitmax */
export function nestedScopes(): number {
  function collect(): number {
    const acc: Five[] = [];
    for (const a of as) acc.push(a);
    return acc.length;
  }
  function sum(rows: Five[]): number {
    let n = 0;
    for (const r of rows) n += r.kind.length;
    return n;
  }
  return collect() + sum([...as, ...bs, ...cs, ...ds, ...es]);
}

// The load has to come OUT of this collection. `probe` is annotated with the
// whole union, so a type-identity test made `(probe as A).a` a read off every
// array in scope — and neither of these is read at all: `src` is iterated into
// `out`, `out` is pushed to and returned. Two errors, on the one function whose
// only load is off a third value (BUGS TC-101).
/** @jitmax */
export function collect(src: Five[], probe: Five): Five[] {
  const out: Five[] = [];
  for (const s of src) out.push(s);
  return (probe as A).a > 0 ? out : [];
}

// The same defect between two collections. `items` is iterated and read,
// `spare` is not, and the two share ONE element type — which is what the check
// compared. `items` is the finding; `spare` is silent (BUGS TC-94).
/** @jitmax */
export function sibling(spare: Five[], items: Five[]): number {
  let n = 0;
  for (const r of items) n += r.kind.length;
  return n + spare.length;
}
