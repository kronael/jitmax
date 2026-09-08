export interface Box { value: number }

export function choose(a: Box, b: Box): Box {
  return a.value <= b.value ? a : { value: b.value };
}

export function remove(record: Record<string, number>): void {
  delete record.secret;
}
