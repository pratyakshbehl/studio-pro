/**
 * Patch semantics shared by commands, overrides and the breakpoint resolver:
 * plain objects merge key by key, arrays and primitives replace, and
 * `undefined` removes a key.
 */

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Returns a new object; neither input is mutated. */
export function deepMerge<T>(base: T, patch: Record<string, unknown> | undefined): T {
  if (!patch) return base;
  if (!isPlainObject(base)) return structuredClone(patch) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete out[key];
    } else if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = deepMerge(out[key], value);
    } else {
      out[key] = isPlainObject(value) || Array.isArray(value) ? structuredClone(value) : value;
    }
  }
  return out as T;
}

/** Same rules as deepMerge, applied in place — for Immer drafts. */
export function assignDeep(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete target[key];
    } else if (isPlainObject(value) && isPlainObject(target[key])) {
      assignDeep(target[key] as Record<string, unknown>, value);
    } else {
      target[key] = isPlainObject(value) || Array.isArray(value) ? structuredClone(value) : value;
    }
  }
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const arr = b as unknown[];
    return a.length === arr.length && a.every((v, i) => deepEqual(v, arr[i]));
  }
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
