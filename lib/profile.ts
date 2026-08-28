import fs from 'node:fs';
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
}

interface Node {
  id: number;
  callFrame: {
    functionName: string;
    url: string;
    lineNumber: number;
    columnNumber: number;
  };
}

// Self time from `samples` and `timeDeltas` rather than `hitCount`: a sample
// carries the time actually attributed to it, and hitCount weights every sample
// equally whatever the sampling interval did.
export function hotFrames(profilePath: string, minSelfPct: number): HotFrame[] {
  let text: string;
  try {
    text = fs.readFileSync(profilePath, 'utf8');
  } catch {
    throw new Error(`no such file: ${profilePath}`);
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
    if (!node || !node.callFrame.url.startsWith('file://')) continue;
    const pct = (time / total) * 100;
    if (pct < minSelfPct) continue;
    out.push({
      file: fileURLToPath(node.callFrame.url),
      // cpuprofile positions are 0-based; every Site in this project is 1-based.
      line: node.callFrame.lineNumber + 1,
      column: node.callFrame.columnNumber + 1,
      name: node.callFrame.functionName || '<anonymous>',
      pct,
    });
  }
  return out.sort((a, b) => b.pct - a.pct);
}
