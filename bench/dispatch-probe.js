// node --allow-natives-syntax bench/dispatch-probe.js
//
// Answers, before any cell runs, what the four families actually are to V8.
// This is where bench/dispatch.js's family table gets its map and target counts
// from — it cites this file by name, and without it those four lines are an
// assertion nobody can re-run. That is why it is tracked.
//
// A DIAGNOSTIC, never a measurement: it needs --allow-natives-syntax, which
// protocol rule 8 bars from an evidence run. It prints what V8 thinks; the
// cost of thinking it is bench/dispatch.jl's job.
'use strict';

class C0 { constructor(v) { this.v = v; } step() { return this.v * 2 + 1; } }
class C1 { constructor(v) { this.v = v; } step() { return this.v * 2 + 1; } }

function step0() { return this.v * 2 + 1; }
function step1() { return this.v * 2 + 1; }

const S0 = (v, w, f) => ({ v, w, step: f });
const S1 = (v, w, f) => ({ v, step: f, w });
const S4 = (v, w, f) => ({ step: f, v, w });

const say = (label, val) => process.stdout.write(`${label.padEnd(54)} ${val}\n`);

say('two C0 instances share a map', %HaveSameMap(new C0(1), new C0(2)));
say('C0 and C1 instances share a map', %HaveSameMap(new C0(1), new C1(2)));

// Warm the literal sites past the const-field tracking that a first-run
// object carries, then compare: the tgt family's whole premise is that one
// key order stays ONE map when the function value differs.
let a = S0(1, 2, step0);
let b = S0(3, 4, step1);
for (let i = 0; i < 5; i++) { a = S0(i, i, step0); b = S0(i, i, step1); }
say('one key order, two different step functions', %HaveSameMap(a, b));
say('one key order, same step function', %HaveSameMap(S0(1, 2, step0), S0(3, 4, step0)));
say('two key orders, same step function', %HaveSameMap(S0(1, 2, step0), S1(3, 4, step0)));
say('two key orders, different step functions', %HaveSameMap(S0(1, 2, step0), S4(3, 4, step1)));

say('C0 instance has fast properties', %HasFastProperties(new C0(1)));
say('S0 literal has fast properties', %HasFastProperties(S0(1, 2, step0)));
