import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  importData: (json: string) => { ok: boolean; message: string }
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

export function AppProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferencesState] = useState<UserPreferences>(() => loadPreferences())
  const [favorites, setFavorites] = useState<string[]>(() => loadFavorites())
  const [customCombos, setCustomCombos] = useState<CustomCombo[]>(() => loadCustomCombos())
  const [history, setHistory] = useState<SessionSummary[]>(() => loadHistory())
  const [dailyDrills, setDailyDrillsState] = useState<DailyDrillMap>(() => loadDailyDrillMap())
  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>(() =>
    resolveTheme(loadPreferences().theme),
  )

  const setPreferences = useCallback((next: UserPreferences | ((p: UserPreferences) => UserPreferences)) => {
    setPreferencesState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next
      savePreferences(value)
      return value
    })
  }, [])

  const updatePreferences = useCallback(
    (partial: Partial<UserPreferences>) => {
      setPreferences((prev) => ({ ...prev, ...partial }))
    },
    [setPreferences],
  )

  useEffect(() => {
    // Persist migrated history / custom combos so legacy records keep repaired shape.
    saveHistory(history)
    saveCustomCombos(customCombos)
    saveDailyDrillMap(dailyDrills)
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
          saveFavorites(next)
          return next
        })
      },
      customCombos,
      upsertCustomCombo: (combo) => {
        setCustomCombos((prev) => {
          const idx = prev.findIndex((c) => c.id === combo.id)
          const next = idx >= 0 ? prev.map((c) => (c.id === combo.id ? combo : c)) : [...prev, combo]
          saveCustomCombos(next)
          return next
        })
      },
      removeCustomCombo: (id) => {
        setCustomCombos((prev) => {
          const next = prev.filter((c) => c.id !== id)
          saveCustomCombos(next)
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
          saveHistory(next)
          return next
        })
      },
      clearHistory: () => {
        clearHistoryStore()
        setHistory([])
      },
      resetPreferences: () => {
        const next = resetPreferencesStore()
        setPreferencesState(next)
      },
      dailyDrills,
      setDailyDrill: (state) => {
        const normalized = normalizeDailyDrillState(state)
        if (!normalized) return
        saveDailyDrill(normalized)
        setDailyDrillsState((prev) => ({ ...prev, [normalized.dateKey]: normalized }))
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
        }
        return result
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
