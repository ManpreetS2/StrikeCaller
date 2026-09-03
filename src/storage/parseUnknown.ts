/** Small helpers for untrusted JSON (localStorage, IndexedDB, import files). */

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

export function isForbiddenKey(key: string): boolean {
  return FORBIDDEN_KEYS.has(key)
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  if (typeof value !== 'string') return undefined
  return (allowed as readonly string[]).includes(value) ? (value as T) : undefined
}

/** Only an actual boolean. Strings such as `"false"` are not booleans. */
export function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

export function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

export function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function finiteInRange(value: unknown, min: number, max: number): number | undefined {
  const n = finiteNumber(value)
  if (n === undefined || n < min || n > max) return undefined
  return n
}

export function nonNegativeFinite(value: unknown): number | undefined {
  const n = finiteNumber(value)
  if (n === undefined || n < 0) return undefined
  return n
}

export function nonNegativeInt(value: unknown): number | undefined {
  const n = nonNegativeFinite(value)
  if (n === undefined || !Number.isInteger(n)) return undefined
  return n
}

export function nonEmptyString(value: unknown, maxLength = 500): string | undefined {
  if (typeof value !== 'string') return undefined
  if (value.length === 0 || value.length > maxLength) return undefined
  return value
}

export function stringValue(value: unknown, maxLength = 20_000): string | undefined {
  if (typeof value !== 'string' || value.length > maxLength) return undefined
  return value
}

/**
 * Assign an own enumerable property without going through the `__proto__` setter.
 * Forbidden keys are ignored.
 */
export function defineOwn<T>(target: Record<string, T>, key: string, value: T): void {
  if (isForbiddenKey(key)) return
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  })
}
