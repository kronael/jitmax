// Verify every V8 citation in README.md against the checkout in v8src/, so the
// second kind of evidence rots as loudly as the first.
//   node bench/v8-check.js
//
// README's table is the source of truth. A citation is `src/path:line` followed
// by `→ token`, and the check is that the token is still on that line at the
// pinned revision. A citation whose token has moved is printed with the line V8
// has there now, and the run fails.
//
// v8src/ is gitignored, 96 MB, and not everyone has it. That is exactly why
// this exits 2 when it is missing rather than reporting success: a check that
// passes when it cannot look is the failure this project exists to prevent.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.join(import.meta.dirname, '..');
const docPath = path.join(root, 'README.md');
const v8root = path.join(root, 'v8src');

const doc = fs.readFileSync(docPath, 'utf8').split('\n');

const fail = (msg) => {
  process.stdout.write(`${msg}\n`);
  process.exit(2);
};

const pin = {};
{
  const start = doc.findIndex((l) => l.trim() === '```pin');
  if (start === -1) fail('README.md has no ```pin block; nothing to pin the citations to');
  for (let i = start + 1; i < doc.length && doc[i].trim() !== '```'; i++) {
    const m = /^(\w+)\s*=\s*(\S+)$/.exec(doc[i].trim());
    if (m) pin[m[1]] = m[2];
  }
}
for (const k of ['revision', 'version']) {
  if (!pin[k]) fail(`README.md's pin block has no ${k}`);
}

if (!fs.existsSync(v8root)) {
  fail(
    `v8-check: v8src/ is missing, so the citations cannot be checked.\n` +
      `  git clone --filter=blob:none --sparse https://github.com/v8/v8 v8src\n` +
      `  git -C v8src sparse-checkout set src include\n` +
      `  git -C v8src checkout ${pin.revision}`
  );
}

// The pin is a claim about which V8 the line numbers refer to. Check it, or
// every citation below is verified against the wrong source.
{
  const head = execFileSync('git', ['-C', v8root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (head !== pin.revision) {
    fail(`v8-check: v8src/ is at ${head.slice(0, 10)}, the pin says ${pin.revision.slice(0, 10)}`);
  }
}

// `src/ic/ic.cc:798` → `number_of_maps`
const CITATION = /`(src\/[^`:]+):(\d+)`\s*(?:→|->)\s*`([^`]+)`/g;

const cache = new Map();
const linesOf = (rel) => {
  if (!cache.has(rel)) {
    const p = path.join(v8root, rel);
    if (!fs.existsSync(p)) fail(`v8-check: ${rel} does not exist at the pinned revision`);
    cache.set(rel, fs.readFileSync(p, 'utf8').split('\n'));
  }
  return cache.get(rel);
};

let checked = 0;
const drifted = [];
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

if (!checked) fail('v8-check: README.md contains no citations; the table is the source of truth');

if (drifted.length) {
  process.stdout.write(`v8-check: ${drifted.length} of ${checked} citations drifted\n`);
  for (const d of drifted) process.stdout.write(`  ${d}\n`);
  process.stdout.write('\nRe-read the new source and correct the citation, never the other way round.\n');
  process.exit(1);
}

process.stdout.write(
  `v8-check: ${checked} citations match V8 ${pin.version} @ ${pin.revision.slice(0, 10)}\n`
);
