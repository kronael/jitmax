import { createRequire } from 'node:module';
import path from 'node:path';
// Types statically, the value dynamically: type-only imports are erased, so
// this carries no runtime dependency on our own copy of TypeScript.
import type * as TS from 'typescript';

export type Ts = typeof import('typescript');

// Prefer the TypeScript the project already has, so jitmax sees the same
// parse and the same types the project's own build sees.
export function load(cwd: string): Ts {
  for (const from of [path.join(cwd, 'index.js'), import.meta.url]) {
    try {
      return createRequire(from)('typescript') as Ts;
    } catch {}
  }
  throw new Error(
    'jitmax needs the "typescript" package. Install it in this project:\n' +
      '  npm install --save-dev typescript'
  );
}

// A Program gives us the type checker. Without a tsconfig we still build one,
// over whatever sources the caller named, with checking relaxed: jitmax
// reports its own findings, never the project's type errors.
//
// The project's tsconfig.json decides the OPTIONS every time it exists. A path
// argument chooses the file LIST and nothing else. Before this, naming a path
// skipped the tsconfig entirely and fell back to hardcoded NodeNext, which
// knows nothing of `paths` or `bundler` — so `jitmax src` reported every
// aliased import as unresolved and exited 1 where bare `jitmax` exited 0. The
// documented invocation was the degraded one (BUGS TC-76).
export function program(ts: Ts, cwd: string, inputs: string[]): TS.Program {
  const configPath = ts.findConfigFile(cwd, ts.sys.fileExists, 'tsconfig.json');
  // A tsconfig that does not read or does not parse fails the run. `.config ??
  // {}` dropped `.error`, so a truncated `tsconfig.json` silently produced
  // DEFAULT compiler options — a different program from the one the caller
  // named — and the tool printed "every annotated function is clean" at exit 0
  // over it. bin/jitmax.ts already holds source syntax to this gate; the
  // options that decide how the source is read deserve the same one
  // (BUGS TC-114).
  let parsed: TS.ParsedCommandLine | undefined;
  if (configPath) {
    const read = ts.readConfigFile(configPath, ts.sys.readFile);
    if (read.error) {
      throw new Error(
        `${configPath}: ${ts.flattenDiagnosticMessageText(read.error.messageText, ' ')}` +
          ' — nothing here was checked'
      );
    }
    parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(configPath));
  }
  if (parsed && inputs.length === 0) return ts.createProgram(parsed.fileNames, parsed.options);

  // Every extension the tool reads. `.cjs` and `.jsx` were missing, so those
  // files were skipped without a word and a directory of them reported `every
  // annotated function is clean` at exit 0 (BUGS TC-84).
  const EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.jsx'];
  const files: string[] = [];
  for (const root of inputs.length ? inputs : [cwd]) {
    const abs = path.resolve(cwd, root);
    if (ts.sys.directoryExists(abs)) {
      // The walk skips dependencies the caller did not name; a root that is
      // itself inside node_modules WAS named — a dependency you can read is a
      // dependency you can check (scan.ts) — so only the path below the named
      // root can exclude a file. The filter used to run on the whole path,
      // after the emptiness guard, so `jitmax node_modules/dep` dropped every
      // file it had just collected and reported clean at exit 0 (BUGS TC-84).
      files.push(
        ...ts.sys
          .readDirectory(abs, EXTENSIONS)
          .filter((f) => !path.relative(abs, f).includes('node_modules'))
      );
    } else if (ts.sys.fileExists(abs)) {
      files.push(abs);
    } else {
      // A path that is not there must not read as a clean run. Silence on a
      // typo is the one failure mode a CI gate cannot have.
      throw new Error(`no such file or directory: ${root}`);
    }
  }
  if (files.length === 0) throw new Error(`no source files found in: ${inputs.join(', ')}`);
  // allowJs and noEmit are this tool's, not the project's: it reads .js as
  // readily as .ts and never writes. Everything else — `paths`, the resolution
  // mode, the lib set — comes from the project so the walk resolves what the
  // project's own build resolves.
  return ts.createProgram(files, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    ...parsed?.options,
    allowJs: true,
    noEmit: true,
  });
}
