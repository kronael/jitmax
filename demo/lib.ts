import * as tsapi from 'typescript';

type Row = { x: number; y: number };
type A = { a: number };
type B = { b: number };
type C = { c: number };
type D = { d: number };
type E = { e: number };

// Five aliases of one property set, and a five-member discriminated union over
// another: the two shapes `megamorphic-elements` used to report and V8 builds
// one map for.
type Row1 = { x: number; y: number };
type Row2 = { x: number; y: number };
type Row3 = { x: number; y: number };
type Row4 = { x: number; y: number };
type Row5 = { x: number; y: number };
type Ev1 = { kind: 'a'; v: number };
type Ev2 = { kind: 'b'; v: number };
type Ev3 = { kind: 'c'; v: number };
type Ev4 = { kind: 'd'; v: number };
type Ev5 = { kind: 'e'; v: number };

function scale(v: number): number {
  return v * 1.5;
}

/** @jitmax */
export function total(rows: Row[]): number {
  let s = 0;
  for (const r of rows) s += Math.sqrt(r.x) + scale(r.y);
  return s;
}

/** Four shapes are under the four-map budget and a plain number[] has no
 * shapes at all: silent. The figure is in EVIDENCE, where a re-measurement
 * moves it; a comment quoting one is a copy nothing updates. */
/** @jitmax */
export function fourShapes(rows: (A | B | C | D)[], gaps: number[]): number {
  return rows.length + gaps.length;
}

/** The fifth distinct property set is the cliff — at a load site, which is why
 * this reads a property off an element and not off the array. */
/** @jitmax */
export function fiveShapes(rows: (A | B | C | D | E)[]): number {
  let s = 0;
  for (const r of rows) s += r.x;
  return s;
}

/** Five property sets and nothing loaded off one of them: silent. `rows.length`
 * is a load off the ARRAY, whose map is the same whatever the elements are, so
 * there is no site here for a fifth map to reach (BUGS TC-8). */
/** @jitmax */
export function fiveShapesNoLoad(rows: (A | B | C | D | E)[]): number {
  return rows.length;
}

/** Five names for one property set. V8 keys a map on the property names, so
 * these five reach the load site as ONE map — `%HaveSameMap` says true — and
 * the rule that counted union members reported them anyway (BUGS TC-42).
 * Silent. */
/** @jitmax */
export function aliasedShapes(rows: (Row1 | Row2 | Row3 | Row4 | Row5)[]): number {
  let s = 0;
  for (const r of rows) s += r.x + r.y;
  return s;
}

/** A discriminated union over ONE key set: five members, five literal types for
 * `kind`, and one map at runtime, because a string literal type is not a
 * property name. Silent, for the same reason. */
/** @jitmax */
export function taggedShapes(evts: (Ev1 | Ev2 | Ev3 | Ev4 | Ev5)[]): number {
  let s = 0;
  for (const e of evts) s += e.v;
  return s;
}

/** The trigger `boxed-elements` used to fire on. V8 picks the elements kind
 * from the values stored, so this array is PACKED_DOUBLE unless a string is
 * actually put in it: 0.96-1.08x, seventeen of eighteen intervals spanning 1.
 * Silent, and the rule that reported it is withdrawn. */
/** @jitmax */
export function mixed(vals: (number | string)[]): number {
  return vals.length;
}

/** One object, one delete. This was published as the case delete-property must
 * stay silent on — 0x, dictionary mode up to 10% faster — and it measures
 * 13.3-15.6x on reads, in all nine of its sweeps. */
/** @jitmax */
export function drop(o: Record<string, number>, k: string): void {
  delete o[k];
}

/** The same violation, disabled by rule name for this function only. */
/** @jitmax -delete-property */
export function dropQuiet(o: Record<string, number>, k: string): void {
  delete o[k];
}

/** Rebuilding the accumulator every pass is the quadratic one. */
/** @jitmax */
export function collect(rows: number[]): number[] {
  let acc: number[] = [];
  for (const r of rows) acc = [...acc, r];
  return acc;
}

/** The same shape hidden inside reduce. */
/** @jitmax */
export function collectByReduce(rows: number[]): number[] {
  return rows.reduce<number[]>((acc, r) => [...acc, r], []);
}

/** The same copy written as a call: concat returns a whole new array. */
/** @jitmax */
export function collectByConcat(rows: number[]): number[] {
  let acc: number[] = [];
  for (const r of rows) acc = acc.concat(r);
  return acc;
}

/** One concat, no loop to re-run it: O(n), and silent. */
/** @jitmax */
export function appendOnce(rows: number[], extra: number[]): number[] {
  let acc = rows;
  acc = acc.concat(extra);
  return acc;
}

/** Appending to a string is not the array copy: 0.27-0.56x of push-and-join. */
/** @jitmax */
export function joinByPlus(parts: string[]): string {
  let s = '';
  for (const p of parts) s = s + p;
  return s;
}

/** The same call the array form makes, on a string: a cons-string, not a copy. */
/** @jitmax */
export function joinByConcat(parts: string[]): string {
  let s = '';
  for (const p of parts) s = s.concat(p);
  return s;
}

/** A spread no loop re-runs, and one that never carries the target: silent. */
/** @jitmax */
export function widen(rows: number[], extra: number[]): number[] {
  const out = [...extra, rows.length];
  for (const r of rows) out.push(r);
  return out;
}

function dropInner(o: Record<string, number>, k: string): void {
  delete o[k];
}

/** The violation is inside an unannotated callee, and the walk follows it. */
/** @jitmax */
export function viaCallee(o: Record<string, number>, k: string): void {
  dropInner(o, k);
}

/** Same callee as viaCallee, disabled by defect code here only — proves the
 * override reaches through the walk and does not leak into viaCallee. */
/** @jitmax -TC-9 */
export function viaCalleeQuiet(o: Record<string, number>, k: string): void {
  dropInner(o, k);
}

/** @jitmax */
export const helper = (v: number): number => v * 2;

/** An annotated arrow, and an alias to it: both stay inside the closed world. */
/** @jitmax */
export function usesHelper(xs: number[]): number {
  const alias = helper;
  return alias(xs.length) + helper(1);
}

/** Two stages, two arrays: the second one is thrown away immediately. */
/** @jitmax */
export function twoStages(rows: number[]): number[] {
  return rows.map((v) => v * 2).filter((v) => v > 10);
}

/** One stage allocates once, which is the baseline, not the defect. */
/** @jitmax */
export function oneStage(rows: number[]): number[] {
  return rows.map((v) => v * 2);
}

/** entries allocates a pair array per key before map allocates again: 3.59x. */
/** @jitmax */
export function entriesMap(o: Record<string, number>): number[] {
  return Object.entries(o).map(([, v]) => v * 3 + 1);
}

/** The same chain on keys BEAT its fused loop, 0.94-0.95x, so this is silent. */
/** @jitmax */
export function keysMap(o: Record<string, number>): number[] {
  return Object.keys(o).map((k) => o[k] * 3 + 1);
}

/** sort returns the array it was given, so there is no second array: silent. */
/** @jitmax */
export function sortedStages(rows: number[]): number[] {
  return rows.map((v) => v * 3 + 1).sort((a, b) => a - b);
}

/** The split chain measured 1.06-1.09x, under the bar a warning needs: silent. */
/** @jitmax */
export function splitJoin(s: string): string {
  return s
    .split(',')
    .map((t) => String(Number(t) * 3 + 1))
    .join(',');
}

/** A typed dependency ships a .d.ts and no body: this is where it stops. */
/** @jitmax */
export function usesDependency(src: string): number {
  const file = tsapi.createSourceFile('x.ts', src, tsapi.ScriptTarget.ES2022);
  return file.statements.length;
}

/** The object form of the same quadratic trap. */
/** @jitmax */
export function collectObject(rows: number[]): Record<string, number> {
  return rows.reduce<Record<string, number>>((acc, r, i) => ({ ...acc, [`k${i}`]: r }), {});
}

/** An immutable value type, the shape decimal.js and Temporal both have. */
class Money {
  constructor(readonly v: number) {}
  lt(o: Money): boolean {
    return this.v < o.v;
  }
  static min(a: Money, b: Money): Money {
    return new Money(Math.min(a.v, b.v));
  }
}

/** Choosing with a call that returns a new value allocates on every pass. */
/** @jitmax */
export function lowest(rows: Money[], bucket: { lo: Money }): void {
  for (const r of rows) bucket.lo = Money.min(bucket.lo, r);
}

/** The same loop on numbers: Math.min allocates nothing, so this is silent. */
/** @jitmax */
export function lowestNumber(rows: number[], bucket: { lo: number }): void {
  for (const r of rows) bucket.lo = Math.min(bucket.lo, r);
}

/** One spread, no loop to re-run it: silent. */
/** @jitmax */
export function mergeOnce(a: Record<string, number>, b: Record<string, number>) {
  return { ...a, ...b };
}

/** Object.assign onto a fresh target copies every key the accumulator holds. */
/** @jitmax */
export function collectByAssign(rows: number[]): Record<string, number> {
  let acc: Record<string, number> = {};
  for (let i = 0; i < rows.length; i++) acc = Object.assign({}, acc, { [`k${i}`]: rows[i] });
  return acc;
}

/** Object.assign onto the accumulator itself mutates it: O(n), and silent. */
/** @jitmax */
export function mergeInto(rows: number[]): Record<string, number> {
  let acc: Record<string, number> = {};
  for (let i = 0; i < rows.length; i++) acc = Object.assign(acc, { [`k${i}`]: rows[i] });
  return acc;
}

type Grown = { x: number; y?: number };

/** The folklore's own example. Every object takes the same path, so they share
 * one final map and the load site is monomorphic: 1.21-1.34x, refuted. */
/** @jitmax */
export function addField(rows: number[]): Grown[] {
  const out: Grown[] = [];
  for (const r of rows) {
    const o: Grown = { x: r };
    o.y = r * 2;
    out.push(o);
  }
  return out;
}

/** Two hidden classes at one load site, which is what `y?: number` really is.
 * Reads measured 1.04-1.21x and building costs LESS, so this is silent. */
/** @jitmax */
export function optionalField(rows: Grown[]): number {
  let s = 0;
  for (const r of rows) s += r.x;
  return s;
}

/** Keyed stores past fast_properties_soft_limit reach dictionary mode and cost
 * 6.17-6.34x to read — but twelve of them cost 1.02-1.04x and nothing static
 * separates the two, so no rule fires here. BUGS TC-12. */
/** @jitmax */
export function growByKey(keys: string[], vals: number[]): Record<string, number> {
  const acc: Record<string, number> = {};
  for (let i = 0; i < keys.length; i++) acc[keys[i]] = vals[i];
  return acc;
}

type Circle = { id: number; r: number; area(): number };
type Square = { id: number; s: number; area(): number };
type Rect = { id: number; w: number; h: number; area(): number };
type Tri = { id: number; b: number; t: number; area(): number };
type Hex = { id: number; e: number; area(): number };

/** Four shapes at a call site cost the band four shapes cost at a load site:
 * silent, for the same reason. */
/** @jitmax */
export function areaOfFour(x: Circle | Square | Rect | Tri): number {
  return x.area();
}

/** The fifth shape at a call site is the cliff, and sharper than at a load
 * site: the fifth map costs the inlining as well as the cached lookup. */
/** @jitmax */
export function areaOfFive(x: Circle | Square | Rect | Tri | Hex): number {
  return x.area();
}

/** Five object types and nothing called on them. TC-8 is the flagship rule
 * firing where no site exists; this rule does not repeat it. */
/** @jitmax */
export function idOfFive(x: Circle | Square | Rect | Tri | Hex): number {
  return x.id;
}

/** One union reaching one site, written as an array. megamorphic-elements has
 * the parameter, so this reports once and not twice. */
/** @jitmax */
export function totalArea(rows: (Circle | Square | Rect | Tri | Hex)[]): number {
  let s = 0;
  for (const r of rows) s += r.area();
  return s;
}


/** The accumulator on a FIELD. `this.acc` is not an identifier, and requiring
 * one silenced the measured defect completely (BUGS TC-43). */
export class Collector {
  acc: number[] = [];

  /** @jitmax */
  addAll(xs: number[]): void {
    for (const x of xs) this.acc = [...this.acc, x];
  }
}

/** The same copy inside a `forEach` callback. `reduce` was special-cased for
 * this and `forEach` was not, so three tokens moved the defect out of sight. */
/** @jitmax */
export function collectInForEach(xs: number[]): number[] {
  let acc: number[] = [];
  xs.forEach((x) => {
    acc = [...acc, x];
  });
  return acc;
}

/** A chain on a STRING. No array is allocated anywhere in it, and the rule
 * matched the method names and said one was (BUGS TC-35). The same measurement
 * that keeps `accumulating-spread` off strings keeps this off them. Silent. */
/** @jitmax */
export function trimTail(str: string): string {
  return str.concat('x').slice(1);
}

/** `delete` on an ARRAY ELEMENT. It makes the backing store holey; it does not
 * put the array in dictionary mode, which is the only thing bench/delete.jl
 * measured, and "assign undefined instead" boxes the array (BUGS TC-36).
 * Silent. */
/** @jitmax */
export function dropElement(xs: number[], i: number): number[] {
  delete xs[i];
  return xs;
}

type Pt = { a: number };

/** Returns one of its arguments and allocates on no pass. The rule read the
 * return TYPE and asserted an allocation on every pass (BUGS TC-34). */
function nearer(a: Pt, b: Pt): Pt {
  return a.a < b.a ? a : b;
}

/** @jitmax */
export function nearest(pts: Pt[]): Pt {
  let x = pts[0];
  for (const y of pts) x = nearer(x, y);
  return x;
}

/** Allocates, but only inside a callback it never calls, and never returns the
 * allocation. `builds()` walked the whole body including nested functions, so
 * this read as "returns a new object every pass" (BUGS TC-34, second half). */
function cheaperOf(a: Pt, b: Pt): Pt {
  const describe = () => ({ label: 'unused' });
  void describe;
  return a.a <= b.a ? a : b;
}

/** @jitmax */
export function cheapest(pts: Pt[]): Pt {
  let x = pts[0];
  for (const y of pts) x = cheaperOf(x, y);
  return x;
}

/** A chain whose own literal `.slice(0, 10)` bounds it to ten elements: silent.
 * `bench/chained.jl` starts at n=1000, so below that the rule would be quoting
 * a sweep that never went there (BUGS TC-54). */
/** @jitmax */
export function topTen(rows: number[]): string[] {
  return rows.slice(0, 10).map((r) => `row ${r}`);
}

/** The same chain with nothing bounding it: the rule fires, as it always has. */
/** @jitmax */
export function allRows(rows: number[]): string[] {
  return rows.slice(1).map((r) => `row ${r}`);
}
