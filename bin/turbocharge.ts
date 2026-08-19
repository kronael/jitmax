#!/usr/bin/env node
import path from 'node:path';

import { load, program } from '../lib/ts.ts';
import { scan } from '../lib/scan.ts';
import { check, resolveDisabled } from '../lib/rules.ts';
import { render } from '../lib/report.ts';
import { loadConfig } from '../lib/config.ts';

try {
  const cwd = process.cwd();
  const ts = load(cwd);
  // Every argument is positional. There are no flags, so an argument that
  // LOOKS like one was a mistake — and this line used to drop it silently, so
  // `turbocharge --config=cfg.toml src` scanned src with the config never
  // loaded and exited 0. A configuration that was never read is the same
  // silent lie `loadConfig` and `resolveDisabled` throw on everywhere else.
  const argv = process.argv.slice(2);
  const flag = argv.find((a) => a.startsWith('-'));
  if (flag !== undefined) {
    throw new Error(
      `${flag}: turbocharge takes no options. Usage: turbocharge [config.toml] [path…]`
    );
  }
  const args = argv;

  // `turbocharge turbocharge.toml src` — the config is the first positional,
  // named by its .toml suffix, and optional: `turbocharge src` still works,
  // and behaves exactly as it did before configuration existed.
  const configPath = args[0]?.endsWith('.toml') ? args[0] : undefined;
  const inputs = configPath ? args.slice(1) : args;
  const configDisabled = configPath ? loadConfig(configPath).disabled : new Set<string>();
  // Validated up front so a typo fails loudly even when it never happens to
  // match a finding — an unknown key that disabled nothing would be the same
  // silent lie in a quieter place.
  resolveDisabled(configDisabled);

  const p = program(ts, cwd, inputs);
  // A file that does not parse yields a garbage AST, every type-based rule
  // goes quiet on it, and the run reported `every annotated function is clean`
  // and exited 0 — a gate reads that as a pass. Same class as TC-7 and TC-17:
  // the tool must never call a run clean when it could not read the code.
  // Syntax only: a type error is somebody's build problem and not evidence
  // that this tool could not look.
  const broken = p.getSyntacticDiagnostics();
  if (broken.length > 0) {
    const where = [...new Set(broken.map((d) => d.file?.fileName ?? '<unknown>'))];
    throw new Error(
      `${broken.length} syntax error${broken.length > 1 ? 's' : ''} — nothing here was ` +
        `checked: ${where.map((f) => path.relative(cwd, f) || f).join(', ')}`
    );
  }
  const { checker, marks } = scan(ts, p);

  const allKeys = new Set(configDisabled);
  for (const mark of marks) for (const key of mark.disabled) allKeys.add(key);

  let suppressed = 0;
  const results = marks.map((mark) => {
    const disabled = resolveDisabled([...configDisabled, ...mark.disabled]);
    const raw = check(ts, checker, mark);
    const findings = raw.filter((f) => !disabled.has(f.rule));
    suppressed += raw.length - findings.length;
    return { mark, findings };
  });

  const out = render(cwd, results, { count: suppressed, keys: [...allKeys].sort() });
  process.stdout.write(out + '\n');
  // A truncated walk exits 1 as a finding does. It is not a clean run — part of
  // the call tree was never checked, so silence from it is unproven — and `1`
  // already means "turbocharge has something to report". A fourth code would be
  // a new contract for every gate that reads this one (BUGS TC-17).
  process.exitCode = results.some((r) => r.findings.length > 0 || r.mark.truncated) ? 1 : 0;
} catch (err) {
  process.stderr.write(`turbocharge: ${(err as Error).message}\n`);
  process.exitCode = 2;
}
