// Two functions, neither annotated. Profile mode marks the one the profile says
// is hot and leaves the other alone — which is the whole claim of BUGS TC-57:
// hotness is measured, not inferred from loops and fan-in.
export function parseOnce(text: string): number {
  return text.split(',').length;
}

export function kernel(rows: number[]): number[] {
  return rows.map((r) => r * 2).filter((r) => r > 10);
}
