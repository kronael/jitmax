import { builtinModules } from 'node:module';
import type * as TS from 'typescript';
import type { Ts } from './ts.ts';
import type { HotFrame } from './profile.ts';
import { BUILTINS } from './builtins.ts';
import { createFlow, type Flow } from './flow.ts';

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

// What the dataflow walk (lib/flow.ts) found reaching an interface-typed
// receiver. `count` is the distinct implementations the program's own
// construction sites can send here — classes by identity, literals by shape,
// both undercounting maps and never overcounting them (BUGS TC-60). `unknown`
// is why the count is a lower bound, when it is: one origin the walk cannot
// see — JSON.parse, a caller outside this program — and the number cannot be
// stood behind as complete (BUGS TC-69, TC-82).
export interface Dispatch {
  count: number;
  names: string[];
  unknown: string[];
  recv: string;
  method: string;
  // The receiver has a declared type — it is not `any` or `unknown`. The walk
  // is 0-CFA and path-insensitive, so it counts every shape that reaches the
  // VALUE, not the ones that reach this CALL. Where a declared type agrees
  // with the count, the two answers check each other; where the receiver is
  // `any`, nothing does, and es-toolkit's `isPlainObject(object?: any)` had 42
  // shapes counted at an `object.toString()` that a `typeof` guard three lines
  // up lets one kind of value reach. A megamorphic claim needs the check, so
  // the count is printed there and not acted on (BUGS TC-111).
  typed: boolean;
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
  // What the receiver-origin walk counted, at EVERY escape. It used to be set
  // only where `viaInterface` was, so the rule for the other half — a callee
  // with no body anywhere — had no count to reason with, and reported a
  // fourteen-implementation site and a one-implementation site in the same
  // words. The maps reaching a receiver decide the inline cache whether or not
  // the walk could read the callee's body, so the question is asked at both
  // (BUGS TC-110).
  dispatch: Dispatch;
}

export interface Body {
  // Any node the walk can descend into, not only a signature: a class field
  // initializer runs in the implicit constructor and is a body like any other,
  // and it is a PropertyDeclaration.
  node: TS.Node;
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
  // Interface-typed calls whose receiver the dataflow walk traced to exactly
  // ONE visible implementation, followed instead of reported: the rules then
  // run over a body they never saw before (BUGS TC-69). Sound only for a
  // closed program, which the report says once per run.
  followed: number;
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

// A function boundary: what the walk follows into, and what the rules must not
// walk across. One definition, because rules.ts kept a second copy that differed
// from this one in two node kinds.
export function isFunctionLike(ts: Ts, n: TS.Node): n is TS.SignatureDeclaration {
  return (
    ts.isFunctionDeclaration(n) ||
    ts.isFunctionExpression(n) ||
    ts.isArrowFunction(n) ||
    ts.isMethodDeclaration(n) ||
    ts.isGetAccessor(n) ||
    ts.isSetAccessor(n) ||
    // A constructor is a body like any other, and allocation is what
    // constructors do — which is the rule `allocating-select` is about
    // (BUGS TC-10).
    ts.isConstructorDeclaration(n)
  );
}

// Arrow functions and function expressions carry no name of their own; the
// name a reader recognises sits on the declaration that holds them.
function nameOf(ts: Ts, node: TS.Node): string {
  const name = (node as TS.NamedDeclaration).name;
  if (name && ts.isIdentifier(name)) return name.text;
  const p = node.parent;
  if (p && (ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p)) && ts.isIdentifier(p.name)) {
    return p.name.text;
  }
  return '<anonymous>';
}

// The program's OWN source: not a declaration file, and not something module
// resolution pulled in beside what the caller named. Asked of the resolver
// rather than of the path, because a substring match on `node_modules` skipped
// a dependency the caller NAMED and reported the run clean (BUGS TC-84). Three
// walks draw this edge — findMarks, marksFromProfile and lib/flow.ts's index —
// and it was written out at each.
export const isOwnSource = (program: TS.Program, sf: TS.SourceFile): boolean =>
  !sf.isDeclarationFile && !program.isSourceFileFromExternalLibrary(sf);

// The symbol a name binds to, through an import alias. The callee walk here and
// the value walk in lib/flow.ts both start here and both had their own copy;
// the try/catch is load-bearing, because getAliasedSymbol throws on a symbol
// that is not an alias after all, and the unaliased symbol is the answer then.
export function symbolOf(
  ts: Ts,
  checker: TS.TypeChecker,
  node: TS.Node
): TS.Symbol | undefined {
  const sym = checker.getSymbolAtLocation(node);
  if (!sym || !(sym.flags & ts.SymbolFlags.Alias)) return sym;
  try {
    return checker.getAliasedSymbol(sym);
  } catch {
    return sym;
  }
}

export function at(sf: TS.SourceFile, node: TS.Node): Site {
  const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  return { file: sf.fileName, line: line + 1, column: character + 1 };
}

// One site, one string. Three walks key sites this way — the profile's
// function index, the lowered-call counter and the escape counter — and a key
// spelled per call site is a key that drifts per call site.
export const siteKey = (s: Site): string => `${s.file}:${s.line}:${s.column}`;

// Through the type syntax to the value underneath. `as`, `satisfies`, `!` and
// the old-style assertion are all erased before V8 sees anything, so
// `(iss as any).path` loads `path` off iss's map exactly as `iss.path` does —
// the cast is a claim about the type checker, not about the object. Reading a
// type or a symbol off the wrapper instead of off the value silenced
// `megamorphic-elements` on zod's `prefixIssues`, the one true instance of it
// that twelve libraries contain.
//
// One copy, because there were three and they disagreed: lib/flow.ts looked
// through `satisfies` and the two in lib/rules/ did not — the same shape as
// `.cts` reaching the extension list while `.cjs` did not.
export function unwrap(ts: Ts, e: TS.Expression): TS.Expression {
  let n = e;
  while (
    ts.isParenthesizedExpression(n) ||
    ts.isAsExpression(n) ||
    ts.isSatisfiesExpression(n) ||
    ts.isNonNullExpression(n) ||
    ts.isTypeAssertionExpression(n)
  ) {
    n = n.expression;
  }
  // `(0, f)` is the value of `f`. The comma is not erased — the left operand
  // does run — but nothing here asks what runs, only which value arrives, and
  // that is the right operand. `(0, eval)('…')` and the `(0, mod.fn)(…)` a
  // bundler emits resolved to a binary expression with no symbol, so the callee
  // walk found no declarations at all and closed-world reported a V8 builtin as
  // somebody's unreadable code (BUGS TC-110).
  while (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.CommaToken) {
    n = unwrap(ts, n.right);
  }
  return n;
}

// An unwalked mark. Both entry points — the annotation and the profile — build
// one, and every field `reach()` fills has to start at the same value in both:
// spelled twice, a field added for one entry point is a field the other one
// silently leaves undefined.
function newMark(
  ts: Ts,
  sf: TS.SourceFile,
  node: TS.SignatureDeclaration,
  disabled: string[]
): Mark {
  return {
    ...at(sf, node),
    name: nameOf(ts, node),
    node,
    sf,
    reached: [],
    escapes: [],
    platform: 0,
    lowered: 0,
    followed: 0,
    truncated: false,
    disabled,
  };
}

function findMarks(ts: Ts, program: TS.Program): Mark[] {
  const marks: Mark[] = [];
  for (const sf of program.getSourceFiles()) {
    // Annotations are looked for in the program's OWN files, not in what the
    // resolver pulled in beside them. The old guard matched the substring
    // `node_modules` anywhere in the path, so a dependency the caller NAMED —
    // the use case `followable` below endorses — was skipped and the run
    // reported clean at exit 0 (BUGS TC-84). Whether a file arrived through
    // module resolution is the resolver's own fact; asking it is the guard
    // with no path to misread.
    if (!isOwnSource(program, sf)) continue;
    const visit = (node: TS.Node): void => {
      if (isFunctionLike(ts, node)) {
        const tags = ts.getJSDocTags(node).filter((t) => t.tagName.escapedText === 'jitmax');
        if (tags.length > 0) marks.push(newMark(ts, sf, node, disabledKeys(ts, tags)));
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
    // The same edge findMarks draws: the program's own files, by the
    // resolver's answer rather than a substring of the path (BUGS TC-84).
    if (!isOwnSource(program, sf)) continue;
    const visit = (node: TS.Node): void => {
      if (isFunctionLike(ts, node)) {
        const site = at(sf, node);
        put(siteKey(site), { node, sf });
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
    const hit = nodes.get(siteKey(frame));
    if (!hit) {
      unmatched.push(frame);
      continue;
    }
    if (seen.has(hit.node)) continue;
    seen.add(hit.node);
    marks.push({
      ...newMark(ts, hit.sf, hit.node, []),
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
export function targetsOf(
  ts: Ts,
  checker: TS.TypeChecker,
  callee: TS.Expression,
  seen: Set<TS.Node> = new Set()
): TS.Node[] {
  if (seen.has(callee)) return [];
  seen.add(callee);
  const sym = symbolOf(ts, checker, callee);
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
  flow: Flow,
  root: Mark
): {
  reached: Body[];
  escapes: Call[];
  platform: number;
  lowered: number;
  followed: number;
  truncated: boolean;
} {
  // `@types/node` is the platform: native code that no `npm install` and no
  // rewrite makes readable (BUGS TC-55).
  const isPlatform = (d: TS.Node): boolean =>
    d.getSourceFile()?.fileName.includes('/@types/node/') === true;
  // The same platform callee when `@types/node` is NOT installed: `path.join`
  // then resolves to nothing at all, and the two tests above see an ordinary
  // opaque callee — which is how a checkout with no node_modules got a
  // closed-world note per fs call (BUGS TC-55, TC-69 cause 1). The import's
  // own specifier still says where the call goes, and a Node specifier is the
  // platform no matter what is installed, so it is read off the declaration
  // the callee's leftmost name binds to.
  const fromNodeImport = (expr: TS.Expression): boolean => {
    let base: TS.Expression = expr;
    while (ts.isPropertyAccessExpression(base) || ts.isElementAccessExpression(base)) {
      base = base.expression;
    }
    if (!ts.isIdentifier(base)) return false;
    for (const d of checker.getSymbolAtLocation(base)?.getDeclarations() ?? []) {
      if (ts.isImportClause(d) || ts.isNamespaceImport(d) || ts.isImportSpecifier(d)) {
        let up: TS.Node = d;
        while (!ts.isImportDeclaration(up) && up.parent) up = up.parent;
        if (
          ts.isImportDeclaration(up) &&
          ts.isStringLiteral(up.moduleSpecifier) &&
          isNodeSpecifier(up.moduleSpecifier.text)
        ) {
          return true;
        }
      }
      if (ts.isImportEqualsDeclaration(d) && ts.isExternalModuleReference(d.moduleReference)) {
        const spec = d.moduleReference.expression;
        if (ts.isStringLiteral(spec) && isNodeSpecifier(spec.text)) return true;
      }
    }
    return false;
  };
  // The host, read off the RECEIVER rather than off the callee. `globalThis.gz()`
  // resolves its callee to a `declare global { var gz }` written in own source,
  // and `(globalThis as {z(): void}).z()` to a property signature in an inline
  // type — own-source declarations both, so the two tests above answer
  // "somebody's code" for a call that lands in the host. There is no body to
  // inline out of `globalThis`, no reader who can go and look at one, and no map
  // to count: the receiver is a V8 interceptor object, not a JS object. That is
  // the class TC-63 took out of `delete-property`, at the other rule that asks
  // the same platform-versus-application question (BUGS TC-110).
  //
  // The DECLARATION of the base name, never its type. A value TYPED
  // `Record<string, number>` is declared in lib.es5.d.ts and is an ordinary
  // object with a real map — testing the type is how the first attempt at TC-63
  // silenced the case its benchmark measured.
  const intoHost = (expr: TS.Expression): boolean => {
    let base = unwrap(ts, expr);
    while (ts.isPropertyAccessExpression(base) || ts.isElementAccessExpression(base)) {
      base = unwrap(ts, base.expression);
    }
    if (!ts.isIdentifier(base)) return false;
    // `globalThis` is the one host object with no declaration to find: TypeScript
    // synthesises its symbol from the global scope, so it has declarations in
    // whatever files augment it — own source included — and never one that says
    // "this is the host".
    if (base.text === 'globalThis') return true;
    for (const d of symbolOf(ts, checker, base)?.getDeclarations() ?? []) {
      const sf = d.getSourceFile();
      if (!sf) continue;
      if (program.isSourceFileDefaultLibrary(sf) || sf.fileName.includes('/@types/node/')) {
        return true;
      }
    }
    return false;
  };
  // A dispatch site the dataflow walk can try: the callee resolves to an
  // own-source declaration with no body to follow — an interface or type
  // literal member, an abstract method, a declared field holding a function.
  // The body IS somewhere in this checkout; which one runs is a question about
  // the value, and lib/flow.ts asks it (BUGS TC-69, TC-81 — zod's `_parse` is
  // an abstract method reached through a field, and the signature-only test
  // filed it under "no body" where nothing could count its implementations).
  const isDispatchDecl = (d: TS.Node): boolean =>
    (ts.isMethodSignature(d) ||
      ts.isPropertySignature(d) ||
      ((ts.isMethodDeclaration(d) || ts.isPropertyDeclaration(d)) &&
        !(d as TS.FunctionLikeDeclaration).body)) &&
    d.getSourceFile()?.isDeclarationFile === false;

  const reached: Body[] = [{ node: root.node, sf: root.sf, name: root.name }];
  const seen = new Set<TS.Node>([root.node]);
  const escapes: Call[] = [];
  let platform = 0;
  let lowered = 0;
  let followed = 0;
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
        if (PRIMITIVES.has(text)) {
          // No call boundary here at all — see PRIMITIVES. Counted, once per
          // site, so the report can say what was stepped over and under which
          // V8 the stepping-over is true (BUGS TC-70).
          const site = at(body.sf, node);
          const key = siteKey(site);
          if (!reported.has(key)) {
            reported.add(key);
            lowered++;
          }
        } else {
          // An immediately-invoked function has no symbol to resolve, but its
          // body is right there. Follow it rather than reporting it as code we
          // cannot read.
          // One unwrap, the exported one. This had its own parentheses-only
          // loop, so `(0, eval)` and `(fn as F)()` reached `targetsOf` still
          // wrapped and resolved to nothing.
          const callee = unwrap(ts, node.expression);
          const raw =
            ts.isArrowFunction(callee) || ts.isFunctionExpression(callee)
              ? [callee as TS.Node]
              : targetsOf(ts, checker, callee);
          // `new Foo()` resolves to the CLASS, and what runs is its
          // constructor. A class that declares none does NOT run nothing: the
          // implicit constructor runs every field initializer, and `extends`
          // makes it run the base class's constructor. Reading it as empty let
          // a `delete` in a base constructor pass as a clean run — the shape
          // TC-10's fix did not anticipate.
          let emptyCtor = false;
          const decls: TS.Node[] = [];
          // Field initializers run whether or not a constructor is declared,
          // and they are not callees, so they are walked as bodies directly
          // rather than going through `followable`, which wants a signature.
          const inits: TS.Node[] = [];
          const classBodies = (d: TS.Node, depth: number): void => {
            if (!ts.isClassDeclaration(d) && !ts.isClassExpression(d)) {
              decls.push(d);
              return;
            }
            for (const m of d.members) {
              if (ts.isPropertyDeclaration(m) && m.initializer) inits.push(m);
            }
            const ctor = d.members.find((m) => ts.isConstructorDeclaration(m) && m.body);
            if (ctor) {
              decls.push(ctor);
              return;
            }
            let base = false;
            // The depth cap CUTS the walk, and a cut walk is not an empty
            // constructor. `depth < 8` used to hand a nine-deep `extends` chain
            // to the `!base` test below, which read "this class declares no
            // constructor and inherits nothing" and set `emptyCtor` — so the
            // `new` was not even an escape and the run called itself checked
            // (BUGS TC-115). A class with heritage the walk refused to follow
            // stays an escape.
            const cut = depth >= 8 && (d.heritageClauses ?? []).length > 0;
            for (const h of cut ? [] : d.heritageClauses ?? []) {
              if (h.token !== ts.SyntaxKind.ExtendsKeyword) continue;
              for (const t of h.types) {
                for (const b of targetsOf(ts, checker, t.expression)) {
                  base = true;
                  classBodies(b, depth + 1);
                }
              }
            }
            if (
              !base &&
              !cut &&
              inits.length === 0 &&
              d.getSourceFile()?.isDeclarationFile === false
            ) {
              emptyCtor = true;
            }
          };
          for (const d of raw) classBodies(d, 0);
          const next = [...decls.filter((d) => followable(ts, d)), ...inits];
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
          const key = siteKey(site);
          if (unchecked && !reported.has(key)) {
            reported.add(key);
            // The platform is `@types/node` and V8's own builtins — resolved
            // into their .d.ts when the types are installed, recognised by the
            // import's Node specifier when they are not — and neither will
            // ever have a readable body. Everything else is somebody's code
            // and is named.
            const native =
              decls.some(isPlatform) ||
              decls.some((d) => {
                const sf = d.getSourceFile();
                return Boolean(sf) && program.isSourceFileDefaultLibrary(sf);
              }) ||
              fromNodeImport(node.expression) ||
              intoHost(node.expression);
            if (native) {
              platform++;
            } else {
              // Count what actually reaches this receiver, by dataflow — not
              // what could structurally fit its interface (BUGS TC-69, the
              // owner's correction). One visible implementation and nothing
              // unknown is not an escape at all: follow it, and the rules run
              // over a body they never saw before. Anything else stays a
              // finding, carrying the count so the report can tell a silence
              // from a real megamorphic site (BUGS TC-82).
              //
              // Asked at EVERY escape, not only where the callee resolved to an
              // interface member. `const f = pick ? a : b; f(x)` resolves to a
              // variable with no function initializer to follow, so it was
              // filed under "we have no body for f" and printed that sentence
              // about two bodies sitting in the same file — and a receiver that
              // fourteen classes reach reads the same as one nothing reaches.
              // The dataflow walk answers both, and what separates the two
              // rules is which body is missing, not which one got counted
              // (BUGS TC-110).
              const r = flow.receiver(node);
              const one =
                r.origins.length === 1 && r.unknown.length === 0 ? r.origins[0] : undefined;
              if (one?.follow !== undefined) {
                followed++;
                if (!seen.has(one.follow)) {
                  if (reached.length >= MAX_BODIES) {
                    truncated = true;
                  } else {
                    seen.add(one.follow);
                    reached.push({
                      node: one.follow,
                      sf: one.follow.getSourceFile(),
                      name: nameOf(ts, one.follow),
                    });
                  }
                }
              } else {
                const prop = ts.isPropertyAccessExpression(callee) ? callee : undefined;
                const rt = checker.getTypeAtLocation(prop ? prop.expression : callee);
                escapes.push({
                  ...site,
                  text,
                  viaInterface: decls.some(isDispatchDecl),
                  dispatch: {
                    count: r.origins.length,
                    names: r.origins.map((o) => o.name).slice(0, 6),
                    unknown: r.unknown.slice(0, 2),
                    recv: prop ? prop.expression.getText(body.sf) : text,
                    method: prop ? prop.name.text : '',
                    typed: (rt.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) === 0,
                  },
                });
              }
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(body.node, visit);
  }
  return { reached, escapes, platform, lowered, followed, truncated };
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
      // A Node specifier is the platform whether or not `@types/node` is
      // installed, and the platform is never the blindness this reports: its
      // bodies are native and no rule was going to read them. Only a module
      // that should have resolved and did not can have silenced a rule.
      if (
        spec &&
        ts.isStringLiteral(spec) &&
        !isNodeSpecifier(spec.text) &&
        !checker.getSymbolAtLocation(spec)
      ) {
        out.add(spec.text);
      }
    }
  }
  return [...out].sort();
}

// An annotation on a declaration with no body. `isFunctionLike` is a test on the
// NODE KIND, and an overload signature and an ambient `declare function` are
// both that kind with nothing inside them — so the walk had nothing to walk,
// found nothing, and the run printed "every annotated function is clean" at
// exit 0 over an unchecked hot body. That is the one failure this tool exists
// to prevent, and JSDoc above the first overload is the ordinary way to
// document an overload set (BUGS TC-124).
//
// An overload signature HAS a body — on its implementation, which the symbol's
// other declarations hold. Bind to it. When no declaration anywhere has a body
// the annotation names something this program cannot read, and that is not a
// clean run: the mark is dropped and the name is returned so the report can say
// so. Both paths run here, because `given` marks come from a profile and V8
// names a body-less declaration just as readily.
function withBodies(
  ts: Ts,
  checker: TS.TypeChecker,
  marks: Mark[]
): { marks: Mark[]; bodyless: (Site & { name: string })[] } {
  const kept: Mark[] = [];
  const bodyless: (Site & { name: string })[] = [];
  const seen = new Set<TS.Node>();
  for (const mark of marks) {
    let node: TS.SignatureDeclaration | undefined = mark.node;
    if ((node as TS.FunctionLikeDeclaration).body === undefined) {
      const name = (node as TS.NamedDeclaration).name;
      const symbol = name ? checker.getSymbolAtLocation(name) : undefined;
      node = symbol?.declarations?.find(
        (d): d is TS.SignatureDeclaration =>
          isFunctionLike(ts, d) && (d as TS.FunctionLikeDeclaration).body !== undefined
      );
      if (node === undefined) {
        bodyless.push({ name: mark.name, file: mark.file, line: mark.line, column: mark.column });
        continue;
      }
    }
    // Annotating the signature AND the implementation is one function, not two.
    if (seen.has(node)) continue;
    seen.add(node);
    kept.push(node === mark.node ? mark : newMark(ts, node.getSourceFile(), node, mark.disabled));
  }
  return { marks: kept, bodyless };
}

export function scan(
  ts: Ts,
  program: TS.Program,
  given?: Mark[]
): { checker: TS.TypeChecker; marks: Mark[]; unresolved: string[]; bodyless: (Site & { name: string })[] } {
  const checker = program.getTypeChecker();
  const { marks, bodyless } = withBodies(ts, checker, given ?? findMarks(ts, program));
  // One flow analysis per program: its indexes and memo are shared across
  // every mark, because "who writes this field" is a fact about the program
  // and not about the annotation that asked.
  const flow = createFlow(ts, program, checker);
  for (const mark of marks) {
    const { reached, escapes, platform, lowered, followed, truncated } = reach(
      ts,
      program,
      checker,
      flow,
      mark
    );
    mark.reached = reached;
    mark.escapes = escapes;
    mark.platform = platform;
    mark.lowered = lowered;
    mark.followed = followed;
    mark.truncated = truncated;
  }
  // Only the files the walk actually read. A module nothing annotated imports
  // cannot have blinded a rule.
  const files = new Set<string>();
  for (const mark of marks) {
    files.add(mark.file);
    for (const body of mark.reached) files.add(body.sf.fileName);
  }
  return { checker, marks, bodyless, unresolved: unresolvedModules(ts, checker, files, program) };
}
