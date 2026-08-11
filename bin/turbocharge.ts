#!/usr/bin/env node
import { load, program } from '../lib/ts.ts';
import { scan } from '../lib/scan.ts';
import { check } from '../lib/rules.ts';
import { render } from '../lib/report.ts';

try {
  const cwd = process.cwd();
  const ts = load(cwd);
  const p = program(ts, cwd, process.argv.slice(2).filter((a) => !a.startsWith('-')));
  const { checker, marks } = scan(ts, p);
  const results = marks.map((mark) => ({ mark, findings: check(ts, checker, mark) }));

  process.stdout.write(render(cwd, results) + '\n');
  process.exitCode = results.some((r) => r.findings.length > 0) ? 1 : 0;
} catch (err) {
  process.stderr.write(`turbocharge: ${(err as Error).message}\n`);
  process.exitCode = 2;
}
