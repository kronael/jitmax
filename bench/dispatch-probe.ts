// node --allow-natives-syntax bench/dispatch-probe.ts
//
// Answers, before any cell runs, what the four families actually are to V8.
// This is where bench/dispatch.ts's family table gets its map and target counts
// from — it cites this file by name, and without it those four lines are an
// assertion nobody can re-run. That is why it is tracked.
//
// A DIAGNOSTIC, never a measurement: it needs --allow-natives-syntax, which
// protocol rule 8 bars from an evidence run. It prints what V8 thinks; the
// cost of thinking it is bench/dispatch.jl's job.
//
// The natives themselves are in bench/natives.js — the one file here that
// cannot be TypeScript, because `%Foo()` is a parse error for tsc and for
// node's type stripper alike. The logic is here.
import { haveSameMap, hasFastProperties } from './natives.js';

class C0 {
  v: number;
  constructor(v: number) { this.v = v; }
  step() { return this.v * 2 + 1; }
}
class C1 {
  v: number;
  constructor(v: number) { this.v = v; }
  step() { return this.v * 2 + 1; }
}

function step0(this: { v: number }) { return this.v * 2 + 1; }
function step1(this: { v: number }) { return this.v * 2 + 1; }

type Step = (this: { v: number }) => number;
const S0 = (v: number, w: number, f: Step) => ({ v, w, step: f });
const S1 = (v: number, w: number, f: Step) => ({ v, step: f, w });
const S4 = (v: number, w: number, f: Step) => ({ step: f, v, w });

const say = (label: string, val: boolean) =>
  process.stdout.write(`${label.padEnd(54)} ${val}\n`);

say('two C0 instances share a map', haveSameMap(new C0(1), new C0(2)));
say('C0 and C1 instances share a map', haveSameMap(new C0(1), new C1(2)));

// Warm the literal sites past the const-field tracking that a first-run
// object carries, then compare: the tgt family's whole premise is that one
// key order stays ONE map when the function value differs.
let a = S0(1, 2, step0);
let b = S0(3, 4, step1);
for (let i = 0; i < 5; i++) { a = S0(i, i, step0); b = S0(i, i, step1); }
say('one key order, two different step functions', haveSameMap(a, b));
say('one key order, same step function', haveSameMap(S0(1, 2, step0), S0(3, 4, step0)));
say('two key orders, same step function', haveSameMap(S0(1, 2, step0), S1(3, 4, step0)));
say('two key orders, different step functions', haveSameMap(S0(1, 2, step0), S4(3, 4, step1)));

say('C0 instance has fast properties', hasFastProperties(new C0(1)));
say('S0 literal has fast properties', hasFastProperties(S0(1, 2, step0)));
