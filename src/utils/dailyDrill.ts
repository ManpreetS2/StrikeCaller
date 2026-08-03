import type { DailyDrillMap, DailyDrillState, MartialArt } from '../types'
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
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const raw = value as Record<string, unknown>
  return typeof raw.dateKey === 'string' && typeof raw.comboId === 'string'
}

export function normalizeDailyDrillState(raw: unknown): DailyDrillState | null {
  if (!isDailyDrillState(raw)) return null
  const martialArt: MartialArt =
    raw.martialArt === 'boxing'
      ? 'boxing'
      : raw.martialArt === 'muay-thai'
        ? 'muay-thai'
        : raw.dateKey.includes(':boxing')
          ? 'boxing'
          : 'muay-thai'
  const key = dailyDrillKey(raw.dateKey, martialArt)
  return {
    dateKey: key,
    comboId: raw.comboId,
    martialArt,
    slowDone: Boolean(raw.slowDone),
    normalDone: Boolean(raw.normalDone),
    fightDone: Boolean(raw.fightDone),
    completed: Boolean(raw.completed),
  }
}

/** Migrate legacy single-record DailyDrillState into a map. */
export function migrateDailyDrillMap(raw: unknown): DailyDrillMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}

  const obj = raw as Record<string, unknown>

  // Legacy single record
  if (typeof obj.dateKey === 'string' && typeof obj.comboId === 'string') {
    const state = normalizeDailyDrillState(obj)
    if (!state) return {}
    return { [state.dateKey]: state }
  }

  const map: DailyDrillMap = {}
  for (const [key, value] of Object.entries(obj)) {
    const state = normalizeDailyDrillState(value)
    if (!state) continue
    const storageKey = dailyDrillKey(state.dateKey, state.martialArt)
    map[storageKey] = { ...state, dateKey: storageKey }
    void key
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
