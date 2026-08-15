// Annotate a checkout the way a user would, by a stated rule rather than by
// taste: every function that is not nested inside another function, and whose
// body contains a loop or an array-iteration call, gets `/** @turbocharge */`.
// No function is picked to make a rule fire and none is picked to keep one
// quiet.
//
// The rule was narrower twice and both narrowings were unfair across libraries.
// Exported-only saw 8 of remeda's ~200 functions, because remeda exports a
// `purry` wrapper and keeps the looping implementation unexported. Top-level
// declarations only saw 32 of ramda's ~250, because ramda writes every function
// as an argument to `_curry2`. What the rule has to be about is the code, not
// about the shape a library wraps it in.
//
// This is how each example in this directory was found. Nothing here was
// searched for; it is what came back.
//
//   git clone --depth 1 https://github.com/toss/es-toolkit tmp/lib-estoolkit
//   node examples/annotate.js tmp/lib-estoolkit/src
//   node bin/turbocharge.ts tmp/lib-estoolkit/src
//
// Rewrites the checkout in place. Prints how many functions it marked. The
// comment is inserted inline, immediately before the declaration, so line
// numbers in the checkout stay the ones the pristine file has.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ts = createRequire(import.meta.url)('typescript');

const root = path.resolve(process.argv[2]);
const ITER = new Set(['map', 'filter', 'reduce', 'reduceRight', 'forEach', 'flatMap', 'some', 'every', 'find', 'findIndex', 'sort']);

function files(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', '__tests__', 'tests', 'test'].includes(e.name)) continue;
      out.push(...files(p));
    } else if (/\.(ts|js|mjs)$/.test(e.name) && !/\.(test|test-d|test-prop|spec|bench|tests)\.(ts|js|mjs)$/.test(e.name) && !/\.d\.ts$/.test(e.name) && !/^(rollup|jest|vite|eslint|babel)\./.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

// A test file, decided by what it CALLS rather than what it is named. The
// dotted patterns above miss date-fns, which writes `src/<name>/index.ts` with
// `src/<name>/test.ts` beside it: the first date-fns survey annotated 18 such
// files and reported 46 functions where the library has 28, and eleven
// `allocating-select` findings where the library has four. Naming is not enough
// to separate them either — ramda's `source/test.js` is `R.test`, a function
// the survey has to keep. What separates them is that one of the two calls a
// test framework by name.
const TESTCALL = /\b(?:describe|it|test)\s*\(\s*["'`]/;

const isFn = (ts, n) =>
  ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) ||
  ts.isMethodDeclaration(n);

function loops(node) {
  let found = false;
  const visit = (n) => {
    if (found) return;
    if (
      ts.isForStatement(n) || ts.isForOfStatement(n) || ts.isForInStatement(n) ||
      ts.isWhileStatement(n) || ts.isDoStatement(n)
    ) { found = true; return; }
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ITER.has(n.expression.name.text)) {
      found = true; return;
    }
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(node, visit);
  return found;
}

let marked = 0;
let touched = 0;
for (const f of files(root)) {
  const text = fs.readFileSync(f, 'utf8');
  if (TESTCALL.test(text)) continue;
  const sf = ts.createSourceFile(f, text, ts.ScriptTarget.ES2022, true);
  const inserts = [];
  // Outermost functions only: once a function is marked, turbocharge walks its
  // whole call tree, so marking a function inside it would report the same body
  // twice. Descend past a marked one instead of into it.
  const outer = (n) => {
    if (isFn(ts, n)) {
      if (n.body && loops(n.body)) {
        // The tag has to attach to the declaration a reader sees: for
        // `const f = () => {}` that is the statement, not the arrow.
        let target = n;
        while (
          target.parent &&
          (ts.isVariableDeclaration(target.parent) ||
            ts.isVariableDeclarationList(target.parent) ||
            ts.isVariableStatement(target.parent))
        ) {
          target = target.parent;
        }
        inserts.push(target.getStart(sf));
      }
      return;
    }
    ts.forEachChild(n, outer);
  };
  ts.forEachChild(sf, outer);
  const unique = [...new Set(inserts)];
  if (unique.length === 0) continue;
  // Inline, immediately before the declaration. Inserting a whole line above it
  // duplicated everything to the left of a function that begins mid-line —
  // ramda writes every one of them as an argument to _curry2 — and the
  // corrupted files then parsed as 32 marks instead of 100.
  let out = text;
  for (const pos of unique.sort((a, b) => b - a)) {
    out = out.slice(0, pos) + '/** @turbocharge */ ' + out.slice(pos);
  }
  fs.writeFileSync(f, out);
  marked += unique.length;
  touched++;
}
process.stdout.write(`annotated ${marked} functions in ${touched} files under ${root}\n`);
