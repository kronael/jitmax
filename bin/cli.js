#!/usr/bin/env node
// The one JavaScript file in this package, and the reason it exists is not
// obvious. `bin/jitmax.ts` cannot be the `bin` entry: Node refuses to strip
// types from any file under node_modules, so every installed copy died at
// startup with ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING (BUGS TC-72).
// npm's `prepare` compiles dist/ into every packed and every git-installed
// copy, so an install has JavaScript to run. A clone runs the TypeScript
// directly, which is what keeps development build-free -- and it is also the
// path bun takes when it skips `prepare`, since bun reads TypeScript anywhere.
import { existsSync } from 'node:fs';

// INSIDE node_modules the compiled copy is the only thing Node can load, so it
// wins there. OUTSIDE it -- a clone -- the TypeScript is the truth and dist/ is
// not consulted at all, even when it exists. `npm install` in a clone runs
// `prepare`, so a clone CAN hold a dist/, and preferring it would give this
// repo two entry points that drift: the tests reading the source while the
// binary ran yesterday's build.
const installed = import.meta.url.includes('/node_modules/');
const compiled = new URL('../dist/bin/jitmax.js', import.meta.url);
const source = new URL('./jitmax.ts', import.meta.url);
const entry = installed && existsSync(compiled) ? compiled : source;
try {
  await import(entry.href);
} catch (err) {
  // Exit 2 is this tool's "the tool failed". Left to Node an unhandled
  // rejection exits 1, which is the code that means "jitmax has findings" --
  // a gate reads only the number, so the wrong one is a lie.
  process.stderr.write(`jitmax: cannot load ${entry.href}: ${err.message}\n`);
  process.exitCode = 2;
}
