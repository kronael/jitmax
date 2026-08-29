import type { Mark } from '../scan.ts';
import { N } from '../numbers.ts';
import { cells, type Add, type Evidence } from './shared.ts';

const evidence: Evidence = {
  cost:
    'an opaque call is an inlining boundary, and a callee V8 refuses to inline costs ' +
    `${N['inline.reads']} in a hot loop at n=1000 (CI ${N['inline.ci1000']}). The ` +
    `n=100000 cell read ${N['inline.withdrawn.100k']} across its three sweeps, which have ` +
    'no value common to all three, so rule 13 withdraws it and this range no longer ' +
    'reaches down into it (TC-37)',
  source:
    `bench/inline.jl, ${cells(N['inline.cells'])}, 20 pairs each; the inlining decision ` +
    'itself confirmed with --trace-turbo-inlining, which reports the padded callee as ' +
    '"cannot consider"',
  severity: 'warn',
  silent:
    'this bounds what ONE unchecked call can cost, not what any particular one does cost ' +
    '— a small callee is inlined and the boundary costs nothing. The trigger and the ' +
    'benchmark are different programs: the rule fires on a callee with no readable body, ' +
    'and the sweep measures a readable one padded past the inlining budget, because a ' +
    'callee nobody can read is a callee nobody can size (TC-33)',
  defects: ['TC-33'],
};

// The closed-world rule: a callee whose body is nowhere in this checkout. The
// walk already followed every callee whose source we have, so what is left is a
// dependency we cannot read, and that is where the promise stops.
//
// A call through an INTERFACE is not this. Its body IS here; the walk just
// cannot decide which one runs, and telling the author to inline it would be
// telling them to undo the abstraction. That was 96.7% of every finding across
// the 22-codebase survey under this same name, so `[rules] closed-world = false`
// — the obvious way to quiet it — also switched off the one cause that is honest
// about not being able to look. It has its own name now (BUGS TC-93).
function detect(mark: Mark, add: Add): void {
  for (const c of mark.escapes) {
    if (c.viaInterface || c.dispatch) continue;
    add({
      file: c.file,
      line: c.line,
      column: c.column,
      rule: 'closed-world',
      message: `calls ${c.text}, which we have no body for; the promise stops here`,
      fix: `inline what you need from ${c.text}, or accept that this call is unchecked`,
    });
  }
}

export const closedWorld = {
  name: 'closed-world',
  evidence,
  detect,
};
