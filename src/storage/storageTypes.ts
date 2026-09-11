export type StorageWriteReason = 'unavailable' | 'quota-exceeded' | 'serialization' | 'write-failed'

export type StorageWriteResult =
  | { ok: true }
  | { ok: false; reason: StorageWriteReason; message: string }

export const STORAGE_WRITE_MESSAGES: Record<StorageWriteReason, string> = {
  unavailable:
    "StrikeCaller couldn't save your latest data. It may be lost after you close or reload this page.",
  'quota-exceeded':
    'StrikeCaller storage is full. Your latest change may exist only in this tab. Export a backup before reloading or clearing data.',
  serialization:
    "StrikeCaller couldn't save your latest data. It may be lost after you close or reload this page.",
  'write-failed':
    "StrikeCaller couldn't save your latest data. It may be lost after you close or reload this page.",
}

export const HISTORY_QUOTA_MESSAGE =
  'StrikeCaller storage is full. Your latest workout may exist only in this tab. Export a backup before reloading or clearing data.'

export const DELETE_ALL_PARTIAL_MESSAGE =
  'Some StrikeCaller data could not be deleted. Data already removed cannot be restored.'

export const DELETE_ALL_SUCCESS_MESSAGE = 'All StrikeCaller data on this device was deleted.'

export const LEGACY_HISTORY_CLEANUP_MESSAGE =
  'StrikeCaller saved your history, but could not remove leftover older storage. Some stale data may remain.'

export const IMPORT_RESTORE_FAILED_MESSAGE =
  'Import could not be completed. StrikeCaller could not restore all previous data.'

export const IMPORT_EXECUTION_FAILED_MESSAGE =
  'Import could not be saved. StrikeCaller could not complete this import.'

export const HISTORY_CLEAR_RESTORE_FAILED_MESSAGE =
  'StrikeCaller cleared workout history but could not restore it after leftover storage cleanup failed.'

export function storageFail(reason: StorageWriteReason): Extract<StorageWriteResult, { ok: false }> {
  return { ok: false, reason, message: STORAGE_WRITE_MESSAGES[reason] }
}

export function isQuotaExceededError(error: unknown): boolean {
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

function isSerializationError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const name = 'name' in error ? String(error.name) : ''
  return name === 'DataCloneError'
}

export function classifyStorageError(error: unknown): Extract<StorageWriteResult, { ok: false }> {
  if (isQuotaExceededError(error)) return storageFail('quota-exceeded')
  if (isUnavailableError(error)) return storageFail('unavailable')
  if (isSerializationError(error)) return storageFail('serialization')
  return storageFail('write-failed')
}
