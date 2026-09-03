import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach } from 'vitest'
import { resetHistoryDbConnection } from '../storage/historyStore'
import { resetStorageAvailabilityCache } from '../storage/localStore'

beforeEach(() => {
  resetStorageAvailabilityCache()
  resetHistoryDbConnection()
  const factory = new IDBFactory()
  Object.defineProperty(globalThis, 'indexedDB', {
    value: factory,
    configurable: true,
    writable: true,
  })
})
