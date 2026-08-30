// The corpus condition: no node_modules, so `node:path` and `fs` resolve to no
// symbol at all and the resolved-declaration platform tests in reach() see an
// ordinary opaque callee. The import specifier is what still says where the
// call goes (BUGS TC-55, TC-69 cause 1). The test copies this directory OUT of
// the repository before running it — in here @types/node resolves, and that
// branch is what test/fixtures/platform covers.
import path from 'node:path';
import { readFileSync } from 'fs';
// @ts-expect-error — deliberately not installed anywhere: a genuinely opaque
// application callee, which must STAY a closed-world finding while the two
// platform calls above go silent.
import { opaque } from 'some-opaque-package';

/** @jitmax */
export function stat(dir: string, name: string): number {
  const p = path.join(dir, name);
  const s = readFileSync(p, 'utf8');
  return Math.max(p.length, opaque(s));
}
