import assert from 'node:assert/strict';
import * as before from './radash-assign.before.ts';
import * as after from './radash-assign.after.ts';

const cases: {
  name: string;
  defaults: Record<string, unknown>;
  overrides: Record<string, unknown>;
  expected: Record<string, unknown>;
}[] = [
  {
    name: 'nested service options',
    defaults: {
      port: 3000,
      retry: { attempts: 3, delay: 100 },
      logging: { enabled: true, level: 'info' },
      hosts: ['localhost'],
    },
    overrides: {
      retry: { attempts: 5 },
      logging: { level: 'debug' },
      hosts: ['api.example.test'],
    },
    expected: {
      port: 3000,
      retry: { attempts: 5, delay: 100 },
      logging: { enabled: true, level: 'debug' },
      hosts: ['api.example.test'],
    },
  },
  {
    name: 'empty overrides',
    defaults: { port: 3000, retry: { attempts: 3 } },
    overrides: {},
    expected: { port: 3000, retry: { attempts: 3 } },
  },
  {
    name: 'false, zero, empty string and null overrides',
    defaults: { enabled: true, retries: 3, label: 'app', token: 'secret' },
    overrides: { enabled: false, retries: 0, label: '', token: null },
    expected: { enabled: false, retries: 0, label: '', token: null },
  },
];

for (const entry of cases) {
  const defaults = structuredClone(entry.defaults);
  const overrides = structuredClone(entry.overrides);
  for (const variant of [before, after]) {
    assert.deepStrictEqual(
      variant.assign(entry.defaults, entry.overrides), entry.expected,
      entry.name,
    );
    assert.deepStrictEqual(entry.defaults, defaults, 'defaults changed');
    assert.deepStrictEqual(entry.overrides, overrides, 'overrides changed');
  }
  console.log(`PASS ${entry.name}; inputs unchanged`);
}
