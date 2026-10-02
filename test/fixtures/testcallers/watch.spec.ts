import { anyActive, F5, sumRows } from './watch.ts';

const yes = (): boolean => true;
export const active = [
  anyActive({ some: yes, a: 1 }),
  anyActive({ some: yes, b: 1 }),
  anyActive({ some: yes, c: 1 }),
  anyActive({ some: yes, d: 1 }),
  anyActive({ some: yes, e: 1 }),
];

export const total = sumRows([
  { x: 1, a: 1 },
  { x: 2, b: 2 },
  { x: 3, c: 3 },
  { x: 4, d: 4 },
  { x: 5, e: 5 },
]);

export const fifth = new F5();
