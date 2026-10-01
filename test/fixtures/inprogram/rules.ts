// marked's `other` table, cut down: arrow functions in an exported object that
// another file puts into a literal by shorthand (BUGS TC-157).
export const other = {
  listItemRegex: (bull: string) => new RegExp(`^${bull}`),
};
