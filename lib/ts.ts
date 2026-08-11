import { createRequire } from 'node:module';
import path from 'node:path';
// Types statically, the value dynamically: type-only imports are erased, so
// this carries no runtime dependency on our own copy of TypeScript.
import type * as TS from 'typescript';

export type Ts = typeof import('typescript');

// Prefer the TypeScript the project already has, so turbocharge sees the same
// parse and the same types the project's own build sees.
export function load(cwd: string): Ts {
  for (const from of [path.join(cwd, 'index.js'), import.meta.url]) {
    try {
      return createRequire(from)('typescript') as Ts;
    } catch {}
  }
  throw new Error(
    'turbocharge needs the "typescript" package. Install it in this project:\n' +
      '  npm install --save-dev typescript'
  );
}

// A Program gives us the type checker. Without a tsconfig we still build one,
// over whatever sources the caller named, with checking relaxed: turbocharge
// reports its own findings, never the project's type errors.
export function program(ts: Ts, cwd: string, inputs: string[]): TS.Program {
  const configPath = ts.findConfigFile(cwd, ts.sys.fileExists, 'tsconfig.json');
  if (configPath && inputs.length === 0) {
    const read = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(
      read.config ?? {},
      ts.sys,
      path.dirname(configPath)
    );
    return ts.createProgram(parsed.fileNames, parsed.options);
  }

  const files: string[] = [];
  for (const root of inputs.length ? inputs : [cwd]) {
    const abs = path.resolve(cwd, root);
    if (ts.sys.directoryExists(abs)) {
      files.push(...ts.sys.readDirectory(abs, ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs']));
    } else if (ts.sys.fileExists(abs)) {
      files.push(abs);
    } else {
      // A path that is not there must not read as a clean run. Silence on a
      // typo is the one failure mode a CI gate cannot have.
      throw new Error(`no such file or directory: ${root}`);
    }
  }
  if (files.length === 0) throw new Error(`no source files found in: ${inputs.join(', ')}`);
  return ts.createProgram(
    files.filter((f) => !f.includes('node_modules')),
    {
      allowJs: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      noEmit: true,
    }
  );
}
