import { N } from '../numbers.ts';
import { megamorphicCall } from './megamorphic-dispatch.ts';
import { cells, reached, type EscapeRule, type Evidence, type RuleModule } from './shared.ts';

// The rule's name, once. It was a terminal string in the finding and a second
// terminal string in the exported rule below, and the pair that drifted was in
// interface-dispatch.ts, which reports a rule that is not its own.
const NAME = 'closed-world';

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
  silent:
    'the platform. A call into `globalThis`, a V8 builtin or `@types/node` has no body a ' +
    'reader can go and look at and no `npm install` that produces one, so "inline what you ' +
    'need from it" is advice nobody can take — those are counted and not named (BUGS ' +
    'TC-55, TC-110). A method read off a value typed `any` is not this rule either: ' +
    'nothing resolves there, so the platform test cannot fire and the tool has no way to ' +
    "tell a Map builtin from somebody's code — the site is reported as blindness and the " +
    'run is not clean, which is what it is (BUGS TC-129). And this bounds what ONE ' +
    'unchecked call can cost, not what any ' +
    'particular one does cost ' +
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
const detect: EscapeRule = (mark, add) => {
  // The complement of interface-dispatch's guard, over ONE field: an escape is
  // either a callee with no body anywhere or a call through an interface, and
  // the two rules split `mark.escapes` between them. `|| c.dispatch` was a
  // second term that decided nothing, and a De Morgan pair spelled out in two
  // files is two edits in opposite directions the day a third escape kind
  // appears.
  for (const c of mark.escapes) {
    if (c.viaInterface) continue;
    // The receiver's maps decide the inline cache whether or not the callee's
    // body is readable, so this rule asks the megamorphic question the same way
    // interface-dispatch does, and hands the site to the rule that carries the
    // sweep for it. Unreadable and megamorphic is not two findings (BUGS TC-110).
    if (megamorphicCall(c, add)) continue;
    const d = c.dispatch;
    add({
      file: c.file,
      line: c.line,
      column: c.column,
      rule: NAME,
      // What reaches the receiver, when anything does. `const f = pick ? a : b`
      // has no body the callee walk can follow and two the dataflow walk can
      // see, and printing "we have no body for f" over both of them is a
      // coverage claim this rule exists to keep honest.
      //
      // So the sentence turns on `located` and not on the count: "we have no
      // body for" is reserved for a receiver whose implementations the walk
      // could not find. pixi's `arrayUploadFunction` got that sentence with the
      // file and line of two located bodies printed inside it, and a fix line
      // offering to inline a callee the tool had just pointed at (BUGS TC-109).
      // Stopping at two is defensible — following them is the walk change the
      // entry proposes and this rule does not make — but it has to say that it
      // stopped, not that it could not look.
      message:
        d.located > 0
          ? `calls ${c.text}, and the walk does not pick between the bodies that reach ` +
            `it${reached(d)}; those bodies are readable and are not walked, so the promise ` +
            'stops here'
          : d.count >= 2
          ? `calls ${c.text}, which we have no body for${reached(d)}; the promise stops here`
          : `calls ${c.text}, which we have no body for; the promise stops here`,
      fix:
        d.located > 0
          ? `read the ${d.located} implementations named above, or give this call one of them`
          : `inline what you need from ${c.text}, or accept that this call is unchecked`,
      note:
        d.located > 0
          ? 'they are located, not missing, and what is inside them is unchecked'
          : undefined,
    });
  }
};

export const closedWorld: RuleModule = {
  name: NAME,
  evidence,
  scope: 'escapes',
  detect,
};
