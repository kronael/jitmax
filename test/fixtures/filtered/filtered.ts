// marked's list tokenizer, cut down (BUGS TC-161). `item.tokens.filter(t =>
// t.type === 'space')` keeps one token kind, and the array it builds was
// counted by its declared element type, all six kinds. A member whose `type`
// is a string rather than a literal could still be a space, so `Generic` stays.
interface Space { type: 'space'; raw: string }
interface Code { type: 'code'; raw: string; text: string; lang?: string }
interface Heading { type: 'heading'; raw: string; depth: number; text: string }
interface List { type: 'list'; raw: string; items: unknown[]; ordered: boolean }
interface Link { type: 'link'; raw: string; href: string; title: string }
interface Generic { [index: string]: unknown; type: string; raw: string }
export type Token = Space | Code | Heading | List | Link | Generic;

/** @jitmax */
export function spaced(item: { tokens: Token[] }): boolean {
  const spacers = item.tokens.filter((t) => t.type === 'space');
  return spacers.some((t) => /\n.*\n/.test(t.raw));
}

// The same read with a predicate that is not a discriminant test: every kind
// can pass it, so all six still reach the load.
/** @jitmax */
export function longOnes(item: { tokens: Token[] }): boolean {
  const long = item.tokens.filter((t) => t.raw.length > 80);
  return long.some((t) => /\n.*\n/.test(t.raw));
}
