import { megamorphicCall } from './megamorphic-dispatch.ts';
import { reached, dispatchHints, type EscapeRule, type Evidence, type RuleModule } from './shared.ts';

// The rule's name, once. It was a terminal string in the finding and a second
// terminal string in the exported rule below, and the pair that drifted was in
// interface-dispatch.ts, which reports a rule that is not its own.
const NAME = 'interface-dispatch';

const evidence: Evidence = {
  cost:
    'nothing this project has measured. A call through an interface has a body in this ' +
    'checkout; the walk checks located readable bodies but cannot decide which target runs ' +
    'or price the call',
  source:
    'no sweep. Split out of closed-world, which was one name over three causes: a callee ' +
    'with no body anywhere, a call through an interface, and a receiver whose origin is ' +
    'outside this program. Interface dispatch was 96.7% of every finding across the ' +
    '22-codebase survey, so disabling closed-world to quiet it also disabled the one cause ' +
    'that is honest about not being able to look (BUGS TC-93)',
  silent:
    'a call with one known receiver implementation and a checkable body stays silent: ' +
    'the walk follows that body. A throw-only method is a declaration, not an implementation. ' +
    "Two to four receivers are inside V8's four-map budget: the finding says so in those " +
    "words and never carries megamorphic-dispatch's claim. Five or more is a real " +
    'megamorphic call site and belongs to megamorphic-dispatch, which carries the sweep',
  unreported:
    'the count is a lower bound twice over: classes are counted by identity and literals ' +
    'by shape, which undercounts maps (BUGS TC-60), and the enumeration sees only this ' +
    'program, so a consumer of an exported interface can add more',
  defects: ['TC-33'],
};

// A call the walk reached through an interface. The body IS in this checkout —
// that is what separates this from `closed-world` — and the dataflow walk
// counted what reaches the receiver (lib/flow.ts, BUGS TC-69). The count decides
// what is said: five or more belongs to `megamorphic-dispatch` and its
// benchmark; two to four is inside V8's four-map budget and is a note; an
// unknown origin makes every count a lower bound, and the finding says so rather
// than printing a number it cannot stand behind (BUGS TC-82: @noble/curves'
// one-place `Fp` and zod's thirteen-way `_parse` used to render as the same
// warning).
const detect: EscapeRule = (mark, add) => {
  // The complement of closed-world's guard; see the note there.
  for (const c of mark.escapes) {
    if (!c.viaInterface) continue;
    if (megamorphicCall(c, add)) continue;
    const d = c.dispatch;
    // A bare call reaches a function, not a receiver's method: `setPurgeTimer`
    // is a const holding one of two arrows, and "through an interface" named a
    // thing that is not there (BUGS TC-158).
    const via = d.method === '' ? '' : ' through an interface';
    const origin = d.method === '' ? 'callee' : 'receiver';
    const walked = d.checked === 0
      ? 'no readable body was checked at this call'
      : d.checked === 1 && d.located === 1
      ? 'only the one body located is walked; other targets remain unchecked'
      : `${d.checked} readable ${d.checked === 1 ? 'body is' : 'bodies are'} checked; ` +
        'runtime target selection remains unresolved' +
        (d.checked < d.located ? '; some located bodies were not checked' : '') +
        (d.unknown.length > 0 ? '; other targets remain unchecked' : '');
    add({
      file: c.file,
      line: c.line,
      column: c.column,
      ...dispatchHints(d),
      rule: NAME,
      message:
        d.unknown.length > 0
          ? `${c.text}: unknown ${origin} origin` +
            `${reached(d)}${d.count > 0 ? ', a lower bound' : ''}; ${walked}`
          : d.count >= 2
          ? `calls ${c.text}${via}${reached(d)}; ${walked}`
          : `${c.text}: no single checkable implementation resolved${via}`,
      fix:
        `review the implementations of ${c.text}, then record the review with ` +
        "-interface-dispatch on this root's @jitmax annotation",
      note:
        'annotating a target checks its body but does not clear this call-site error. ' +
        'Keep the abstraction; a type assertion does not select a runtime implementation',
    });
  }
};

export const interfaceDispatch: RuleModule = {
  name: NAME,
  evidence,
  scope: 'escapes',
  detect,
};
