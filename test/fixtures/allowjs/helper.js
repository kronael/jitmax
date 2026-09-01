export function merge(rows) {
  let acc = {};
  for (const r of rows) acc = { ...acc, ...r };
  return acc;
}
