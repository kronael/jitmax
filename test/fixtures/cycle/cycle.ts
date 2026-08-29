// Two consts that name each other. `targetsOf` followed g to h to g with no
// visited set and the tool died with "Maximum call stack size exceeded", exit
// 2, on legal source.
export const g: any = h;
export const h: any = g;

/** @jitmax */
export function go(): number {
  return g(1);
}
