import * as tsapi from 'typescript';

type Row = { x: number; y: number };
type A = { a: number };
type B = { b: number };
type C = { c: number };
type D = { d: number };
type E = { e: number };

function scale(v: number): number {
  return v * 1.5;
}

/** @turbocharge */
export function total(rows: Row[]): number {
  let s = 0;
  for (const r of rows) s += Math.sqrt(r.x) + scale(r.y);
  return s;
}

/** Four shapes cost 1.18-1.58x and a plain number[] costs nothing: silent. */
/** @turbocharge */
export function fourShapes(rows: (A | B | C | D)[], gaps: number[]): number {
  return rows.length + gaps.length;
}

/** The fifth shape is the cliff: 5.34x at L1. */
/** @turbocharge */
export function fiveShapes(rows: (A | B | C | D | E)[]): number {
  return rows.length;
}

/** @turbocharge */
export function mixed(vals: (number | string)[]): number {
  return vals.length;
}

/** @turbocharge */
export function drop(o: Record<string, number>, k: string): void {
  delete o[k];
}

/** Rebuilding the accumulator every pass is the quadratic one. */
/** @turbocharge */
export function collect(rows: number[]): number[] {
  let acc: number[] = [];
  for (const r of rows) acc = [...acc, r];
  return acc;
}

/** The same shape hidden inside reduce. */
/** @turbocharge */
export function collectByReduce(rows: number[]): number[] {
  return rows.reduce<number[]>((acc, r) => [...acc, r], []);
}

/** The same copy written as a call: concat returns a whole new array. */
/** @turbocharge */
export function collectByConcat(rows: number[]): number[] {
  let acc: number[] = [];
  for (const r of rows) acc = acc.concat(r);
  return acc;
}

/** One concat, no loop to re-run it: O(n), and silent. */
/** @turbocharge */
export function appendOnce(rows: number[], extra: number[]): number[] {
  let acc = rows;
  acc = acc.concat(extra);
  return acc;
}

/** Appending to a string is not the array copy: 0.27-0.56x of push-and-join. */
/** @turbocharge */
export function joinByPlus(parts: string[]): string {
  let s = '';
  for (const p of parts) s = s + p;
  return s;
}

/** The same call the array form makes, on a string: a cons-string, not a copy. */
/** @turbocharge */
export function joinByConcat(parts: string[]): string {
  let s = '';
  for (const p of parts) s = s.concat(p);
  return s;
}

/** A spread no loop re-runs, and one that never carries the target: silent. */
/** @turbocharge */
export function widen(rows: number[], extra: number[]): number[] {
  const out = [...extra, rows.length];
  for (const r of rows) out.push(r);
  return out;
}

function dropInner(o: Record<string, number>, k: string): void {
  delete o[k];
}

/** The violation is inside an unannotated callee, and the walk follows it. */
/** @turbocharge */
export function viaCallee(o: Record<string, number>, k: string): void {
  dropInner(o, k);
}

/** @turbocharge */
export const helper = (v: number): number => v * 2;

/** An annotated arrow, and an alias to it: both stay inside the closed world. */
/** @turbocharge */
export function usesHelper(xs: number[]): number {
  const alias = helper;
  return alias(xs.length) + helper(1);
}

/** Two stages, two arrays: the second one is thrown away immediately. */
/** @turbocharge */
export function twoStages(rows: number[]): number[] {
  return rows.map((v) => v * 2).filter((v) => v > 10);
}

/** One stage allocates once, which is the baseline, not the defect. */
/** @turbocharge */
export function oneStage(rows: number[]): number[] {
  return rows.map((v) => v * 2);
}

/** entries allocates a pair array per key before map allocates again: 3.59x. */
/** @turbocharge */
export function entriesMap(o: Record<string, number>): number[] {
  return Object.entries(o).map(([, v]) => v * 3 + 1);
}

/** The same chain on keys BEAT its fused loop, 0.94-0.95x, so this is silent. */
/** @turbocharge */
export function keysMap(o: Record<string, number>): number[] {
  return Object.keys(o).map((k) => o[k] * 3 + 1);
}

/** sort returns the array it was given, so there is no second array: silent. */
/** @turbocharge */
export function sortedStages(rows: number[]): number[] {
  return rows.map((v) => v * 3 + 1).sort((a, b) => a - b);
}

/** The split chain measured 1.06-1.09x, under the bar a warning needs: silent. */
/** @turbocharge */
export function splitJoin(s: string): string {
  return s
    .split(',')
    .map((t) => String(Number(t) * 3 + 1))
    .join(',');
}

/** A typed dependency ships a .d.ts and no body: this is where it stops. */
/** @turbocharge */
export function usesDependency(src: string): number {
  const file = tsapi.createSourceFile('x.ts', src, tsapi.ScriptTarget.ES2022);
  return file.statements.length;
}

/** The object form of the same quadratic trap. */
/** @turbocharge */
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
/** @turbocharge */
export function lowest(rows: Money[], bucket: { lo: Money }): void {
  for (const r of rows) bucket.lo = Money.min(bucket.lo, r);
}

/** The same loop on numbers: Math.min allocates nothing, so this is silent. */
/** @turbocharge */
export function lowestNumber(rows: number[], bucket: { lo: number }): void {
  for (const r of rows) bucket.lo = Math.min(bucket.lo, r);
}

/** One spread, no loop to re-run it: silent. */
/** @turbocharge */
export function mergeOnce(a: Record<string, number>, b: Record<string, number>) {
  return { ...a, ...b };
}

/** Object.assign onto a fresh target copies every key the accumulator holds. */
/** @turbocharge */
export function collectByAssign(rows: number[]): Record<string, number> {
  let acc: Record<string, number> = {};
  for (let i = 0; i < rows.length; i++) acc = Object.assign({}, acc, { [`k${i}`]: rows[i] });
  return acc;
}

/** Object.assign onto the accumulator itself mutates it: O(n), and silent. */
/** @turbocharge */
export function mergeInto(rows: number[]): Record<string, number> {
  let acc: Record<string, number> = {};
  for (let i = 0; i < rows.length; i++) acc = Object.assign(acc, { [`k${i}`]: rows[i] });
  return acc;
}

type Grown = { x: number; y?: number };

/** The folklore's own example. Every object takes the same path, so they share
 * one final map and the load site is monomorphic: 1.21-1.34x, refuted. */
/** @turbocharge */
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
/** @turbocharge */
export function optionalField(rows: Grown[]): number {
  let s = 0;
  for (const r of rows) s += r.x;
  return s;
}

/** Keyed stores past fast_properties_soft_limit reach dictionary mode and cost
 * 6.17-6.34x to read — but twelve of them cost 1.02-1.04x and nothing static
 * separates the two, so no rule fires here. BUGS TC-12. */
/** @turbocharge */
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

/** Four shapes at a call site cost 1.16-1.56x, the same band four shapes cost
 * at a load site: silent, for the same reason. */
/** @turbocharge */
export function areaOfFour(x: Circle | Square | Rect | Tri): number {
  return x.area();
}

/** The fifth shape at a call site is the cliff: 14.6-20.0x on reads. */
/** @turbocharge */
export function areaOfFive(x: Circle | Square | Rect | Tri | Hex): number {
  return x.area();
}

/** Five object types and nothing called on them. TC-8 is the flagship rule
 * firing where no site exists; this rule does not repeat it. */
/** @turbocharge */
export function idOfFive(x: Circle | Square | Rect | Tri | Hex): number {
  return x.id;
}

/** One union reaching one site, written as an array. megamorphic-elements has
 * the parameter, so this reports once and not twice. */
/** @turbocharge */
export function totalArea(rows: (Circle | Square | Rect | Tri | Hex)[]): number {
  let s = 0;
  for (const r of rows) s += r.area();
  return s;
}
