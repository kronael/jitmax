import path from 'node:path';
import type { Mark } from './scan.ts';
import { DEFECT, type Finding } from './rules.ts';

const plural = (n: number, s: string): string => `${n} ${s}${n === 1 ? '' : 's'}`;

// A finding no benchmark prices is a warning, not an error, and a warning does
// not fail a build. A rule that carries no evidence at all defaults to the same
// place, because a gate that fails on an unmeasured claim is failing on
// something this project cannot support (BUGS TC-33, TC-52).
export const severity = (f: Finding): 'error' | 'warn' => f.evidence?.severity ?? 'warn';

const wrap = (text: string, indent: string, width = 88): string[] => {
  const lines: string[] = [];
  let line = indent;
  for (const word of text.split(/\s+/)) {
    if (line !== indent && line.length + 1 + word.length > width) {
      lines.push(line);
      line = indent;
    }
    line += line === indent ? word : ` ${word}`;
  }
  if (line !== indent) lines.push(line);
  return lines;
};

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
  suppression: Suppression = { count: 0, keys: [] },
  // What the functions in this run are. An annotation is the author asserting
  // hotness; a profile is a measurement of it. The report says which.
  subject = 'annotated function'
): string {
  const out: string[] = [];
  // One finding per SITE. The same line reached from 28 annotated functions was
  // 28 findings, so the headline counted the call-graph fan-in rather than the
  // work: agent-twitter-client reported 118 errors over 12 distinct lines, and
  // tsc 49 over 5. TC-51 read this as `closed-world`'s problem; it is how every
  // finding was counted, and that rule only made it visible first because it
  // fires most (BUGS TC-62). The finding is kept under the first annotated
  // function that reaches it, and how many others do is printed.
  const key = (f: Finding): string => `${f.rule}|${f.file}|${f.line}|${f.column}`;
  // Counted first, then rendered, because the fan-in is printed ON the finding
  // and the last caller is not known until every mark has been walked. The
  // fan-in is kept rather than discarded: a line reached by 28 annotated
  // functions is a better fix than one reached by one.
  const reach = new Map<string, number>();
  for (const f of results.flatMap((r) => r.findings)) {
    reach.set(key(f), (reach.get(key(f)) ?? 0) + 1);
  }
  const shown = new Set<string>();
  const perSite = results.map(({ mark, findings }) => ({
    mark,
    findings: findings.filter((f) => {
      if (shown.has(key(f))) return false;
      shown.add(key(f));
      return true;
    }),
  }));
  const alsoReached = [...reach.values()].reduce((n, c) => n + (c - 1), 0);
  const all = perSite.flatMap((r) => r.findings);
  const warnings = all.filter((f) => severity(f) === 'warn').length;
  const total = all.length - warnings;
  out.push(
    `jitmax — ${plural(results.length, subject)}, ${plural(total, 'error')}` +
      (warnings > 0 ? `, ${plural(warnings, 'warning')}` : '')
  );
  // Suppression is never silent: a run that looks clean because rules were
  // switched off says so here, every time, not only when it would otherwise
  // read as clean. BUGS TC-7 is the same class of lie in a different place.
  if (suppression.count > 0) {
    out.push(`  ${plural(suppression.count, 'finding')} suppressed (${suppression.keys.join(', ')})`);
  }

  if (alsoReached > 0) {
    out.push(
      `  ${plural(alsoReached, 'repeat')} of a line already listed, not counted again`
    );
  }

  const partial = perSite.filter((r) => r.mark.truncated);
  // One line for the whole run, not one note per call site. See Mark.platform.
  const platform = results.reduce((n, r) => n + r.mark.platform, 0);
  if (platform > 0) {
    out.push(`  ${plural(platform, 'call')} into the platform, not listed: the body is native`);
  }

  for (const { mark, findings } of perSite) {
    if (findings.length === 0 && !mark.truncated) continue;
    out.push(
      '',
      `  ${path.relative(cwd, mark.file) || mark.file}:${mark.line}  ${mark.name}()` +
        // Where "this function is hot" came from, when the tool decided it
        // rather than the author (BUGS TC-57).
        (mark.from ? ` — ${mark.from}` : '')
    );
    if (mark.truncated) {
      out.push(
        '    WALK TRUNCATED',
        '      the call tree exceeded the body limit, so part of it was never checked;',
        '      treat any silence from this function as unproven'
      );
    }
    for (const f of findings) {
      out.push(`    ${severity(f)}  ${f.rule}`);
      // The walk follows callees, so a finding is often not in the annotated
      // function at all. Saying where it is is the difference between a report
      // and a riddle.
      const from = reach.get(key(f)) ?? 1;
      const alsoFrom = from > 1 ? ` — reached by ${from} annotated functions` : '';
      if (f.file !== mark.file || f.line !== mark.line) {
        out.push(`      ${path.relative(cwd, f.file) || f.file}:${f.line}${alsoFrom}`);
      } else if (alsoFrom !== '') {
        out.push(`     ${alsoFrom}`);
      }
      out.push(`      ${f.message}`);
      out.push(`      fix: ${f.fix}`);
      // The sweep that priced the RULE, named — and no ratio. A ratio is a
      // property of the input: chained allocation is one number at n=1000 and
      // another at n=100000, and the annotation says this function is hot, not
      // how large its data is. Printing one here states a cost at a site whose
      // size and shape the tool cannot see, which is the whole of BUGS TC-9.
      // `EVIDENCE` still binds each rule to its measurement; only the print
      // site moved. The numbers are in README.md and in the file named here.
      if (f.evidence) {
        const data = f.evidence.source.match(/bench\/[a-z-]+\.jl/g) ?? [];
        if (data.length > 0) out.push(`      measured in ${data.join(' and ')}`);
      }
      for (const code of f.evidence?.defects ?? []) {
        out.push(`      known defect: ${code} — ${DEFECT[code] ?? code}`);
      }
    }
  }

  out.push(
    '',
    total === 0 && warnings === 0 && partial.length === 0
      ? `  every ${subject} is clean.`
      : total === 0 && partial.length > 0
      ? `  no findings, but ${plural(partial.length, 'walk')} truncated: this is not a clean run.`
      : total === 0
      ? `  no errors: ${plural(warnings, 'warning')}, and a warning prices no program\n` +
        '  this project measured, so it does not fail this run.'
      : '  No cost is printed beside a finding. Every rule is measured, and the\n' +
        '  measurements are in README.md and in the bench/*.jl named above — but a\n' +
        '  ratio is a property of the input, and being told a function is hot does\n' +
        '  not say how large its data is. Each rule also records where its own\n' +
        '  benchmark found nothing; README.md prints that beside the cost.'
  );
  return out.join('\n');
}
