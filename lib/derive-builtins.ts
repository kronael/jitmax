// The lowered-builtin list, derived from the pinned V8 checkout. Run it to
// regenerate `lib/builtins.ts`:
//
//   make builtins        (or `make build`, which also re-derives the numbers)
//
// `v8src/src/compiler/js-call-reducer.cc` carries a `case Builtin::k<Name>`
// for every builtin TurboFan lowers to inline code. That list answers exactly
// one question — is there a real call into C++ or Torque at this site — and it
// must not be written by hand: a hand-written performance list is what TC-50
// charges oxlint and Biome with shipping, and the hand-written `PRIMITIVES`
// set in scan.ts was this project's own copy of the same mistake (BUGS TC-70).
//
// The list is version-specific. It is derived at the pin README.md's ```pin
// block names — the same pin `bench/v8-check.ts` verifies citations against —
// and the pin is recorded in the artifact so every claim made from the list
// can say which V8 it is a fact about. `make test` fails when the committed
// artifact and the pinned source disagree; this tool only regenerates.
//
//   node lib/derive-builtins.ts --write          regenerate lib/builtins.ts
//   node lib/derive-builtins.ts --against-head   derive from whatever v8src/
//        has checked out — the weekly drift workflow points it at V8 main —
//        and exit 1 listing what left or entered the list since the artifact

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REDUCER = 'src/compiler/js-call-reducer.cc';

// README's ```pin block, the one source of the pinned revision and version.
// `bench/v8-check.ts` imports this rather than reading the block the same way
// with its own regex, its own key list and its own message, which is what it
// did: the block is the source of truth and one reader is what makes that so.
export function pin(root: string): { revision: string; version: string } {
  const doc = fs.readFileSync(path.join(root, 'README.md'), 'utf8').split('\n');
  const start = doc.findIndex((l) => l.trim() === '```pin');
  if (start === -1) throw new Error('README.md has no ```pin block; nothing pins the derivation');
  const found: Record<string, string> = {};
  for (let i = start + 1; i < doc.length && doc[i]!.trim() !== '```'; i++) {
    const m = /^(\w+)\s*=\s*(\S+)$/.exec(doc[i]!.trim());
    if (m) found[m[1]!] = m[2]!;
  }
  for (const k of ['revision', 'version']) {
    if (!found[k]) throw new Error(`README.md's pin block has no ${k}`);
  }
  return { revision: found['revision']!, version: found['version']! };
}

// Every distinct `case Builtin::k<Name>` label, sorted. Zero matches is a
// parse failure, not an empty list: the file has carried these cases since
// TurboFan existed, so finding none means the shape changed and this
// extraction is reading nothing — which must never pass as a result.
export function loweredCases(source: string): string[] {
  const names = new Set<string>();
  for (const m of source.matchAll(/case Builtin::k([A-Za-z0-9_]+)\s*:/g)) names.add(m[1]!);
  if (names.size === 0) {
    throw new Error(`no \`case Builtin::k…\` labels found — ${REDUCER} no longer looks like itself`);
  }
  return [...names].sort();
}

// The lowered subset that has a JS spelling a textual match can recognise:
// `Math.max`, `Number.isNaN`, `Reflect.get`. A prototype method has no
// spelling of its own at a call site — `xs.sort()` names the receiver, not the
// builtin — and the two bare globals (GlobalIsFinite, GlobalIsNaN) stay out
// because a one-token identifier is shadowed by any local of the same name,
// and a shadowed match would skip a body the walk should have entered.
//
// The rules here SELECT from the derived list; they can never add to it. When
// a re-derivation drops a name, its spelling drops out of `statics` with it.
const STATIC_FORM: Record<string, string> = {
  ArrayIsArray: 'Array.isArray',
  ArrayBufferIsView: 'ArrayBuffer.isView',
  BigIntAsIntN: 'BigInt.asIntN',
  BigIntAsUintN: 'BigInt.asUintN',
  DateNow: 'Date.now',
  ObjectCreate: 'Object.create',
  ObjectIs: 'Object.is',
  // The trampoline is the builtin installed at `Promise.resolve`; the suffix
  // is V8's, not part of any JS name.
  PromiseResolveTrampoline: 'Promise.resolve',
  ReflectApply: 'Reflect.apply',
  ReflectConstruct: 'Reflect.construct',
  ReflectGet: 'Reflect.get',
  ReflectHas: 'Reflect.has',
  StringFromCharCode: 'String.fromCharCode',
  StringFromCodePoint: 'String.fromCodePoint',
};

const lcFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

export function staticForms(lowered: string[]): string[] {
  const texts: string[] = [];
  for (const name of lowered) {
    // Every Math.* builtin is a static method and the enum name is the JS name
    // in caps; the same holds for Number's `is*`/`parse*` family.
    const math = /^Math([A-Z]\w*)$/.exec(name);
    const num = /^Number((?:Is|Parse)[A-Z]\w*)$/.exec(name);
    if (math) texts.push(`Math.${lcFirst(math[1]!)}`);
    else if (num) texts.push(`Number.${lcFirst(num[1]!)}`);
    else if (STATIC_FORM[name]) texts.push(STATIC_FORM[name]);
  }
  return texts.sort();
}

export interface Builtins {
  version: string;
  revision: string;
  lowered: readonly string[];
  statics: readonly string[];
}

// Derive from the checkout at the pin, refusing a checkout that is not at the
// pin — the same guard `bench/v8-check.ts` runs, for the same reason: a list
// read from the wrong revision would be recorded as a fact about the pin.
// The pinned checkout, or a loud refusal — the clone instructions and the
// head-versus-pin guard, both of which bench/v8-check.ts had its own copy of,
// down to the wording. `atHead` skips only the guard: the drift workflow points
// v8src/ at V8's main to ask what moved, and a drifted line is that run's
// answer rather than its failure to start. Never the default — a run without
// the guard reads the wrong source and calls it good.
export function v8Checkout(
  root: string,
  atHead = false
): { v8root: string; head: string; pin: { revision: string; version: string } } {
  const v8root = path.join(root, 'v8src');
  const p = pin(root);
  if (!fs.existsSync(v8root)) {
    throw new Error(
      'v8src/ is missing, so nothing here can be checked against V8.\n' +
        '  git clone --filter=blob:none --sparse https://github.com/v8/v8 v8src\n' +
        '  git -C v8src sparse-checkout set src include\n' +
        `  git -C v8src checkout ${p.revision}`
    );
  }
  const head = execFileSync('git', ['-C', v8root, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  if (!atHead && head !== p.revision) {
    throw new Error(`v8src/ is at ${head.slice(0, 10)}, the pin says ${p.revision.slice(0, 10)}`);
  }
  return { v8root, head, pin: p };
}

export function deriveBuiltins(root: string, atHead = false): Builtins {
  const { v8root, head, pin: p } = v8Checkout(root, atHead);
  const file = path.join(v8root, REDUCER);
  if (!fs.existsSync(file)) throw new Error(`${REDUCER} does not exist in this checkout`);
  const lowered = loweredCases(fs.readFileSync(file, 'utf8'));
  return {
    version: atHead ? `HEAD (pin is ${p.version})` : p.version,
    revision: head,
    lowered,
    statics: staticForms(lowered),
  };
}

const list = (names: readonly string[], indent: string): string => {
  const lines: string[] = [];
  let line = '';
  for (const n of names) {
    const q = `'${n}',`;
    if (line !== '' && line.length + 1 + q.length > 98 - indent.length) {
      lines.push(indent + line);
      line = q;
    } else {
      line = line === '' ? q : `${line} ${q}`;
    }
  }
  if (line !== '') lines.push(indent + line);
  return lines.join('\n');
};

export function generate(root: string): string {
  const b = deriveBuiltins(root);
  return [
    '// GENERATED by `make builtins` from v8src/src/compiler/js-call-reducer.cc.',
    '// Do not edit by hand: lib/derive-builtins.ts holds the extraction, and',
    '// `make test` fails when this file and the pinned V8 source disagree.',
    '//',
    '// One name per `case Builtin::k<Name>` in that file — every builtin TurboFan',
    '// lowers to inline code. The list says one thing only: at these callees there',
    '// is no call boundary at all. It is NOT a fast-versus-slow classifier —',
    '// Array.prototype.sort is lowered and is still O(n log n) with a comparator',
    '// call per comparison (BUGS TC-70).',
    '',
    'export const BUILTINS: {',
    '  version: string;',
    '  revision: string;',
    '  lowered: readonly string[];',
    '  statics: readonly string[];',
    '} = {',
    '  // The V8 this list is a fact about. The list is version-specific, so every',
    '  // claim made from it names this pin (BUGS TC-70).',
    `  version: '${b.version}',`,
    `  revision: '${b.revision}',`,
    '  lowered: [',
    list(b.lowered, '    '),
    '  ],',
    '  // The lowered subset with a static JS spelling — the only form a textual',
    '  // match can recognise. See staticForms() in lib/derive-builtins.ts.',
    '  statics: [',
    list(b.statics, '    '),
    '  ],',
    '};',
    '',
  ].join('\n');
}

// Run as a script, not imported — see the note on the same guard in
// lib/derive.ts.
const script = process.argv[1] === import.meta.filename;

if (script && process.argv[2] === '--write') {
  const root = path.join(import.meta.dirname, '..');
  const b = deriveBuiltins(root);
  fs.writeFileSync(path.join(root, 'lib', 'builtins.ts'), generate(root));
  process.stdout.write(
    `builtins: ${b.lowered.length} lowered, ${b.statics.length} static forms -> ` +
      `lib/builtins.ts (V8 ${b.version} @ ${b.revision.slice(0, 10)})\n`
  );
} else if (script && process.argv[2] === '--against-head') {
  const root = path.join(import.meta.dirname, '..');
  const fresh = deriveBuiltins(root, true);
  const { BUILTINS } = await import('./builtins.ts');
  const gone = BUILTINS.lowered.filter((n) => !fresh.lowered.includes(n));
  const added = fresh.lowered.filter((n) => !BUILTINS.lowered.includes(n));
  if (gone.length === 0 && added.length === 0) {
    process.stdout.write(
      `builtins: no drift — ${fresh.lowered.length} lowered at ${fresh.revision.slice(0, 10)}, ` +
        `same set as the artifact @ ${BUILTINS.revision.slice(0, 10)}\n`
    );
  } else {
    process.stdout.write(
      `builtins: drift against ${fresh.revision.slice(0, 10)} ` +
        `(artifact @ ${BUILTINS.revision.slice(0, 10)})\n`
    );
    for (const n of gone) process.stdout.write(`  no longer lowered: ${n}\n`);
    for (const n of added) process.stdout.write(`  newly lowered: ${n}\n`);
    process.stdout.write(
      '\nV8 moved. Re-read the new source before re-pinning; the artifact changes only\n' +
      'with its pin (`make build` after moving the pin in README.md).\n'
    );
    process.exit(1);
  }
}
