import { createContext, useContext } from 'react'
import type { StorageWriteResult } from '../storage/localStore'
import type { DeleteAllUserDataResult, ImportUserDataResult } from '../storage/userData'
import type {
  CustomCombo,
  DailyDrillMap,
  DailyDrillState,
  SessionSummary,
  ThemePreference,
  UserPreferences,
} from '../types'

export type StorageIssueSource =
  | 'preferences'
  | 'favorites'
  | 'custom-combos'
  | 'history'
  | 'daily-drill'
  | 'import'
  | 'migration'
  | 'delete'

export type StorageIssue = {
  id: number
  reason: Exclude<StorageWriteResult, { ok: true }>['reason']
  message: string
  source: StorageIssueSource
}

export type AddHistoryResult =
  | { status: 'persisted' }
  | { status: 'skipped' }
  | { status: 'failed'; write: Extract<StorageWriteResult, { ok: false }> }

export interface AppContextValue {
  preferences: UserPreferences
  setPreferences: (next: UserPreferences | ((p: UserPreferences) => UserPreferences)) => void
  updatePreferences: (partial: Partial<UserPreferences>) => void
  resolvedTheme: 'dark' | 'light'
  setTheme: (theme: ThemePreference) => void
  favorites: string[]
  toggleFavorite: (comboId: string) => void
  customCombos: CustomCombo[]
  upsertCustomCombo: (combo: CustomCombo) => void
  removeCustomCombo: (id: string) => void
  history: SessionSummary[]
  historyReady: boolean
  dataMutationPending: boolean
  addHistory: (summary: SessionSummary) => Promise<AddHistoryResult>
  clearHistory: () => Promise<void>
  resetPreferences: () => void
  dailyDrills: DailyDrillMap
  /** Upsert one sport/date record into the daily drill map */
  setDailyDrill: (state: DailyDrillState) => void
  getDailyDrill: (dateKey: string) => DailyDrillState | null
  exportData: () => Promise<string>
  importData: (json: string) => Promise<ImportUserDataResult>
  deleteAllUserData: () => Promise<DeleteAllUserDataResult>
  storageIssue: StorageIssue | null
  storageWarningVisible: boolean
  dismissStorageIssue: () => void
}

export const AppReactContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const ctx = useContext(AppReactContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
