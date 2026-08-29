import { builtinModules } from 'node:module';
import type * as TS from 'typescript';
import type { Ts } from './ts.ts';
import type { HotFrame } from './profile.ts';
import { BUILTINS } from './builtins.ts';

// Calls that TurboFan lowers to inline machine code: there is no call boundary
// at these sites at all, so reaching one is not a hole in the promise. The set
// is derived from the pinned V8's js-call-reducer.cc by `make builtins`, never
// written by hand — a hand-written list here was this project's own copy of
// the mistake TC-50 charges the incumbents with (BUGS TC-70). These sites are
// counted on `Mark.lowered` so the report can say the claim's V8 version.
const PRIMITIVES = new Set<string>(BUILTINS.statics);

// Node's own module names. `node:*` and the bare names in
// `module.builtinModules` are reserved by Node's resolver, so a specifier of
// this shape is the platform no matter what is or is not installed.
const NODE_BUILTINS = new Set(builtinModules);
const isNodeSpecifier = (spec: string): boolean =>
  spec.startsWith('node:') || NODE_BUILTINS.has(spec);

export interface Site {
  file: string;
  line: number;
  column: number;
}

export interface Call extends Site {
  text: string;
  // The callee resolves to an interface member declared in this program's own
  // source — `Fp.mul` where `Fp` is an interface-typed value. The body exists
  // in the checkout and the walk cannot pick which one, which is a third cause
  // behind this rule and a different one from a missing `npm install` (TC-51)
  // or a native builtin (TC-55). It is the worst of the three, because the
  // pattern it punishes is good design: @noble/curves abstracts its field
  // arithmetic behind an interface and gets 2,113 notes for it (BUGS TC-69).
  viaInterface: boolean;
}

export interface Body {
  node: TS.SignatureDeclaration;
  sf: TS.SourceFile;
  name: string;
}

export interface Mark extends Site {
  name: string;
  node: TS.SignatureDeclaration;
  sf: TS.SourceFile;
  // The annotated function first, then every callee we could follow into. This
  // is the closed world: njit compiles the whole call tree, so the rules run
  // over the whole call tree.
  reached: Body[];
  escapes: Call[];
  // Calls into the platform — Node's own API, typed by `@types/node`. They are
  // counted and not listed: the body is native, so it will never be readable
  // and "inline what you need from `path.join`" is advice nobody can take. A
  // run over 67 files printed 157 such notes and no action (BUGS TC-55). An
  // unresolved callee in somebody's package is still listed, because that one
  // is a body a reader can go and look at.
  platform: number;
  // Calls to builtins TurboFan lowers to inline code — no call boundary exists
  // at these sites, which is a stronger statement than `platform`'s "the body
  // is native" and a version-specific one: the set is derived from the pinned
  // V8, so the report names that pin whenever this count is not zero
  // (BUGS TC-70).
  lowered: number;
  // True when the walk refused a callee because `reached` was full at
  // MAX_BODIES — not merely when it ended there. A partial walk that reports no
  // findings is not a clean function, and saying "clean" there would be a lie.
  truncated: boolean;
  // Raw `-key` tokens from the `@jitmax` tag's own comment, e.g.
  // `@jitmax -boxed-elements -TC-15`. Unresolved: rules.ts's
  // resolveDisabled() turns these into rule names and validates them.
  disabled: string[];
  // Where the assertion "this function is hot" came from. Absent for an
  // annotation: the author asserted it by writing the tag. Present for a
  // profile-driven mark, and printed, because a hotness claim the tool made for
  // itself has to say what it rests on (BUGS TC-57).
  from?: string;
}

// Termination. The visited set already handles cycles; this bounds a call
// graph that fans out faster than it repeats.
const MAX_BODIES = 200;

function isFunctionLike(ts: Ts, n: TS.Node): n is TS.SignatureDeclaration {
  return (
    ts.isFunctionDeclaration(n) ||
    ts.isFunctionExpression(n) ||
    ts.isArrowFunction(n) ||
    ts.isMethodDeclaration(n) ||
    // A constructor is a body like any other, and allocation is what
    // constructors do — which is the rule `allocating-select` is about
    // (BUGS TC-10).
    ts.isConstructorDeclaration(n)
  );
}

// Arrow functions and function expressions carry no name of their own; the
// name a reader recognises sits on the declaration that holds them.
function nameOf(ts: Ts, node: TS.SignatureDeclaration): string {
  if (node.name && ts.isIdentifier(node.name)) return node.name.text;
  const p = node.parent;
  if (p && (ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p)) && ts.isIdentifier(p.name)) {
    return p.name.text;
  }
  return '<anonymous>';
}

export function at(sf: TS.SourceFile, node: TS.Node): Site {
  const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  return { file: sf.fileName, line: line + 1, column: character + 1 };
}

function findMarks(ts: Ts, program: TS.Program): Mark[] {
  const marks: Mark[] = [];
  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile || sf.fileName.includes('node_modules')) continue;
    const visit = (node: TS.Node): void => {
      if (isFunctionLike(ts, node)) {
        const tags = ts.getJSDocTags(node).filter((t) => t.tagName.escapedText === 'jitmax');
        if (tags.length > 0) {
          marks.push({
            ...at(sf, node),
            name: nameOf(ts, node),
            node,
            sf,
            reached: [],
            escapes: [],
            platform: 0,
            truncated: false,
            disabled: disabledKeys(ts, tags),
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sf, visit);
  }
  return marks;
}

// The same marks, from a measured profile instead of an annotation. The
// annotation and the profile assert exactly the same thing — that this function
// is hot — so everything downstream is untouched: reach(), check() and render()
// cannot tell the two apart, and a profile-driven finding gates as an annotated
// one does.
//
// A frame that matches no function-like node is returned rather than dropped:
// it usually means the profile is stale against edited source, and a mode that
// silently checked nothing would be the lie this project throws on everywhere
// else.
export function marksFromProfile(
  ts: Ts,
  program: TS.Program,
  hot: HotFrame[],
  source: string
): { marks: Mark[]; unmatched: HotFrame[] } {
  const nodes = new Map<string, { node: TS.SignatureDeclaration; sf: TS.SourceFile }>();
  const put = (k: string, v: { node: TS.SignatureDeclaration; sf: TS.SourceFile }): void => {
    if (!nodes.has(k)) nodes.set(k, v);
  };
  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile || sf.fileName.includes('node_modules')) continue;
    const visit = (node: TS.Node): void => {
      if (isFunctionLike(ts, node)) {
        const site = at(sf, node);
        put(`${site.file}:${site.line}:${site.column}`, { node, sf });
        // V8 reports a function's position as its parameter list's `(`, not the
        // `function` keyword — `export function kernel(` puts the frame 22
        // columns right of where the node starts. An arrow's two positions
        // coincide, which is why half the frames matched before this line.
        const paren = sf.getLineAndCharacterOfPosition(node.parameters.pos - 1);
        put(`${sf.fileName}:${paren.line + 1}:${paren.character + 1}`, { node, sf });
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sf, visit);
  }

  const marks: Mark[] = [];
  const unmatched: HotFrame[] = [];
  const seen = new Set<TS.Node>();
  for (const frame of hot) {
    const hit = nodes.get(`${frame.file}:${frame.line}:${frame.column}`);
    if (!hit) {
      unmatched.push(frame);
      continue;
    }
    if (seen.has(hit.node)) continue;
    seen.add(hit.node);
    marks.push({
      ...at(hit.sf, hit.node),
      name: nameOf(ts, hit.node),
      node: hit.node,
      sf: hit.sf,
      reached: [],
      escapes: [],
      platform: 0,
      truncated: false,
      disabled: [],
      from: `${frame.pct.toFixed(1)}% of samples, ${source}`,
    });
  }
  return { marks, unmatched };
}

// `-key` tokens in the promise's own tag: `@jitmax -boxed-elements -TC-15`
// disables those rules for this function and everything its walk reaches.
// Unrecognized text that is not a `-key` token is prose, not a directive, and
// stays out of the list.
function disabledKeys(ts: Ts, tags: TS.JSDocTag[]): string[] {
  const keys: string[] = [];
  for (const tag of tags) {
    const text = ts.getTextOfJSDocComment(tag.comment) ?? '';
    for (const token of text.split(/\s+/)) {
      // A key, not any token starting with a dash. `-` had to be followed by a
      // NAME: `/** @jitmax -- benchmarked 2026-01 */` produced the key `-`,
      // which resolveDisabled rejects, so a comment in the tag crashed the tool
      // with exit 2. Prose in the tag is prose.
      if (/^-[A-Za-z][\w-]*$/.test(token)) keys.push(token.slice(1));
    }
  }
  return keys;
}

// `seen` bounds the recursion, not the loop below it. `export const g: any = h`
// beside `export const h: any = g` walked g to h to g forever and the tool died
// with "Maximum call stack size exceeded", exit 2, on legal source.
function targetsOf(
  ts: Ts,
  checker: TS.TypeChecker,
  callee: TS.Expression,
  seen: Set<TS.Node> = new Set()
): TS.Node[] {
  if (seen.has(callee)) return [];
  seen.add(callee);
  let sym = checker.getSymbolAtLocation(callee);
  if (sym && sym.flags & ts.SymbolFlags.Alias) {
    try {
      sym = checker.getAliasedSymbol(sym);
    } catch {}
  }
  const decls: TS.Node[] = [...(sym?.getDeclarations() ?? [])];

  // `const f = () => …` and `const g = f` both resolve to a VariableDeclaration,
  // not to the function the annotation sits on. Follow the initializer, or the
  // call is reported as leaving the annotated world when it never left.
  for (let i = 0; i < decls.length && i < 8; i++) {
    const d = decls[i];
    if (!d || !ts.isVariableDeclaration(d) || !d.initializer) continue;
    const init = d.initializer;
    if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) decls.push(init);
    else if (ts.isIdentifier(init)) decls.push(...targetsOf(ts, checker, init, seen));
  }
  return decls;
}

// A callee we can follow: any function with a real body, wherever it lives.
// njit compiles through library code as well and raises only where it cannot
// compile at all, so the edge is the absence of source, not the name of the
// directory the source sits in. A dependency you can read is a dependency you
// can check, and its cost lands in your run either way.
function followable(ts: Ts, d: TS.Node): d is TS.SignatureDeclaration {
  if (!isFunctionLike(ts, d)) return false;
  if (!(d as TS.FunctionLikeDeclaration).body) return false;
  const sf = d.getSourceFile();
  return Boolean(sf) && !sf.isDeclarationFile;
}

// The annotated region is the whole call tree, not one function: a helper
// three calls down runs in the same loop and pays the same costs. V8 already
// optimizes all of it — the rules look for the patterns that stop it. The walk
// ends only where the source does, and that edge is worth reporting.
function reach(
  ts: Ts,
  program: TS.Program,
  checker: TS.TypeChecker,
  root: Mark
): { reached: Body[]; escapes: Call[]; platform: number; truncated: boolean } {
  // Where the promise really stops: a callee that exists only as a type. A
  // typed dependency resolves to its .d.ts, so we have its signature and not
  // one line of its body. The platform's own lib.*.d.ts is excluded — those
  // are the builtins V8 implements, not somebody's unchecked code.
  const unreadable = (d: TS.Node): boolean => {
    const sf = d.getSourceFile();
    return Boolean(sf) && sf.isDeclarationFile && !program.isSourceFileDefaultLibrary(sf);
  };
  // `lib.*.d.ts` is already excluded above. `@types/node` is the other half of
  // the same platform: native code that no `npm install` and no rewrite makes
  // readable (BUGS TC-55).
  const isPlatform = (d: TS.Node): boolean =>
    d.getSourceFile()?.fileName.includes('/@types/node/') === true;
  // An interface member written here, not in a dependency's `.d.ts`.
  const isOwnInterfaceMember = (d: TS.Node): boolean =>
    (ts.isMethodSignature(d) || ts.isPropertySignature(d)) &&
    d.getSourceFile()?.isDeclarationFile === false;

  const reached: Body[] = [{ node: root.node, sf: root.sf, name: root.name }];
  const seen = new Set<TS.Node>([root.node]);
  const escapes: Call[] = [];
  let platform = 0;
  const reported = new Set<string>();
  let truncated = false;

  // Every body that made it into `reached` is walked. Stopping the loop at the
  // cap instead left the last bodies pushed sitting unvisited with `truncated`
  // still false, so a call tree 250 deep — which fills `reached` at the END of
  // a body, never refusing a callee — printed "every annotated function is
  // clean" for a walk that had checked 200 of them. That is TC-7 again, in the
  // one shape its fix did not cover. The push below is what the cap gates, and
  // refusing a push is what makes the walk truncated.
  for (let i = 0; i < reached.length; i++) {
    const body = reached[i];
    if (!body) continue;
    const visit = (node: TS.Node): void => {
      // `new Foo()` is a NewExpression, not a CallExpression. The walk visited
      // only the second, so a constructor in your own source was never checked
      // and a constructor from a typed dependency was never reported as an
      // escape — the closed-world report said the world was closed when it was
      // not, which is the failure the rule exists to prevent (BUGS TC-10).
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const text = node.expression.getText(body.sf);
        if (!PRIMITIVES.has(text)) {
          // An immediately-invoked function has no symbol to resolve, but its
          // body is right there. Follow it rather than reporting it as code we
          // cannot read.
          let callee: TS.Expression = node.expression;
          while (ts.isParenthesizedExpression(callee)) callee = callee.expression;
          const raw =
            ts.isArrowFunction(callee) || ts.isFunctionExpression(callee)
              ? [callee as TS.Node]
              : targetsOf(ts, checker, node.expression);
          // `new Foo()` resolves to the CLASS, and what runs is its
          // constructor. A class we can read that declares none runs a default
          // constructor with no body: nothing to follow and nothing to report,
          // so it is neither an escape nor a body.
          let emptyCtor = false;
          const decls: TS.Node[] = [];
          for (const d of raw) {
            if (!ts.isClassDeclaration(d) && !ts.isClassExpression(d)) {
              decls.push(d);
              continue;
            }
            const ctor = d.members.find((m) => ts.isConstructorDeclaration(m) && m.body);
            if (ctor) decls.push(ctor);
            else if (d.getSourceFile()?.isDeclarationFile === false) emptyCtor = true;
          }
          const next = decls.filter((d) => followable(ts, d));
          for (const d of next) {
            if (seen.has(d)) continue;
            if (reached.length >= MAX_BODIES) {
              truncated = true;
              continue;
            }
            seen.add(d);
            reached.push({ node: d, sf: d.getSourceFile(), name: nameOf(ts, d) });
          }
          // The promise ends wherever we cannot look, and the test is simply
          // that nothing was followable. It used to also require the callee to
          // be types-only or unresolvable, so a call that resolved to an
          // interface member — a body that IS in this checkout, at a site the
          // walk cannot bind to one implementation — fell through both branches
          // and vanished (BUGS TC-45, TC-31). A coverage report that silently
          // omits a case is the lie this rule exists to prevent.
          const unchecked = next.length === 0 && !emptyCtor;
          const site = at(body.sf, node);
          const key = `${site.file}:${site.line}:${site.column}`;
          if (unchecked && !reported.has(key)) {
            reported.add(key);
            // The platform is `@types/node` and V8's own builtins, and neither
            // will ever have a readable body. Everything else is somebody's
            // code and is named.
            const native =
              decls.some(isPlatform) ||
              decls.some((d) => {
                const sf = d.getSourceFile();
                return Boolean(sf) && program.isSourceFileDefaultLibrary(sf);
              });
            if (native) platform++;
            else escapes.push({ ...site, text, viaInterface: decls.some(isOwnInterfaceMember) });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(body.node, visit);
  }
  return { reached, escapes, platform, truncated };
}

// Modules the program could not resolve, named. Every type imported from one
// reads as `any`, so `objectShapes` counts nothing, `isArray` answers false, and
// every type-based rule goes quiet — on a file the tool then calls clean. That
// is the "clean run that checked nothing" this project throws on in five other
// places, and it was the one shape left (BUGS TC-51, and the CTO review's S1).
//
// Asked of the checker rather than of `getSemanticDiagnostics`: an unresolved
// specifier has no symbol, which costs 8ms over 230 files where the diagnostics
// cost seconds.
function unresolvedModules(ts: Ts, checker: TS.TypeChecker, files: Set<string>,
  program: TS.Program): string[] {
  const out = new Set<string>();
  for (const name of files) {
    const sf = program.getSourceFile(name);
    if (!sf) continue;
    for (const st of sf.statements) {
      const spec =
        ts.isImportDeclaration(st) || ts.isExportDeclaration(st) ? st.moduleSpecifier : undefined;
      if (spec && ts.isStringLiteral(spec) && !checker.getSymbolAtLocation(spec)) {
        out.add(spec.text);
      }
    }
  }
  return [...out].sort();
}

export function scan(
  ts: Ts,
  program: TS.Program,
  given?: Mark[]
): { checker: TS.TypeChecker; marks: Mark[]; unresolved: string[] } {
  const checker = program.getTypeChecker();
  const marks = given ?? findMarks(ts, program);
  for (const mark of marks) {
    const { reached, escapes, platform, truncated } = reach(ts, program, checker, mark);
    mark.reached = reached;
    mark.escapes = escapes;
    mark.platform = platform;
    mark.truncated = truncated;
  }
  // Only the files the walk actually read. A module nothing annotated imports
  // cannot have blinded a rule.
  const files = new Set<string>();
  for (const mark of marks) {
    files.add(mark.file);
    for (const body of mark.reached) files.add(body.sf.fileName);
  }
  return { checker, marks, unresolved: unresolvedModules(ts, checker, files, program) };
}
