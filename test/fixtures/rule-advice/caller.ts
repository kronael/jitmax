import { choose, remove, type Box } from './helpers.ts';

/** @jitmax */
export function lowest(current: Box, values: Box[]): Box {
  for (const value of values) current = choose(current, value);
  return current;
}

/** @jitmax */
export function removeThenList(record: Record<string, number>): string[] {
  remove(record);
  return Object.keys(record);
}
