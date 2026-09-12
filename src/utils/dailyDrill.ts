import { BEGINNER_COMBOS, INTERMEDIATE_COMBOS, COMBO_MAP, getCombo } from '../data/combos'
import { BOXING_BEGINNER, BOXING_INTERMEDIATE } from '../data/boxing'
import { MMA_BEGINNER, MMA_INTERMEDIATE } from '../data/mma-striking'
import type { Combo, DailyDrillMap, DailyDrillState, MartialArt } from '../types'
import { isMartialArt, martialArtLabel } from './martialArt'
import { booleanOr, defineOwn, hasOwn, isForbiddenKey, isPlainObject, nonEmptyString, oneOf, readBoolean } from '../storage/parseUnknown'
import { MARTIAL_ARTS } from '../storage/sessionValidation'
import { localDateKey } from './localDate'

const DAILY_DRILL_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2}):(boxing|muay-thai|mma-striking)$/

/** Storage / lookup key: local civil date + martial art. Never shown in UI. */
export function dailyDrillKey(dateKey: string, martialArt: MartialArt): string {
  if (dateKey.includes(':')) {
    const [, maybeArt] = dateKey.split(':')
    if (isMartialArt(maybeArt)) return dateKey
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
 * Validates canonical `YYYY-MM-DD:boxing|muay-thai|mma-striking` shape and a real civil date.
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
      : martialArt === 'mma-striking'
        ? [...MMA_BEGINNER, ...MMA_INTERMEDIATE]
        : [...BEGINNER_COMBOS, ...INTERMEDIATE_COMBOS]
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash + key.charCodeAt(i) * (i + 1)) % pool.length
  return pool[hash]!.id
}

function curatedComboForArt(comboId: string, martialArt: MartialArt): Combo | null {
  const combo = COMBO_MAP[comboId]
  if (!combo || combo.martialArt !== martialArt) return null
  return combo
}

/**
 * Display/session resolver. Never returns a known combo from the wrong sport.
 * Unknown or cross-sport IDs recover to the deterministic Daily pick for that key.
 */
export function resolveDailyDrillCombo(comboId: string, martialArt: MartialArt, dateKey?: string): Combo {
  const matched = curatedComboForArt(comboId, martialArt)
  if (matched) return matched
  const parsed = dateKey ? parseDailyDrillKey(dateKey) : { ok: false as const }
  const key = parsed.ok ? parsed.key : dailyDrillKey('1970-01-01', martialArt)
  return getCombo(pickDailyComboId(key, martialArt))
}

function salvageDailyDrillState(state: DailyDrillState): DailyDrillState {
  const parsed = parseDailyDrillKey(state.dateKey)
  const martialArt = parsed.ok ? parsed.martialArt : state.martialArt
  const key = parsed.ok ? parsed.key : dailyDrillKey(state.dateKey, martialArt)
  const comboId = curatedComboForArt(state.comboId, martialArt)
    ? state.comboId
    : pickDailyComboId(key, martialArt)
  return {
    ...state,
    dateKey: key,
    martialArt,
    comboId,
  }
}

export function validateImportedDailyDrill(
  raw: unknown,
  outerKey?: string,
): { ok: true; value: DailyDrillState } | { ok: false; message: string } {
  const normalized = normalizeDailyDrillState(raw)
  if (!normalized) return { ok: false, message: 'One or more dailyDrills records are invalid.' }

  const parsed = parseDailyDrillKey(normalized.dateKey)
  if (!parsed.ok) return { ok: false, message: 'Daily drill dateKey is invalid.' }
  if (normalized.martialArt !== parsed.martialArt) {
    return { ok: false, message: 'Daily drill dateKey does not match martialArt.' }
  }
  if (outerKey !== undefined && outerKey !== parsed.key) {
    return { ok: false, message: 'dailyDrills map key does not match dateKey.' }
  }

  const combo = COMBO_MAP[normalized.comboId]
  if (!combo) return { ok: false, message: 'Daily drill combo ID is unknown.' }
  if (combo.martialArt !== parsed.martialArt) {
    return { ok: false, message: 'Daily drill combo does not match its martial art.' }
  }

  return {
    ok: true,
    value: {
      ...normalized,
      dateKey: parsed.key,
      martialArt: parsed.martialArt,
    },
  }
}

export function validateImportedDailyDrills(
  raw: unknown,
): { ok: true; value: DailyDrillMap } | { ok: false; message: string } {
  if (!isPlainObject(raw)) return { ok: false, message: 'dailyDrills must be an object.' }
  const map: DailyDrillMap = {}
  for (const [key, value] of Object.entries(raw)) {
    if (isForbiddenKey(key)) return { ok: false, message: 'dailyDrills contains an invalid key.' }
    const validated = validateImportedDailyDrill(value, key)
    if (!validated.ok) return validated
    if (hasOwn(map, validated.value.dateKey)) {
      return { ok: false, message: 'dailyDrills contains duplicate date keys.' }
    }
    defineOwn(map, validated.value.dateKey, validated.value)
  }
  return { ok: true, value: map }
}

export { martialArtLabel }

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
    oneOf(raw.martialArt, MARTIAL_ARTS) ??
    (dateKey.includes(':mma-striking')
      ? 'mma-striking'
      : dateKey.includes(':boxing')
        ? 'boxing'
        : 'muay-thai')
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
    const salvaged = salvageDailyDrillState(state)
    return { [salvaged.dateKey]: salvaged }
  }

  const map: DailyDrillMap = {}
  for (const [key, value] of Object.entries(raw)) {
    if (isForbiddenKey(key)) continue
    const state = normalizeDailyDrillState(value)
    if (!state) continue
    const salvaged = salvageDailyDrillState(state)
    if (isForbiddenKey(salvaged.dateKey)) continue
    defineOwn(map, salvaged.dateKey, salvaged)
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
