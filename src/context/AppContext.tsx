import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { DEFAULT_PREFERENCES } from '../data/defaults'
import {
  loadPreferences,
  savePreferences,
  loadFavorites,
  saveFavorites,
  loadCustomCombos,
  saveCustomCombos,
  loadHistory,
  saveHistory,
  clearHistory as clearHistoryStore,
  resetPreferences as resetPreferencesStore,
  loadDailyDrillMap,
  saveDailyDrill,
  saveDailyDrillMap,
  exportUserData,
  importUserData,
  HISTORY_QUOTA_MESSAGE,
  type ImportUserDataResult,
  type StorageWriteResult,
} from '../storage/localStore'
import type {
  CustomCombo,
  DailyDrillMap,
  DailyDrillState,
  SessionSummary,
  ThemePreference,
  UserPreferences,
} from '../types'
import { normalizeDailyDrillState } from '../utils/dailyDrill'

export type StorageIssueSource =
  | 'preferences'
  | 'favorites'
  | 'custom-combos'
  | 'history'
  | 'daily-drill'
  | 'import'
  | 'migration'

export type StorageIssue = {
  id: number
  reason: Exclude<StorageWriteResult, { ok: true }>['reason']
  message: string
  source: StorageIssueSource
}

interface AppContextValue {
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
  addHistory: (summary: SessionSummary) => void
  clearHistory: () => void
  resetPreferences: () => void
  dailyDrills: DailyDrillMap
  /** Upsert one sport/date record into the daily drill map */
  setDailyDrill: (state: DailyDrillState) => void
  getDailyDrill: (dateKey: string) => DailyDrillState | null
  exportData: () => string
  importData: (json: string) => ImportUserDataResult
  storageIssue: StorageIssue | null
  storageWarningVisible: boolean
  dismissStorageIssue: () => void
}

const AppContext = createContext<AppContextValue | null>(null)

function resolveTheme(pref: ThemePreference): 'dark' | 'light' {
  if (pref === 'system') {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light'
    }
    return 'dark'
  }
  return pref
}

function messageForWrite(result: Extract<StorageWriteResult, { ok: false }>, source: StorageIssueSource): string {
  if (result.reason === 'quota-exceeded' && source === 'history') return HISTORY_QUOTA_MESSAGE
  return result.message
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferencesState] = useState<UserPreferences>(() => loadPreferences())
  const [favorites, setFavorites] = useState<string[]>(() => loadFavorites())
  const [customCombos, setCustomCombos] = useState<CustomCombo[]>(() => loadCustomCombos())
  const [history, setHistory] = useState<SessionSummary[]>(() => loadHistory())
  const [dailyDrills, setDailyDrillsState] = useState<DailyDrillMap>(() => loadDailyDrillMap())
  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>(() =>
    resolveTheme(loadPreferences().theme),
  )
  const [storageIssue, setStorageIssue] = useState<StorageIssue | null>(null)
  const [dismissedIssueId, setDismissedIssueId] = useState<number | null>(null)
  const issueIdRef = useRef(0)

  const applyWrite = useCallback((result: StorageWriteResult, source: StorageIssueSource) => {
    if (result.ok) {
      setStorageIssue((current) => (current?.source === source ? null : current))
      return
    }
    issueIdRef.current += 1
    setStorageIssue({
      id: issueIdRef.current,
      reason: result.reason,
      message: messageForWrite(result, source),
      source,
    })
  }, [])

  const setPreferences = useCallback(
    (next: UserPreferences | ((p: UserPreferences) => UserPreferences)) => {
      setPreferencesState((prev) => {
        const value = typeof next === 'function' ? next(prev) : next
        const result = savePreferences(value)
        queueMicrotask(() => applyWrite(result, 'preferences'))
        return value
      })
    },
    [applyWrite],
  )

  const updatePreferences = useCallback(
    (partial: Partial<UserPreferences>) => {
      setPreferences((prev) => ({ ...prev, ...partial }))
    },
    [setPreferences],
  )

  useEffect(() => {
    // Persist migrated history / custom combos so legacy records keep repaired shape.
    const writes: Array<{ result: StorageWriteResult; source: StorageIssueSource }> = [
      { result: saveHistory(history), source: 'migration' },
      { result: saveCustomCombos(customCombos), source: 'migration' },
      { result: saveDailyDrillMap(dailyDrills), source: 'migration' },
    ]
    const failed = writes.find((w) => !w.result.ok)
    if (failed) applyWrite(failed.result, failed.source)
    // intentionally once after initial load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const theme = resolveTheme(preferences.theme)
    setResolvedTheme(theme)
    document.documentElement.dataset.theme = theme
    document.documentElement.classList.toggle('large-text', preferences.largeText)
  }, [preferences.theme, preferences.largeText])

  useEffect(() => {
    if (preferences.theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const handler = () => {
      const theme = resolveTheme('system')
      setResolvedTheme(theme)
      document.documentElement.dataset.theme = theme
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [preferences.theme])

  const value = useMemo<AppContextValue>(
    () => ({
      preferences,
      setPreferences,
      updatePreferences,
      resolvedTheme,
      setTheme: (theme) => updatePreferences({ theme }),
      favorites,
      toggleFavorite: (comboId) => {
        setFavorites((prev) => {
          const next = prev.includes(comboId) ? prev.filter((id) => id !== comboId) : [...prev, comboId]
          const result = saveFavorites(next)
          queueMicrotask(() => applyWrite(result, 'favorites'))
          return next
        })
      },
      customCombos,
      upsertCustomCombo: (combo) => {
        setCustomCombos((prev) => {
          const idx = prev.findIndex((c) => c.id === combo.id)
          const next = idx >= 0 ? prev.map((c) => (c.id === combo.id ? combo : c)) : [...prev, combo]
          const result = saveCustomCombos(next)
          queueMicrotask(() => applyWrite(result, 'custom-combos'))
          return next
        })
      },
      removeCustomCombo: (id) => {
        setCustomCombos((prev) => {
          const next = prev.filter((c) => c.id !== id)
          const result = saveCustomCombos(next)
          queueMicrotask(() => applyWrite(result, 'custom-combos'))
          return next
        })
      },
      history,
      addHistory: (summary) => {
        setHistory((prev) => {
          if (prev.some((h) => h.id === summary.id)) return prev
          if (summary.excludeFromStats || summary.isDemo || summary.mode === 'demo') {
            return prev
          }
          const next = [summary, ...prev]
          const result = saveHistory(next)
          queueMicrotask(() => applyWrite(result, 'history'))
          return next
        })
      },
      clearHistory: () => {
        const result = clearHistoryStore()
        setHistory([])
        applyWrite(result, 'history')
      },
      resetPreferences: () => {
        const { preferences: next, write } = resetPreferencesStore()
        setPreferencesState(next)
        applyWrite(write, 'preferences')
      },
      dailyDrills,
      setDailyDrill: (state) => {
        const normalized = normalizeDailyDrillState(state)
        if (!normalized) return
        const result = saveDailyDrill(normalized)
        setDailyDrillsState((prev) => ({ ...prev, [normalized.dateKey]: normalized }))
        applyWrite(result, 'daily-drill')
      },
      getDailyDrill: (dateKey) => dailyDrills[dateKey] ?? null,
      exportData: exportUserData,
      importData: (json) => {
        const result = importUserData(json)
        if (result.ok) {
          setPreferencesState(loadPreferences())
          setFavorites(loadFavorites())
          setCustomCombos(loadCustomCombos())
          setHistory(loadHistory())
          setDailyDrillsState(loadDailyDrillMap())
          setStorageIssue(null)
        } else if (result.write && !result.write.ok) {
          applyWrite(result.write, 'import')
        }
        return result
      },
      storageIssue,
      storageWarningVisible: storageIssue != null && storageIssue.id !== dismissedIssueId,
      dismissStorageIssue: () => {
        if (storageIssue) setDismissedIssueId(storageIssue.id)
      },
    }),
    [
      preferences,
      setPreferences,
      updatePreferences,
      resolvedTheme,
      favorites,
      customCombos,
      history,
      dailyDrills,
      applyWrite,
      storageIssue,
      dismissedIssueId,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}

export { DEFAULT_PREFERENCES }
