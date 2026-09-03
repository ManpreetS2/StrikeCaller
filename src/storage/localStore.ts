import { DEFAULT_PREFERENCES } from '../data/defaults'
import { MAX_COMBO_LENGTH } from '../engines/comboValidator'
import type {
  CustomCombo,
  DailyDrillMap,
  DailyDrillState,
  MusicCompatibilityRecord,
  MusicCompatibilityResult,
  SessionSummary,
  ThemePreference,
  UserPreferences,
} from '../types'
import { migrateDailyDrillMap, normalizeDailyDrillState } from '../utils/dailyDrill'
import { WORKOUT_LIMITS } from '../utils/workoutValidation'
import {
  booleanOr,
  finiteInRange,
  hasOwn,
  isPlainObject,
  nonEmptyString,
  nonNegativeFinite,
  nonNegativeInt,
  oneOf,
  readBoolean,
  stringValue,
} from './parseUnknown'
import {
  CALL_STYLES,
  DIFFICULTIES,
  EQUIPMENT,
  MARTIAL_ARTS,
  MAX_FAVORITE_IDS,
  MAX_SESSION_ID_LENGTH,
  MAX_STRING_FIELD,
  PACE_PRESETS,
  RESUME_BEHAVIORS,
  SIDE_TERMINOLOGY,
  STANCES,
  isPersistableSession,
  validateSessionSummary,
  validateSoundSettings,
  validateSpeechSettings,
  validateTimingMultipliers,
} from './sessionValidation'
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

/** Every StrikeCaller-owned localStorage key. Never pass this list to localStorage.clear(). */
export const USER_DATA_STORAGE_KEYS = [
  KEYS.preferences,
  KEYS.favorites,
  KEYS.customCombos,
  KEYS.history,
  KEYS.daily,
  KEYS.musicCompatibility,
] as const

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

function readJSON(key: string): unknown {
  if (typeof window === 'undefined' || !storageAvailable()) return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw)
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

const THEMES = ['dark', 'light', 'system'] as const satisfies readonly ThemePreference[]

function isObject(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value)
}

function presentInvalidEnum<T extends string>(
  raw: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): boolean {
  if (!hasOwn(raw, key)) return false
  return oneOf(raw[key], allowed) === undefined
}

function presentInvalidBoolean(raw: Record<string, unknown>, key: string): boolean {
  if (!hasOwn(raw, key)) return false
  return readBoolean(raw[key]) === undefined
}

/**
 * LOAD salvage for preferences: missing fields receive product defaults;
 * present-but-invalid enums/ranges fall back; `"false"` is not a boolean.
 */
export function validatePreferences(raw: unknown): UserPreferences {
  if (!isObject(raw)) return { ...DEFAULT_PREFERENCES }

  const theme = oneOf(raw.theme, THEMES) ?? DEFAULT_PREFERENCES.theme
  const stance = oneOf(raw.stance, STANCES) ?? DEFAULT_PREFERENCES.stance
  const experience = oneOf(raw.experience, DIFFICULTIES) ?? DEFAULT_PREFERENCES.experience
  const callStyle = oneOf(raw.callStyle, CALL_STYLES) ?? DEFAULT_PREFERENCES.callStyle
  const resumeBehavior = oneOf(raw.resumeBehavior, RESUME_BEHAVIORS) ?? DEFAULT_PREFERENCES.resumeBehavior
  const martialArt = oneOf(raw.martialArt, MARTIAL_ARTS) ?? DEFAULT_PREFERENCES.martialArt
  const equipment = oneOf(raw.equipment, EQUIPMENT) ?? DEFAULT_PREFERENCES.equipment
  const pace = oneOf(raw.pace, PACE_PRESETS) ?? DEFAULT_PREFERENCES.pace
  const sideTerminology = oneOf(raw.sideTerminology, SIDE_TERMINOLOGY) ?? DEFAULT_PREFERENCES.sideTerminology
  const speechFallback = { ...DEFAULT_PREFERENCES.speech, callStyle }

  return {
    ...DEFAULT_PREFERENCES,
    theme,
    stance,
    experience,
    callStyle,
    resumeBehavior,
    martialArt,
    equipment,
    pace,
    sideTerminology,
    musicCompatibility: validateMusicCompatibility(raw.musicCompatibility),
    largeText: booleanOr(raw.largeText, DEFAULT_PREFERENCES.largeText),
    customPaceMultiplier:
      finiteInRange(
        raw.customPaceMultiplier,
        WORKOUT_LIMITS.customPaceMultiplier.min,
        WORKOUT_LIMITS.customPaceMultiplier.max,
      ) ?? DEFAULT_PREFERENCES.customPaceMultiplier,
    wakeLock: booleanOr(raw.wakeLock, DEFAULT_PREFERENCES.wakeLock),
    customComboMigrationNoticeShown: booleanOr(
      raw.customComboMigrationNoticeShown,
      DEFAULT_PREFERENCES.customComboMigrationNoticeShown,
    ),
    preferMinimalMode: booleanOr(raw.preferMinimalMode, DEFAULT_PREFERENCES.preferMinimalMode),
    wakeLockNoticeDismissed: booleanOr(raw.wakeLockNoticeDismissed, DEFAULT_PREFERENCES.wakeLockNoticeDismissed),
    speech: validateSpeechSettings(raw.speech, speechFallback),
    sound: validateSoundSettings(raw.sound, DEFAULT_PREFERENCES.sound),
    timingMultipliers: validateTimingMultipliers(raw.timingMultipliers, DEFAULT_PREFERENCES.timingMultipliers),
    onboardingComplete: booleanOr(raw.onboardingComplete, DEFAULT_PREFERENCES.onboardingComplete),
    includeDefense: booleanOr(raw.includeDefense, DEFAULT_PREFERENCES.includeDefense),
    includeMovement: booleanOr(raw.includeMovement, DEFAULT_PREFERENCES.includeMovement),
  }
}

export type PreferencesImportResult =
  | { ok: true; value: UserPreferences }
  | { ok: false; message: string }

/**
 * Import-only: provided fields must already be valid. Missing fields still
 * fall back through {@link validatePreferences}. Wrong types fail the import
 * instead of silently rewriting a backup.
 */
export function parseImportedPreferences(raw: unknown): PreferencesImportResult {
  if (!isObject(raw)) return { ok: false, message: 'preferences must be an object.' }

  if (presentInvalidEnum(raw, 'theme', THEMES)) return { ok: false, message: 'preferences.theme is invalid.' }
  if (presentInvalidEnum(raw, 'stance', STANCES)) return { ok: false, message: 'preferences.stance is invalid.' }
  if (presentInvalidEnum(raw, 'experience', DIFFICULTIES)) {
    return { ok: false, message: 'preferences.experience is invalid.' }
  }
  if (presentInvalidEnum(raw, 'callStyle', CALL_STYLES)) {
    return { ok: false, message: 'preferences.callStyle is invalid.' }
  }
  if (presentInvalidEnum(raw, 'resumeBehavior', RESUME_BEHAVIORS)) {
    return { ok: false, message: 'preferences.resumeBehavior is invalid.' }
  }
  if (presentInvalidEnum(raw, 'martialArt', MARTIAL_ARTS)) {
    return { ok: false, message: 'preferences.martialArt is invalid.' }
  }
  if (presentInvalidEnum(raw, 'equipment', EQUIPMENT)) {
    return { ok: false, message: 'preferences.equipment is invalid.' }
  }
  if (presentInvalidEnum(raw, 'pace', PACE_PRESETS)) return { ok: false, message: 'preferences.pace is invalid.' }
  if (presentInvalidEnum(raw, 'sideTerminology', SIDE_TERMINOLOGY)) {
    return { ok: false, message: 'preferences.sideTerminology is invalid.' }
  }

  for (const key of [
    'largeText',
    'wakeLock',
    'customComboMigrationNoticeShown',
    'preferMinimalMode',
    'wakeLockNoticeDismissed',
    'onboardingComplete',
    'includeDefense',
    'includeMovement',
  ] as const) {
    if (presentInvalidBoolean(raw, key)) {
      return { ok: false, message: `preferences.${key} must be a boolean.` }
    }
  }

  if (hasOwn(raw, 'customPaceMultiplier')) {
    if (
      finiteInRange(
        raw.customPaceMultiplier,
        WORKOUT_LIMITS.customPaceMultiplier.min,
        WORKOUT_LIMITS.customPaceMultiplier.max,
      ) === undefined
    ) {
      return { ok: false, message: 'preferences.customPaceMultiplier is invalid.' }
    }
  }

  if (hasOwn(raw, 'sound')) {
    if (!isObject(raw.sound)) return { ok: false, message: 'preferences.sound is invalid.' }
    if (presentInvalidBoolean(raw.sound, 'bellsEnabled')) {
      return { ok: false, message: 'preferences.sound.bellsEnabled must be a boolean.' }
    }
    if (presentInvalidBoolean(raw.sound, 'tonesEnabled')) {
      return { ok: false, message: 'preferences.sound.tonesEnabled must be a boolean.' }
    }
    if (presentInvalidBoolean(raw.sound, 'vibrationEnabled')) {
      return { ok: false, message: 'preferences.sound.vibrationEnabled must be a boolean.' }
    }
    if (hasOwn(raw.sound, 'masterVolume') && finiteInRange(raw.sound.masterVolume, 0, 1) === undefined) {
      return { ok: false, message: 'preferences.sound.masterVolume is invalid.' }
    }
  }

  if (hasOwn(raw, 'timingMultipliers')) {
    if (!isObject(raw.timingMultipliers)) return { ok: false, message: 'preferences.timingMultipliers is invalid.' }
    const categoryKeys = ['punch', 'kick', 'knee', 'elbow', 'defense', 'movement', 'teep', 'counter', 'clinch'] as const
    for (const key of categoryKeys) {
      if (hasOwn(raw.timingMultipliers, key) && finiteInRange(raw.timingMultipliers[key], 0.7, 1.8) === undefined) {
        return { ok: false, message: `preferences.timingMultipliers.${key} is invalid.` }
      }
    }
    for (const key of ['pauseBetweenCombosMs', 'pauseBeforeRepeatMs'] as const) {
      if (hasOwn(raw.timingMultipliers, key) && finiteInRange(raw.timingMultipliers[key], 0, 60_000) === undefined) {
        return { ok: false, message: `preferences.timingMultipliers.${key} is invalid.` }
      }
    }
  }

  if (hasOwn(raw, 'speech')) {
    if (!isObject(raw.speech)) return { ok: false, message: 'preferences.speech is invalid.' }
    if (presentInvalidEnum(raw.speech, 'callStyle', CALL_STYLES)) {
      return { ok: false, message: 'preferences.speech.callStyle is invalid.' }
    }
    for (const key of [
      'coachingCuesEnabled',
      'countdownEnabled',
      'roundCallsEnabled',
      'musicFriendly',
      'captionsEnabled',
      'spokenCallsEnabled',
    ] as const) {
      if (presentInvalidBoolean(raw.speech, key)) {
        return { ok: false, message: `preferences.speech.${key} must be a boolean.` }
      }
    }
  }

  if (hasOwn(raw, 'musicCompatibility') && raw.musicCompatibility != null) {
    if (!validateMusicCompatibility(raw.musicCompatibility)) {
      return { ok: false, message: 'preferences.musicCompatibility is invalid.' }
    }
  }

  return { ok: true, value: validatePreferences(raw) }
}

export function validateMusicCompatibility(raw: unknown): MusicCompatibilityRecord | null {
  if (!isObject(raw)) return null
  const result = oneOf(raw.result, MUSIC_RESULTS)
  const testedAt = nonNegativeFinite(raw.testedAt)
  const userAgent = stringValue(raw.userAgent, MAX_STRING_FIELD)
  const audioSessionSupported = readBoolean(raw.audioSessionSupported)
  if (!result || testedAt === undefined || userAgent === undefined || audioSessionSupported === undefined) {
    return null
  }
  return { result, testedAt, userAgent, audioSessionSupported }
}

/** LOAD salvage: missing fields default; malformed JSON becomes DEFAULT_PREFERENCES. */
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

export function normalizeFavoriteIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const id = item.trim()
    if (!id || id.length > MAX_SESSION_ID_LENGTH || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= MAX_FAVORITE_IDS) break
  }
  return out
}

/** LOAD salvage: drop blanks, duplicates, and non-strings. */
export function loadFavorites(): string[] {
  return normalizeFavoriteIds(readJSON(KEYS.favorites))
}

export function saveFavorites(ids: string[]): StorageWriteResult {
  return writeJSON(KEYS.favorites, ids)
}

/** LOAD salvage: drop malformed combos; truncate >8 techniques and mark migrated. */
export function loadCustomCombos(): CustomCombo[] {
  const raw = readJSON(KEYS.customCombos)
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => migrateCustomCombo(item))
    .filter((item): item is CustomCombo => item != null)
}

export function migrateCustomCombo(raw: unknown): CustomCombo | null {
  if (!isObject(raw)) return null
  const id = nonEmptyString(raw.id, MAX_SESSION_ID_LENGTH)
  const title = nonEmptyString(raw.title, MAX_STRING_FIELD)
  if (!id || !title || !Array.isArray(raw.techniqueIds)) return null
  const ids = raw.techniqueIds.filter((item): item is string => typeof item === 'string' && item.length > 0)
  if (ids.length < 1) return null
  const migrated = ids.length > MAX_COMBO_LENGTH
  const createdAt = hasOwn(raw, 'createdAt') ? nonNegativeFinite(raw.createdAt) : Date.now()
  const updatedAt = hasOwn(raw, 'updatedAt') ? nonNegativeFinite(raw.updatedAt) : Date.now()
  if (createdAt === undefined || updatedAt === undefined) return null
  if (hasOwn(raw, 'favorite') && readBoolean(raw.favorite) === undefined) return null
  if (hasOwn(raw, 'migrated') && readBoolean(raw.migrated) === undefined) return null
  if (hasOwn(raw, 'martialArt') && raw.martialArt != null && oneOf(raw.martialArt, MARTIAL_ARTS) === undefined) {
    return null
  }
  if (hasOwn(raw, 'repeatCount')) {
    const n = nonNegativeInt(raw.repeatCount)
    if (n === undefined) return null
  }
  return {
    id,
    title,
    techniqueIds: ids.slice(0, MAX_COMBO_LENGTH),
    createdAt,
    updatedAt,
    favorite: booleanOr(raw.favorite, false),
    repeatCount:
      typeof raw.repeatCount === 'number' && Number.isFinite(raw.repeatCount)
        ? Math.min(20, Math.max(1, Math.round(raw.repeatCount)))
        : 1,
    martialArt: oneOf(raw.martialArt, MARTIAL_ARTS) ?? 'muay-thai',
    migrated: migrated || booleanOr(raw.migrated, false),
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

export function removeUserDataKey(key: string): StorageWriteResult {
  if (typeof window === 'undefined') return fail('unavailable')
  try {
    window.localStorage.removeItem(key)
    return { ok: true }
  } catch (error) {
    return classifyStorageError(error)
  }
}

export function removeLegacyHistory(): StorageWriteResult {
  return removeUserDataKey(KEYS.history)
}

export type RemoveUserDataKeysResult =
  | { ok: true }
  | { ok: false; failedKeys: string[]; result: Extract<StorageWriteResult, { ok: false }> }

/** Remove known StrikeCaller keys only. Never calls localStorage.clear(). */
export function removeAllUserDataKeys(): RemoveUserDataKeysResult {
  const failedKeys: string[] = []
  let firstFailure: Extract<StorageWriteResult, { ok: false }> | null = null
  for (const key of USER_DATA_STORAGE_KEYS) {
    const result = removeUserDataKey(key)
    if (!result.ok) {
      failedKeys.push(key)
      if (!firstFailure) firstFailure = result
    }
  }
  if (firstFailure) return { ok: false, failedKeys, result: firstFailure }
  return { ok: true }
}

/** LOAD salvage: skip malformed map entries; migrate a legacy single record in place. */
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
