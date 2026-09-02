import { DEFAULT_PREFERENCES } from '../data/defaults'
import type {
  CustomCombo,
  DailyDrillMap,
  DailyDrillState,
  MusicCompatibilityRecord,
  MusicCompatibilityResult,
  SessionSummary,
  UserPreferences,
} from '../types'
import { migrateDailyDrillMap, normalizeDailyDrillState } from '../utils/dailyDrill'
import { isPersistableSession, validateSessionSummary } from './sessionValidation'
import {
  classifyStorageError,
  HISTORY_QUOTA_MESSAGE,
  isQuotaExceededError,
  STORAGE_WRITE_MESSAGES,
  storageFail,
  type StorageWriteReason,
  type StorageWriteResult,
} from './storageTypes'

export {
  classifyStorageError,
  HISTORY_QUOTA_MESSAGE,
  isPersistableSession,
  STORAGE_WRITE_MESSAGES,
  validateSessionSummary,
  type StorageWriteReason,
  type StorageWriteResult,
}

export const STORAGE_KEYS = {
  preferences: 'strikecaller:preferences',
  favorites: 'strikecaller:favorites',
  customCombos: 'strikecaller:custom-combos',
  history: 'strikecaller:history',
  daily: 'strikecaller:daily-drill',
  musicCompatibility: 'strikecaller:music-compatibility',
} as const

const KEYS = STORAGE_KEYS

const MUSIC_RESULTS: MusicCompatibilityResult[] = [
  'music-lowered',
  'music-continued',
  'music-paused',
  'music-stopped',
  'voice-not-heard',
]

const PROBE_KEY = '__sc_test__'

/** Cached probe for reads/UI only. Writes always classify from the real setItem exception. */
let availabilityCache: boolean | null = null

function fail(reason: StorageWriteReason): Extract<StorageWriteResult, { ok: false }> {
  return storageFail(reason)
}

function classifyWriteError(error: unknown): Extract<StorageWriteResult, { ok: false }> {
  return classifyStorageError(error)
}

function probeStorage(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const storage = window.localStorage
    storage.setItem(PROBE_KEY, '1')
    storage.removeItem(PROBE_KEY)
    return true
  } catch (error) {
    // Tiny probe can fail from quota even though localStorage itself exists.
    return isQuotaExceededError(error)
  }
}

export function storageAvailable(): boolean {
  if (typeof window === 'undefined') return false
  if (availabilityCache != null) return availabilityCache
  availabilityCache = probeStorage()
  return availabilityCache
}

/** Test-only: drop the availability cache so mocks can change storage behavior. */
export function resetStorageAvailabilityCache(): void {
  availabilityCache = null
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

function writeJSON(key: string, value: unknown): StorageWriteResult {
  if (typeof window === 'undefined') return fail('unavailable')

  let serialized: string
  try {
    serialized = JSON.stringify(value)
  } catch {
    return fail('serialization')
  }
  if (typeof serialized !== 'string') return fail('serialization')

  try {
    window.localStorage.setItem(key, serialized)
    availabilityCache = true
    return { ok: true }
  } catch (error) {
    // Classify from the actual setItem exception. Do not consult the probe cache —
    // a stale "unavailable" result must not hide quota or other write failures.
    return classifyWriteError(error)
  }
}

export function snapshotRaw(key: string): { ok: true; value: string | null } | Extract<StorageWriteResult, { ok: false }> {
  if (typeof window === 'undefined') return fail('unavailable')
  try {
    return { ok: true, value: window.localStorage.getItem(key) }
  } catch (error) {
    return classifyWriteError(error)
  }
}

export function restoreRaw(key: string, value: string | null): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
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
  const martialArt = raw.martialArt === 'boxing' || raw.martialArt === 'muay-thai' ? raw.martialArt : 'muay-thai'

  const speechRaw = isObject(raw.speech) ? raw.speech : {}
  const musicCompatibility = validateMusicCompatibility(raw.musicCompatibility)

  // Legacy voice/rate/pitch/volume fields are accepted but normalized to safe defaults for runtime.
  void speechRaw.voiceURI
  void speechRaw.rate
  void speechRaw.pitch
  void speechRaw.volume

  return {
    ...DEFAULT_PREFERENCES,
    theme,
    stance,
    experience,
    callStyle,
    resumeBehavior,
    martialArt,
    musicCompatibility,
    equipment:
      raw.equipment === 'shadowboxing' ||
      raw.equipment === 'heavy-bag' ||
      raw.equipment === 'pads' ||
      raw.equipment === 'partner' ||
      raw.equipment === 'open-space' ||
      raw.equipment === 'limited-space'
        ? raw.equipment
        : DEFAULT_PREFERENCES.equipment,
    pace:
      raw.pace === 'learn' ||
      raw.pace === 'slow' ||
      raw.pace === 'technical' ||
      raw.pace === 'normal' ||
      raw.pace === 'fast' ||
      raw.pace === 'fight' ||
      raw.pace === 'custom'
        ? raw.pace
        : DEFAULT_PREFERENCES.pace,
    sideTerminology: raw.sideTerminology === 'left-right' ? 'left-right' : 'lead-rear',
    largeText: Boolean(raw.largeText),
    customPaceMultiplier:
      typeof raw.customPaceMultiplier === 'number' ? raw.customPaceMultiplier : DEFAULT_PREFERENCES.customPaceMultiplier,
    wakeLock: raw.wakeLock !== false,
    customComboMigrationNoticeShown: Boolean(raw.customComboMigrationNoticeShown),
    preferMinimalMode: Boolean(raw.preferMinimalMode),
    wakeLockNoticeDismissed: Boolean(raw.wakeLockNoticeDismissed),
    speech: {
      ...DEFAULT_PREFERENCES.speech,
      voiceURI: null,
      rate: 1,
      pitch: 1,
      volume: 1,
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
      captionsEnabled:
        typeof speechRaw.captionsEnabled === 'boolean'
          ? speechRaw.captionsEnabled
          : DEFAULT_PREFERENCES.speech.captionsEnabled,
      spokenCallsEnabled:
        typeof speechRaw.spokenCallsEnabled === 'boolean'
          ? speechRaw.spokenCallsEnabled
          : DEFAULT_PREFERENCES.speech.spokenCallsEnabled,
      coachingCuesEnabled: speechRaw.coachingCuesEnabled !== false,
      countdownEnabled: speechRaw.countdownEnabled !== false,
      roundCallsEnabled: speechRaw.roundCallsEnabled !== false,
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
  }
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

export function savePreferences(prefs: UserPreferences): StorageWriteResult {
  return writeJSON(KEYS.preferences, prefs)
}

export function resetPreferences(): { preferences: UserPreferences; write: StorageWriteResult } {
  const preferences = { ...DEFAULT_PREFERENCES }
  return { preferences, write: writeJSON(KEYS.preferences, preferences) }
}

export function loadFavorites(): string[] {
  const raw = readJSON<string[]>(KEYS.favorites)
  return Array.isArray(raw) ? raw.filter((id) => typeof id === 'string') : []
}

export function saveFavorites(ids: string[]): StorageWriteResult {
  return writeJSON(KEYS.favorites, ids)
}

export function loadCustomCombos(): CustomCombo[] {
  const raw = readJSON(KEYS.customCombos)
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => migrateCustomCombo(item))
    .filter((item): item is CustomCombo => item != null)
}

export function migrateCustomCombo(raw: unknown): CustomCombo | null {
  if (!isObject(raw)) return null
  if (typeof raw.id !== 'string' || typeof raw.title !== 'string' || !Array.isArray(raw.techniqueIds)) {
    return null
  }
  const ids = raw.techniqueIds.filter((id): id is string => typeof id === 'string')
  const migrated = ids.length > 8
  return {
    id: raw.id,
    title: raw.title,
    techniqueIds: ids.slice(0, 8),
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
    favorite: Boolean(raw.favorite),
    repeatCount:
      typeof raw.repeatCount === 'number' && Number.isFinite(raw.repeatCount)
        ? Math.min(20, Math.max(1, Math.round(raw.repeatCount)))
        : 1,
    martialArt: raw.martialArt === 'boxing' ? 'boxing' : 'muay-thai',
    migrated: migrated || Boolean(raw.migrated),
  }
}

export function saveCustomCombos(combos: CustomCombo[]): StorageWriteResult {
  return writeJSON(
    KEYS.customCombos,
    combos.map((c) => migrateCustomCombo(c)).filter(Boolean),
  )
}

export const LEGACY_HISTORY_KEY = KEYS.history

export function loadLegacyHistory(): SessionSummary[] {
  const raw = readJSON(KEYS.history)
  if (!Array.isArray(raw)) return []
  return raw
    .map(validateSessionSummary)
    .filter((item): item is SessionSummary => item != null)
    .filter(isPersistableSession)
}

export function removeLegacyHistory(): StorageWriteResult {
  if (typeof window === 'undefined') return fail('unavailable')
  try {
    window.localStorage.removeItem(KEYS.history)
    return { ok: true }
  } catch (error) {
    return classifyStorageError(error)
  }
}

export function loadDailyDrillMap(): DailyDrillMap {
  const raw = readJSON(KEYS.daily)
  const map = migrateDailyDrillMap(raw)
  // Persist migrated shape so single-record storage becomes a map
  if (raw != null && isObject(raw) && typeof raw.dateKey === 'string' && typeof raw.comboId === 'string') {
    writeJSON(KEYS.daily, map)
  }
  return map
}

/** @deprecated Prefer loadDailyDrillMap — returns today's first entry or null for legacy callers */
export function loadDailyDrill(): DailyDrillState | null {
  const map = loadDailyDrillMap()
  const values = Object.values(map)
  return values[0] ?? null
}

export function saveDailyDrillMap(map: DailyDrillMap): StorageWriteResult {
  return writeJSON(KEYS.daily, map)
}

export function saveDailyDrill(state: DailyDrillState): StorageWriteResult {
  const normalized = normalizeDailyDrillState(state)
  if (!normalized) return { ok: true }
  const map = loadDailyDrillMap()
  map[normalized.dateKey] = normalized
  return saveDailyDrillMap(map)
}

export const EXPORT_VERSION = 3
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024
export const MAX_IMPORT_HISTORY = 5000
export const MAX_IMPORT_CUSTOM_COMBOS = 500
