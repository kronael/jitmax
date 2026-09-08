#!/usr/bin/env bun
// Bun can run Git-installed source without trusting dependency build scripts.
import { existsSync } from 'node:fs';

// Clones use source; installed builds also support explicit Node invocation.
const installed = import.meta.url.includes('/node_modules/');
const compiled = new URL('../dist/bin/jitmax.js', import.meta.url);
const source = new URL('./jitmax.ts', import.meta.url);
const entry = installed && existsSync(compiled) ? compiled : source;
try {
  await import(entry.href);
} catch (err) {
  // Loader failure must not share the findings exit code.
  process.stderr.write(`jitmax: cannot load ${entry.href}: ${err.message}\n`);
  process.exitCode = 2;
}
