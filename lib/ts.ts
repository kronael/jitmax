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
    let ts: Ts;
    try {
      ts = createRequire(from)('typescript') as Ts;
    } catch {
      continue;
    }
    // A version string is a hypothesis about what a resolved package
    // provides; `sys` itself is the fact. TypeScript 7 dropped it, and every
    // call below reads from it (tsconfigOf, program) — so a bad resolve used
    // to succeed here and crash later, deep in a call the caller never sees
    // (BUGS TC-144).
    if (ts.sys == null) {
      throw new Error(
        `jitmax needs TypeScript >=5.0.0 <6, and the "typescript" package ` +
          `resolved here is ${ts.version}, which has no "sys" host. Install a ` +
          'supported version in this project:\n' +
          '  npm install --save-dev typescript@^5.9'
      );
    }
    return ts;
  }
  throw new Error(
    'jitmax needs the "typescript" package. Install it in this project:\n' +
      '  npm install --save-dev typescript'
  );
}

// Which tsconfig.json a run started in `cwd` reads, in one spelling. program()
// takes its options from it, and the report names it when an import did not
// resolve: a bare specifier is a missing package or an alias, and the reader
// cannot tell which without knowing what config was in force (BUGS TC-80).
export const tsconfigOf = (ts: Ts, cwd: string): string | undefined =>
  ts.findConfigFile(cwd, ts.sys.fileExists, 'tsconfig.json');

// Found the way tsconfig.json is, and the way other linters find theirs: from
// the working directory upward, the nearest one wins.
export const jitmaxTomlOf = (ts: Ts, cwd: string): string | undefined =>
  ts.findConfigFile(cwd, ts.sys.fileExists, 'jitmax.toml');

// Does a bare specifier match a `paths` entry? A TypeScript pattern holds at
// most one `*`, and a specifier matches when the text either side of it does.
// The answer separates the two causes of an unresolved bare import: a declared
// alias whose target is not on disk is not fixed by installing anything.
export function aliasedBy(paths: TS.MapLike<string[]> | undefined, spec: string): boolean {
  for (const pattern of Object.keys(paths ?? {})) {
    const star = pattern.indexOf('*');
    if (star === -1) {
      if (pattern === spec) return true;
      continue;
    }
    const head = pattern.slice(0, star);
    const tail = pattern.slice(star + 1);
    if (spec.length >= head.length + tail.length && spec.startsWith(head) && spec.endsWith(tail)) {
      return true;
    }
  }
  return false;
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
  const configPath = tsconfigOf(ts, cwd);
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
    // Explicit paths replace only the config's file selection, not its options.
    const errors = parsed.errors.filter((d) =>
      inputs.length === 0 || (d.code !== 18002 && d.code !== 18003)
    );
    if (errors.length > 0) {
      const details = errors.map((d) =>
        `TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`
      );
      throw new Error(`${configPath}: ${details.join('\n')} — nothing here was checked`);
    }
  }
  // The same two options the path run adds below, or the two invocations do
  // not agree: this line passed `parsed.options` alone, so a tsconfig that left
  // `allowJs` unset had its `.js` helpers read on `jitmax .` and reported
  // unresolved on `jitmax` — "check the path", about a file that is on disk.
  if (parsed && inputs.length === 0) {
    return ts.createProgram(parsed.fileNames, { ...parsed.options, allowJs: true, noEmit: true });
  }

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
  //
  // These three apply ONLY when no tsconfig was found, and they used to sit
  // under the spread unconditionally, which reads as a default and is not one:
  // every option the project left UNSET kept the tool's. A tsconfig that does
  // not name `moduleResolution` — the common case, and the one TypeScript has
  // its own default for — got NodeNext for a run given a path and its own
  // default for a bare run, so the two invocations resolved the same project
  // differently and one of them reported an alias unresolved. A path argument
  // chooses the file LIST, and nothing else (BUGS TC-32, TC-76).
  const fallback = parsed
    ? {}
    : {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
      };
  return ts.createProgram(files, { ...fallback, ...parsed?.options, allowJs: true, noEmit: true });
}
