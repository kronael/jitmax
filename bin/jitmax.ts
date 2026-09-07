#!/usr/bin/env node
import path from 'node:path';

import { aliasedBy, load, program, tsconfigOf } from '../lib/ts.ts';
import { marksFromProfile, scan } from '../lib/scan.ts';
import { hotFrames } from '../lib/profile.ts';
import { check, resolveDisabled } from '../lib/rules.ts';
import { blinded, findingKey, plural, rel, render, type Blind } from '../lib/report.ts';
import { DEFAULT_MIN_SELF_PCT, loadConfig } from '../lib/config.ts';

function main() {
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    process.stdout.write(`jitmax — check hot TypeScript functions and their callees

Usage: jitmax [config.toml] [run.cpuprofile] [path…]

Examples:
  jitmax src/hot.ts          Check annotated functions in one file
  jitmax src                 Check annotated functions in a directory
  jitmax rules.toml src      Apply rule settings from a TOML file
  jitmax run.cpuprofile src  Select hot functions from a CPU profile
  jitmax                    Use the tsconfig file list

Mark a hot function: /** @jitmax */
A profile selects functions with at least ${DEFAULT_MIN_SELF_PCT}% sampled self time by default.
Record one: node --cpu-prof --cpu-prof-name=run.cpuprofile workload.js
Set [profile] min_self_pct in a TOML file to change the threshold.

Run from your project root. Compiler options come from tsconfig.json found
from the working directory upward. Paths choose files, not compiler options.
With neither paths nor a tsconfig, scan sources under the working directory.
One .toml and one .cpuprofile are allowed, in any argument position.

Suppress a rule for one function and its callees:
  /** @jitmax -megamorphic-elements */
Or pass a TOML file:
  [rules]
  "megamorphic-elements" = false

Options: -h, --help  Show this help and exit; other arguments are ignored.
Exit codes: 0 checked and clean; 1 findings or incomplete coverage;
            2 the tool failed (input, configuration, or syntax error).
`);
    return;
  }
  const flag = args.find((a) => a.startsWith('-'));
  if (flag !== undefined) {
    throw new Error(
      `Unknown option: ${flag}. Pass config and profile files as positional ` +
        'arguments. Run jitmax --help for usage and examples.'
    );
  }
  const cwd = process.cwd();
  const ts = load(cwd);

  // The suffixes that are not paths, in one list. They were spelled once as two
  // `only()` calls and once as a negated filter below, so a third recognised
  // suffix reaches one of the two and is scanned as a source file.
  const SUFFIXES = ['.toml', '.cpuprofile'];

  const only = (suffix: string): string | undefined => {
    const hits = args.filter((a) => a.endsWith(suffix));
    if (hits.length > 1) {
      throw new Error(`jitmax takes one ${suffix} argument, got ${hits.length}: ${hits.join(', ')}`);
    }
    return hits[0];
  };
  const configPath = only('.toml');
  const profilePath = only('.cpuprofile');
  const inputs = args.filter((a) => !SUFFIXES.some((suffix) => a.endsWith(suffix)));
  const config = configPath ? loadConfig(configPath) : undefined;
  // A [profile] table with no profile to apply it to configured nothing, and
  // said nothing about it — the same silence loadConfig() throws on for a
  // misspelled table.
  if (config?.minSelfPct !== undefined && profilePath === undefined) {
    throw new Error(
      `${configPath}: [profile] min_self_pct applies only to a run given a ` +
        '.cpuprofile, and this run was given none'
    );
  }
  const configDisabled = config?.disabled ?? new Set<string>();
  // Validated up front so a typo fails loudly even when it never happens to
  // match a finding — an unknown key that disabled nothing would be the same
  // silent lie in a quieter place.
  resolveDisabled(configDisabled);

  const configFile = tsconfigOf(ts, cwd);
  const p = program(ts, cwd, inputs);
  // A file that does not parse yields a garbage AST, every type-based rule
  // goes quiet on it, and the run reported `every annotated function is clean`
  // and exited 0 — a gate reads that as a pass. Same class as TC-7 and TC-17:
  // the tool must never call a run clean when it could not read the code.
  // Syntax only: a type error is somebody's build problem and not evidence
  // that this tool could not look.
  const broken = p.getSyntacticDiagnostics();
  if (broken.length > 0) {
    const details = broken.map((d) => {
      let at = d.file ? rel(cwd, d.file.fileName) : '<unknown>';
      if (d.file && d.start !== undefined) {
        const pos = d.file.getLineAndCharacterOfPosition(d.start);
        at += `:${pos.line + 1}:${pos.character + 1}`;
      }
      return `  ${at}: TS${d.code}: ` +
        ts.flattenDiagnosticMessageText(d.messageText, '\n  ');
    });
    throw new Error(
      `${plural(broken.length, 'syntax error')} — nothing here was ` +
        `checked. Fix these errors and run jitmax again:\n${details.join('\n')}`
    );
  }
  // Hotness comes from the profile or from the annotation, never from a guess
  // about loops and fan-in: hotness is a property of the workload, which is the
  // sentence printed under every run of this tool.
  let fromProfile: string | undefined;
  let unmatched: string[] = [];
  let profileCounts = { matched: 0, ported: 0 };
  let given;
  if (profilePath !== undefined) {
    const minSelfPct = config?.minSelfPct ?? DEFAULT_MIN_SELF_PCT;
    const hot = hotFrames(profilePath, minSelfPct);
    const found = marksFromProfile(ts, p, hot, path.basename(profilePath));
    // A frame that matched nothing is measured time this run could not look at,
    // which is what `unresolved` already means for modules — so it goes through
    // the same channel: named above the findings, and exit 1. It used to be two
    // different failures on one axis. All of them missing threw exit 2 blaming
    // a stale profile, a cause the tool never checked; three of four missing
    // printed `clean` and exited 0 over 75% of the measured time, with the
    // caveat below the verdict where nothing reads it (BUGS TC-77).
    // A ported frame is rendered at BOTH ends: the position that was looked up
    // is the author's, and the one the reader will find in their profile is the
    // transformed one. Naming only the first would have the run report a
    // position nothing in the profile contains.
    unmatched = found.unmatched.map((f) => {
      const at = `${rel(cwd, f.file)}:${f.line}:${f.column}`;
      const from = f.generated;
      return `${f.name} (${at}${from ? ` <- ${rel(cwd, from.file)}:${from.line}:${from.column}` : ''})`;
    });
    profileCounts = {
      matched: hot.length - found.unmatched.length,
      ported: found.unmatched.filter((f) => f.generated !== undefined).length,
    };
    given = found.marks;
    fromProfile =
      `  ${plural(found.marks.length, 'hot function')} from ` +
      `${path.basename(profilePath)} at or above ${minSelfPct}% self time`;
  }
  const { checker, marks, unresolved, bodyless, untyped } = scan(ts, p, given);

  const allKeys = new Set(configDisabled);
  for (const mark of marks) for (const key of mark.disabled) allKeys.add(key);

  // Counted per SITE, like the findings it sits beside. Counting per mark made
  // one disabled line reached from three annotated functions read as "3
  // findings suppressed" — the call-graph fan-in that BUGS TC-62 removed from
  // the error and warning counts, left behind in the line under them.
  const suppressedSites = new Set<string>();
  const results = marks.map((mark) => {
    const disabled = resolveDisabled([...configDisabled, ...mark.disabled]);
    const raw = check(ts, checker, mark);
    const findings = raw.filter((f) => !disabled.has(f.rule));
    for (const f of raw) {
      if (disabled.has(f.rule)) suppressedSites.add(findingKey(f));
    }
    return { mark, findings };
  });

  // Formatted here, like `unmatched` above and for the same reason: scan()
  // knows the absolute path and only this file knows what it is relative to.
  const blind: Blind = {
    unresolved,
    unmatched,
    profile: profileCounts,
    bodyless: bodyless.map((b) => `${b.name} (${rel(cwd, b.file)}:${b.line}:${b.column})`),
    untyped: untyped.map((u) => `${u.name} (${rel(cwd, u.file)}:${u.line}:${u.column})`),
    // Which config was in force, and which of the unresolved specifiers it
    // declares an alias for. Without both, a bare specifier that did not
    // resolve reads as a missing package and the report says `npm install` to
    // somebody whose dependencies are fine (BUGS TC-80).
    tsconfig: configFile === undefined ? undefined : rel(cwd, configFile),
    aliased: unresolved.filter((m) => aliasedBy(p.getCompilerOptions().paths, m)),
    // The config governing the files the caller POINTED at, when it is not the
    // one this run read. `findConfigFile` searches up from the working
    // directory and never from the path argument, so `jitmax ../other/src`
    // compiles ../other under THIS directory's options and every alias in it
    // goes unresolved (BUGS TC-76).
    nearer: [
      ...new Set(
        inputs
          .map((input) => path.resolve(cwd, input))
          .map((abs) => tsconfigOf(ts, ts.sys.directoryExists(abs) ? abs : path.dirname(abs)))
          .filter((found): found is string => found !== undefined && found !== configFile)
          .map((found) => rel(cwd, found))
      ),
    ],
  };
  const out = render(
    cwd,
    results,
    { count: suppressedSites.size, keys: [...allKeys].sort() },
    blind,
    fromProfile === undefined ? 'annotated function' : 'hot function'
  );
  process.stdout.write(out + '\n');
  if (fromProfile !== undefined) process.stdout.write(fromProfile + '\n');
  // A truncated walk exits 1 as a finding does. It is not a clean run — part of
  // the call tree was never checked, so silence from it is unproven — and `1`
  // already means "jitmax has something to report". A fourth code would be
  // a new contract for every gate that reads this one (BUGS TC-17).
  //
  // So does every finding, whichever rule made it. Three rules warned and
  // exited 0 until 2026-08-31, because no benchmark measures the program they
  // fire on — 98.6% of the 22-codebase survey, decided out of the exit code on
  // that argument. The annotation is the filter: a finding on a function
  // somebody marked as hot is actionable by definition, and a user who
  // disagrees with a rule switches it off in the `[rules]` table or with a
  // `-rulename` on the annotation. The unmeasured trigger is still stated —
  // `known defect: TC-33`, under every one of those findings (BUGS TC-33).
  // An unresolved module exits 1 for the same reason a truncated walk does: the
  // rules were blind on those files and silence from them proves nothing. The
  // text says so too, so the two still agree (BUGS TC-51). An unmatched hot
  // frame is that same blindness, measured (BUGS TC-77), and a method read off
  // an `any` value is that blindness inside one call (BUGS TC-129).
  // `results.length === 0` is here for the same reason blinded() is: the run
  // checked nothing, and a gate reads only this number. The report says so too,
  // and the two have to agree (BUGS TC-131).
  process.exitCode =
    results.length === 0 ||
    blinded(blind) ||
    results.some((r) => r.findings.length > 0 || r.mark.truncated)
      ? 1
      : 0;
}

try {
  main();
} catch (err) {
  process.stderr.write(`jitmax: ${(err as Error).message}\n`);
  process.exitCode = 2;
}
