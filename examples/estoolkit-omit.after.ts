// es-toolkit 1.50.0 — https://github.com/toss/es-toolkit — MIT
// Copyright (c) 2024 Viva Republica, Inc

/** @jitmax */
export function omit<T extends Record<string, any>, K extends keyof T>(obj: T, keys: readonly K[]): Omit<T, K> {
  const result: Record<PropertyKey, unknown> = {};
  const values: Record<PropertyKey, unknown> = { ...obj };
  const excluded: PropertyKey[] = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    excluded.push(typeof key === 'symbol' ? key : String(key));
  }

  for (const key of Reflect.ownKeys(values)) {
    if (!excluded.includes(key)) {
      Object.defineProperty(result, key, {
        value: values[key], enumerable: true, writable: true, configurable: true,
      });
    }
  }

  return result as Omit<T, K>;
}
