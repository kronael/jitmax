// Node's own API. The body is native, so it will never be readable and
// "inline what you need from `path.join`" is advice nobody can take. It is
// counted once for the run and never listed per site (BUGS TC-55).
import path from 'node:path';

/** @jitmax */
export function under(dir: string, name: string): string {
  return path.join(dir, name);
}
