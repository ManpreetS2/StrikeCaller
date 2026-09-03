import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  loadPreferences,
  savePreferences,
  loadFavorites,
  saveFavorites,
  loadCustomCombos,
  saveCustomCombos,
  loadLegacyHistory,
  resetPreferences as resetPreferencesStore,
  loadDailyDrillMap,
  saveDailyDrill,
  saveDailyDrillMap,
  HISTORY_QUOTA_MESSAGE,
  type StorageWriteResult,
} from '../storage/localStore'
import {
  clearHistory as clearHistoryStore,
  ensureHistoryInitialized,
  loadHistory,
  saveSession,
  sortHistory,
} from '../storage/historyStore'
import { exportUserData, importUserData } from '../storage/userData'
import type { CustomCombo, DailyDrillMap, SessionSummary, ThemePreference, UserPreferences } from '../types'
import { normalizeDailyDrillState } from '../utils/dailyDrill'
import {
  AppReactContext,
  type AddHistoryResult,
  type AppContextValue,
  type StorageIssue,
  type StorageIssueSource,
} from './useApp'

export type { AddHistoryResult, StorageIssue, StorageIssueSource }

type PendingSave = {
  summary: SessionSummary
  resolve: (result: AddHistoryResult) => void
}

function resultFromWrite(write: StorageWriteResult): AddHistoryResult {
  if (write.ok) return { status: 'persisted' }
  return { status: 'failed', write }
}

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

function isPersistableHistoryEntry(summary: SessionSummary): boolean {
  return !summary.excludeFromStats && !summary.isDemo && summary.mode !== 'demo'
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferencesState] = useState<UserPreferences>(() => loadPreferences())
  const [favorites, setFavorites] = useState<string[]>(() => loadFavorites())
  const [customCombos, setCustomCombos] = useState<CustomCombo[]>(() => loadCustomCombos())
  const [history, setHistory] = useState<SessionSummary[]>(() => loadLegacyHistory())
  const [historyReady, setHistoryReady] = useState(false)
  const [dailyDrills, setDailyDrillsState] = useState<DailyDrillMap>(() => loadDailyDrillMap())
  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>(() =>
    resolveTheme(loadPreferences().theme),
  )
  const [storageIssue, setStorageIssue] = useState<StorageIssue | null>(null)
  const [dismissedIssueId, setDismissedIssueId] = useState<number | null>(null)
  const issueIdRef = useRef(0)
  const historyReadyRef = useRef(false)
  const pendingSavesRef = useRef<PendingSave[]>([])
  const inFlightRef = useRef(new Map<string, Promise<AddHistoryResult>>())

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
    let cancelled = false
    void (async () => {
      const { history: loaded, write } = await ensureHistoryInitialized()
      if (cancelled) return
      if (!write.ok) applyWrite(write, 'history')

      historyReadyRef.current = true
      setHistoryReady(true)
      const pending = pendingSavesRef.current
      pendingSavesRef.current = []

      setHistory((prev) => {
        const byId = new Map<string, SessionSummary>()
        for (const session of loaded) byId.set(session.id, session)
        for (const item of pending) {
          if (!byId.has(item.summary.id)) byId.set(item.summary.id, item.summary)
        }
        for (const session of prev) {
          if (!byId.has(session.id)) byId.set(session.id, session)
        }
        return sortHistory([...byId.values()])
      })

      for (const item of pending) {
        const write = await saveSession(item.summary)
        if (!cancelled) applyWrite(write, 'history')
        item.resolve(resultFromWrite(write))
      }
    })()

    const writes: Array<{ result: StorageWriteResult; source: StorageIssueSource }> = [
      { result: saveCustomCombos(customCombos), source: 'migration' },
      { result: saveDailyDrillMap(dailyDrills), source: 'migration' },
    ]
    const failed = writes.find((w) => !w.result.ok)
    if (failed) applyWrite(failed.result, failed.source)

    return () => {
      cancelled = true
    }
    // Hydrate IndexedDB history once after mount. Re-running would duplicate
    // pending-save drains and reset historyReady around an in-flight session.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
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
      historyReady,
      addHistory: (summary) => {
        if (!isPersistableHistoryEntry(summary)) {
          return Promise.resolve({ status: 'skipped' })
        }
        const existing = inFlightRef.current.get(summary.id)
        if (existing) return existing

        setHistory((prev) => {
          if (prev.some((h) => h.id === summary.id)) return prev
          return [summary, ...prev]
        })

        let resolvePersist!: (result: AddHistoryResult) => void
        const persist = new Promise<AddHistoryResult>((resolve) => {
          resolvePersist = resolve
        })
        inFlightRef.current.set(summary.id, persist)

        const finish = (result: AddHistoryResult) => {
          inFlightRef.current.delete(summary.id)
          resolvePersist(result)
        }
        if (!historyReadyRef.current) {
          pendingSavesRef.current.push({ summary, resolve: finish })
          return persist
        }
        void saveSession(summary).then((write) => {
          applyWrite(write, 'history')
          finish(resultFromWrite(write))
        })
        return persist
      },
      clearHistory: async () => {
        const result = await clearHistoryStore()
        applyWrite(result, 'history')
        if (result.ok) {
          const leftover = pendingSavesRef.current
          pendingSavesRef.current = []
          for (const item of leftover) {
            item.resolve({ status: 'skipped' })
          }
          setHistory([])
        }
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
      exportData: () => exportUserData(),
      importData: async (json) => {
        const result = await importUserData(json)
        if (result.ok) {
          setPreferencesState(loadPreferences())
          setFavorites(loadFavorites())
          setCustomCombos(loadCustomCombos())
          setHistory(await loadHistory())
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
      historyReady,
      dailyDrills,
      applyWrite,
      storageIssue,
      dismissedIssueId,
    ],
  )

  return <AppReactContext.Provider value={value}>{children}</AppReactContext.Provider>
}
