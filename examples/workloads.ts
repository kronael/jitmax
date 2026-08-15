// The caller. Each entry says how one example's function is actually reached:
// what it is passed, at what size, how many times, and what the caller then
// does with the result. Those choices decide the whole comparison, so they are
// written down here rather than buried in a runner — an end-to-end number is
// only worth reading if the "end" is stated.
//
//   inputs(n, seed)  BATCH argument lists, each shaped the way the library's
//                    own doc comment describes the function being used
//   run(fn, args)    applies the function; it exists only because the three
//                    examples have different arities
//   read(result)     what the caller does with the return value — named
//                    property loads, because that is what code does with a
//                    config object, and because `delete-property`'s cost is a
//                    cost per load, paid here rather than inside the function
//   digest(result)   the checksum. Deliberately not the same function as
//                    `read`: `read` sits in the timed region and stays as small
//                    as a real caller's use, `digest` runs once outside it and
//                    walks everything, so a before/after pair that computes
//                    different objects fails the pair instead of reporting a
//                    speedup.
//
// BATCH is why every workload is a list rather than one call. A timed loop that
// reads the same object every pass is a loop whose loads are invariant, and
// TurboFan hoists them out — that is exactly how this project came to publish
// "a single delete costs nothing" for a year (BUGS TC-15). A batch of distinct
// results forces a real load per iteration on both sides. 64 is the size of a
// page of rows, which is the shape the caller of any of these three is in.

type Cfg = Record<string, any>;

const BATCH = 64;

const lcg = (seed: number): (() => number) => {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
};

const hash = (key: PropertyKey): number => {
  const s = String(key);
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000003;
  return h;
};

// Order-independent over keys, order-sensitive over array indices, and it walks
// `Reflect.ownKeys` so a dropped symbol-keyed property is a mismatch rather
// than a saving. Every intermediate is reduced under 10^6 before it is
// multiplied, so the sum stays an exact integer and a real difference cannot
// round away.
const digest = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 1000) % 1000003 : 7;
  if (typeof v === 'string') return hash(v);
  if (typeof v === 'boolean') return v ? 1 : 2;
  if (v === null || v === undefined) return 3;
  if (typeof v !== 'object') return 5;
  let t = 0;
  for (const k of Reflect.ownKeys(v)) {
    const child = digest((v as Record<PropertyKey, unknown>)[k]) % 1000003;
    t = (t + hash(k) * (1 + child)) % 1e12;
  }
  return t;
};

// radash `assign(defaults, override)`. radash's doc comment calls it a
// recursive merge of two objects, so both sides are configuration objects of
// the same n keys: three named numbers the caller reads back, one nested
// section — the branch that makes `assign` recurse — and n-4 further numeric
// options. n = 16 is an ordinary options bag, n = 128 a large one.
export const radashAssign = {
  what: 'assign(defaults, options) over two config objects of n keys',
  inputs: (n: number, seed: number): Array<[Cfg, Cfg]> => {
    const rand = lcg(seed);
    const out: Array<[Cfg, Cfg]> = [];
    for (let b = 0; b < BATCH; b++) {
      const defaults: Cfg = {
        timeout: 30,
        retries: 3,
        verbose: 0,
        retry: { attempts: 2, delay: 100 },
      };
      const options: Cfg = {
        timeout: 60,
        retries: 5,
        verbose: 1,
        retry: { attempts: 4, delay: 250 },
      };
      for (let i = 0; i < n - 4; i++) {
        defaults[`opt${i}`] = 1 + Math.floor(rand() * 1000);
        options[`opt${i}`] = 1 + Math.floor(rand() * 1000);
      }
      out.push([defaults, options]);
    }
    return out;
  },
  run: (fn: (a: Cfg, b: Cfg) => Cfg, args: [Cfg, Cfg]): Cfg => fn(args[0], args[1]),
  read: (c: Cfg): number => c.timeout + c.retries + c.verbose + c.retry.attempts,
  digest,
};

// remeda `mergeAll(objects)`. remeda's example is a list of partial objects
// merged left to right, so n is the number of objects: 8 is an ordinary
// defaults/plugin list, 64 a large one. The first object is the base config the
// caller reads back; each of the rest adds three keys of its own and overwrites
// one shared key, which is how such a list grows in real use — if every object
// carried the same keys there would be nothing quadratic to find, and if none
// overlapped the merge would not be a merge.
export const remedaMergeAll = {
  what: 'mergeAll(objects) over n partial config objects',
  inputs: (n: number, seed: number): Array<[Cfg[]]> => {
    const rand = lcg(seed);
    const v = (): number => 1 + Math.floor(rand() * 1000);
    const out: Array<[Cfg[]]> = [];
    for (let b = 0; b < BATCH; b++) {
      const objects: Cfg[] = [{ timeout: 30, port: 8080, depth: 1 }];
      for (let i = 1; i < n; i++) {
        objects.push({ [`a${i}`]: v(), [`b${i}`]: v(), [`c${i}`]: v(), timeout: v() });
      }
      out.push([objects]);
    }
    return out;
  },
  run: (fn: (objects: readonly object[]) => object, args: [Cfg[]]): object => fn(args[0]),
  read: (o: object): number => {
    const c = o as Cfg;
    return c.timeout + c.port + c.depth;
  },
  digest,
};

// es-toolkit `omit(obj, keys)`. The canonical use is stripping a couple of
// secrets off a record before it leaves the process, so two keys are omitted at
// every n and n is the width of the record: 12 is a user row, 48 a fat one. The
// caller then reads four named fields off the result, which is where
// `delete-property`'s cost lands — the object `omit` returns has been demoted
// to dictionary mode and every one of those loads pays for it.
export const estoolkitOmit = {
  what: "omit(record, ['password', 'token']) on a record of n keys, result read by name",
  inputs: (n: number, seed: number): Array<[Cfg, string[]]> => {
    const rand = lcg(seed);
    const out: Array<[Cfg, string[]]> = [];
    for (let b = 0; b < BATCH; b++) {
      const record: Cfg = {
        id: 1 + Math.floor(rand() * 1000),
        age: 1 + Math.floor(rand() * 100),
        score: 1 + Math.floor(rand() * 1000),
        rank: 1 + Math.floor(rand() * 100),
        password: 'hunter2',
        token: 'tok_abcdef',
      };
      for (let i = 0; i < n - 6; i++) record[`f${i}`] = 1 + Math.floor(rand() * 1000);
      out.push([record, ['password', 'token']]);
    }
    return out;
  },
  run: (fn: (obj: Cfg, keys: readonly string[]) => Cfg, args: [Cfg, string[]]): Cfg =>
    fn(args[0], args[1]),
  read: (r: Cfg): number => r.id + r.age + r.score + r.rank,
  digest,
};
