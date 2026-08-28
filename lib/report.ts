import path from 'node:path';
import type { Mark } from './scan.ts';
import { DEFECT, type Finding } from './rules.ts';

const plural = (n: number, s: string): string => `${n} ${s}${n === 1 ? '' : 's'}`;

export interface Suppression {
  // Findings a config or an annotation removed before they reached this
  // report. Zero is the common case and prints nothing.
  count: number;
  // The disable keys in force anywhere in this run — config and every
  // annotation's, deduped and sorted — so a clean run that is clean because
  // rules were switched off says so, and says by what.
  keys: string[];
}

export function render(
  cwd: string,
  results: Array<{ mark: Mark; findings: Finding[] }>,
  suppression: Suppression = { count: 0, keys: [] }
): string {
  const out: string[] = [];
  const total = results.reduce((n, r) => n + r.findings.length, 0);
  out.push(`jitmax — ${plural(results.length, 'annotated function')}, ${plural(total, 'finding')}`);
  // Suppression is never silent: a run that looks clean because rules were
  // switched off says so here, every time, not only when it would otherwise
  // read as clean. BUGS TC-7 is the same class of lie in a different place.
  if (suppression.count > 0) {
    out.push(`  ${plural(suppression.count, 'finding')} suppressed (${suppression.keys.join(', ')})`);
  }

  const partial = results.filter((r) => r.mark.truncated);

  for (const { mark, findings } of results) {
    if (findings.length === 0 && !mark.truncated) continue;
    out.push('', `  ${path.relative(cwd, mark.file) || mark.file}:${mark.line}  ${mark.name}()`);
    if (mark.truncated) {
      out.push(
        '    WALK TRUNCATED',
        '      the call tree exceeded the body limit, so part of it was never checked;',
        '      treat any silence from this function as unproven'
      );
    }
    for (const f of findings) {
      out.push(`    ${f.rule}`);
      // The walk follows callees, so a finding is often not in the annotated
      // function at all. Saying where it is is the difference between a report
      // and a riddle.
      if (f.file !== mark.file || f.line !== mark.line) {
        out.push(`      ${path.relative(cwd, f.file) || f.file}:${f.line}`);
      }
      out.push(`      ${f.message}`);
      // `measured` is a claim about the line above it. Where a rule's benchmark
      // measures the MECHANISM rather than the trigger — `closed-world` fires on
      // a callee with no body and prices one padded past the inlining budget —
      // the word has to change, or the number reads as a measurement of this
      // call (BUGS TC-33).
      if (f.evidence) {
        const lead = f.evidence.bound ? 'bound' : 'measured';
        out.push(`      ${lead} ${f.evidence.cost} [${f.evidence.source}]`);
      }
      out.push(`      fix: ${f.fix}`);
      for (const code of f.evidence?.defects ?? []) {
        out.push(`      known defect: ${code} — ${DEFECT[code] ?? code}`);
      }
    }
  }

  out.push(
    '',
    total === 0 && partial.length === 0
      ? '  every annotated function is clean.'
      : total === 0
      ? `  no findings, but ${plural(partial.length, 'walk')} truncated: this is not a clean run.`
      : '  Costs above are microbenchmark ratios, not a prediction for this\n' +
        '  workload. They say the pattern can cost that much, not that it does.'
  );
  return out.join('\n');
}
