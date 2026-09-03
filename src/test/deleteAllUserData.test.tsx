import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppProvider } from '../context/AppContext'
import { useApp } from '../context/useApp'
import { SettingsPage } from '../pages/SettingsPage'
import { SummaryPage } from '../pages/SummaryPage'
import { AppLayout } from '../components/AppLayout'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { DEFAULT_PREFERENCES } from '../data/defaults'
import {
  LEGACY_HISTORY_KEY,
  STORAGE_KEYS,
  USER_DATA_STORAGE_KEYS,
  loadCustomCombos,
  loadDailyDrillMap,
  loadFavorites,
  loadPreferences,
  saveCustomCombos,
  saveDailyDrillMap,
  saveFavorites,
  savePreferences,
} from '../storage/localStore'
import { exportUserData, importUserData, deleteAllUserData } from '../storage/userData'
import {
  ensureHistoryInitialized,
  getSessionById,
  loadHistory,
  saveSession,
} from '../storage/historyStore'
import * as idb from '../storage/idb'
import * as userData from '../storage/userData'
import { DELETE_ALL_PARTIAL_MESSAGE, DELETE_ALL_SUCCESS_MESSAGE } from '../storage/storageTypes'
import type { CustomCombo, SessionSummary } from '../types'

const UNRELATED_KEY = 'unrelated-app-data'
const UNRELATED_VALUE = 'keep-me'

function session(id: string, extra: Partial<SessionSummary> = {}): SessionSummary {
  const startedAt = extra.startedAt ?? 1_700_000_000_000
  const endedAt = extra.endedAt ?? startedAt + 60_000
  return {
    id,
    martialArt: 'muay-thai',
    mode: 'coach',
    stance: 'orthodox',
    pace: 'technical',
    totalTrainingMs: 60_000,
    roundsCompleted: 1,
    combinationsCompleted: 4,
    techniquesCalled: 8,
    techniqueCounts: { jab: 4 },
    techniqueCategoryCounts: { punch: 8 },
    comboIds: ['beg-01'],
    defenseActions: 0,
    movementActions: 0,
    averagePaceLabel: 'technical',
    dailyDrillCompleted: false,
    cancelled: false,
    favoriteComboIds: [],
    usedCustomCombo: false,
    ...extra,
    startedAt,
    endedAt,
  }
}

function customCombo(id = 'custom-delete-1'): CustomCombo {
  return {
    id,
    title: 'Jab cross',
    techniqueIds: ['jab', 'cross'],
    createdAt: 1,
    updatedAt: 1,
    favorite: false,
    repeatCount: 1,
    martialArt: 'muay-thai',
  }
}

function seedUserData() {
  savePreferences({ ...DEFAULT_PREFERENCES, onboardingComplete: true, theme: 'light', largeText: true })
  saveFavorites(['beg-01'])
  saveCustomCombos([customCombo()])
  saveDailyDrillMap({
    '2026-09-03:muay-thai': {
      dateKey: '2026-09-03:muay-thai',
      comboId: 'beg-01',
      martialArt: 'muay-thai',
      slowDone: true,
      normalDone: false,
      fightDone: false,
      completed: false,
    },
  })
  localStorage.setItem(STORAGE_KEYS.musicCompatibility, '{"result":"music-paused"}')
  localStorage.setItem(LEGACY_HISTORY_KEY, JSON.stringify([session('legacy-delete')]))
  localStorage.setItem(UNRELATED_KEY, UNRELATED_VALUE)
}

function strikeCallerKeys(): string[] {
  return Object.keys(localStorage)
    .filter((key) => key.startsWith('strikecaller:'))
    .sort()
}

function spyRemoveItem(impl: (key: string, original: (key: string) => void) => void) {
  const original = Storage.prototype.removeItem
  return vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, key: string) {
    impl(key, (k) => original.call(this, k))
  })
}

function DeleteAllHarness() {
  const {
    deleteAllUserData: deleteAll,
    preferences,
    favorites,
    customCombos,
    history,
    historyReady,
    dailyDrills,
    addHistory,
    exportData,
    storageIssue,
  } = useApp()
  return (
    <div>
      <button type="button" onClick={() => void deleteAll()}>
        run-delete-all
      </button>
      <button type="button" onClick={() => void addHistory(session('pending-session'))}>
        queue-session
      </button>
      <span data-testid="theme">{preferences.theme}</span>
      <span data-testid="large-text">{String(preferences.largeText)}</span>
      <span data-testid="onboarding">{String(preferences.onboardingComplete)}</span>
      <span data-testid="favorites">{favorites.join(',')}</span>
      <span data-testid="combo-count">{customCombos.length}</span>
      <span data-testid="history-count">{history.length}</span>
      <span data-testid="history-ids">{history.map((item) => item.id).join(',')}</span>
      <span data-testid="history-ready">{historyReady ? 'yes' : 'no'}</span>
      <span data-testid="drill-count">{Object.keys(dailyDrills).length}</span>
      <span data-testid="issue-source">{storageIssue?.source ?? 'none'}</span>
      <button type="button" onClick={() => void exportData().then((json) => {
        document.querySelector('[data-testid="export-payload"]')!.textContent = json
      })}>
        export-now
      </button>
      <pre data-testid="export-payload" />
    </div>
  )
}

function renderHarness() {
  return render(
    <AppProvider>
      <DeleteAllHarness />
    </AppProvider>,
  )
}

describe('deleteAllUserData storage API', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('removes all known StrikeCaller localStorage keys and preserves unrelated data', async () => {
    seedUserData()
    expect(await saveSession(session('idb-session'))).toEqual({ ok: true })
    expect(strikeCallerKeys().length).toBeGreaterThan(0)
    expect(localStorage.getItem(UNRELATED_KEY)).toBe(UNRELATED_VALUE)

    const result = await deleteAllUserData()
    expect(result).toEqual({ ok: true })
    expect(strikeCallerKeys()).toEqual([])
    expect(localStorage.getItem(UNRELATED_KEY)).toBe(UNRELATED_VALUE)
    for (const key of USER_DATA_STORAGE_KEYS) {
      expect(localStorage.getItem(key)).toBeNull()
    }
    expect(await loadHistory()).toEqual([])
    expect(loadFavorites()).toEqual([])
    expect(loadCustomCombos()).toEqual([])
    expect(loadDailyDrillMap()).toEqual({})
    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES)
  })

  it('clears IndexedDB sessions', async () => {
    expect(await saveSession(session('keep-then-delete'))).toEqual({ ok: true })
    expect((await loadHistory()).map((item) => item.id)).toEqual(['keep-then-delete'])
    expect((await deleteAllUserData()).ok).toBe(true)
    expect(await loadHistory()).toEqual([])
  })

  it('removes legacy history so it cannot remigrate', async () => {
    localStorage.setItem(LEGACY_HISTORY_KEY, JSON.stringify([session('legacy-only')]))
    expect((await deleteAllUserData()).ok).toBe(true)
    expect(localStorage.getItem(LEGACY_HISTORY_KEY)).toBeNull()
    const initialized = await ensureHistoryInitialized()
    expect(initialized.history).toEqual([])
    expect(await loadHistory()).toEqual([])
    expect(await getSessionById('legacy-only')).toEqual({ status: 'not-found' })
  })

  it('reports localStorage removal failure without claiming success', async () => {
    seedUserData()
    expect(await saveSession(session('still-in-idb'))).toEqual({ ok: true })
    spyRemoveItem((key, original) => {
      if (key === STORAGE_KEYS.favorites) throw new Error('blocked remove')
      original(key)
    })
    const result = await deleteAllUserData()
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failed).toContain('localStorage')
    expect(result.message).toBe(DELETE_ALL_PARTIAL_MESSAGE)
    expect(result.message).not.toContain('blocked remove')
    expect(localStorage.getItem(STORAGE_KEYS.favorites)).toBeTruthy()
    expect(localStorage.getItem(STORAGE_KEYS.preferences)).toBeNull()
    expect(localStorage.getItem(UNRELATED_KEY)).toBe(UNRELATED_VALUE)
    expect(await loadHistory()).toEqual([])
  })

  it('reports IndexedDB failure without claiming history was deleted', async () => {
    expect(await saveSession(session('idb-stays'))).toEqual({ ok: true })
    saveFavorites(['beg-01'])
    vi.spyOn(IDBObjectStore.prototype, 'clear').mockImplementation(() => {
      throw new DOMException('clear failed', 'UnknownError')
    })
    const result = await deleteAllUserData()
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failed).toContain('indexedDB')
    expect(result.message).toBe(DELETE_ALL_PARTIAL_MESSAGE)
    expect((await loadHistory()).map((item) => item.id)).toEqual(['idb-stays'])
    expect(localStorage.getItem(STORAGE_KEYS.favorites)).toBeNull()
  })

  it('reports partial failure when both storage classes fail', async () => {
    seedUserData()
    expect(await saveSession(session('both-fail'))).toEqual({ ok: true })
    spyRemoveItem((key, original) => {
      if (key === STORAGE_KEYS.preferences) throw new Error('prefs locked')
      original(key)
    })
    vi.spyOn(IDBObjectStore.prototype, 'clear').mockImplementation(() => {
      throw new DOMException('clear failed', 'UnknownError')
    })
    const result = await deleteAllUserData()
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failed).toEqual(['localStorage', 'indexedDB'])
    expect(result.message).toBe(DELETE_ALL_PARTIAL_MESSAGE)
  })

  it('does not let an in-flight session resurrect after a successful delete', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const original = idb.transactSessions
    let heldFirstWrite = false
    vi.spyOn(idb, 'transactSessions').mockImplementation(async (mode, work) => {
      if (mode === 'readwrite' && !heldFirstWrite) {
        heldFirstWrite = true
        await gate
      }
      return original(mode, work)
    })

    const saveP = saveSession(session('late-write'))
    const deleteP = deleteAllUserData()
    release()
    expect((await deleteP).ok).toBe(true)
    await saveP
    expect(await loadHistory()).toEqual([])
    expect(await getSessionById('late-write')).toEqual({ status: 'not-found' })
  })

  it('does not remigrate a pending init after delete', async () => {
    localStorage.setItem(LEGACY_HISTORY_KEY, JSON.stringify([session('init-late')]))
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const original = idb.transactSessions
    let heldFirstWrite = false
    vi.spyOn(idb, 'transactSessions').mockImplementation(async (mode, work) => {
      if (mode === 'readwrite' && !heldFirstWrite) {
        heldFirstWrite = true
        await gate
      }
      return original(mode, work)
    })

    const initP = ensureHistoryInitialized()
    const deleteP = deleteAllUserData()
    release()
    expect((await deleteP).ok).toBe(true)
    await initP
    expect(localStorage.getItem(LEGACY_HISTORY_KEY)).toBeNull()
    expect(await loadHistory()).toEqual([])
    expect(await getSessionById('init-late')).toEqual({ status: 'not-found' })
  })

  it('reuses one in-flight delete promise', async () => {
    seedUserData()
    expect(await saveSession(session('once'))).toEqual({ ok: true })
    const first = deleteAllUserData()
    const second = deleteAllUserData()
    expect(second).toBe(first)
    expect((await first).ok).toBe(true)
    expect((await second).ok).toBe(true)
    expect(await loadHistory()).toEqual([])
  })

  it('export after delete contains no old user data', async () => {
    seedUserData()
    expect(await saveSession(session('export-old'))).toEqual({ ok: true })
    expect((await deleteAllUserData()).ok).toBe(true)
    const payload = JSON.parse(await exportUserData()) as {
      preferences: { theme: string; onboardingComplete: boolean }
      favorites: string[]
      customCombos: unknown[]
      history: unknown[]
      dailyDrills: Record<string, unknown>
    }
    expect(payload.preferences.theme).toBe(DEFAULT_PREFERENCES.theme)
    expect(payload.preferences.onboardingComplete).toBe(false)
    expect(payload.favorites).toEqual([])
    expect(payload.customCombos).toEqual([])
    expect(payload.history).toEqual([])
    expect(payload.dailyDrills).toEqual({})
  })

  it('allows a valid import after delete', async () => {
    seedUserData()
    expect(await saveSession(session('before-delete'))).toEqual({ ok: true })
    const backup = await exportUserData()
    expect((await deleteAllUserData()).ok).toBe(true)
    expect(await loadHistory()).toEqual([])
    const imported = await importUserData(backup)
    expect(imported).toEqual({ ok: true, message: 'Import successful.' })
    expect(loadFavorites()).toEqual(['beg-01'])
    expect(loadCustomCombos().map((combo) => combo.id)).toEqual(['custom-delete-1'])
    expect((await loadHistory()).map((item) => item.id).sort()).toEqual(['before-delete', 'legacy-delete'].sort())
    expect(loadPreferences().theme).toBe('light')
  })

  it('durable summary lookup is not found after delete', async () => {
    expect(await saveSession(session('summary-A'))).toEqual({ ok: true })
    expect(await getSessionById('summary-A')).toEqual({
      status: 'found',
      session: expect.objectContaining({ id: 'summary-A' }),
    })
    expect((await deleteAllUserData()).ok).toBe(true)
    expect(await getSessionById('summary-A')).toEqual({ status: 'not-found' })
  })
})

describe('delete all data AppContext reset', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    seedUserData()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('resets in-memory user data and theme without a reload', async () => {
    expect(await saveSession(session('ctx-session'))).toEqual({ ok: true })
    renderHarness()
    await waitFor(() => {
      expect(screen.getByTestId('history-ready')).toHaveTextContent('yes')
    })
    expect(screen.getByTestId('theme')).toHaveTextContent('light')
    expect(screen.getByTestId('large-text')).toHaveTextContent('true')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.documentElement.classList.contains('large-text')).toBe(true)
    expect(screen.getByTestId('favorites')).toHaveTextContent('beg-01')
    expect(screen.getByTestId('combo-count')).toHaveTextContent('1')
    expect(screen.getByTestId('drill-count')).toHaveTextContent('1')

    await act(async () => {
      screen.getByRole('button', { name: 'run-delete-all' }).click()
    })
    await waitFor(() => {
      expect(screen.getByTestId('theme')).toHaveTextContent('dark')
      expect(screen.getByTestId('large-text')).toHaveTextContent('false')
      expect(screen.getByTestId('onboarding')).toHaveTextContent('false')
      expect(screen.getByTestId('favorites')).toHaveTextContent('')
      expect(screen.getByTestId('combo-count')).toHaveTextContent('0')
      expect(screen.getByTestId('history-count')).toHaveTextContent('0')
      expect(screen.getByTestId('drill-count')).toHaveTextContent('0')
      expect(screen.getByTestId('issue-source')).toHaveTextContent('none')
    })
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.classList.contains('large-text')).toBe(false)
    expect(localStorage.getItem(UNRELATED_KEY)).toBe(UNRELATED_VALUE)
  })

  it('does not persist a pending session after delete during history init', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const original = idb.transactSessions
    let heldFirstRead = false
    vi.spyOn(idb, 'transactSessions').mockImplementation(async (mode, work) => {
      if (mode === 'readonly' && !heldFirstRead) {
        heldFirstRead = true
        await gate
      }
      return original(mode, work)
    })

    renderHarness()
    expect(screen.getByTestId('history-ready')).toHaveTextContent('no')
    await act(async () => {
      screen.getByRole('button', { name: 'queue-session' }).click()
    })
    expect(screen.getByTestId('history-ids')).toHaveTextContent('pending-session')

    screen.getByRole('button', { name: 'run-delete-all' }).click()
    await act(async () => {
      await Promise.resolve()
    })
    release()
    await waitFor(() => {
      expect(screen.getByTestId('history-count')).toHaveTextContent('0')
      expect(screen.getByTestId('history-ready')).toHaveTextContent('yes')
    })
    expect(await loadHistory()).toEqual([])
    expect(await getSessionById('pending-session')).toEqual({ status: 'not-found' })
  })
})

describe('delete all data Settings UI', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    seedUserData()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the danger section and does not delete on the first click or Cancel', async () => {
    const user = userEvent.setup()
    render(
      <AppProvider>
        <SettingsPage />
      </AppProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Delete all local data' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete all data' })).toBeInTheDocument()
    expect(localStorage.getItem(STORAGE_KEYS.favorites)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Delete all data' }))
    expect(screen.getByRole('dialog', { name: 'Delete all local data?' })).toBeInTheDocument()
    expect(localStorage.getItem(STORAGE_KEYS.favorites)).toBeTruthy()
    expect(localStorage.getItem(UNRELATED_KEY)).toBe(UNRELATED_VALUE)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Delete all local data?' })).not.toBeInTheDocument()
    expect(localStorage.getItem(STORAGE_KEYS.favorites)).toBeTruthy()
    expect(localStorage.getItem(STORAGE_KEYS.preferences)).toBeTruthy()
    expect(localStorage.getItem(UNRELATED_KEY)).toBe(UNRELATED_VALUE)
  })

  it('confirms deletion, shows success, and does not show success on failure', async () => {
    const user = userEvent.setup()
    expect(await saveSession(session('settings-session'))).toEqual({ ok: true })
    render(
      <AppProvider>
        <SettingsPage />
      </AppProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'Delete all data' }))
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }))
    await waitFor(() => {
      expect(screen.getByText(DELETE_ALL_SUCCESS_MESSAGE)).toBeInTheDocument()
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(strikeCallerKeys()).toEqual([])
  })

  it('disables the confirm button while delete is pending', async () => {
    const user = userEvent.setup()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.spyOn(userData, 'deleteAllUserData').mockImplementation(async () => {
      await gate
      return { ok: true }
    })
    render(
      <AppProvider>
        <SettingsPage />
      </AppProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'Delete all data' }))
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Delete permanently' })).toBeDisabled()
    })
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    release()
    await waitFor(() => {
      expect(screen.getByText(DELETE_ALL_SUCCESS_MESSAGE)).toBeInTheDocument()
    })
  })

  it('shows failure text and not the success state when deletion fails', async () => {
    const user = userEvent.setup()
    vi.spyOn(userData, 'deleteAllUserData').mockResolvedValue({
      ok: false,
      message: DELETE_ALL_PARTIAL_MESSAGE,
      localStorage: { ok: false, reason: 'write-failed', message: 'nope' },
      indexedDB: { ok: true },
      failed: ['localStorage'],
    })
    render(
      <AppProvider>
        <SettingsPage />
      </AppProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'Delete all data' }))
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(DELETE_ALL_PARTIAL_MESSAGE)
    })
    expect(screen.queryByText(DELETE_ALL_SUCCESS_MESSAGE)).not.toBeInTheDocument()
  })
})

describe('delete all data summary URL', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    savePreferences({ ...DEFAULT_PREFERENCES, onboardingComplete: true })
  })

  it('renders not found for a deleted session without route state', async () => {
    expect(await saveSession(session('gone-A'))).toEqual({ ok: true })
    expect((await deleteAllUserData()).ok).toBe(true)
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <AppLayout />,
          children: [{ path: 'summary/:sessionId', element: <SummaryPage /> }],
        },
      ],
      { initialEntries: ['/summary/gone-A'] },
    )
    render(
      <AppProvider>
        <RouterProvider router={router} />
      </AppProvider>,
    )
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Workout summary not found.' })).toBeInTheDocument()
    })
  })
})
