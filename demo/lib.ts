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
