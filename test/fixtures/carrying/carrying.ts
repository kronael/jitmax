// vue's renderer, cut down (BUGS TC-149). `VNodeType` has six members with six
// property sets, and only two of them carry `process`: a member without it
// throws at the call rather than dispatching there, so two sets can reach it.
const TeleportImpl = { __isTeleport: true, process(n: number): number { return n + 1; } };
const SuspenseImpl = { __isSuspense: true, process(n: number): number { return n + 2; } };
const Fragment = { __isFragment: true };
const Text = { __isText: true };
interface Options { setup(): void; props: string[] }
type VNodeType =
  | string
  | Options
  | typeof Fragment
  | typeof Text
  | typeof TeleportImpl
  | typeof SuspenseImpl
  | { __isComment: true };

/** @jitmax */
export function patch(type: VNodeType, n: number): number {
  return (type as typeof TeleportImpl).process(n);
}

// pixi's render loop, cut down: every pipe carries `execute`, and the cast to
// the interface they share changes nothing about which of them reach the call.
interface InstructionPipe { execute(n: number): number }
type Pipes = {
  batch: { batch: true; execute(n: number): number };
  mesh: { mesh: true; execute(n: number): number };
  sprite: { sprite: true; execute(n: number): number };
  graphics: { graphics: true; execute(n: number): number };
  filter: { filter: true; execute(n: number): number };
  mask: { mask: true };
};

/** @jitmax */
export function executeAll(pipes: Pipes, ids: Array<keyof Pipes>): number {
  let s = 0;
  for (const id of ids) s += (pipes[id] as InstructionPipe).execute(s);
  return s;
}
