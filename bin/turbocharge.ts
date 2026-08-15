#!/usr/bin/env node
import { load, program } from '../lib/ts.ts';
import { scan } from '../lib/scan.ts';
import { check, resolveDisabled } from '../lib/rules.ts';
import { render } from '../lib/report.ts';
import { loadConfig } from '../lib/config.ts';

try {
  const cwd = process.cwd();
  const ts = load(cwd);
  const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));

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
  process.exitCode = results.some((r) => r.findings.length > 0) ? 1 : 0;
} catch (err) {
  process.stderr.write(`turbocharge: ${(err as Error).message}\n`);
  process.exitCode = 2;
}
