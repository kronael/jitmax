// A callee whose body nobody here can read. `closed-world` fires, no other rule
// does, and the rule carries no benchmark of this program — so the finding is a
// warning, the run exits 0, and a CI gate stops failing on a claim this project
// cannot support (BUGS TC-52).
import path from 'node:path';

/** @jitmax */
export function under(dir: string, name: string): string {
  return path.join(dir, name);
}
