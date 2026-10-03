import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../lib/config.ts';

function config(text: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jitmax-config-'));
  const file = path.join(dir, 'jitmax.toml');
  fs.writeFileSync(file, text);
  return { file, read: () => loadConfig(file) };
}

test('duplicate TOML keys cannot overwrite an enabled rule', () => {
  const c = config('[rules]\n"delete-property" = true\ndelete-property = false\n');
  assert.throws(c.read, { message: `${c.file}:3: duplicate key: delete-property` });
});

test('duplicate TOML tables fail at their redefinition', () => {
  const c = config('[rules]\n"delete-property" = true\n[profile]\nmin_self_pct = 2\n[rules]\n"closed-world" = false\n');
  assert.throws(c.read, { message: `${c.file}:5: duplicate table: [rules]` });
});

test('valid separate TOML tables preserve rule and profile policy', () => {
  const c = config('[rules]\n"delete-property" = true\n"closed-world" = false\n[profile]\nmin_self_pct = 2\n');
  const got = c.read();
  assert.deepEqual([...got.disabled], ['closed-world']);
  assert.equal(got.minSelfPct, 2);
});
