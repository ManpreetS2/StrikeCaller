import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AppProvider, useApp } from '../context/AppContext'
import { AppLayout } from '../components/AppLayout'
import { SettingsPage } from '../pages/SettingsPage'
import { DEFAULT_PREFERENCES } from '../data/defaults'
import {
  saveHistory,
  loadHistory,
  savePreferences,
  loadPreferences,
  saveFavorites,
  loadFavorites,
  saveCustomCombos,
  loadCustomCombos,
  importUserData,
  exportUserData,
  storageAvailable,
  resetStorageAvailabilityCache,
  STORAGE_WRITE_MESSAGES,
  HISTORY_QUOTA_MESSAGE,
} from '../storage/localStore'
import type { CustomCombo, SessionSummary } from '../types'

function session(id: string, extra: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id,
    startedAt: 1_700_000_000_000,
    endedAt: 1_700_000_060_000,
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
  }
}

function customCombo(id = 'custom-1'): CustomCombo {
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

function quotaError(): DOMException {
  return new DOMException('The quota has been exceeded.', 'QuotaExceededError')
}

function spySetItem(
  impl: (key: string, value: string, original: (key: string, value: string) => void) => void,
) {
  const original = Storage.prototype.setItem
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
    this: Storage,
    key: string,
    value: string,
  ) {
    impl(key, value, (k, v) => original.call(this, k, v))
  })
  return spy
}

function PersistenceHarness() {
  const {
    addHistory,
    updatePreferences,
    toggleFavorite,
    upsertCustomCombo,
    history,
    preferences,
    favorites,
    customCombos,
    storageIssue,
    storageWarningVisible,
    dismissStorageIssue,
  } = useApp()

  return (
    <div>
      <button type="button" onClick={() => addHistory(session('new-session'))}>
        complete-workout
      </button>
      <button type="button" onClick={() => addHistory(session('second-session'))}>
        add-second-workout
      </button>
      <button type="button" onClick={() => updatePreferences({ largeText: true })}>
        change-pref
      </button>
      <button type="button" onClick={() => updatePreferences({ theme: 'light' })}>
        set-theme
      </button>
      <button type="button" onClick={() => toggleFavorite('beg-01')}>
        toggle-favorite
      </button>
      <button type="button" onClick={() => upsertCustomCombo(customCombo())}>
        save-combo
      </button>
      <button type="button" onClick={dismissStorageIssue}>
        dismiss-warning
      </button>
      <span data-testid="history-count">{history.length}</span>
      <span data-testid="history-ids">{history.map((h) => h.id).join(',')}</span>
      <span data-testid="large-text">{String(preferences.largeText)}</span>
      <span data-testid="favorites">{favorites.join(',')}</span>
      <span data-testid="combo-count">{customCombos.length}</span>
      <span data-testid="issue-reason">{storageIssue?.reason ?? 'none'}</span>
      <span data-testid="issue-source">{storageIssue?.source ?? 'none'}</span>
      <span data-testid="warning-visible">{storageWarningVisible ? 'yes' : 'no'}</span>
    </div>
  )
}

function renderPersistenceApp(path = '/') {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AppLayout />,
        children: [
          { index: true, element: <PersistenceHarness /> },
          { path: 'session', element: <div>Active session</div> },
          { path: 'settings', element: <SettingsPage /> },
          { path: 'summary', element: <PersistenceHarness /> },
        ],
      },
    ],
    { initialEntries: [path] },
  )
  return {
    router,
    ...render(
      <AppProvider>
        <RouterProvider router={router} />
      </AppProvider>,
    ),
  }
}

describe('storage write results', () => {
  beforeEach(() => {
    localStorage.clear()
    resetStorageAvailabilityCache()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    resetStorageAvailabilityCache()
  })

  it('reports success for a normal write', () => {
    const result = saveHistory([session('ok-1')])
    expect(result).toEqual({ ok: true })
    expect(loadHistory().map((h) => h.id)).toEqual(['ok-1'])
  })

  it('classifies blocked storage as unavailable', () => {
    spySetItem(() => {
      throw new DOMException('Access denied', 'SecurityError')
    })
    const result = savePreferences(DEFAULT_PREFERENCES)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('unavailable')
    expect(result.message).toBe(STORAGE_WRITE_MESSAGES.unavailable)
    expect(result.message).not.toMatch(/SecurityError|Access denied/i)
    expect(storageAvailable()).toBe(false)
  })

  it('classifies a simulated QuotaExceededError as quota-exceeded', () => {
    spySetItem((key, value, original) => {
      if (key === 'strikecaller:history') throw quotaError()
      original(key, value)
    })
    const result = saveHistory([session('quota-1')])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('quota-exceeded')
    expect(result.message).toBe(STORAGE_WRITE_MESSAGES['quota-exceeded'])
    expect(result.message).not.toMatch(/QuotaExceededError/i)
  })

  it('classifies NS_ERROR_DOM_QUOTA_REACHED as quota-exceeded', () => {
    spySetItem((key, value, original) => {
      if (key === 'strikecaller:history') {
        const error = new Error('quota')
        Object.assign(error, { name: 'NS_ERROR_DOM_QUOTA_REACHED', code: 1014 })
        throw error
      }
      original(key, value)
    })
    const result = saveHistory([session('quota-ff')])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('quota-exceeded')
  })

  it('classifies a generic setItem exception as write-failed without exposing the raw message', () => {
    spySetItem((key, value, original) => {
      if (key === 'strikecaller:favorites') throw new Error('disk exploded 0xdead')
      original(key, value)
    })
    const result = saveFavorites(['beg-01'])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('write-failed')
    expect(result.message).toBe(STORAGE_WRITE_MESSAGES['write-failed'])
    expect(result.message).not.toContain('disk exploded')
    expect(result.message).not.toContain('0xdead')
  })

  it('classifies cyclic JSON as a serialization failure', () => {
    const cyclic = session('cyclic') as SessionSummary & { self?: SessionSummary }
    cyclic.self = cyclic
    const result = saveHistory([cyclic])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('serialization')
    expect(result.message).toBe(STORAGE_WRITE_MESSAGES.serialization)
  })

  it('treats a quota failure on the availability probe as storage that still exists', () => {
    spySetItem((key, value, original) => {
      if (key === '__sc_test__') throw quotaError()
      original(key, value)
    })
    expect(storageAvailable()).toBe(true)
    expect(saveFavorites(['beg-01'])).toEqual({ ok: true })
  })

  it('does not re-probe after a successful availability check', () => {
    expect(storageAvailable()).toBe(true)
    const spy = spySetItem((key, value, original) => original(key, value))
    expect(storageAvailable()).toBe(true)
    expect(spy.mock.calls.some(([key]) => key === '__sc_test__')).toBe(false)
  })

  it('still classifies quota from the actual setItem even if availability was previously cached as false', () => {
    spySetItem(() => {
      throw new DOMException('Access denied', 'SecurityError')
    })
    expect(storageAvailable()).toBe(false)
    vi.restoreAllMocks()
    spySetItem((key, value, original) => {
      if (key === 'strikecaller:history') throw quotaError()
      original(key, value)
    })
    const result = saveHistory([session('after-unavailable')])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('quota-exceeded')
  })

  it('recovers after a previous unavailable probe when a later write succeeds', () => {
    spySetItem(() => {
      throw new DOMException('Access denied', 'SecurityError')
    })
    expect(saveFavorites(['blocked'])).toEqual({
      ok: false,
      reason: 'unavailable',
      message: STORAGE_WRITE_MESSAGES.unavailable,
    })
    expect(storageAvailable()).toBe(false)
    vi.restoreAllMocks()
    expect(saveFavorites(['beg-01'])).toEqual({ ok: true })
    expect(loadFavorites()).toEqual(['beg-01'])
    expect(storageAvailable()).toBe(true)
  })
})

describe('history load, export, import, and related stores', () => {
  beforeEach(() => {
    localStorage.clear()
    resetStorageAvailabilityCache()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    resetStorageAvailabilityCache()
  })

  it('loads existing history from the stable storage key', () => {
    localStorage.setItem('strikecaller:history', JSON.stringify([session('legacy-1')]))
    expect(loadHistory()).toHaveLength(1)
    expect(loadHistory()[0]?.id).toBe('legacy-1')
  })

  it('keeps successful preferences, favorites, and custom combo writes working', () => {
    expect(savePreferences({ ...DEFAULT_PREFERENCES, stance: 'southpaw' })).toEqual({ ok: true })
    expect(loadPreferences().stance).toBe('southpaw')
    expect(saveFavorites(['beg-01', 'beg-02'])).toEqual({ ok: true })
    expect(loadFavorites()).toEqual(['beg-01', 'beg-02'])
    expect(saveCustomCombos([customCombo()])).toEqual({ ok: true })
    expect(loadCustomCombos()).toHaveLength(1)
    expect(loadCustomCombos()[0]?.id).toBe('custom-1')
  })

  it('round-trips export and import without changing storage key names', () => {
    savePreferences({ ...DEFAULT_PREFERENCES, onboardingComplete: true, stance: 'southpaw' })
    saveFavorites(['beg-01'])
    saveCustomCombos([customCombo()])
    saveHistory([session('export-1')])
    const json = exportUserData()
    localStorage.clear()
    const result = importUserData(json)
    expect(result.ok).toBe(true)
    expect(loadPreferences().stance).toBe('southpaw')
    expect(loadFavorites()).toEqual(['beg-01'])
    expect(loadCustomCombos()[0]?.id).toBe('custom-1')
    expect(loadHistory()[0]?.id).toBe('export-1')
    expect(localStorage.getItem('strikecaller:preferences')).toBeTruthy()
    expect(localStorage.getItem('strikecaller:favorites')).toBeTruthy()
    expect(localStorage.getItem('strikecaller:custom-combos')).toBeTruthy()
    expect(localStorage.getItem('strikecaller:history')).toBeTruthy()
  })

  it('rolls back exact previous raw values when a middle import write fails', () => {
    const rawPrefs =
      '{"theme":"dark","stance":"southpaw","extraLegacyField":true,"onboardingComplete":true}'
    const rawFavorites = '["old-fav"]'
    const rawCombos = '[{"id":"keep-me","title":"Keep","techniqueIds":["jab"],"createdAt":1,"updatedAt":1,"favorite":false,"repeatCount":1,"legacyNote":"preserve"}]'
    const rawHistory = JSON.stringify([session('kept-session')])
    const rawDaily = '{"2026-01-01:muay-thai":{"dateKey":"2026-01-01:muay-thai","comboId":"beg-01","legacy":1}}'
    localStorage.setItem('strikecaller:preferences', rawPrefs)
    localStorage.setItem('strikecaller:favorites', rawFavorites)
    localStorage.setItem('strikecaller:custom-combos', rawCombos)
    localStorage.setItem('strikecaller:history', rawHistory)
    localStorage.setItem('strikecaller:daily-drill', rawDaily)

    spySetItem((key, value, original) => {
      if (key === 'strikecaller:custom-combos' && value.includes('imported-combo')) throw quotaError()
      original(key, value)
    })

    const result = importUserData(
      JSON.stringify({
        version: 3,
        preferences: { ...DEFAULT_PREFERENCES, stance: 'orthodox', onboardingComplete: true },
        favorites: ['new-fav'],
        customCombos: [customCombo('imported-combo')],
        history: [session('imported-should-not-stick')],
        dailyDrills: {},
      }),
    )
    expect(result.ok).toBe(false)
    expect(result.message).toBe('Import could not be saved. Existing data was left unchanged.')
    expect(localStorage.getItem('strikecaller:preferences')).toBe(rawPrefs)
    expect(localStorage.getItem('strikecaller:favorites')).toBe(rawFavorites)
    expect(localStorage.getItem('strikecaller:custom-combos')).toBe(rawCombos)
    expect(localStorage.getItem('strikecaller:history')).toBe(rawHistory)
    expect(localStorage.getItem('strikecaller:daily-drill')).toBe(rawDaily)
  })

  it('does not claim rollback succeeded when restoring previous values also fails', () => {
    savePreferences({ ...DEFAULT_PREFERENCES, stance: 'southpaw' })
    saveFavorites(['old-fav'])
    let importFailed = false
    spySetItem((key, value, original) => {
      if (key === 'strikecaller:custom-combos') {
        importFailed = true
        throw quotaError()
      }
      if (importFailed) throw new Error('rollback blocked')
      original(key, value)
    })
    const result = importUserData(
      JSON.stringify({
        version: 3,
        preferences: { ...DEFAULT_PREFERENCES, stance: 'orthodox' },
        favorites: ['new-fav'],
        customCombos: [customCombo('imported-combo')],
        history: [session('imported-history')],
      }),
    )
    expect(result.ok).toBe(false)
    expect(result.message).toBe(
      'Import could not be saved. StrikeCaller could not restore all previous data.',
    )
    expect(result.message).not.toMatch(/left unchanged/i)
  })
})

describe('AppContext persistence health and visible warning', () => {
  beforeEach(() => {
    localStorage.clear()
    resetStorageAvailabilityCache()
    localStorage.setItem(
      'strikecaller:preferences',
      JSON.stringify({ ...DEFAULT_PREFERENCES, onboardingComplete: true }),
    )
    localStorage.setItem('strikecaller:history', JSON.stringify([session('existing-session')]))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    resetStorageAvailabilityCache()
  })

  it('surfaces a storage issue after a completed workout fails to persist, without crashing', async () => {
    const user = userEvent.setup()
    spySetItem((key, value, original) => {
      if (key === 'strikecaller:history' && value.includes('new-session')) throw quotaError()
      original(key, value)
    })
    renderPersistenceApp('/')

    expect(screen.getByTestId('history-count')).toHaveTextContent('1')
    expect(screen.getByTestId('history-ids')).toHaveTextContent('existing-session')

    await user.click(screen.getByRole('button', { name: 'complete-workout' }))

    await waitFor(() => {
      expect(screen.getByTestId('issue-reason')).toHaveTextContent('quota-exceeded')
    })
    expect(screen.getByTestId('history-count')).toHaveTextContent('2')
    expect(screen.getByTestId('history-ids').textContent).toContain('new-session')
    expect(loadHistory().map((h) => h.id)).toEqual(['existing-session'])

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(HISTORY_QUOTA_MESSAGE)
    expect(within(alert).getByRole('link', { name: /open settings/i })).toHaveAttribute('href', '/settings')
    expect(screen.getByTestId('warning-visible')).toHaveTextContent('yes')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('does not clear a failed-history warning when an unrelated preference write succeeds', async () => {
    const user = userEvent.setup()
    let blockNewHistory = true
    spySetItem((key, value, original) => {
      if (blockNewHistory && key === 'strikecaller:history' && value.includes('new-session')) {
        throw quotaError()
      }
      original(key, value)
    })
    renderPersistenceApp('/')

    await user.click(screen.getByRole('button', { name: 'complete-workout' }))
    await waitFor(() => expect(screen.getByTestId('issue-source')).toHaveTextContent('history'))
    expect(screen.getByRole('alert')).toHaveTextContent(HISTORY_QUOTA_MESSAGE)
    expect(screen.getByTestId('history-ids').textContent).toContain('new-session')
    expect(loadHistory().map((h) => h.id)).toEqual(['existing-session'])

    await user.click(screen.getByRole('button', { name: 'set-theme' }))
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('strikecaller:preferences') ?? '{}').theme).toBe('light')
    })
    expect(screen.getByTestId('issue-source')).toHaveTextContent('history')
    expect(screen.getByTestId('issue-reason')).toHaveTextContent('quota-exceeded')
    expect(screen.getByRole('alert')).toHaveTextContent(HISTORY_QUOTA_MESSAGE)
    expect(screen.getByTestId('history-ids').textContent).toContain('new-session')
    expect(loadHistory().map((h) => h.id)).toEqual(['existing-session'])

    blockNewHistory = false
    await user.click(screen.getByRole('button', { name: 'add-second-workout' }))
    await waitFor(() => expect(screen.getByTestId('issue-reason')).toHaveTextContent('none'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(loadHistory().map((h) => h.id)).toEqual(['second-session', 'new-session', 'existing-session'])
  })

  it('hides the warning on dismiss and shows it again after a later new failure', async () => {
    const user = userEvent.setup()
    spySetItem((key, value, original) => {
      if (key === 'strikecaller:history' && value.includes('new-session')) throw quotaError()
      if (key === 'strikecaller:preferences' && value.includes('"largeText":true')) {
        throw new Error('write exploded')
      }
      original(key, value)
    })
    renderPersistenceApp('/')

    await user.click(screen.getByRole('button', { name: 'complete-workout' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /dismiss storage warning/i }))
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
    expect(screen.getByTestId('issue-reason')).toHaveTextContent('quota-exceeded')

    await user.click(screen.getByRole('button', { name: 'change-pref' }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByTestId('issue-reason')).toHaveTextContent('write-failed')
    expect(screen.getByTestId('large-text')).toHaveTextContent('true')
    expect(JSON.parse(localStorage.getItem('strikecaller:preferences') ?? '{}').largeText).not.toBe(true)
  })

  it('does not show the persistence banner during an active /session route', async () => {
    const user = userEvent.setup()
    spySetItem((key, value, original) => {
      if (key === 'strikecaller:history' && value.includes('new-session')) throw quotaError()
      original(key, value)
    })
    const { router } = renderPersistenceApp('/')
    await user.click(screen.getByRole('button', { name: 'complete-workout' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())

    await act(async () => {
      await router.navigate('/session')
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Active session')).toBeInTheDocument()

    await act(async () => {
      await router.navigate('/summary')
    })
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('keeps the UI usable when a preference write fails and does not corrupt stored prefs', async () => {
    const user = userEvent.setup()
    spySetItem((key, value, original) => {
      if (key === 'strikecaller:preferences' && value.includes('"largeText":true')) {
        throw new Error('nope')
      }
      original(key, value)
    })
    renderPersistenceApp('/')

    await user.click(screen.getByRole('button', { name: 'change-pref' }))
    await waitFor(() => expect(screen.getByTestId('issue-reason')).toHaveTextContent('write-failed'))
    expect(screen.getByTestId('large-text')).toHaveTextContent('true')
    expect(screen.getByRole('alert')).toHaveTextContent(STORAGE_WRITE_MESSAGES['write-failed'])
    expect(loadPreferences().largeText).toBe(false)
  })

  it('still updates in-memory favorites and custom combos when persistence fails', async () => {
    const user = userEvent.setup()
    spySetItem((key, value, original) => {
      if (key === 'strikecaller:favorites' || key === 'strikecaller:custom-combos') {
        throw new Error('blocked write')
      }
      original(key, value)
    })
    renderPersistenceApp('/')
    await user.click(screen.getByRole('button', { name: 'toggle-favorite' }))
    await waitFor(() => expect(screen.getByTestId('favorites')).toHaveTextContent('beg-01'))
    expect(loadFavorites()).toEqual([])

    await user.click(screen.getByRole('button', { name: 'save-combo' }))
    await waitFor(() => expect(screen.getByTestId('combo-count')).toHaveTextContent('1'))
    expect(loadCustomCombos()).toEqual([])
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('shows storage status in Settings and recovery copy for quota failures', async () => {
    const user = userEvent.setup()
    spySetItem((key, value, original) => {
      if (key === 'strikecaller:history' && value.includes('new-session')) throw quotaError()
      original(key, value)
    })
    const { router } = renderPersistenceApp('/')
    expect(screen.queryByText('Storage: Available')).not.toBeInTheDocument()

    await act(async () => {
      await router.navigate('/settings')
    })
    expect(screen.getByText('Storage: Available')).toBeInTheDocument()

    await act(async () => {
      await router.navigate('/')
    })
    await user.click(screen.getByRole('button', { name: 'complete-workout' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())

    await act(async () => {
      await router.navigate('/settings')
    })
    expect(screen.getByText('Storage issue: Browser storage is full.')).toBeInTheDocument()
    expect(
      screen.getByText(/Export JSON or clear workout history to free space/i),
    ).toBeInTheDocument()
  })

  it('does not show a warning when persistence succeeds', async () => {
    const user = userEvent.setup()
    renderPersistenceApp('/')
    await user.click(screen.getByRole('button', { name: 'complete-workout' }))
    await waitFor(() => expect(screen.getByTestId('history-count')).toHaveTextContent('2'))
    expect(screen.getByTestId('issue-reason')).toHaveTextContent('none')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(loadHistory().map((h) => h.id)).toEqual(['new-session', 'existing-session'])
  })
})
