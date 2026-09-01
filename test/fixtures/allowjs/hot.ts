// The finding is in the JavaScript helper, not here. A path run read helper.js
// and reported it; a bare run under the same tsconfig said the specifier
// "resolves to no file on disk" about a file that is, and never saw the loop.
import { merge } from './helper.js';

/** @jitmax */
export function total(rows: Array<Record<string, number>>): Record<string, number> {
  return merge(rows);
}
