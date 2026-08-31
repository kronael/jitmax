// No function here carries the annotation. The tool used to print
// "every annotated function is clean" and exit 0 over this file — the first
// thing a new user sees, passing a gate having read nothing (BUGS TC-131).
export function hot(rows: number[]): number[] {
  let acc: number[] = [];
  for (const r of rows) acc = [...acc, r];
  return acc;
}
