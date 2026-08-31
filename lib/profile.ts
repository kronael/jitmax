import fs from 'node:fs';
import path from 'node:path';
import { SourceMap, type SourceMapPayload } from 'node:module';
import { fileURLToPath } from 'node:url';

// A V8 `--cpu-prof` profile, read for one thing: which functions the workload
// actually spent time in. Hotness is a property of the workload — that sentence
// is printed under every run of this tool — so a mode that reports "hot code"
// has to measure hotness rather than infer it from loops and fan-in, which
// predict it weakly and fail in exactly the higher-order code the walk already
// cannot follow (BUGS TC-57).

export interface HotFrame {
  file: string;
  line: number;
  column: number;
  name: string;
  // Self time as a percentage of the profile's total sampled time.
  pct: number;
  // Where the profile itself put this frame, when a source map moved it. The
  // three fields above are then the AUTHOR's position — the one a finding has
  // to name — and this is the transformed one V8 sampled (BUGS TC-77).
  generated?: { file: string; line: number; column: number };
}

// Every field optional below `id`: this is somebody else's JSON, and a node
// without a callFrame crashed the tool with an unattributed TypeError that
// exit 2 then printed with no file and no line.
interface Node {
  id: number;
  callFrame?: {
    functionName?: string;
    url?: string;
    lineNumber?: number;
    columnNumber?: number;
  };
}

// The transform between the source and the profile, undone. A frame's position
// is a position in the file V8 RAN, and the functions it is matched against are
// the ones the author wrote; the two only meet when the position is ported back
// through the source map the transform left behind. Without this, a fresh
// profile of a codebase that needs `--experimental-transform-types` — one real
// `enum` forces it — was reported as stale against its own sources (BUGS TC-77).
//
// Deliberately NOT ported, because each is a position this tool would have to
// guess at: a file with no `sourceMappingURL`, a map named over http (this tool
// reads the disk and nothing else), an `originalSource` that is not a filesystem
// path, and a position no segment on its OWN generated line covers — findEntry
// answers with the segment at or before a position, and past the last segment of
// a line that segment belongs to an earlier line, which is an answer about
// different code. Those frames stay where V8 put them and the report names them.
const SOURCE_MAPPING_URL = /\/\/[#@]\s*sourceMappingURL=(\S+)/g;

interface Located {
  map: SourceMap;
  // What the map's `sources` are relative to: its own directory, and the
  // `sourceRoot` it prefixes them with.
  dir: string;
  root: string;
}

// Absent — no comment, nothing this tool fetches, no such file — is `undefined`.
// Present and unreadable throws, out of the caller below with the file named: a
// map that will not parse is a broken build artifact, and reading it as absent
// would file its frames under "no source map here", a diagnosis of a different
// problem.
function readMap(url: string, dir: string): Located | undefined {
  let json: string;
  if (url.startsWith('data:')) {
    const comma = url.indexOf(',');
    if (comma < 0) return undefined;
    const body = url.slice(comma + 1);
    json = url.slice(0, comma).includes(';base64')
      ? Buffer.from(body, 'base64').toString('utf8')
      : decodeURIComponent(body);
  } else if (/^https?:/i.test(url)) {
    return undefined;
  } else {
    const at = url.startsWith('file:') ? fileURLToPath(url) : path.resolve(dir, decodeURIComponent(url));
    dir = path.dirname(at);
    try {
      json = fs.readFileSync(at, 'utf8');
    } catch {
      return undefined;
    }
  }
  const payload = JSON.parse(json) as Partial<SourceMapPayload>;
  return { map: new SourceMap(payload as SourceMapPayload), dir, root: payload.sourceRoot ?? '' };
}

function mapBeside(file: string): Located | undefined {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
  // The LAST comment wins, which is how V8 and every other consumer reads it.
  let url: string | undefined;
  for (const m of text.matchAll(SOURCE_MAPPING_URL)) url = m[1];
  if (url === undefined) return undefined;
  try {
    return readMap(url, path.dirname(file));
  } catch (e) {
    throw new Error(`${file}: its sourceMappingURL is not a source map: ${(e as Error).message}`);
  }
}

function ported(frames: HotFrame[]): HotFrame[] {
  // One read per file: a profile names the same file in frame after frame.
  const maps = new Map<string, Located | undefined>();
  return frames.map((frame) => {
    if (!maps.has(frame.file)) maps.set(frame.file, mapBeside(frame.file));
    const found = maps.get(frame.file);
    if (found === undefined) return frame;
    const entry = found.map.findEntry(frame.line - 1, frame.column - 1);
    if (!('originalSource' in entry) || entry.generatedLine !== frame.line - 1) return frame;
    const source = entry.originalSource;
    // `webpack://name/./src/a.ts` and its kind name no file on this disk, and
    // resolving one as a path invents a directory nobody has. Left where V8 put
    // it, like every other position this cannot map.
    if (/^[a-z][a-z0-9+.-]+:/i.test(source) && !source.startsWith('file:')) return frame;
    return {
      ...frame,
      file: source.startsWith('file:')
        ? fileURLToPath(source)
        : path.resolve(found.dir, found.root, source),
      line: entry.originalLine + 1,
      column: entry.originalColumn + 1,
      generated: { file: frame.file, line: frame.line, column: frame.column },
    };
  });
}

// Self time from `samples` and `timeDeltas` rather than `hitCount`: a sample
// carries the time actually attributed to it, and hitCount weights every sample
// equally whatever the sampling interval did.
export function hotFrames(profilePath: string, minSelfPct: number): HotFrame[] {
  let text: string;
  try {
    text = fs.readFileSync(profilePath, 'utf8');
  } catch (e) {
    throw new Error(`cannot read ${profilePath}: ${(e as NodeJS.ErrnoException).code ?? 'failed'}`);
  }
  let parsed: { nodes?: Node[]; samples?: number[]; timeDeltas?: number[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${profilePath}: not JSON — expected a V8 --cpu-prof profile`);
  }
  const { nodes, samples, timeDeltas } = parsed;
  if (!nodes || !samples || !timeDeltas) {
    throw new Error(`${profilePath}: not a V8 --cpu-prof profile (no nodes/samples/timeDeltas)`);
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const self = new Map<number, number>();
  let total = 0;
  // timeDeltas[i] is the time BEFORE samples[i], which is the interval that
  // sample stands for.
  for (let i = 0; i < samples.length; i++) {
    const dt = timeDeltas[i] ?? 0;
    if (dt <= 0) continue;
    const id = samples[i]!;
    self.set(id, (self.get(id) ?? 0) + dt);
    total += dt;
  }
  if (total === 0) throw new Error(`${profilePath}: the profile has no sampled time in it`);

  const out: HotFrame[] = [];
  for (const [id, time] of self) {
    const node = byId.get(id);
    // A frame with no URL is the engine's own: (garbage collector), (program),
    // (idle). Real time, no source line, nothing this tool can report on.
    const frame = node?.callFrame;
    if (!frame?.url?.startsWith('file://')) continue;
    const pct = (time / total) * 100;
    if (pct < minSelfPct) continue;
    out.push({
      file: fileURLToPath(frame.url),
      // cpuprofile positions are 0-based; every Site in this project is 1-based.
      line: (frame.lineNumber ?? 0) + 1,
      column: (frame.columnNumber ?? 0) + 1,
      name: frame.functionName || '<anonymous>',
      pct,
    });
  }
  return ported(out).sort((a, b) => b.pct - a.pct);
}
