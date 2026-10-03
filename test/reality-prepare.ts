// The reality gate checks these eight roots in pristine pinned radash source.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { load } from '../lib/ts.ts';
import type { Ts } from '../lib/ts.ts';

const ROOTS = new Map([
  ['src/array.ts', ['group', 'sort', 'counting', 'objectify', 'select']],
  ['src/object.ts', ['mapValues', 'invert', 'assign']],
]);

export function annotateRoots(ts: Ts, files: Map<string, string>): void {
  for (const [file, names] of ROOTS) {
    const text = files.get(file);
    if (text === undefined) throw new Error(`missing reality source ${file}`);
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const inserts: number[] = [];
    for (const name of names) {
      const statements = sf.statements.filter((statement) =>
        ts.isVariableStatement(statement) && statement.declarationList.declarations.some((decl) =>
          ts.isIdentifier(decl.name) && decl.name.text === name &&
          decl.initializer !== undefined && ts.isArrowFunction(decl.initializer)));
      if (statements.length !== 1) {
        throw new Error(`reality root ${name} in ${file}: expected one declaration, found ${statements.length}`);
      }
      inserts.push(statements[0]!.getStart(sf));
    }
    let annotated = text;
    for (const pos of inserts.sort((a, b) => b - a)) {
      annotated = annotated.slice(0, pos) + '/** @jitmax */\n' + annotated.slice(pos);
    }
    files.set(file, annotated);
  }
}

function prepare(checkout: string, revision: string): void {
  function git(args: string[]): string {
    const result = spawnSync('git', ['-C', checkout, ...args], { encoding: 'utf8' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr.trim() || 'cannot read radash Git source');
    return result.stdout;
  }
  const actual = git(['rev-parse', 'HEAD']).trim();
  if (actual !== revision) throw new Error(`radash revision ${actual}; expected ${revision}`);
  // Preserve the upstream package boundary for NodeNext relative imports.
  const paths = git(['ls-tree', '-r', '--name-only', revision, '--', 'src', 'tsconfig.json', 'package.json'])
    .trim().split('\n').filter(Boolean);
  const files = new Map(paths.map((file) => [file, git(['show', `${revision}:${file}`])]));
  annotateRoots(load(path.join(import.meta.dirname, '..')), files);
  fs.mkdirSync('tmp', { recursive: true });
  const dest = fs.mkdtempSync(path.resolve('tmp/reality-'));
  for (const [file, text] of files) {
    const target = path.join(dest, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  }
  fs.writeFileSync('tmp/reality-path', dest + '\n');
  process.stdout.write(`reality: prepared 8 roots from radash ${revision}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const checkout = process.argv[2];
    const revision = process.argv[3];
    if (!checkout || !revision) throw new Error('usage: reality-prepare.ts <checkout> <pinned revision>');
    prepare(checkout, revision);
  } catch (error) {
    process.stderr.write(`reality: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
