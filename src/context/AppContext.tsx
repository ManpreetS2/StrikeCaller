import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DELETE_ALL_PARTIAL_MESSAGE, HISTORY_QUOTA_MESSAGE, classifyStorageError } from '../storage/storageTypes'
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
  type StorageWriteResult,
} from '../storage/localStore'
import * as historyStore from '../storage/historyStore'
import * as userDataStore from '../storage/userData'
import type { DeleteAllUserDataResult } from '../storage/userData'
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
  if (source === 'delete') return DELETE_ALL_PARTIAL_MESSAGE
  if (result.reason === 'quota-exceeded' && source === 'history') return HISTORY_QUOTA_MESSAGE
  return result.message
}

function isPersistableHistoryEntry(summary: SessionSummary): boolean {
  return !summary.excludeFromStats && !summary.isDemo && summary.mode !== 'demo'
}

function afterSettle(promise: Promise<unknown>, cleanup: () => void): void {
  void promise.then(cleanup, cleanup)
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
  const dataEpochRef = useRef(0)
  const deleteInFlightRef = useRef<Promise<DeleteAllUserDataResult> | null>(null)
  const clearInFlightRef = useRef<Promise<void> | null>(null)
  const dataMutationTailRef = useRef(Promise.resolve())
  const dataMutationCountRef = useRef(0)
  const [dataMutationPending, setDataMutationPending] = useState(false)

  const runLocalDataMutation = useCallback(<T,>(work: () => Promise<T>): Promise<T> => {
    dataMutationCountRef.current += 1
    setDataMutationPending(true)
    const run = dataMutationTailRef.current.then(work, work)
    dataMutationTailRef.current = run.then(
      () => undefined,
      () => undefined,
    )
    afterSettle(run, () => {
      dataMutationCountRef.current -= 1
      if (dataMutationCountRef.current === 0) setDataMutationPending(false)
    })
    return run
  }, [])

  const enqueueAfterLocalData = useCallback((work: () => void) => {
    if (dataMutationCountRef.current === 0) {
      work()
      return
    }
    const run = dataMutationTailRef.current.then(work, work)
    dataMutationTailRef.current = run.then(
      () => undefined,
      () => undefined,
    )
  }, [])

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
      enqueueAfterLocalData(() => {
        setPreferencesState((prev) => {
          const value = typeof next === 'function' ? next(prev) : next
          const result = savePreferences(value)
          queueMicrotask(() => applyWrite(result, 'preferences'))
          return value
        })
      })
    },
    [applyWrite, enqueueAfterLocalData],
  )

  const updatePreferences = useCallback(
    (partial: Partial<UserPreferences>) => {
      setPreferences((prev) => ({ ...prev, ...partial }))
    },
    [setPreferences],
  )

  useEffect(() => {
    const epoch = dataEpochRef.current
    let cancelled = false
    void (async () => {
      const { history: loaded, write } = await historyStore.ensureHistoryInitialized()
      if (cancelled || dataEpochRef.current !== epoch) return
      if (!write.ok) applyWrite(write, 'history')

      historyReadyRef.current = true
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
        return historyStore.sortHistory([...byId.values()])
      })

      for (const item of pending) {
        if (dataEpochRef.current !== epoch) {
          item.resolve({ status: 'skipped' })
          continue
        }
        const write = await historyStore.commitSessionWrite(item.summary)
        if (cancelled || historyStore.getHistoryWriteGeneration() !== write.generation) {
          const durable = await historyStore.ensureHistoryInitialized()
          if (cancelled || !durable.history.some((session) => session.id === item.summary.id)) {
            item.resolve({ status: 'skipped' })
            continue
          }
        }
        applyWrite(write.write, 'history')
        item.resolve(resultFromWrite(write.write))
      }

      if (cancelled || dataEpochRef.current !== epoch) return
      setHistoryReady(true)
    })()

    if (dataEpochRef.current === epoch) {
      const writes: Array<{ result: StorageWriteResult; source: StorageIssueSource }> = [
        { result: saveCustomCombos(customCombos), source: 'migration' },
        { result: saveDailyDrillMap(dailyDrills), source: 'migration' },
      ]
      const failed = writes.find((w) => !w.result.ok)
      if (failed) applyWrite(failed.result, failed.source)
    }

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
        enqueueAfterLocalData(() => {
          setFavorites((prev) => {
            const next = prev.includes(comboId) ? prev.filter((id) => id !== comboId) : [...prev, comboId]
            const result = saveFavorites(next)
            queueMicrotask(() => applyWrite(result, 'favorites'))
            return next
          })
        })
      },
      customCombos,
      upsertCustomCombo: (combo) => {
        enqueueAfterLocalData(() => {
          setCustomCombos((prev) => {
            const idx = prev.findIndex((c) => c.id === combo.id)
            const next = idx >= 0 ? prev.map((c) => (c.id === combo.id ? combo : c)) : [...prev, combo]
            const result = saveCustomCombos(next)
            queueMicrotask(() => applyWrite(result, 'custom-combos'))
            return next
          })
        })
      },
      removeCustomCombo: (id) => {
        enqueueAfterLocalData(() => {
          setCustomCombos((prev) => {
            const next = prev.filter((c) => c.id !== id)
            const result = saveCustomCombos(next)
            queueMicrotask(() => applyWrite(result, 'custom-combos'))
            return next
          })
        })
      },
      history,
      historyReady,
      dataMutationPending,
      addHistory: (summary) => {
        if (!isPersistableHistoryEntry(summary)) {
          return Promise.resolve({ status: 'skipped' })
        }
        const existing = inFlightRef.current.get(summary.id)
        if (existing) return existing

        let resolvePersist!: (result: AddHistoryResult) => void
        const persist = new Promise<AddHistoryResult>((resolve) => {
          resolvePersist = resolve
        })
        inFlightRef.current.set(summary.id, persist)

        let settled = false
        const finish = (result: AddHistoryResult) => {
          if (settled) return
          settled = true
          inFlightRef.current.delete(summary.id)
          resolvePersist(result)
        }

        const persistNow = async () => {
          try {
            if (!historyReadyRef.current) {
              setHistory((prev) => {
                if (prev.some((h) => h.id === summary.id)) return prev
                return [summary, ...prev]
              })
              pendingSavesRef.current.push({ summary, resolve: finish })
              return
            }

            setHistory((prev) => {
              if (prev.some((h) => h.id === summary.id)) return prev
              return [summary, ...prev]
            })

            const committed = await historyStore.commitSessionWrite(summary)
            if (!committed.write.ok) {
              applyWrite(committed.write, 'history')
              finish(resultFromWrite(committed.write))
              return
            }

            if (historyStore.getHistoryWriteGeneration() !== committed.generation) {
              const durable = await historyStore.ensureHistoryInitialized()
              if (!durable.history.some((session) => session.id === summary.id)) {
                setHistory((prev) => prev.filter((session) => session.id !== summary.id))
                finish({ status: 'skipped' })
                return
              }
            }

            applyWrite(committed.write, 'history')
            setHistory((prev) => {
              if (prev.some((h) => h.id === summary.id)) {
                return historyStore.sortHistory(prev.map((h) => (h.id === summary.id ? summary : h)))
              }
              return historyStore.sortHistory([summary, ...prev])
            })
            finish({ status: 'persisted' })
          } catch (error) {
            const write = classifyStorageError(error)
            applyWrite(write, 'history')
            finish({ status: 'failed', write })
          }
        }

        const queued = dataMutationTailRef.current.then(persistNow, persistNow)
        dataMutationTailRef.current = queued.then(
          () => undefined,
          () => undefined,
        )
        return persist
      },
      clearHistory: () => {
        if (clearInFlightRef.current) return clearInFlightRef.current
        const run = runLocalDataMutation(async () => {
          const result = await historyStore.clearHistory()
          applyWrite(result, 'history')
          if (result.ok) {
            dataEpochRef.current += 1
            const leftover = pendingSavesRef.current
            pendingSavesRef.current = []
            for (const item of leftover) {
              item.resolve({ status: 'skipped' })
            }
            setHistory([])
          }
        })
        clearInFlightRef.current = run
        afterSettle(run, () => {
          if (clearInFlightRef.current === run) clearInFlightRef.current = null
        })
        return run
      },
      resetPreferences: () => {
        enqueueAfterLocalData(() => {
          const { preferences: next, write } = resetPreferencesStore()
          setPreferencesState(next)
          applyWrite(write, 'preferences')
        })
      },
      deleteAllUserData: () => {
        if (deleteInFlightRef.current) return deleteInFlightRef.current
        const run = runLocalDataMutation(async () => {
          dataEpochRef.current += 1
          const epoch = dataEpochRef.current
          const result = await userDataStore.deleteAllUserData()
          if (dataEpochRef.current !== epoch) return result

          const leftover = pendingSavesRef.current
          pendingSavesRef.current = []
          for (const item of leftover) {
            item.resolve({ status: 'skipped' })
          }

          historyReadyRef.current = true
          setHistoryReady(true)
          setPreferencesState(loadPreferences())
          setFavorites(loadFavorites())
          setCustomCombos(loadCustomCombos())
          setDailyDrillsState(loadDailyDrillMap())
          setHistory(await historyStore.loadHistory())

          if (result.ok) {
            setStorageIssue(null)
          } else {
            const failedWrite = !result.indexedDB.ok
              ? result.indexedDB
              : result.localStorage
            applyWrite(failedWrite, 'delete')
          }
          return result
        })
        deleteInFlightRef.current = run
        afterSettle(run, () => {
          if (deleteInFlightRef.current === run) deleteInFlightRef.current = null
        })
        return run
      },
      dailyDrills,
      setDailyDrill: (state) => {
        enqueueAfterLocalData(() => {
          const normalized = normalizeDailyDrillState(state)
          if (!normalized) return
          const result = saveDailyDrill(normalized)
          setDailyDrillsState((prev) => ({ ...prev, [normalized.dateKey]: normalized }))
          applyWrite(result, 'daily-drill')
        })
      },
      getDailyDrill: (dateKey) => dailyDrills[dateKey] ?? null,
      exportData: () =>
        dataMutationTailRef.current.then(
          () => userDataStore.exportUserData(),
          () => userDataStore.exportUserData(),
        ),
      importData: (json) =>
        runLocalDataMutation(async () => {
          const result = await userDataStore.importUserData(json)
          const applied = result.ok || ('applied' in result && result.applied === true)
          if (applied) {
            dataEpochRef.current += 1
            setPreferencesState(loadPreferences())
            setFavorites(loadFavorites())
            setCustomCombos(loadCustomCombos())
            setHistory(await historyStore.loadHistory())
            setDailyDrillsState(loadDailyDrillMap())
            historyReadyRef.current = true
            setHistoryReady(true)
            if (result.ok) {
              setStorageIssue(null)
            } else if (result.write && !result.write.ok) {
              applyWrite(result.write, 'import')
            }
          } else if (result.write && !result.write.ok) {
            applyWrite(result.write, 'import')
          }
          return result
        }),
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
      dataMutationPending,
      applyWrite,
      runLocalDataMutation,
      enqueueAfterLocalData,
      storageIssue,
      dismissedIssueId,
    ],
  )

  return <AppReactContext.Provider value={value}>{children}</AppReactContext.Provider>
}
