/** Callgraph self time selects source functions; invalid accounting fails. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { hotFrames } from '../lib/profile.ts';

function frame(id: number, name: string, url: string, line = 0, column = 0) {
  return {
    id,
    callFrame: {
      functionName: name,
      scriptId: url ? '1' : '0',
      url,
      lineNumber: url ? line : -1,
      columnNumber: url ? column : -1,
    },
  };
}

/** Alias positions of one source function sum before the project threshold. */
test('distinct source positions of one function combine their self time', () => {
  withProfile(url => ({
    nodes: [frame(1, 'clean', url), frame(2, 'bad', url, 1),
      frame(3, 'bad', url, 1, 16)],
    samples: [1, 2, 3],
    timeDeltas: [988, 6, 6],
  }), (profile, source) => {
    const result = check(profile, source);
    assert.equal(result.status, 1, result.stderr + result.stdout);
    assert.match(result.stdout, /bad\(\) — 1\.2% of samples/);
    assert.match(result.stdout, /error  delete-property/);
  });
});

function withProfile(
  create: (url: string) => unknown,
  run: (profile: string, source: string) => void,
) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jitmax-profile-'));
  const source = path.join(dir, 'work.ts');
  const profile = path.join(dir, 'run.cpuprofile');
  try {
    fs.writeFileSync(source,
      'export function clean() { return 1; }\n' +
      'export function bad(value: { x?: number }) { delete value.x; }\n');
    const data = create(pathToFileURL(source).href);
    fs.writeFileSync(profile,
      typeof data === 'string' ? data : JSON.stringify(data));
    run(profile, source);
  } finally {
    for (const file of fs.readdirSync(dir))
      fs.unlinkSync(path.join(dir, file));
    fs.rmdirSync(dir);
  }
}

function check(profile: string, source: string) {
  return spawnSync(process.execPath, ['bin/jitmax.ts', profile, source], {
    encoding: 'utf8',
    timeout: 20_000,
  });
}

/** One function sampled under 200 callers remains hot and reports its rule. */
test('repeated callgraph nodes aggregate before the hotness threshold', () => {
  withProfile((url) => {
    const ids = Array.from({ length: 200 }, (_, i) => i + 3);
    return {
      nodes: [
        { ...frame(1, '(root)', ''), children: [2, ...ids.map(id => id + 1000)] },
        frame(2, 'clean', url),
        ...ids.map(id => ({
          ...frame(id + 1000, `caller${id}`, url, id + 10),
          children: [id],
        })),
        ...ids.map(id => frame(id, 'bad', url, 1)),
      ],
      samples: [2, ...ids],
      timeDeltas: [3, ...ids.map(() => 1)],
    };
  }, (profile, source) => {
    const found = hotFrames(profile);
    assert.equal(found.frames.length, 2);
    assert.equal(found.frames[0].name, 'bad');
    assert.equal(found.frames[0].pct, 200 / 203 * 100);
    const result = check(profile, source);
    assert.equal(result.status, 1, result.stderr + result.stdout);
    assert.match(result.stdout, /error  delete-property/);
    assert.match(result.stdout, /bad\(\) — 98\.5% of samples/);
  });
});

/** Equal names at distinct locations keep separate self times and stay cold. */
test('unrelated functions with the same name do not become hot together', () => {
  const lines = [
    'export function clean() { return 1; }',
    'export const first = { same(value: { x?: number }) { delete value.x; } };',
    'export const second = { same(value: { x?: number }) { delete value.x; } };',
  ];
  withProfile(url => ({
    nodes: [frame(1, 'same', url, 1, lines[1].indexOf('same')),
      frame(2, 'same', url, 2, lines[2].indexOf('same')),
      frame(3, 'clean', url)],
    samples: [1, 2, 3],
    timeDeltas: [6, 6, 988],
  }), (profile, source) => {
    fs.writeFileSync(source, lines.join('\n'));
    assert.equal(hotFrames(profile).frames.length, 3);
    const result = check(profile, source);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.doesNotMatch(result.stdout, /delete-property/);
    const config = path.join(path.dirname(source), 'jitmax.toml');
    fs.writeFileSync(config, '[profile]\nmin_self_pct = 0.5\n');
    const selected = spawnSync(process.execPath,
      ['bin/jitmax.ts', config, profile, source], {
        encoding: 'utf8',
        timeout: 20_000,
      });
    assert.equal(selected.status, 1, selected.stderr + selected.stdout);
    assert.match(selected.stdout, /3 hot functions, 2 errors/);
    assert.equal(selected.stdout.match(/error  delete-property/g)?.length, 2);
  });
});

/** Varied intervals, zero intervals and engine positions keep exact shares. */
test('sample intervals weight self time and accept V8 engine frames', () => {
  withProfile(url => ({
    nodes: [frame(1, 'bad', url, 1), frame(2, 'clean', url),
      frame(3, '(garbage collector)', ''),
      frame(4, 'run', 'node:internal/process/task_queues')],
    samples: [1, 2, 1, 3, 4],
    timeDeltas: [2, 20, 0, 3, 5],
  }), (profile) => {
    const found = hotFrames(profile);
    assert.equal(found.frames[0].pct, 20 / 30 * 100);
    assert.equal(found.frames[1].pct, 2 / 30 * 100);
    assert.equal(found.engine, 10);
    assert.equal(found.node, 5 / 30 * 100);
  });
});

/** Repeated generated positions map once to the author's function position. */
test('aggregated frames retain source map locations and self time', () => {
  withProfile(url => ({
    nodes: [frame(1, 'bad', url), frame(2, 'bad', url)],
    samples: [1, 2],
    timeDeltas: [4, 6],
  }), (profile, source) => {
    const map = {
      version: 3,
      sources: ['author.ts'],
      names: [],
      mappings: 'AACA',
    };
    fs.appendFileSync(source, '\n//# sourceMappingURL=data:application/json;base64,' +
      Buffer.from(JSON.stringify(map)).toString('base64'));
    const found = hotFrames(profile);
    assert.equal(found.frames.length, 1);
    assert.equal(found.frames[0].file, path.join(path.dirname(source), 'author.ts'));
    assert.equal(found.frames[0].line, 2);
    assert.equal(found.frames[0].pct, 100);
    assert.deepEqual(found.frames[0].generated,
      { file: source, line: 1, column: 1 });
  });
});

/** Mapped token positions sum under the source function and retain provenance. */
test('source mapped aliases combine before the hotness threshold', () => {
  withProfile(url => ({
    nodes: [frame(1, 'clean', url),
      frame(2, 'bad', new URL('generated.js', url).href),
      frame(3, 'bad', new URL('generated.js', url).href, 0, 16)],
    samples: [1, 2, 3],
    timeDeltas: [988, 6, 6],
  }), (profile, source) => {
    const map = {
      version: 3,
      sources: ['work.ts'],
      names: [],
      mappings: 'AACA,gBAAgB',
    };
    fs.writeFileSync(path.join(path.dirname(source), 'generated.js'),
      'function bad() {}\n//# sourceMappingURL=data:application/json;base64,' +
      Buffer.from(JSON.stringify(map)).toString('base64'));
    const result = check(profile, source);
    assert.equal(result.status, 1, result.stderr + result.stdout);
    assert.match(result.stdout, /bad\(\) — 1\.2% of samples/);
    assert.match(result.stdout, /ported through a source map/);
    assert.match(result.stdout, /error  delete-property/);
  });
});

/** Invalid profile structures and accounting fail with the profile path. */
test('malformed profiles reject invalid shapes, IDs and sampled times', () => {
  const invalid = [
    null,
    [],
    { nodes: {}, samples: [], timeDeltas: [] },
    { nodes: [null], samples: [1], timeDeltas: [1] },
    { nodes: [{ id: 1 }], samples: [1], timeDeltas: [1] },
    { nodes: [frame(1.5, 'f', '')], samples: [1.5], timeDeltas: [1] },
    { nodes: [frame(0, 'f', '')], samples: [0], timeDeltas: [1] },
    { nodes: [frame(1, 'f', 'file:///work.ts', 1.5)],
      samples: [1], timeDeltas: [1] },
    { nodes: [{ id: 1, callFrame: { functionName: 'f', url: 5,
      lineNumber: 0, columnNumber: 0 } }], samples: [1], timeDeltas: [1] },
    { nodes: [frame(1, 'f', 'file://other-host/work.ts')],
      samples: [1], timeDeltas: [1] },
    { nodes: [frame(1, 'f', ''), frame(1, 'f', '')],
      samples: [1], timeDeltas: [1] },
    { nodes: [frame(1, 'f', '')], samples: [2], timeDeltas: [1] },
    { nodes: [frame(1, 'f', '')], samples: [2], timeDeltas: [0] },
    { nodes: [frame(1, 'f', '')], samples: [1, 1], timeDeltas: [1] },
    { nodes: [frame(1, 'f', '')], samples: [1], timeDeltas: [1, 2] },
    { nodes: [frame(1, 'f', '')], samples: ['1'], timeDeltas: [1] },
    { nodes: [frame(1, 'f', '')], samples: [1], timeDeltas: [-1] },
    { nodes: [frame(1, 'f', '')], samples: [1], timeDeltas: [null] },
    { nodes: [frame(1, 'f', '')], samples: [1], timeDeltas: ['1'] },
    '{"nodes":[{"id":1,"callFrame":{"functionName":"f","url":"",' +
      '"lineNumber":-1,"columnNumber":-1}}],"samples":[1],' +
      '"timeDeltas":[1e400]}',
    { nodes: [frame(1, 'f', '')], samples: [1, 1],
      timeDeltas: [Number.MAX_VALUE, Number.MAX_VALUE] },
  ];
  for (const data of invalid) {
    withProfile(() => data, (profile) => {
      assert.throws(() => hotFrames(profile), error =>
        error instanceof Error && error.message.includes(profile));
    });
  }
});

/** Lost intervals or unknown sampled IDs make the CLI fail with exit 2. */
test('invalid profile accounting cannot produce a clean CLI result', () => {
  for (const samples of [[1, 1], [2]]) {
    withProfile(url => ({
      nodes: [frame(1, 'clean', url)],
      samples,
      timeDeltas: [1],
    }), (profile, source) => {
      const result = check(profile, source);
      assert.equal(result.status, 2, result.stderr + result.stdout);
      assert.ok(result.stderr.includes(profile), result.stderr);
      assert.match(result.stderr, /invalid V8 --cpu-prof profile/);
      assert.doesNotMatch(result.stdout, /every hot function is clean/);
    });
  }
});
