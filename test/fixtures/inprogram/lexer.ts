// Three calls whose bodies are in this program, or in the platform, that read
// as code nobody can read (BUGS TC-157). marked reaches `other` through
// `this.rules = { other }`, and the shorthand stopped the walk one hop short of
// the arrow function. arktype's error classes extend `class {}` through a cast,
// and its `ReadonlyPath` extends `Array` through one.
import { other } from './rules.ts';

export const NoopBase = class {} as new <t extends object>() => t;
export class CastableBase<t extends object> extends NoopBase<t> {}
export const ReadonlyArray = Array as unknown as new <T>(...items: T[]) => readonly T[];

interface Rules {
  other: typeof other;
}

export class Tokenizer {
  rules!: Rules;
  /** @jitmax */
  list(bull: string): RegExp {
    return this.rules.other.listItemRegex(bull);
  }
}

export class ArkError extends CastableBase<{ code: string }> {
  constructor() {
    super();
  }
}

export class ReadonlyPath extends ReadonlyArray<string> {
  constructor() {
    super();
  }
}

/** @jitmax */
export function raise(): number {
  return [new ArkError(), new ReadonlyPath()].length;
}

export function lex(t: Tokenizer): void {
  const rules = { other };
  t.rules = rules;
}

export const tokenizer = new Tokenizer();
