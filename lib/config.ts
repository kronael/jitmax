import fs from 'node:fs';
import { resolveDisabled } from './rules.ts';

export interface Config {
  // Validated [rules] keys, with defect codes left unexpanded.
  disabled: Set<string>;
  // [profile] min_self_pct — the share of sampled time a function must own
  // before profile mode calls it hot. A constant nobody has measured, so the
  // TOML owns it and every run prints the value it used (BUGS TC-57).
  // `undefined` means the file set no value, which is not the same as setting
  // the default: a `[profile]` table in a run with no profile configured
  // nothing, and the caller has to be able to see that and say so.
  minSelfPct?: number;
}

export const DEFAULT_MIN_SELF_PCT = 1;

type TomlValue = string | number | boolean;
type TomlTable = Record<string, TomlValue>;

function stripComment(line: string): string {
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === '#' && !inQuotes) return line.slice(0, i);
  }
  return line;
}

function parseKey(raw: string, path: string, lineNo: number): string {
  if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) return raw.slice(1, -1);
  if (/^[A-Za-z0-9_-]+$/.test(raw)) return raw;
  throw new Error(`${path}:${lineNo}: cannot read key: ${raw}`);
}

function parseValue(raw: string, path: string, lineNo: number): TomlValue {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) return raw.slice(1, -1);
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  throw new Error(`${path}:${lineNo}: cannot read value: ${raw}`);
}

// Not a general TOML implementation — jitmax.toml only ever needs one
// level of [table] headers and key = value pairs, so that is all this reads.
// A real TOML file with arrays, inline tables or multi-line strings will fail
// loudly here rather than being silently misread.
function parseToml(text: string, path: string): Record<string, TomlTable> {
  const tables: Record<string, TomlTable> = Object.create(null);
  let current: TomlTable | undefined;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = stripComment(lines[i] ?? '').trim();
    if (line === '') continue;

    const header = line.match(/^\[([^[\]]+)\]$/);
    if (header?.[1] !== undefined) {
      const name = header[1].trim();
      if (Object.hasOwn(tables, name)) {
        throw new Error(`${path}:${lineNo}: duplicate table: [${name}]`);
      }
      current = tables[name] = Object.create(null);
      continue;
    }

    const eq = line.indexOf('=');
    if (eq < 0) throw new Error(`${path}:${lineNo}: not a "key = value" line: ${line}`);
    if (!current) throw new Error(`${path}:${lineNo}: key outside any [table]: ${line}`);
    const key = parseKey(line.slice(0, eq).trim(), path, lineNo);
    if (Object.hasOwn(current, key)) {
      throw new Error(`${path}:${lineNo}: duplicate key: ${key}`);
    }
    current[key] = parseValue(line.slice(eq + 1).trim(), path, lineNo);
  }
  return tables;
}

export function loadConfig(configPath: string): Config {
  let text: string;
  try {
    text = fs.readFileSync(configPath, 'utf8');
  } catch (e) {
    // The errno, because a directory and a permission error both read as "no
    // such file" without it — the same misdiagnosis TC-80 filed against the
    // unresolved-module message.
    throw new Error(`cannot read ${configPath}: ${(e as NodeJS.ErrnoException).code ?? 'failed'}`);
  }
  const tables = parseToml(text, configPath);
  // A misspelled table disabled nothing, silently — `[rulez]` read as a clean
  // config and every rule stayed on. That is the same lie an unknown rule name
  // tells in resolveDisabled(), which throws, so this throws too.
  for (const name of Object.keys(tables)) {
    if (name !== 'rules' && name !== 'profile') {
      throw new Error(
        `${configPath}: unknown table [${name}] — the tables are [rules] and [profile]`
      );
    }
  }
  const rules = tables.rules ?? {};
  resolveDisabled(Object.keys(rules));
  const disabled = new Set<string>();
  for (const [key, value] of Object.entries(rules)) {
    if (typeof value !== 'boolean') {
      throw new Error(
        `${configPath}: [rules] "${key}" must be true or false, got ${JSON.stringify(value)}`
      );
    }
    if (value === false) disabled.add(key);
  }
  const profile = tables.profile ?? {};
  for (const key of Object.keys(profile)) {
    if (key !== 'min_self_pct') {
      throw new Error(`${configPath}: [profile] has no key "${key}" — only min_self_pct`);
    }
  }
  const pct = profile.min_self_pct;
  if (pct !== undefined && (typeof pct !== 'number' || pct <= 0 || pct > 100)) {
    throw new Error(
      `${configPath}: [profile] min_self_pct must be a number in (0, 100], got ${JSON.stringify(pct)}`
    );
  }
  return { disabled, minSelfPct: pct as number | undefined };
}
