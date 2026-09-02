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

export type StorageWriteReason = 'unavailable' | 'quota-exceeded' | 'serialization' | 'write-failed'

export type StorageWriteResult =
  | { ok: true }
  | { ok: false; reason: StorageWriteReason; message: string }

export const STORAGE_WRITE_MESSAGES: Record<StorageWriteReason, string> = {
  unavailable:
    "StrikeCaller couldn't save your latest data. It may be lost after you close or reload this page.",
  'quota-exceeded':
    'StrikeCaller storage is full. Your latest change may not be saved. Export your data or clear older history before closing the app.',
  serialization:
    "StrikeCaller couldn't save your latest data. It may be lost after you close or reload this page.",
  'write-failed':
    "StrikeCaller couldn't save your latest data. It may be lost after you close or reload this page.",
}

export const HISTORY_QUOTA_MESSAGE =
  'StrikeCaller storage is full. Your latest workout may not be saved. Export your data or clear older history before closing the app.'

const PROBE_KEY = '__sc_test__'

/** Cached probe for reads/UI only. Writes always classify from the real setItem exception. */
let availabilityCache: boolean | null = null

function fail(reason: StorageWriteReason): Extract<StorageWriteResult, { ok: false }> {
  return { ok: false, reason, message: STORAGE_WRITE_MESSAGES[reason] }
}

function isQuotaExceeded(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const name = 'name' in error ? String(error.name) : ''
  const code = 'code' in error && typeof error.code === 'number' ? error.code : undefined
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    code === 22 ||
    code === 1014
  )
}

function isUnavailableError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const name = 'name' in error ? String(error.name) : ''
  return name === 'SecurityError' || name === 'NS_ERROR_DOM_SECURITY_ERR'
}

function classifyWriteError(error: unknown): Extract<StorageWriteResult, { ok: false }> {
  if (isQuotaExceeded(error)) return fail('quota-exceeded')
  if (isUnavailableError(error)) return fail('unavailable')
  return fail('write-failed')
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
    return isQuotaExceeded(error)
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

function snapshotRaw(key: string): { ok: true; value: string | null } | Extract<StorageWriteResult, { ok: false }> {
  if (typeof window === 'undefined') return fail('unavailable')
  try {
    return { ok: true, value: window.localStorage.getItem(key) }
  } catch (error) {
    return classifyWriteError(error)
  }
}

function restoreRaw(key: string, value: string | null): boolean {
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

export function validateSessionSummary(raw: unknown): SessionSummary | null {
  if (!isObject(raw) || typeof raw.id !== 'string') return null
  if (typeof raw.startedAt !== 'number') return null
  const mode = typeof raw.mode === 'string' ? raw.mode : 'coach'
  const martialArt = raw.martialArt === 'boxing' ? 'boxing' : 'muay-thai'
  const migrated = raw.martialArt == null
  return {
    id: raw.id,
    startedAt: raw.startedAt,
    endedAt: typeof raw.endedAt === 'number' ? raw.endedAt : raw.startedAt,
    martialArt,
    mode: mode as SessionSummary['mode'],
    stance: raw.stance === 'southpaw' ? 'southpaw' : 'orthodox',
    pace: (typeof raw.pace === 'string' ? raw.pace : 'technical') as SessionSummary['pace'],
    totalTrainingMs: typeof raw.totalTrainingMs === 'number' ? raw.totalTrainingMs : 0,
    roundsCompleted: typeof raw.roundsCompleted === 'number' ? raw.roundsCompleted : 0,
    combinationsCompleted: typeof raw.combinationsCompleted === 'number' ? raw.combinationsCompleted : 0,
    techniquesCalled: typeof raw.techniquesCalled === 'number' ? raw.techniquesCalled : 0,
    techniqueCounts: isObject(raw.techniqueCounts) ? (raw.techniqueCounts as Record<string, number>) : {},
    techniqueCategoryCounts: isObject(raw.techniqueCategoryCounts)
      ? (raw.techniqueCategoryCounts as Record<string, number>)
      : {},
    comboIds: Array.isArray(raw.comboIds) ? raw.comboIds.filter((id) => typeof id === 'string') : [],
    defenseActions: typeof raw.defenseActions === 'number' ? raw.defenseActions : 0,
    movementActions: typeof raw.movementActions === 'number' ? raw.movementActions : 0,
    averagePaceLabel: typeof raw.averagePaceLabel === 'string' ? raw.averagePaceLabel : 'technical',
    dailyDrillCompleted: Boolean(raw.dailyDrillCompleted),
    cancelled: Boolean(raw.cancelled),
    favoriteComboIds: Array.isArray(raw.favoriteComboIds)
      ? raw.favoriteComboIds.filter((id) => typeof id === 'string')
      : [],
    usedCustomCombo: Boolean(raw.usedCustomCombo),
    workoutConfig: isObject(raw.workoutConfig)
      ? (raw.workoutConfig as unknown as SessionSummary['workoutConfig'])
      : undefined,
    queuedCombos: Array.isArray(raw.queuedCombos)
      ? (raw.queuedCombos as SessionSummary['queuedCombos'])
      : undefined,
    comboSnapshots: Array.isArray(raw.comboSnapshots)
      ? (raw.comboSnapshots as SessionSummary['comboSnapshots'])
      : undefined,
    customPaceMultiplier:
      typeof raw.customPaceMultiplier === 'number' && Number.isFinite(raw.customPaceMultiplier)
        ? raw.customPaceMultiplier
        : undefined,
    excludeFromStats: Boolean(raw.excludeFromStats) || mode === 'demo' || Boolean(raw.isDemo),
    isDemo: Boolean(raw.isDemo) || mode === 'demo',
    dailyPhase:
      raw.dailyPhase === 'slowDone' || raw.dailyPhase === 'normalDone' || raw.dailyPhase === 'fightDone'
        ? raw.dailyPhase
        : undefined,
    migrated: migrated || Boolean(raw.migrated),
  }
}

export function loadHistory(): SessionSummary[] {
  const raw = readJSON(KEYS.history)
  if (!Array.isArray(raw)) return []
  return raw
    .map(validateSessionSummary)
    .filter((item): item is SessionSummary => item != null)
    .filter((item) => !item.excludeFromStats && !item.isDemo && item.mode !== 'demo')
}

export function saveHistory(history: SessionSummary[]): StorageWriteResult {
  // No session cap — preserve full valid history
  return writeJSON(
    KEYS.history,
    history.filter((h) => !h.excludeFromStats && !h.isDemo && h.mode !== 'demo'),
  )
}

export function clearHistory(): StorageWriteResult {
  return writeJSON(KEYS.history, [])
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

export function exportUserData(): string {
  const dailyDrills = loadDailyDrillMap()
  return JSON.stringify(
    {
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      preferences: loadPreferences(),
      favorites: loadFavorites(),
      customCombos: loadCustomCombos(),
      history: loadHistory(),
      dailyDrills,
      // Legacy single-record mirror for older importers
      dailyDrill: Object.values(dailyDrills)[0] ?? null,
    },
    null,
    2,
  )
}

function validateImportPayload(data: unknown): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
  if (!isObject(data)) return { ok: false, message: 'Invalid JSON structure.' }
  const version = data.version
  if (version !== 1 && version !== 2 && version !== 3 && version !== undefined) {
    return { ok: false, message: `Unsupported export version: ${String(version)}.` }
  }

  if (data.preferences != null && !isObject(data.preferences)) {
    return { ok: false, message: 'preferences must be an object.' }
  }
  if (data.favorites != null) {
    if (!Array.isArray(data.favorites) || data.favorites.length > 2000) {
      return { ok: false, message: 'favorites array is invalid or too large.' }
    }
    if (!data.favorites.every((id) => typeof id === 'string')) {
      return { ok: false, message: 'favorites must be string IDs.' }
    }
  }
  if (data.customCombos != null) {
    if (!Array.isArray(data.customCombos) || data.customCombos.length > MAX_IMPORT_CUSTOM_COMBOS) {
      return { ok: false, message: 'customCombos array is invalid or too large.' }
    }
    for (const raw of data.customCombos) {
      if (!isObject(raw) || !Array.isArray(raw.techniqueIds)) {
        return { ok: false, message: 'One or more custom combos are invalid.' }
      }
      const rawIds = raw.techniqueIds.filter((id) => typeof id === 'string')
      if (rawIds.length < 1 || rawIds.length > 8) {
        return { ok: false, message: 'Custom combos must contain 1–8 techniques.' }
      }
      const combo = migrateCustomCombo(raw)
      if (!combo) return { ok: false, message: 'One or more custom combos are invalid.' }
      if (combo.repeatCount < 1 || combo.repeatCount > 20) {
        return { ok: false, message: 'Custom combo repeatCount must be 1–20.' }
      }
    }
  }
  if (data.history != null) {
    if (!Array.isArray(data.history) || data.history.length > MAX_IMPORT_HISTORY) {
      return { ok: false, message: 'history array is invalid or too large.' }
    }
    for (const raw of data.history) {
      const summary = validateSessionSummary(raw)
      if (!summary) return { ok: false, message: 'One or more history records are invalid.' }
      if (!Number.isFinite(summary.startedAt) || summary.startedAt < 0) {
        return { ok: false, message: 'History timestamps must be finite and nonnegative.' }
      }
      if (!Number.isFinite(summary.totalTrainingMs) || summary.totalTrainingMs < 0) {
        return { ok: false, message: 'History counters must be finite and nonnegative.' }
      }
      if (summary.martialArt !== 'muay-thai' && summary.martialArt !== 'boxing') {
        return { ok: false, message: 'Unknown martial art in history.' }
      }
    }
  }
  if (data.dailyDrill != null) {
    if (!isObject(data.dailyDrill)) return { ok: false, message: 'dailyDrill must be an object.' }
    if (typeof data.dailyDrill.dateKey !== 'string' || typeof data.dailyDrill.comboId !== 'string') {
      return { ok: false, message: 'dailyDrill is missing required fields.' }
    }
  }
  if (data.dailyDrills != null) {
    if (!isObject(data.dailyDrills)) return { ok: false, message: 'dailyDrills must be an object.' }
    for (const value of Object.values(data.dailyDrills)) {
      if (!normalizeDailyDrillState(value)) {
        return { ok: false, message: 'One or more dailyDrills records are invalid.' }
      }
    }
  }
  return { ok: true, value: data }
}

export type ImportUserDataResult =
  | { ok: true; message: string }
  | { ok: false; message: string; write?: StorageWriteResult }

export function importUserData(json: string): ImportUserDataResult {
  if (typeof json !== 'string') return { ok: false, message: 'Import payload must be text.' }
  if (new TextEncoder().encode(json).length > MAX_IMPORT_BYTES) {
    return { ok: false, message: 'Import file exceeds the 2 MB limit.' }
  }
  try {
    const parsed = JSON.parse(json) as unknown
    const validated = validateImportPayload(parsed)
    if (!validated.ok) return validated

    const data = validated.value
    // Validate complete payload before writing anything
    const prefs = data.preferences ? validatePreferences(data.preferences) : null
    const favorites = Array.isArray(data.favorites)
      ? data.favorites.filter((x): x is string => typeof x === 'string')
      : null
    const combos = Array.isArray(data.customCombos)
      ? data.customCombos.map(migrateCustomCombo).filter((c): c is CustomCombo => c != null)
      : null
    const history = Array.isArray(data.history)
      ? data.history
          .map(validateSessionSummary)
          .filter((h): h is SessionSummary => h != null)
          .filter((h) => !h.excludeFromStats && !h.isDemo && h.mode !== 'demo')
      : null
    const dailyFromMap =
      data.dailyDrills && isObject(data.dailyDrills) ? migrateDailyDrillMap(data.dailyDrills) : null
    const dailyLegacy =
      data.dailyDrill && isObject(data.dailyDrill) ? migrateDailyDrillMap(data.dailyDrill) : null
    const daily = dailyFromMap ?? dailyLegacy

    const planned: { key: string; write: () => StorageWriteResult }[] = []
    if (prefs) planned.push({ key: KEYS.preferences, write: () => savePreferences(prefs) })
    if (favorites) planned.push({ key: KEYS.favorites, write: () => saveFavorites(favorites) })
    if (combos) planned.push({ key: KEYS.customCombos, write: () => saveCustomCombos(combos) })
    if (history) planned.push({ key: KEYS.history, write: () => saveHistory(history) })
    if (daily) planned.push({ key: KEYS.daily, write: () => saveDailyDrillMap(daily) })

    const snapshots: { key: string; value: string | null }[] = []
    for (const item of planned) {
      const snap = snapshotRaw(item.key)
      if (!snap.ok) {
        return {
          ok: false,
          message: 'Import could not be saved. Existing data was left unchanged.',
          write: snap,
        }
      }
      snapshots.push({ key: item.key, value: snap.value })
    }

    for (const item of planned) {
      const result = item.write()
      if (!result.ok) {
        let restored = true
        for (const snap of snapshots) {
          if (!restoreRaw(snap.key, snap.value)) restored = false
        }
        return {
          ok: false,
          message: restored
            ? 'Import could not be saved. Existing data was left unchanged.'
            : 'Import could not be saved. StrikeCaller could not restore all previous data.',
          write: result,
        }
      }
    }

    return { ok: true, message: 'Import successful.' }
  } catch {
    return { ok: false, message: 'Could not parse JSON.' }
  }
}
