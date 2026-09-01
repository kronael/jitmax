// Verify every V8 citation in bench/README.md against the checkout in v8src/, so the
// second kind of evidence rots as loudly as the first.
//   node bench/v8-check.ts
//
// That file's table is the source of truth. A citation is `src/path:line` followed
// by `→ token`, and the check is that the token is still on that line at the
// pinned revision. A citation whose token has moved is printed with the line V8
// has there now, and the run fails.
//
// v8src/ is gitignored, 96 MB, and not everyone has it. That is exactly why
// this exits 2 when it is missing rather than reporting success: a check that
// passes when it cannot look is the failure this project exists to prevent.

import fs from 'node:fs';
import path from 'node:path';
// The pin block and the pinned checkout, read from ONE place. This file read
// the block with its own regex and its own key list, and carried its own copy
// of the clone instructions and the head-versus-pin guard, all of which
// lib/derive-builtins.ts also had: two readers of one source of truth.
import { v8Checkout } from '../lib/derive-builtins.ts';

const root = path.join(import.meta.dirname, '..');
const docPath = path.join(root, 'bench', 'README.md');

const doc = fs.readFileSync(docPath, 'utf8').split('\n');

const fail = (msg: string): never => {
  process.stdout.write(`${msg}\n`);
  process.exit(2);
};

const againstHead = process.argv.includes('--against-head');
const { v8root, head, pin } = ((): ReturnType<typeof v8Checkout> => {
  try {
    return v8Checkout(root, againstHead);
  } catch (err) {
    return fail(`v8-check: ${(err as Error).message}`);
  }
})();

// `src/ic/ic.cc:798` → `number_of_maps`
const CITATION = /`(src\/[^`:]+):(\d+)`\s*(?:→|->)\s*`([^`]+)`/g;

const cache = new Map<string, string[]>();
const linesOf = (rel: string): string[] => {
  if (!cache.has(rel)) {
    const p = path.join(v8root, rel);
    if (!fs.existsSync(p)) fail(`v8-check: ${rel} does not exist at the pinned revision`);
    cache.set(rel, fs.readFileSync(p, 'utf8').split('\n'));
  }
  return cache.get(rel)!;
};

let checked = 0;
const drifted: string[] = [];
for (const line of doc) {
  for (const [, rel, lineNo, token] of line.matchAll(CITATION)) {
    const src = linesOf(rel);
    const n = Number(lineNo);
    const got = src[n - 1];
    checked++;
    if (got === undefined) {
      drifted.push(`${rel}:${n} → ${token}\n    the file has only ${src.length} lines`);
    } else if (!got.includes(token)) {
      drifted.push(`${rel}:${n} → ${token}\n    V8 has: ${got.trim()}`);
    }
  }
}

if (!checked)
  fail('v8-check: bench/README.md contains no citations; the table is the source of truth');

if (drifted.length) {
  process.stdout.write(`v8-check: ${drifted.length} of ${checked} citations drifted\n`);
  for (const d of drifted) process.stdout.write(`  ${d}\n`);
  process.stdout.write('\nRe-read the new source and correct the citation, never the other way round.\n');
  process.exit(1);
}

process.stdout.write(
  againstHead
    ? `v8-check: ${checked} citations still match at ${head.slice(0, 10)} ` +
      `(the pin is ${pin.revision.slice(0, 10)})\n`
    : `v8-check: ${checked} citations match V8 ${pin.version} @ ${pin.revision.slice(0, 10)}\n`
);
