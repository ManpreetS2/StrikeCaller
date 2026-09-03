import type { DailyDrillMap, DailyDrillState, MartialArt } from '../types'
import { booleanOr, defineOwn, hasOwn, isForbiddenKey, isPlainObject, nonEmptyString, oneOf, readBoolean } from '../storage/parseUnknown'
import { MARTIAL_ARTS } from '../storage/sessionValidation'
import { localDateKey } from './localDate'

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
