import { DEFAULT_PREFERENCES } from '../data/defaults'
import type {
  CustomCombo,
  DailyDrillState,
  MusicCompatibilityRecord,
  MusicCompatibilityResult,
  SessionSummary,
  UserPreferences,
} from '../types'

const KEYS = {
  preferences: 'strikecaller:preferences',
  favorites: 'strikecaller:favorites',
  customCombos: 'strikecaller:custom-combos',
  history: 'strikecaller:history',
  daily: 'strikecaller:daily-drill',
  musicCompatibility: 'strikecaller:music-compatibility',
} as const

const MUSIC_RESULTS: MusicCompatibilityResult[] = [
  'music-lowered',
  'music-continued',
  'music-paused',
  'music-stopped',
  'voice-not-heard',
]

function storageAvailable(): boolean {
  try {
    const key = '__sc_test__'
    window.localStorage.setItem(key, '1')
    window.localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

function readJSON<T>(key: string): unknown {
  if (typeof window === 'undefined' || !storageAvailable()) return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function writeJSON(key: string, value: unknown): boolean {
  if (typeof window === 'undefined' || !storageAvailable()) return false
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validatePreferences(raw: unknown): UserPreferences {
  if (!isObject(raw)) return { ...DEFAULT_PREFERENCES }

  const theme = raw.theme === 'dark' || raw.theme === 'light' || raw.theme === 'system' ? raw.theme : DEFAULT_PREFERENCES.theme
  const stance = raw.stance === 'orthodox' || raw.stance === 'southpaw' ? raw.stance : DEFAULT_PREFERENCES.stance
  const experience =
    raw.experience === 'beginner' || raw.experience === 'intermediate' || raw.experience === 'advanced'
      ? raw.experience
      : DEFAULT_PREFERENCES.experience
  const callStyle =
    raw.callStyle === 'names' || raw.callStyle === 'numbers' || raw.callStyle === 'hybrid'
      ? raw.callStyle
      : DEFAULT_PREFERENCES.callStyle
  const resumeBehavior =
    raw.resumeBehavior === 'restart-combo' || raw.resumeBehavior === 'next-combo'
      ? raw.resumeBehavior
      : DEFAULT_PREFERENCES.resumeBehavior

  const speechRaw = isObject(raw.speech) ? raw.speech : {}
  const musicCompatibility = validateMusicCompatibility(raw.musicCompatibility)

  return {
    ...DEFAULT_PREFERENCES,
    ...raw,
    theme,
    stance,
    experience,
    callStyle,
    resumeBehavior,
    musicCompatibility,
    speech: {
      ...DEFAULT_PREFERENCES.speech,
      ...speechRaw,
      callStyle:
        speechRaw.callStyle === 'names' ||
        speechRaw.callStyle === 'numbers' ||
        speechRaw.callStyle === 'hybrid'
          ? speechRaw.callStyle
          : callStyle,
      musicFriendly:
        typeof speechRaw.musicFriendly === 'boolean'
          ? speechRaw.musicFriendly
          : DEFAULT_PREFERENCES.speech.musicFriendly,
    },
    sound: {
      ...DEFAULT_PREFERENCES.sound,
      ...(isObject(raw.sound) ? raw.sound : {}),
    },
    timingMultipliers: {
      ...DEFAULT_PREFERENCES.timingMultipliers,
      ...(isObject(raw.timingMultipliers) ? raw.timingMultipliers : {}),
    },
    onboardingComplete: Boolean(raw.onboardingComplete),
    includeDefense: raw.includeDefense !== false,
    includeMovement: raw.includeMovement !== false,
  } as UserPreferences
}

export function validateMusicCompatibility(raw: unknown): MusicCompatibilityRecord | null {
  if (!isObject(raw)) return null
  if (typeof raw.result !== 'string' || !MUSIC_RESULTS.includes(raw.result as MusicCompatibilityResult)) {
    return null
  }
  if (typeof raw.testedAt !== 'number' || typeof raw.userAgent !== 'string') return null
  return {
    result: raw.result as MusicCompatibilityResult,
    testedAt: raw.testedAt,
    userAgent: raw.userAgent,
    audioSessionSupported: Boolean(raw.audioSessionSupported),
  }
}

export function loadPreferences(): UserPreferences {
  return validatePreferences(readJSON(KEYS.preferences))
}

export function savePreferences(prefs: UserPreferences): void {
  writeJSON(KEYS.preferences, prefs)
}

export function resetPreferences(): UserPreferences {
  const next = { ...DEFAULT_PREFERENCES }
  writeJSON(KEYS.preferences, next)
  return next
}

export function loadFavorites(): string[] {
  const raw = readJSON<string[]>(KEYS.favorites)
  return Array.isArray(raw) ? raw.filter((id) => typeof id === 'string') : []
}

export function saveFavorites(ids: string[]): void {
  writeJSON(KEYS.favorites, ids)
}

export function loadCustomCombos(): CustomCombo[] {
  const raw = readJSON(KEYS.customCombos)
  if (!Array.isArray(raw)) return []
  return raw.filter((item): item is CustomCombo => {
    if (!isObject(item)) return false
    return (
      typeof item.id === 'string' &&
      typeof item.title === 'string' &&
      Array.isArray(item.techniqueIds) &&
      item.techniqueIds.every((id) => typeof id === 'string')
    )
  })
}

export function saveCustomCombos(combos: CustomCombo[]): void {
  writeJSON(KEYS.customCombos, combos)
}

export function loadHistory(): SessionSummary[] {
  const raw = readJSON(KEYS.history)
  if (!Array.isArray(raw)) return []
  return raw.filter((item): item is SessionSummary => isObject(item) && typeof item.id === 'string')
}

export function saveHistory(history: SessionSummary[]): void {
  writeJSON(KEYS.history, history.slice(0, 50))
}

export function clearHistory(): void {
  writeJSON(KEYS.history, [])
}

export function loadDailyDrill(): DailyDrillState | null {
  const raw = readJSON(KEYS.daily)
  if (!isObject(raw)) return null
  if (typeof raw.dateKey !== 'string' || typeof raw.comboId !== 'string') return null
  return raw as unknown as DailyDrillState
}

export function saveDailyDrill(state: DailyDrillState): void {
  writeJSON(KEYS.daily, state)
}

export function exportUserData(): string {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      preferences: loadPreferences(),
      favorites: loadFavorites(),
      customCombos: loadCustomCombos(),
      history: loadHistory(),
      dailyDrill: loadDailyDrill(),
    },
    null,
    2,
  )
}

export function importUserData(json: string): { ok: boolean; message: string } {
  try {
    const data = JSON.parse(json) as unknown
    if (!isObject(data)) return { ok: false, message: 'Invalid JSON structure.' }
    if (data.preferences) savePreferences(validatePreferences(data.preferences))
    if (Array.isArray(data.favorites)) saveFavorites(data.favorites.filter((x) => typeof x === 'string'))
    if (Array.isArray(data.customCombos)) {
      saveCustomCombos(data.customCombos as CustomCombo[])
    }
    if (Array.isArray(data.history)) saveHistory(data.history as SessionSummary[])
    if (data.dailyDrill && isObject(data.dailyDrill)) saveDailyDrill(data.dailyDrill as unknown as DailyDrillState)
    return { ok: true, message: 'Import successful.' }
  } catch {
    return { ok: false, message: 'Could not parse JSON.' }
  }
}

export { storageAvailable }
