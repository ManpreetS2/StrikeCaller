import type { CustomCombo, DailyDrillMap, SessionSummary, UserPreferences } from '../types'
import { validateImportedDailyDrill, validateImportedDailyDrills } from '../utils/dailyDrill'
import { MAX_COMBO_LENGTH } from '../engines/comboValidator'
import { validateCustomComboSemantics } from '../utils/customCombo'
import {
  clearSessionsStore,
  ensureHistoryInitialized,
  loadHistory,
  loadHistoryFromDbOnly,
  replaceHistoryAt,
  runAuthoritativeHistoryTransition,
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
  normalizeFavoriteIds,
  parseImportedPreferences,
  removeAllUserDataKeys,
  removeLegacyHistory,
  restoreRaw,
  saveCustomCombos,
  saveDailyDrillMap,
  saveFavorites,
  savePreferences,
  snapshotRaw,
  type StorageWriteResult,
} from './localStore'
import { isPlainObject, hasOwn, nonNegativeInt } from './parseUnknown'
import { isPersistableSession, validateSessionSummary } from './sessionValidation'
import {
  DELETE_ALL_PARTIAL_MESSAGE,
  IMPORT_EXECUTION_FAILED_MESSAGE,
  IMPORT_RESTORE_FAILED_MESSAGE,
} from './storageTypes'

export type DeleteAllUserDataFailureClass = 'localStorage' | 'indexedDB'

export type DeleteAllUserDataResult =
  | { ok: true }
  | {
      ok: false
      message: string
      localStorage: StorageWriteResult
      indexedDB: StorageWriteResult
      failed: DeleteAllUserDataFailureClass[]
    }

let inFlightDelete: Promise<DeleteAllUserDataResult> | null = null
let importTail: Promise<void> = Promise.resolve()
let afterImportLocalWritesForTests: (() => Promise<void>) | null = null

/**
 * Test-only hook: runs after an import has written planned localStorage values
 * and before the IndexedDB history replace. Production code must not use this.
 */
export function setAfterImportLocalWritesForTests(hook: (() => Promise<void>) | null): void {
  afterImportLocalWritesForTests = hook
}

function rollbackImportResult(
  restored: boolean,
  write: StorageWriteResult,
): ImportUserDataResult {
  if (restored) {
    return {
      ok: false,
      message: 'Import could not be saved. Existing data was left unchanged.',
      write,
    }
  }
  const failed = write.ok
    ? { ok: false as const, reason: 'write-failed' as const, message: IMPORT_RESTORE_FAILED_MESSAGE }
    : { ...write, message: IMPORT_RESTORE_FAILED_MESSAGE }
  return {
    ok: false,
    applied: true,
    message: IMPORT_RESTORE_FAILED_MESSAGE,
    write: failed,
  }
}

export type ImportUserDataResult =
  | { ok: true; message: string }
  | { ok: false; message: string; write?: StorageWriteResult; applied?: boolean }

type NormalizedImport = {
  preferences?: UserPreferences
  favorites?: string[]
  customCombos?: CustomCombo[]
  history?: SessionSummary[]
  daily?: DailyDrillMap
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

/**
 * IMPORT: every *provided* section must already be valid.
 * One malformed supplied section fails the whole import.
 * No localStorage / IndexedDB writes happen until this returns ok.
 *
 * LOAD (elsewhere): salvage valid records, skip malformed ones, default missing
 * legacy-compatible preference fields.
 */
function validateImportPayload(
  data: unknown,
): { ok: true; value: NormalizedImport } | { ok: false; message: string } {
  if (!isPlainObject(data)) return { ok: false, message: 'Invalid JSON structure.' }
  const version = data.version
  if (version !== 1 && version !== 2 && version !== 3 && version !== undefined) {
    return { ok: false, message: `Unsupported export version: ${String(version)}.` }
  }

  const normalized: NormalizedImport = {}

  if (data.preferences != null) {
    const prefs = parseImportedPreferences(data.preferences)
    if (!prefs.ok) return prefs
    normalized.preferences = prefs.value
  }

  if (data.favorites != null) {
    if (!Array.isArray(data.favorites) || data.favorites.length > 2000) {
      return { ok: false, message: 'favorites array is invalid or too large.' }
    }
    if (!data.favorites.every((id) => typeof id === 'string')) {
      return { ok: false, message: 'favorites must be string IDs.' }
    }
    normalized.favorites = normalizeFavoriteIds(data.favorites)
  }

  if (data.customCombos != null) {
    if (!Array.isArray(data.customCombos) || data.customCombos.length > MAX_IMPORT_CUSTOM_COMBOS) {
      return { ok: false, message: 'customCombos array is invalid or too large.' }
    }
    const combos: CustomCombo[] = []
    for (const raw of data.customCombos) {
      if (!isPlainObject(raw) || !Array.isArray(raw.techniqueIds)) {
        return { ok: false, message: 'One or more custom combos are invalid.' }
      }
      if (
        raw.techniqueIds.length < 1 ||
        raw.techniqueIds.length > MAX_COMBO_LENGTH ||
        !raw.techniqueIds.every((id) => typeof id === 'string' && id.length > 0)
      ) {
        return { ok: false, message: 'Custom combos must contain 1–8 techniques.' }
      }
      if (hasOwn(raw, 'repeatCount')) {
        const n = nonNegativeInt(raw.repeatCount)
        if (n === undefined || n < 1 || n > 20) {
          return { ok: false, message: 'Custom combo repeatCount must be 1–20.' }
        }
      }
      const combo = migrateCustomCombo(raw)
      if (!combo) return { ok: false, message: 'One or more custom combos are invalid.' }
      if (combo.repeatCount < 1 || combo.repeatCount > 20) {
        return { ok: false, message: 'Custom combo repeatCount must be 1–20.' }
      }
      const semantic = validateCustomComboSemantics(combo)
      if (!semantic.ok) return { ok: false, message: semantic.message }
      combos.push(combo)
    }
    const comboIds = new Set<string>()
    for (const combo of combos) {
      if (comboIds.has(combo.id)) return { ok: false, message: 'customCombos contains duplicate IDs.' }
      comboIds.add(combo.id)
    }
    normalized.customCombos = combos
  }

  if (data.history != null) {
    if (!Array.isArray(data.history) || data.history.length > MAX_IMPORT_HISTORY) {
      return { ok: false, message: 'history array is invalid or too large.' }
    }
    const history: SessionSummary[] = []
    for (const raw of data.history) {
      const summary = validateSessionSummary(raw)
      if (!summary) return { ok: false, message: 'One or more history records are invalid.' }
      if (isPersistableSession(summary)) history.push(summary)
    }
    const sessionIds = new Set<string>()
    for (const row of history) {
      if (sessionIds.has(row.id)) return { ok: false, message: 'History contains duplicate session IDs.' }
      sessionIds.add(row.id)
    }
    normalized.history = history
  }

  if (data.dailyDrill != null) {
    if (!isPlainObject(data.dailyDrill)) return { ok: false, message: 'dailyDrill must be an object.' }
    const daily = validateImportedDailyDrill(data.dailyDrill)
    if (!daily.ok) return daily
  }
  if (data.dailyDrills != null) {
    const daily = validateImportedDailyDrills(data.dailyDrills)
    if (!daily.ok) return daily
    normalized.daily = daily.value
  } else if (data.dailyDrill != null && isPlainObject(data.dailyDrill)) {
    const daily = validateImportedDailyDrill(data.dailyDrill)
    if (!daily.ok) return daily
    normalized.daily = { [daily.value.dateKey]: daily.value }
  }

  return { ok: true, value: normalized }
}

export function importUserData(json: string): Promise<ImportUserDataResult> {
  const run = importTail.then(() => performImportUserData(json), () => performImportUserData(json))
  const guarded = run.then(
    (result) => result,
    () =>
      ({
        ok: false as const,
        message: IMPORT_EXECUTION_FAILED_MESSAGE,
      }) satisfies ImportUserDataResult,
  )
  importTail = guarded.then(
    () => undefined,
    () => undefined,
  )
  return guarded
}

async function performImportUserData(json: string): Promise<ImportUserDataResult> {
  if (typeof json !== 'string') return { ok: false, message: 'Import payload must be text.' }
  if (new TextEncoder().encode(json).length > MAX_IMPORT_BYTES) {
    return { ok: false, message: 'Import file exceeds the 2 MB limit.' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, message: 'Could not parse JSON.' }
  }

  try {
    const validated = validateImportPayload(parsed)
    if (!validated.ok) return validated

    const { preferences: prefs, favorites, customCombos: combos, history, daily } = validated.value

    const planned: { key: string; write: () => StorageWriteResult }[] = []
    if (prefs) planned.push({ key: STORAGE_KEYS.preferences, write: () => savePreferences(prefs) })
    if (favorites) planned.push({ key: STORAGE_KEYS.favorites, write: () => saveFavorites(favorites) })
    if (combos) planned.push({ key: STORAGE_KEYS.customCombos, write: () => saveCustomCombos(combos) })
    if (daily) planned.push({ key: STORAGE_KEYS.daily, write: () => saveDailyDrillMap(daily) })

    if (history) {
      return await runAuthoritativeHistoryTransition(async (generation) => {
        const idbSnapshot = await loadHistoryFromDbOnly()
        if (!idbSnapshot.ok) {
          return {
            ok: false as const,
            message: 'Import could not be saved. Existing data was left unchanged.',
            write: idbSnapshot,
          }
        }

        const snapshots: { key: string; value: string | null }[] = []
        for (const item of planned) {
          const snap = snapshotRaw(item.key)
          if (!snap.ok) {
            return {
              ok: false as const,
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
            return rollbackImportResult(restored, result)
          }
        }

        if (afterImportLocalWritesForTests) await afterImportLocalWritesForTests()

        const historyWrite = await replaceHistoryAt(history, generation)
        if (!historyWrite.ok) {
          let restored = true
          for (const snap of snapshots) {
            if (!restoreRaw(snap.key, snap.value)) restored = false
          }
          return rollbackImportResult(restored, historyWrite)
        }

        const legacyRemoved = removeLegacyHistory()
        if (!legacyRemoved.ok) {
          const restoredIdb = await replaceHistoryAt(idbSnapshot.history, generation)
          let restoredLs = true
          for (const snap of snapshots) {
            if (!restoreRaw(snap.key, snap.value)) restoredLs = false
          }
          if (restoredIdb.ok && restoredLs) {
            return {
              ok: false as const,
              message: 'Import could not be saved. Existing data was left unchanged.',
              write: legacyRemoved,
            }
          }
          return {
            ok: false as const,
            applied: true,
            message: IMPORT_RESTORE_FAILED_MESSAGE,
            write: restoredIdb.ok
              ? { ...legacyRemoved, message: IMPORT_RESTORE_FAILED_MESSAGE }
              : { ...restoredIdb, message: IMPORT_RESTORE_FAILED_MESSAGE },
          }
        }

        return { ok: true as const, message: 'Import successful.' }
      })
    }

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
        return rollbackImportResult(restored, result)
      }
    }

    return { ok: true, message: 'Import successful.' }
  } catch {
    return { ok: false, message: IMPORT_EXECUTION_FAILED_MESSAGE }
  }
}

async function performDeleteAllUserData(): Promise<DeleteAllUserDataResult> {
  return runAuthoritativeHistoryTransition(async () => {
    const indexedDB = await clearSessionsStore()
    const localStorageResult = removeAllUserDataKeys()

    const failed: DeleteAllUserDataFailureClass[] = []
    if (!localStorageResult.ok) failed.push('localStorage')
    if (!indexedDB.ok) failed.push('indexedDB')

    if (failed.length === 0) return { ok: true }

    return {
      ok: false,
      message: DELETE_ALL_PARTIAL_MESSAGE,
      localStorage: localStorageResult.ok ? { ok: true } : localStorageResult.result,
      indexedDB,
      failed,
    }
  })
}

/**
 * Delete every StrikeCaller-owned user-data record on this device.
 *
 * Not atomic across localStorage and IndexedDB. Partial success is reported
 * truthfully; already-removed data is not restored.
 */
export function deleteAllUserData(): Promise<DeleteAllUserDataResult> {
  if (inFlightDelete) return inFlightDelete
  inFlightDelete = performDeleteAllUserData().finally(() => {
    inFlightDelete = null
  })
  return inFlightDelete
}
