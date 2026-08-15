import fs from 'node:fs';

export interface Config {
  // Raw keys from [rules]: a rule name or a defect code, unexpanded. Expanding
  // and validating them against what the checker actually knows is
  // resolveDisabled()'s job in rules.ts — config.ts only reads the file.
  disabled: Set<string>;
}

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

// Not a general TOML implementation — turbocharge.toml only ever needs one
// level of [table] headers and key = value pairs, so that is all this reads.
// A real TOML file with arrays, inline tables or multi-line strings will fail
// loudly here rather than being silently misread.
function parseToml(text: string, path: string): Record<string, TomlTable> {
  const tables: Record<string, TomlTable> = {};
  let current: TomlTable | undefined;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = stripComment(lines[i] ?? '').trim();
    if (line === '') continue;

    const header = line.match(/^\[([^[\]]+)\]$/);
    if (header?.[1] !== undefined) {
      const name = header[1].trim();
      current = tables[name] ??= {};
      continue;
    }

    const eq = line.indexOf('=');
    if (eq < 0) throw new Error(`${path}:${lineNo}: not a "key = value" line: ${line}`);
    if (!current) throw new Error(`${path}:${lineNo}: key outside any [table]: ${line}`);
    const key = parseKey(line.slice(0, eq).trim(), path, lineNo);
    current[key] = parseValue(line.slice(eq + 1).trim(), path, lineNo);
  }
  return tables;
}

export function loadConfig(configPath: string): Config {
  let text: string;
  try {
    text = fs.readFileSync(configPath, 'utf8');
  } catch {
    throw new Error(`no such file: ${configPath}`);
  }
  const tables = parseToml(text, configPath);
  const rules = tables.rules ?? {};
  const disabled = new Set<string>();
  for (const [key, value] of Object.entries(rules)) {
    if (typeof value !== 'boolean') {
      throw new Error(
        `${configPath}: [rules] "${key}" must be true or false, got ${JSON.stringify(value)}`
      );
    }
    if (value === false) disabled.add(key);
  }
  return { disabled };
}
