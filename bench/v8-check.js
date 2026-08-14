// Verify every V8 citation in docs/v8-evidence.md against the checkout in
// v8src/, so the second kind of evidence rots as loudly as the first.
//   node bench/v8-check.js
//
// The document is the source of truth. A citation is a line that starts with
// `path:line` and is followed by a fenced block; the block must be the file's
// lines, verbatim, starting at that line. A quoted line that no longer matches
// is printed with both versions and the run fails.
//
// v8src/ is gitignored, 96 MB, and not everyone has it. That is exactly why
// this exits 2 when it is missing rather than reporting success: a check that
// passes when it cannot look is the failure this project exists to prevent.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.join(import.meta.dirname, '..');
const docPath = path.join(root, 'docs/v8-evidence.md');
const v8root = path.join(root, 'v8src');

const doc = fs.readFileSync(docPath, 'utf8').split('\n');

const fail = (msg) => {
  process.stdout.write(`${msg}\n`);
  process.exit(2);
};

// --- the pin -------------------------------------------------------------

const pin = {};
{
  const start = doc.findIndex((l) => l.trim() === '```pin');
  if (start === -1) fail('docs/v8-evidence.md has no ```pin block; nothing to pin the citations to');
  for (let i = start + 1; i < doc.length && doc[i].trim() !== '```'; i++) {
    const m = /^(\w+)\s*=\s*(\S+)$/.exec(doc[i].trim());
    if (m) pin[m[1]] = m[2];
  }
}
for (const k of ['revision', 'version']) {
  if (!pin[k]) fail(`the pin block has no ${k}`);
}

if (!fs.existsSync(v8root)) {
  fail(
    `v8src/ is absent, so no citation in docs/v8-evidence.md can be checked.\n` +
      `  It is a gitignored sparse checkout of github.com/v8/v8 (src and include).\n` +
      `  git clone --filter=blob:none --sparse https://github.com/v8/v8 v8src\n` +
      `  git -C v8src sparse-checkout set src include\n` +
      `  git -C v8src checkout ${pin.revision}`
  );
}

// --- the checkout is the pinned one --------------------------------------

let head;
try {
  head = execFileSync('git', ['-C', v8root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
} catch (e) {
  fail(`v8src/ has no readable git metadata, so the pin cannot be confirmed: ${e.message}`);
}
if (head !== pin.revision) {
  fail(
    `v8src/ is at ${head}\n` +
      `  the citations were read at ${pin.revision}\n` +
      `  every line below would be checked against the wrong tree, so nothing was checked`
  );
}

{
  const v = fs.readFileSync(path.join(v8root, 'include/v8-version.h'), 'utf8');
  const num = (name) => {
    const m = new RegExp(`#define ${name} (\\d+)`).exec(v);
    if (!m) fail(`include/v8-version.h has no ${name}`);
    return m[1];
  };
  const version = [
    num('V8_MAJOR_VERSION'),
    num('V8_MINOR_VERSION'),
    num('V8_BUILD_NUMBER'),
    num('V8_PATCH_LEVEL'),
  ].join('.');
  if (version !== pin.version) {
    fail(`v8src/ is V8 ${version}, the pin says ${pin.version}`);
  }
}

// --- every rule has a section --------------------------------------------

const rulesSrc = fs.readFileSync(path.join(root, 'lib/rules.ts'), 'utf8');
const evidenceBlock = rulesSrc.slice(
  rulesSrc.indexOf('export const EVIDENCE'),
  rulesSrc.indexOf('type Add =')
);
const rules = [...evidenceBlock.matchAll(/^ {2}'([a-z-]+)': \{$/gm)].map((m) => m[1]);
if (rules.length === 0) fail('could not read any rule name out of lib/rules.ts');

const sections = doc.filter((l) => l.startsWith('## ')).map((l) => l.slice(3).trim());
const missing = rules.filter((r) => !sections.some((s) => s.startsWith(`\`${r}\``)));
if (missing.length > 0) {
  fail(
    `docs/v8-evidence.md has no section for: ${missing.join(', ')}\n` +
      `  every shipped rule owes one, even when the answer is that V8's source is silent`
  );
}

// --- every citation still says what it said -------------------------------

const cite = /^`((?:src|include)\/[^`:\s]+):(\d+)`/;
const files = new Map();
const lines = (rel) => {
  if (!files.has(rel)) {
    const p = path.join(v8root, rel);
    if (!fs.existsSync(p)) fail(`cited file does not exist in the checkout: ${rel}`);
    files.set(rel, fs.readFileSync(p, 'utf8').split('\n'));
  }
  return files.get(rel);
};

let checked = 0;
let drifted = 0;
for (let i = 0; i < doc.length; i++) {
  const m = cite.exec(doc[i]);
  if (!m) continue;
  let j = i + 1;
  while (j < doc.length && doc[j].trim() === '') j++;
  if (j >= doc.length || !doc[j].startsWith('```')) {
    fail(`${docPath}:${i + 1}: citation ${m[1]}:${m[2]} quotes nothing`);
  }
  const [rel, start] = [m[1], Number(m[2])];
  const src = lines(rel);
  for (let k = j + 1; k < doc.length && !doc[k].startsWith('```'); k++) {
    const want = doc[k];
    const got = src[start + (k - j - 1) - 1];
    checked++;
    if (got !== want) {
      drifted++;
      process.stdout.write(
        `DRIFTED ${rel}:${start + (k - j - 1)}  (docs/v8-evidence.md:${k + 1})\n` +
          `  doc: ${JSON.stringify(want)}\n` +
          `  v8:  ${JSON.stringify(got ?? '<past end of file>')}\n`
      );
    }
  }
  i = j;
}

if (drifted > 0) {
  process.stdout.write(
    `\n${drifted} of ${checked} quoted lines no longer match V8 ${pin.version}.\n` +
      'Re-read the file and correct the citation; do not adjust the pin to make this pass.\n'
  );
  process.exit(1);
}

process.stdout.write(
  `v8-check: ${checked} quoted lines across ${files.size} files match ` +
    `V8 ${pin.version} @ ${pin.revision.slice(0, 10)}, ${rules.length} rules documented\n`
);
