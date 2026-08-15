import type * as TS from 'typescript';
import type { Ts } from './ts.ts';

// Calls that TurboFan lowers to inline machine code. Reaching one of these is
// not a hole in the promise. Anything not listed here is user code, and the
// promise stops at its edge until it is annotated too.
const PRIMITIVES = new Set([
  'Math.abs', 'Math.acos', 'Math.asin', 'Math.atan', 'Math.atan2', 'Math.cbrt',
  'Math.ceil', 'Math.clz32', 'Math.cos', 'Math.cosh', 'Math.exp', 'Math.expm1',
  'Math.floor', 'Math.fround', 'Math.hypot', 'Math.imul', 'Math.log',
  'Math.log10', 'Math.log1p', 'Math.log2', 'Math.max', 'Math.min', 'Math.pow',
  'Math.round', 'Math.sign', 'Math.sin', 'Math.sinh', 'Math.sqrt', 'Math.tan',
  'Math.tanh', 'Math.trunc',
  'Number.isFinite', 'Number.isInteger', 'Number.isNaN', 'Number.isSafeInteger',
  'Array.isArray',
]);

export interface Site {
  file: string;
  line: number;
  column: number;
}

export interface Call extends Site {
  text: string;
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
  // True when the walk stopped at MAX_BODIES. A partial walk that reports no
  // findings is not a clean function, and saying "clean" there would be a lie.
  truncated: boolean;
  // Raw `-key` tokens from the `@turbocharge` tag's own comment, e.g.
  // `@turbocharge -boxed-elements -TC-15`. Unresolved: rules.ts's
  // resolveDisabled() turns these into rule names and validates them.
  disabled: string[];
}

// Termination. The visited set already handles cycles; this bounds a call
// graph that fans out faster than it repeats.
const MAX_BODIES = 200;

function isFunctionLike(ts: Ts, n: TS.Node): n is TS.SignatureDeclaration {
  return (
    ts.isFunctionDeclaration(n) ||
    ts.isFunctionExpression(n) ||
    ts.isArrowFunction(n) ||
    ts.isMethodDeclaration(n)
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
        const tags = ts.getJSDocTags(node).filter((t) => t.tagName.escapedText === 'turbocharge');
        if (tags.length > 0) {
          marks.push({
            ...at(sf, node),
            name: nameOf(ts, node),
            node,
            sf,
            reached: [],
            escapes: [],
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

// `-key` tokens in the promise's own tag: `@turbocharge -boxed-elements -TC-15`
// disables those rules for this function and everything its walk reaches.
// Unrecognized text that is not a `-key` token is prose, not a directive, and
// stays out of the list.
function disabledKeys(ts: Ts, tags: TS.JSDocTag[]): string[] {
  const keys: string[] = [];
  for (const tag of tags) {
    const text = ts.getTextOfJSDocComment(tag.comment) ?? '';
    for (const token of text.split(/\s+/)) {
      if (token.startsWith('-') && token.length > 1) keys.push(token.slice(1));
    }
  }
  return keys;
}

function targetsOf(ts: Ts, checker: TS.TypeChecker, callee: TS.Expression): TS.Node[] {
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
    else if (ts.isIdentifier(init)) decls.push(...targetsOf(ts, checker, init));
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
): { reached: Body[]; escapes: Call[]; truncated: boolean } {
  // Where the promise really stops: a callee that exists only as a type. A
  // typed dependency resolves to its .d.ts, so we have its signature and not
  // one line of its body. The platform's own lib.*.d.ts is excluded — those
  // are the builtins V8 implements, not somebody's unchecked code.
  const unreadable = (d: TS.Node): boolean => {
    const sf = d.getSourceFile();
    return Boolean(sf) && sf.isDeclarationFile && !program.isSourceFileDefaultLibrary(sf);
  };

  const reached: Body[] = [{ node: root.node, sf: root.sf, name: root.name }];
  const seen = new Set<TS.Node>([root.node]);
  const escapes: Call[] = [];
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
      if (ts.isCallExpression(node)) {
        const text = node.expression.getText(body.sf);
        if (!PRIMITIVES.has(text)) {
          // An immediately-invoked function has no symbol to resolve, but its
          // body is right there. Follow it rather than reporting it as code we
          // cannot read.
          let callee: TS.Expression = node.expression;
          while (ts.isParenthesizedExpression(callee)) callee = callee.expression;
          const decls =
            ts.isArrowFunction(callee) || ts.isFunctionExpression(callee)
              ? [callee as TS.Node]
              : targetsOf(ts, checker, node.expression);
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
          // The promise ends wherever we cannot look: a callee that exists
          // only as a type, AND a callee we could not resolve at all. The
          // second case used to fall through both branches and vanish, which
          // made a silent run mean two different things.
          const unchecked =
            next.length === 0 && (decls.length === 0 || decls.some(unreadable));
          const site = at(body.sf, node);
          const key = `${site.file}:${site.line}:${site.column}`;
          if (unchecked && !reported.has(key)) {
            reported.add(key);
            escapes.push({ ...site, text });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(body.node, visit);
  }
  return { reached, escapes, truncated };
}

export function scan(ts: Ts, program: TS.Program): { checker: TS.TypeChecker; marks: Mark[] } {
  const checker = program.getTypeChecker();
  const marks = findMarks(ts, program);
  for (const mark of marks) {
    const { reached, escapes, truncated } = reach(ts, program, checker, mark);
    mark.reached = reached;
    mark.escapes = escapes;
    mark.truncated = truncated;
  }
  return { checker, marks };
}
