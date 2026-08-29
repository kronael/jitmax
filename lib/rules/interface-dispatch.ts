import type { Mark } from '../scan.ts';
import { MAX_CACHED_MAPS, type Add, type Evidence } from './shared.ts';

const evidence: Evidence = {
  cost:
    'nothing this project has measured. A call through an interface has a body in this ' +
    'checkout; what the walk cannot do is decide WHICH body runs, so it can neither follow ' +
    'it nor price it',
  source:
    'no sweep. Split out of closed-world, which was one name over three causes: a callee ' +
    'with no body anywhere, a call through an interface, and a receiver whose origin is ' +
    'outside this program. Interface dispatch was 96.7% of every finding across the ' +
    '22-codebase survey, so disabling closed-world to quiet it also disabled the one cause ' +
    'that is honest about not being able to look (BUGS TC-93)',
  silent:
    'a call whose receiver reaches it as one implementation is a monomorphic site and this ' +
    'rule says nothing about it. Two to four are inside V8\'s four-map budget and are ' +
    'reported as a note, never as an error; five or more is a real megamorphic call site ' +
    'and belongs to megamorphic-dispatch, which carries the sweep',
  unreported:
    'the count is a lower bound twice over: classes are counted by identity and literals ' +
    'by shape, which undercounts maps (BUGS TC-60), and the enumeration sees only this ' +
    'program, so a consumer of an exported interface can add more',
  severity: 'warn',
  defects: ['TC-33', 'TC-82'],
};

// A call the walk reached through an interface. The body IS in this checkout —
// that is what separates this from `closed-world` — and the dataflow walk
// counted what reaches the receiver (lib/flow.ts, BUGS TC-69). The count decides
// what is said: five or more is a real megamorphic call site and belongs to
// `megamorphic-dispatch` with the benchmark that rule carries; two to four is
// inside V8's four-map budget and is a note; an unknown origin makes every count
// a lower bound, and the finding says so rather than printing a number it cannot
// stand behind (BUGS TC-82: @noble/curves' one-place `Fp` and zod's thirteen-way
// `_parse` used to render as the same warning).
function detect(mark: Mark, add: Add): void {
  for (const c of mark.escapes) {
    if (!c.viaInterface && !c.dispatch) continue;
    const d = c.dispatch;
    if (d && d.count > MAX_CACHED_MAPS) {
      const listed = d.names.slice(0, 5).join(', ');
      add({
        file: c.file,
        line: c.line,
        column: c.column,
        rule: 'megamorphic-dispatch',
        message:
          `${d.recv} reaches this call as at least ${d.count} implementations built by ` +
          `this program (${listed}${d.count > 5 ? ', …' : ''}) and .${d.method}() is ` +
          'called on it; V8 caches four maps per call site, so a fifth makes every call ' +
          'here a lookup',
        fix:
          'get the implementations reaching this call to four or fewer, or give the ' +
          'call site one shape — the count is a lower bound: two identical classes are ' +
          'still two maps, and a consumer of an exported interface can add more',
      });
      continue;
    }
    add({
      file: c.file,
      line: c.line,
      column: c.column,
      rule: 'interface-dispatch',
      message:
        d && d.unknown.length > 0
          ? `calls ${c.text} through an interface, and the receiver has an unknown ` +
            `origin (${d.unknown[0]})` +
            (d.count > 0
              ? `; ${d.count} implementation${d.count === 1 ? ' is' : 's are'} visible ` +
                `(${d.names.join(', ')}), a lower bound`
              : '') +
            '; the promise stops here'
          : d && d.count >= 2
          ? `calls ${c.text} through an interface; ${d.count} implementations reach this ` +
            `receiver (${d.names.join(', ')}) — inside V8's four-map budget, and their ` +
            'bodies are not followed; the promise stops here'
          : `calls ${c.text} through an interface, so the walk cannot tell which ` +
            'implementation runs here; the promise stops here',
      fix:
        `check the implementations of ${c.text} yourself, or narrow the value to one of ` +
        "them at this call — do not inline the abstraction away on this rule's account",
    });
  }
}

export const interfaceDispatch = {
  name: 'interface-dispatch',
  evidence,
  detect,
};
