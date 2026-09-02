import type { CustomCombo, SessionSummary } from '../types'
import { migrateDailyDrillMap, normalizeDailyDrillState } from '../utils/dailyDrill'
import {
  ensureHistoryInitialized,
  loadHistory,
  replaceHistory,
} from './historyStore'
import {
  EXPORT_VERSION,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_CUSTOM_COMBOS,
  MAX_IMPORT_HISTORY,
  STORAGE_KEYS,
  loadCustomCombos,
  loadDailyDrillMap,
  loadFavorites,
  loadPreferences,
  migrateCustomCombo,
  removeLegacyHistory,
  restoreRaw,
  saveCustomCombos,
  saveDailyDrillMap,
  saveFavorites,
  savePreferences,
  snapshotRaw,
  validatePreferences,
  type StorageWriteResult,
} from './localStore'
import { isPersistableSession, validateSessionSummary } from './sessionValidation'

export type ImportUserDataResult =
  | { ok: true; message: string }
  | { ok: false; message: string; write?: StorageWriteResult }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function exportUserData(): Promise<string> {
  await ensureHistoryInitialized()
  const history = await loadHistory()
  const dailyDrills = loadDailyDrillMap()
  return JSON.stringify(
    {
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      preferences: loadPreferences(),
      favorites: loadFavorites(),
      customCombos: loadCustomCombos(),
      history,
      dailyDrills,
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

export async function importUserData(json: string): Promise<ImportUserDataResult> {
  if (typeof json !== 'string') return { ok: false, message: 'Import payload must be text.' }
  if (new TextEncoder().encode(json).length > MAX_IMPORT_BYTES) {
    return { ok: false, message: 'Import file exceeds the 2 MB limit.' }
  }
  try {
    const parsed = JSON.parse(json) as unknown
    const validated = validateImportPayload(parsed)
    if (!validated.ok) return validated

    const data = validated.value
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
          .filter(isPersistableSession)
      : null
    const dailyFromMap =
      data.dailyDrills && isObject(data.dailyDrills) ? migrateDailyDrillMap(data.dailyDrills) : null
    const dailyLegacy =
      data.dailyDrill && isObject(data.dailyDrill) ? migrateDailyDrillMap(data.dailyDrill) : null
    const daily = dailyFromMap ?? dailyLegacy

    const planned: { key: string; write: () => StorageWriteResult }[] = []
    if (prefs) planned.push({ key: STORAGE_KEYS.preferences, write: () => savePreferences(prefs) })
    if (favorites) planned.push({ key: STORAGE_KEYS.favorites, write: () => saveFavorites(favorites) })
    if (combos) planned.push({ key: STORAGE_KEYS.customCombos, write: () => saveCustomCombos(combos) })
    if (daily) planned.push({ key: STORAGE_KEYS.daily, write: () => saveDailyDrillMap(daily) })

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

    // localStorage writes happen first. IndexedDB replaceHistory is one transaction
    // (clear + every put, resolved only on transaction oncomplete). If that
    // transaction fails, small-state keys are restored. This is not ACID across
    // localStorage and IndexedDB together.
    if (history) {
      const historyWrite = await replaceHistory(history)
      if (!historyWrite.ok) {
        let restored = true
        for (const snap of snapshots) {
          if (!restoreRaw(snap.key, snap.value)) restored = false
        }
        return {
          ok: false,
          message: restored
            ? 'Import could not be saved. Existing data was left unchanged.'
            : 'Import could not be saved. StrikeCaller could not restore all previous data.',
          write: historyWrite,
        }
      }
      removeLegacyHistory()
    }

    return { ok: true, message: 'Import successful.' }
  } catch {
    return { ok: false, message: 'Could not parse JSON.' }
  }
}
