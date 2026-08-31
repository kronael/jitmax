import path from 'node:path';
import { BUILTINS } from './builtins.ts';
import type { Mark } from './scan.ts';
import { DEFECT, type Finding } from './rules.ts';

// One spelling of the count-and-noun, because a hand-written plural beside a
// derived numeral is how `1 cells` reached a published sentence (BUGS TC-70).
export const plural = (n: number, s: string): string => `${n} ${s}${n === 1 ? '' : 's'}`;

// One spelling of a printed location, for the same reason. `path.relative`
// returns the EMPTY STRING when the two paths are equal, so a location that is
// the directory the run started in renders as `kernel (:12:5)` — and for an
// unmatched hot frame that line is the whole of what the run says it could not
// look at. Four sites rendered a location and this guard was on two of them
// (BUGS TC-100).
export const rel = (cwd: string, file: string): string => path.relative(cwd, file) || file;

// One finding per SITE. The same line reached from 28 annotated functions was
// 28 findings, so the headline counted the call-graph fan-in rather than the
// work: agent-twitter-client reported 118 errors over 12 distinct lines, and
// tsc 49 over 5. TC-51 read this as `closed-world`'s problem; it is how every
// finding was counted, and that rule only made it visible first because it
// fires most (BUGS TC-62). The finding is kept under the first annotated
// function that reaches it, and how many others do is printed.
//
// bin/jitmax.ts counts SUPPRESSED findings per site too, and the two counts
// only agree while one line spells what a site is.
export const findingKey = (f: Finding): string =>
  `${f.rule}|${f.file}|${f.line}|${f.column}`;

export interface Blind {
  // Modules the program could not resolve. Every type from one reads as `any`,
  // so every type-based rule is quiet on the files that import it — and quiet
  // is what this tool prints as clean. Named here so a run says what it could
  // not see (BUGS TC-51).
  unresolved: string[];
  // Hot frames from a profile that matched no function in this program, each
  // already rendered as `name (file:line:col)`. Measured time this run could
  // not look at, which is the unresolved-module problem with a different cause:
  // a total miss threw and a partial miss printed `clean` over it (BUGS TC-77).
  unmatched: string[];
  // The arithmetic behind that list, when the run was given a profile: how many
  // frames DID match a function here, and how many of the misses were ported
  // back through a source map before they were looked up. "N frames matched
  // nothing" reads the same for a stale profile and for a transformed one, and
  // the user of TC-77 was told the wrong one of the two; these say which.
  profile: { matched: number; ported: number };
  // Annotated declarations with no body anywhere in this program — an ambient
  // `declare function`, or an overload signature whose implementation is not
  // here. The walk had nothing to walk and reported nothing, which read as
  // clean (BUGS TC-124). An overload signature whose implementation IS here is
  // not in this list: scan() binds the mark to the implementation instead.
  bodyless: string[];
  // Calls whose callee resolved to nothing because the value it was read off
  // is typed `any`, each already rendered as `name (file:line:col)`. The same
  // `any` erasure as an unresolved module, from a declaration instead of a
  // missing package: nothing says whether `b.has(k)` is a Map builtin, the
  // platform or somebody's code, so the tool has no finding to make and no
  // right to call the run clean either (BUGS TC-129).
  untyped: string[];
}

// Could this run see everything it was asked to look at? ONE answer, because
// the two channels below are one question and were asked separately: an
// unresolved module reached the exit code and an unmatched hot frame did not,
// so a run that checked nothing over 75% of the measured time exited 0. The
// verdict line and bin/jitmax.ts's exit code both read this, and a further
// channel added to `Blind` reaches both by being added here — two have been
// since (BUGS TC-124, TC-129).
export const blinded = (b: Blind): boolean =>
  b.unresolved.length > 0 ||
  b.unmatched.length > 0 ||
  b.bodyless.length > 0 ||
  b.untyped.length > 0;

// The first eight, and how many were not printed. Both blindness channels
// print a list and both truncate it the same way.
const listed = (items: string[]): string =>
  items.slice(0, 8).join(', ') + (items.length > 8 ? `, and ${items.length - 8} more` : '');

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
  blind: Blind = {
    unresolved: [],
    unmatched: [],
    profile: { matched: 0, ported: 0 },
    bodyless: [],
    untyped: [],
  },
  // What the functions in this run are. An annotation is the author asserting
  // hotness; a profile is a measurement of it. The report says which.
  subject = 'annotated function'
): string {
  const out: string[] = [];
  // Counted first, then rendered, because the fan-in is printed ON the finding
  // and the last caller is not known until every mark has been walked. The
  // fan-in is kept rather than discarded: a line reached by 28 annotated
  // functions is a better fix than one reached by one.
  const reach = new Map<string, number>();
  for (const f of results.flatMap((r) => r.findings)) {
    reach.set(findingKey(f), (reach.get(findingKey(f)) ?? 0) + 1);
  }
  const shown = new Set<string>();
  const perSite = results.map(({ mark, findings }) => ({
    mark,
    findings: findings.filter((f) => {
      if (shown.has(findingKey(f))) return false;
      shown.add(findingKey(f));
      return true;
    }),
  }));
  const alsoReached = [...reach.values()].reduce((n, c) => n + (c - 1), 0);
  const all = perSite.flatMap((r) => r.findings);
  out.push(`jitmax — ${plural(results.length, subject)}, ${plural(all.length, 'error')}`);
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

  // Before the findings, because it changes what the findings are worth: a rule
  // that reads a type from an unresolved module read `any` and said nothing.
  if (blind.unresolved.length > 0) {
    // `npm install, then run again` named one of two causes and was the wrong
    // one for the run that filed this: the imports were a tsconfig `paths`
    // alias, and the user had to work that out unaided. A relative specifier
    // that resolves to nothing is a file that is not on disk; a bare one is a
    // package or an alias (BUGS TC-80).
    const relative = blind.unresolved.some((m) => m.startsWith('.') || m.startsWith('/'));
    const bare = blind.unresolved.some((m) => !m.startsWith('.') && !m.startsWith('/'));
    out.push(
      `  ${plural(blind.unresolved.length, 'module')} could not be resolved, so the types`,
      '  they declare read as `any` and every type-based rule is blind on the files',
      `  that import them: ${listed(blind.unresolved)}`
    );
    if (relative) out.push('  a relative specifier resolves to no file on disk: check the path.');
    if (bare) {
      out.push(
        '  a bare specifier comes from node_modules or from a `paths` alias: check',
        '  `npm install`, and check that this run read the tsconfig.json defining it.'
      );
    }
    out.push('  This is not a clean run.');
  }

  if (blind.unmatched.length > 0) {
    const missed = blind.unmatched.length;
    out.push(
      `  ${plural(blind.profile.matched, 'hot frame')} matched a function here; ${missed} did not, so`,
      `  measured time was not checked: ${listed(blind.unmatched)}`
    );
    // Which of the two causes it was, named. The whole of TC-77 is that this
    // said "stale" to somebody whose profile was minutes old: a frame with no
    // map behind it was never ported at all, and a transform between the source
    // and the profile explains that better than an edit to the source does.
    const unported = missed - blind.profile.ported;
    if (unported > 0) {
      const which = unported === missed ? 'any of those positions' : `${unported} of those positions`;
      out.push(
        `  no source map covers ${which}, so they could not be ported`,
        '  back to the source: a transform between your source and your profile — a build',
        '  step, or the --experimental-transform-types that one `enum` forces — moves every',
        '  position below it, and that fits a fresh profile better than a stale one.'
      );
    }
    if (blind.profile.ported > 0) {
      out.push(
        `  ${blind.profile.ported} of those positions came back through a source map, and no function`,
        '  begins where they land: that much of the profile is stale against this source.'
      );
    }
    out.push('  This is not a clean run.');
  }

  if (blind.bodyless.length > 0) {
    out.push(
      `  ${plural(blind.bodyless.length, 'annotation')} sits on a declaration with no body in`,
      '  this program, so nothing was checked there — an overload signature whose',
      `  implementation is elsewhere, or an ambient declaration: ${listed(blind.bodyless)}`,
      '  This is not a clean run.'
    );
  }

  if (blind.untyped.length > 0) {
    out.push(
      `  ${plural(blind.untyped.length, 'call')} read a method off a value typed \`any\`, so`,
      "  nothing resolved and the walk cannot tell a Map builtin from somebody's code:",
      `  ${listed(blind.untyped)}`,
      '  give the receiver a type and the call is checked like any other.',
      '  This is not a clean run.'
    );
  }

  const partial = perSite.filter((r) => r.mark.truncated);
  // One line for the whole run, not one note per call site. See Mark.platform.
  const platform = results.reduce((n, r) => n + r.mark.platform, 0);
  if (platform > 0) {
    out.push(`  ${plural(platform, 'call')} into the platform, not listed: the body is native`);
  }
  // Also once per run, and with the pin: "lowered" is a fact about one V8, and
  // stating it without the version would be a version-specific claim in a
  // general voice (BUGS TC-126). See Mark.lowered.
  const lowered = results.reduce((n, r) => n + r.mark.lowered, 0);
  if (lowered > 0) {
    out.push(
      `  ${plural(lowered, 'call')} lowered to inline code, not listed: no call ` +
        `boundary exists there (V8 ${BUILTINS.version} @ ${BUILTINS.revision.slice(0, 10)})`
    );
  }
  // Interface-typed calls whose receiver the dataflow walk traced to exactly
  // one implementation this program builds: followed, so the rules ran over
  // those bodies, and not reported (BUGS TC-69). The assumption is stated
  // where the claim is made — the enumeration sees only this program, so a
  // consumer handing in an implementation of its own is not counted.
  const followed = results.reduce((n, r) => n + r.mark.followed, 0);
  if (followed > 0) {
    out.push(
      `  ${plural(followed, 'interface call')} resolved to the one implementation this ` +
        'program builds, and followed — sound only for a closed program'
    );
  }

  for (const { mark, findings } of perSite) {
    if (findings.length === 0 && !mark.truncated) continue;
    out.push(
      '',
      `  ${rel(cwd, mark.file)}:${mark.line}  ${mark.name}()` +
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
      // Every finding is an error. The annotation is the filter: a function
      // marked `/** @jitmax */` is one somebody needs fast, so a finding
      // on it is actionable by definition and a second tier gates nobody. Three
      // rules fire on programs their own benchmarks did not measure — they say
      // so in the `known defect: TC-33` line below, and the way to quiet one is
      // the `[rules]` table or a `-rulename` on the annotation (BUGS TC-33).
      out.push(`    error  ${f.rule}`);
      // The walk follows callees, so a finding is often not in the annotated
      // function at all. Saying where it is is the difference between a report
      // and a riddle.
      const from = reach.get(findingKey(f)) ?? 1;
      const alsoFrom = from > 1 ? ` — reached by ${from} annotated functions` : '';
      if (f.file !== mark.file || f.line !== mark.line) {
        out.push(`      ${rel(cwd, f.file)}:${f.line}${alsoFrom}`);
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

  // A run with no findings is either clean or blind, and the branches below are
  // the second half of that: every one of them ends a run that found nothing and
  // could not see everything, which is never a pass.
  // Nothing to check is not a clean bill of health. Pointed at a repo that
  // carries no annotation at all, the tool printed `every annotated function is
  // clean` and exited 0 — the first thing a new user sees, and it passes a gate
  // having read nothing. The mis-slotted `.cpuprofile` case in bin/jitmax.ts
  // already had its own guard against this exact sentence; this is the general
  // form of it (BUGS TC-131).
  const nothingChecked = results.length === 0;
  const clean = !nothingChecked && all.length === 0 && partial.length === 0 && !blinded(blind);
  out.push(
    '',
    nothingChecked
      ? `  no ${subject} here — nothing was checked, so this is not a clean run.`
      : clean
      ? `  every ${subject} is clean.`
      : all.length === 0 && blind.unresolved.length > 0
      ? '  no findings, but the types above were unreadable: this is not a clean run.'
      : all.length === 0 && blind.unmatched.length > 0
      ? '  no findings, but the hot frames above matched nothing here: this is not a clean run.'
      : all.length === 0 && blind.bodyless.length > 0
      ? '  no findings, but the annotations above have no body here: this is not a clean run.'
      : all.length === 0 && blind.untyped.length > 0
      ? '  no findings, but the receivers above are `any`: this is not a clean run.'
      : all.length === 0 && partial.length > 0
      ? `  no findings, but ${plural(partial.length, 'walk')} truncated: this is not a clean run.`
      : '  No cost is printed beside a finding. Every rule is measured, and the\n' +
        '  measurements are in README.md and in the bench/*.jl named above — but a\n' +
        '  ratio is a property of the input, and being told a function is hot does\n' +
        '  not say how large its data is. Each rule also records where its own\n' +
        '  benchmark found nothing; README.md prints that beside the cost.'
  );
  if (nothingChecked) {
    out.push(
      subject === 'annotated function'
        ? '  add `/** @jitmax */` above one hot function, then run this command again.'
        : '  confirm the workload reached this code, or lower `[profile] min_self_pct`.'
    );
  }
  return out.join('\n');
}
