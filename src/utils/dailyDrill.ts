import { BEGINNER_COMBOS, INTERMEDIATE_COMBOS, BOXING_COMBOS, getCombo } from '../data/combos'
import { BOXING_BEGINNER, BOXING_INTERMEDIATE } from '../data/boxing'
import type { Combo, DailyDrillMap, DailyDrillState, MartialArt } from '../types'
import { booleanOr, defineOwn, hasOwn, isForbiddenKey, isPlainObject, nonEmptyString, oneOf, readBoolean } from '../storage/parseUnknown'
import { MARTIAL_ARTS } from '../storage/sessionValidation'
import { localDateKey } from './localDate'

const DAILY_DRILL_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2}):(boxing|muay-thai)$/

/** Storage / lookup key: local civil date + martial art. Never shown in UI. */
export function dailyDrillKey(dateKey: string, martialArt: MartialArt): string {
  if (dateKey.includes(':')) {
    const [, maybeArt] = dateKey.split(':')
    if (maybeArt === 'boxing' || maybeArt === 'muay-thai') return dateKey
  }
  return `${dateKey}:${martialArt}`
}

export function todayDailyDrillKey(martialArt: MartialArt, now = new Date()): string {
  return dailyDrillKey(localDateKey(now), martialArt)
}

function isValidCivilDateParts(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const probe = new Date(year, month - 1, day)
  return probe.getFullYear() === year && probe.getMonth() === month - 1 && probe.getDate() === day
}

/**
 * Strict route-boundary parser for Daily Drill origin keys.
 * Validates canonical `YYYY-MM-DD:boxing|muay-thai` shape and a real civil date.
 * Does not require the key to equal today — a previous-day origin is valid after midnight.
 */
export function parseDailyDrillKey(
  raw: unknown,
): { ok: true; key: string; civilDate: string; martialArt: MartialArt } | { ok: false } {
  if (typeof raw !== 'string' || raw.length === 0) return { ok: false }
  const match = DAILY_DRILL_KEY_PATTERN.exec(raw)
  if (!match) return { ok: false }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!isValidCivilDateParts(year, month, day)) return { ok: false }
  const martialArt = match[4] as MartialArt
  return {
    ok: true,
    key: `${match[1]}-${match[2]}-${match[3]}:${martialArt}`,
    civilDate: `${match[1]}-${match[2]}-${match[3]}`,
    martialArt,
  }
}

/** Deterministic Daily combo id for a storage key. Same algorithm as the Daily page. */
export function pickDailyComboId(key: string, martialArt: MartialArt): string {
  const pool =
    martialArt === 'boxing'
      ? [...BOXING_BEGINNER, ...BOXING_INTERMEDIATE]
      : [...BEGINNER_COMBOS, ...INTERMEDIATE_COMBOS]
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash + key.charCodeAt(i) * (i + 1)) % pool.length
  return pool[hash]!.id
}

export function resolveDailyDrillCombo(comboId: string, martialArt: MartialArt): Combo {
  try {
    return getCombo(comboId)
  } catch {
    return martialArt === 'boxing' ? BOXING_COMBOS[0]! : BEGINNER_COMBOS[0]!
  }
}

export function martialArtLabel(art: MartialArt): string {
  return art === 'boxing' ? 'Boxing' : 'Muay Thai'
}

export function dailyDrillCompleteMessage(martialArt: MartialArt): string {
  return `Today’s ${martialArtLabel(martialArt)} drill is complete.`
}

export function emptyDailyDrill(
  dateKey: string,
  martialArt: MartialArt,
  comboId: string,
): DailyDrillState {
  const civil = dateKey.includes(':') ? dateKey.split(':')[0]! : dateKey
  const key = dailyDrillKey(civil, martialArt)
  return {
    dateKey: key,
    comboId,
    martialArt,
    slowDone: false,
    normalDone: false,
    fightDone: false,
    completed: false,
  }
}

export function isDailyDrillState(value: unknown): value is DailyDrillState {
  if (!isPlainObject(value)) return false
  return typeof value.dateKey === 'string' && typeof value.comboId === 'string'
}

export function normalizeDailyDrillState(raw: unknown): DailyDrillState | null {
  if (!isPlainObject(raw)) return null
  const dateKey = nonEmptyString(raw.dateKey, 80)
  const comboId = nonEmptyString(raw.comboId, 200)
  if (!dateKey || !comboId) return null
  if (hasOwn(raw, 'slowDone') && readBoolean(raw.slowDone) === undefined) return null
  if (hasOwn(raw, 'normalDone') && readBoolean(raw.normalDone) === undefined) return null
  if (hasOwn(raw, 'fightDone') && readBoolean(raw.fightDone) === undefined) return null
  if (hasOwn(raw, 'completed') && readBoolean(raw.completed) === undefined) return null
  if (hasOwn(raw, 'martialArt') && raw.martialArt != null && oneOf(raw.martialArt, MARTIAL_ARTS) === undefined) {
    return null
  }

  const martialArt: MartialArt =
    oneOf(raw.martialArt, MARTIAL_ARTS) ?? (dateKey.includes(':boxing') ? 'boxing' : 'muay-thai')
  const key = dailyDrillKey(dateKey, martialArt)
  return {
    dateKey: key,
    comboId,
    martialArt,
    slowDone: booleanOr(raw.slowDone, false),
    normalDone: booleanOr(raw.normalDone, false),
    fightDone: booleanOr(raw.fightDone, false),
    completed: booleanOr(raw.completed, false),
  }
}

/** Migrate legacy single-record DailyDrillState into a map. */
export function migrateDailyDrillMap(raw: unknown): DailyDrillMap {
  if (!isPlainObject(raw)) return {}

  // Legacy single record
  if (typeof raw.dateKey === 'string' && typeof raw.comboId === 'string') {
    const state = normalizeDailyDrillState(raw)
    if (!state) return {}
    return { [state.dateKey]: state }
  }

  const map: DailyDrillMap = {}
  for (const [key, value] of Object.entries(raw)) {
    if (isForbiddenKey(key)) continue
    const state = normalizeDailyDrillState(value)
    if (!state) continue
    const storageKey = dailyDrillKey(state.dateKey, state.martialArt)
    if (isForbiddenKey(storageKey)) continue
    defineOwn(map, storageKey, { ...state, dateKey: storageKey })
  }
  return map
}

export function phaseUnlocked(
  state: Pick<DailyDrillState, 'slowDone' | 'normalDone' | 'fightDone'>,
  phase: 'slowDone' | 'normalDone' | 'fightDone',
): boolean {
  if (phase === 'slowDone') return true
  if (phase === 'normalDone') return state.slowDone
  return state.slowDone && state.normalDone
}

export function phaseLockReason(phase: 'slowDone' | 'normalDone' | 'fightDone'): string | null {
  if (phase === 'slowDone') return null
  if (phase === 'normalDone') return 'Complete Slow practice first.'
  return 'Complete Slow and Normal practice first.'
}
