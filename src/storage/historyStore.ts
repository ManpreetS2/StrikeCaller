import type { SessionSummary } from '../types'
import {
  classifyIdbError,
  indexedDbUnavailableResult,
  isIndexedDbAvailable,
  openHistoryDb,
  resetHistoryDbConnection as resetIdbConnection,
  transactSessions,
} from './idb'
import { loadLegacyHistory, removeLegacyHistory } from './localStore'
import { isPersistableSession, validateSessionSummary } from './sessionValidation'
import {
  classifyStorageError,
  STORAGE_WRITE_MESSAGES,
  type StorageWriteResult,
} from './storageTypes'

let initPromise: Promise<{ history: SessionSummary[]; write: StorageWriteResult }> | null = null

export function resetHistoryDbConnection(): void {
  initPromise = null
  resetIdbConnection()
}

export function sortHistory(history: SessionSummary[]): SessionSummary[] {
  return [...history].sort((a, b) => {
    if (b.startedAt !== a.startedAt) return b.startedAt - a.startedAt
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
  })
}

function persistable(summary: unknown): SessionSummary | null {
  const validated = validateSessionSummary(summary)
  if (!validated || !isPersistableSession(validated)) return null
  return validated
}

/** LOAD salvage: skip rows that fail validateSessionSummary; do not delete them. */
export async function loadHistory(): Promise<SessionSummary[]> {
  if (!isIndexedDbAvailable()) return sortHistory(loadLegacyHistory())
  try {
    await openHistoryDb()
    let rows: unknown[] = []
    await transactSessions('readonly', (store) => {
      const request = store.getAll()
      request.onsuccess = () => {
        rows = request.result as unknown[]
      }
    })
    return sortHistory(
      rows
        .map((row) => persistable(row))
        .filter((item): item is SessionSummary => item != null),
    )
  } catch {
    return sortHistory(loadLegacyHistory())
  }
}

export async function saveSession(summary: SessionSummary): Promise<StorageWriteResult> {
  const next = persistable(summary)
  if (!next) return { ok: true }
  if (!isIndexedDbAvailable()) return indexedDbUnavailableResult()
  try {
    await transactSessions('readwrite', (store) => {
      store.put(next)
    })
    return { ok: true }
  } catch (error) {
    return classifyIdbError(error)
  }
}

export async function replaceHistory(history: SessionSummary[]): Promise<StorageWriteResult> {
  const sessions = history.map(persistable).filter((item): item is SessionSummary => item != null)
  if (!isIndexedDbAvailable()) return indexedDbUnavailableResult()
  try {
    await transactSessions('readwrite', (store) => {
      store.clear()
      for (const session of sessions) store.put(session)
    })
    return { ok: true }
  } catch (error) {
    return classifyIdbError(error)
  }
}

/**
 * Clear durable history only after the canonical IndexedDB store can be opened
 * and cleared. Legacy localStorage is removed only after that commit succeeds,
 * so a failed clear cannot destroy the only remaining copy.
 */
export async function clearHistory(): Promise<StorageWriteResult> {
  if (!isIndexedDbAvailable()) return indexedDbUnavailableResult()

  let existing: SessionSummary[]
  try {
    const loaded = await loadHistoryFromDbOnly()
    if (!loaded.ok) return loaded
    existing = loaded.history
  } catch (error) {
    return classifyIdbError(error)
  }

  try {
    await transactSessions('readwrite', (store) => {
      store.clear()
    })
  } catch (error) {
    return classifyIdbError(error)
  }

  const legacyRemoved = removeLegacyHistory()
  if (!legacyRemoved.ok) {
    const restored = await replaceHistory(existing)
    if (!restored.ok) return restored
    return legacyRemoved
  }
  return { ok: true }
}

function mergePreferIndexedDb(existing: SessionSummary[], legacy: SessionSummary[]): SessionSummary[] {
  const byId = new Map<string, SessionSummary>()
  for (const session of existing) byId.set(session.id, session)
  for (const session of legacy) {
    if (!byId.has(session.id)) byId.set(session.id, session)
  }
  return sortHistory([...byId.values()])
}

async function verifyContainsLegacy(
  legacy: SessionSummary[],
): Promise<{ ok: true; history: SessionSummary[] } | Extract<StorageWriteResult, { ok: false }>> {
  const verified = await loadHistoryFromDbOnly()
  if (!verified.ok) return verified
  const ids = new Set(verified.history.map((session) => session.id))
  const missing = legacy.some((session) => !ids.has(session.id))
  if (missing) {
    return { ok: false, reason: 'write-failed', message: STORAGE_WRITE_MESSAGES['write-failed'] }
  }
  return { ok: true, history: verified.history }
}

async function loadHistoryFromDbOnly(): Promise<
  { ok: true; history: SessionSummary[] } | Extract<StorageWriteResult, { ok: false }>
> {
  try {
    await openHistoryDb()
    let rows: unknown[] = []
    await transactSessions('readonly', (store) => {
      const request = store.getAll()
      request.onsuccess = () => {
        rows = request.result as unknown[]
      }
    })
    return {
      ok: true,
      history: sortHistory(
        rows
          .map((row) => persistable(row))
          .filter((item): item is SessionSummary => item != null),
      ),
    }
  } catch (error) {
    return classifyIdbError(error)
  }
}

/**
 * Load canonical history, migrating leftover localStorage records into IndexedDB.
 *
 * Conflict rule: if the same session id exists in both stores, the IndexedDB copy wins.
 * Legacy localStorage is removed only after the IndexedDB transaction completes and
 * every legacy session id is present in IndexedDB.
 */
export async function initHistory(): Promise<{ history: SessionSummary[]; write: StorageWriteResult }> {
  const legacy = loadLegacyHistory()

  if (!isIndexedDbAvailable()) {
    return {
      history: sortHistory(legacy),
      write: indexedDbUnavailableResult(),
    }
  }

  let existing: SessionSummary[]
  try {
    const loaded = await loadHistoryFromDbOnly()
    if (!loaded.ok) {
      return { history: sortHistory(mergePreferIndexedDb([], legacy)), write: loaded }
    }
    existing = loaded.history
  } catch (error) {
    return { history: sortHistory(legacy), write: classifyStorageError(error) }
  }

  if (legacy.length === 0) {
    return { history: existing, write: { ok: true } }
  }

  const existingIds = new Set(existing.map((session) => session.id))
  const toInsert = legacy.filter((session) => !existingIds.has(session.id))

  if (toInsert.length > 0) {
    const putResult = await replaceOrPut(toInsert)
    if (!putResult.ok) {
      return {
        history: mergePreferIndexedDb(existing, legacy),
        write: putResult,
      }
    }
  }

  const verified = await verifyContainsLegacy(legacy)
  if (!verified.ok) {
    return { history: mergePreferIndexedDb(existing, legacy), write: verified }
  }

  removeLegacyHistory()
  return { history: verified.history, write: { ok: true } }
}

export function ensureHistoryInitialized(): Promise<{ history: SessionSummary[]; write: StorageWriteResult }> {
  if (!initPromise) {
    initPromise = initHistory().then((result) => {
      if (!result.write.ok) initPromise = null
      return result
    })
  }
  return initPromise
}

async function replaceOrPut(sessions: SessionSummary[]): Promise<StorageWriteResult> {
  try {
    await transactSessions('readwrite', (store) => {
      for (const session of sessions) store.put(session)
    })
    return { ok: true }
  } catch (error) {
    return classifyIdbError(error)
  }
}
