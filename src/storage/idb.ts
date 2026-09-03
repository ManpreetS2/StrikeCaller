import { STORAGE_WRITE_MESSAGES, classifyStorageError, type StorageWriteResult } from './storageTypes'

export const HISTORY_DB_NAME = 'strikecaller'
export const HISTORY_DB_VERSION = 1
export const SESSIONS_STORE = 'sessions'

let opening: Promise<IDBDatabase> | null = null
let openDb: IDBDatabase | null = null

export function isIndexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    return false
  }
}

export function resetHistoryDbConnection(): void {
  if (openDb) {
    try {
      openDb.close()
    } catch {
      // ignore
    }
    openDb = null
  }
  opening = null
}

export function indexedDbUnavailableResult(): StorageWriteResult {
  return { ok: false, reason: 'unavailable', message: STORAGE_WRITE_MESSAGES.unavailable }
}

export function openHistoryDb(): Promise<IDBDatabase> {
  if (!isIndexedDbAvailable()) {
    return Promise.reject(new DOMException('IndexedDB is unavailable.', 'UnknownError'))
  }
  if (openDb) return Promise.resolve(openDb)
  if (opening) return opening

  opening = new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(HISTORY_DB_NAME, HISTORY_DB_VERSION)
    } catch (error) {
      opening = null
      reject(error)
      return
    }

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
        db.createObjectStore(SESSIONS_STORE, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => {
        db.close()
        if (openDb === db) openDb = null
        opening = null
      }
      openDb = db
      resolve(db)
    }

    request.onerror = () => {
      opening = null
      openDb = null
      reject(request.error ?? new DOMException('IndexedDB failed to open.', 'UnknownError'))
    }
  })

  return opening
}

/**
 * Run work against the sessions store and resolve only after the transaction
 * completes (not after individual request success).
 */
export function transactSessions(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => void,
): Promise<void> {
  return openHistoryDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        let settled = false
        const finishOk = () => {
          if (settled) return
          settled = true
          resolve()
        }
        const finishErr = (error: unknown) => {
          if (settled) return
          settled = true
          reject(error)
        }

        let tx: IDBTransaction
        try {
          tx = db.transaction(SESSIONS_STORE, mode)
        } catch (error) {
          finishErr(error)
          return
        }

        tx.oncomplete = finishOk
        tx.onerror = () => finishErr(tx.error ?? new DOMException('IndexedDB transaction failed.', 'UnknownError'))
        tx.onabort = () => finishErr(tx.error ?? new DOMException('IndexedDB transaction aborted.', 'AbortError'))

        try {
          work(tx.objectStore(SESSIONS_STORE))
        } catch (error) {
          finishErr(error)
          try {
            tx.abort()
          } catch {
            // Original work() error already rejected the promise.
          }
        }
      }),
  )
}

export function classifyIdbError(error: unknown): Extract<StorageWriteResult, { ok: false }> {
  return classifyStorageError(error)
}
