import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IDBFactory } from 'fake-indexeddb'
import { AppProvider } from '../context/AppContext'
import { useApp } from '../context/useApp'
import { DEFAULT_PREFERENCES } from '../data/defaults'
import {
  loadCustomCombos,
  loadDailyDrillMap,
  loadFavorites,
  loadPreferences,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_CUSTOM_COMBOS,
  MAX_IMPORT_HISTORY,
  saveCustomCombos,
  saveDailyDrillMap,
  saveFavorites,
  savePreferences,
} from '../storage/localStore'
import { exportUserData, importUserData } from '../storage/userData'
import { loadHistory, saveSession, resetHistoryDbConnection } from '../storage/historyStore'
import { HISTORY_QUOTA_MESSAGE } from '../storage/storageTypes'
import { isTemporallyPlausibleSession } from '../utils/sessionTime'
import type { CustomCombo, DailyDrillMap, SessionSummary } from '../types'

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

function customCombo(id = 'custom-1', extra: Partial<CustomCombo> = {}): CustomCombo {
  return {
    id,
    title: 'Jab cross',
    techniqueIds: ['jab', 'cross'],
    createdAt: 1,
    updatedAt: 1,
    favorite: false,
    repeatCount: 1,
    martialArt: 'muay-thai',
    ...extra,
  }
}

function quotaError(): DOMException {
  return new DOMException('The quota has been exceeded.', 'QuotaExceededError')
}

function sessionIdOf(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || !('id' in value)) return null
  return typeof value.id === 'string' ? value.id : null
}

function spyIdbPut(impl: (value: unknown, original: (value: unknown) => IDBRequest) => IDBRequest) {
  const original = IDBObjectStore.prototype.put
  return vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    value: unknown,
    key?: IDBValidKey,
  ) {
    return impl(value, (v) => original.call(this, v, key))
  })
}

function spySetItem(
  impl: (key: string, value: string, original: (key: string, value: string) => void) => void,
) {
  const original = Storage.prototype.setItem
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
    this: Storage,
    key: string,
    value: string,
  ) {
    impl(key, value, (k, v) => original.call(this, k, v))
  })
}

function ExportHarness() {
  const {
    addHistory,
    history,
    historyReady,
    customCombos,
    preferences,
    favorites,
    dailyDrills,
    exportData,
    importData,
    upsertCustomCombo,
    updatePreferences,
    toggleFavorite,
    setDailyDrill,
    storageIssue,
  } = useApp()
  return (
    <div>
      <button type="button" onClick={() => void addHistory(session('new-session'))}>
        complete-workout
      </button>
      <button type="button" onClick={() => upsertCustomCombo(customCombo('visible-combo'))}>
        save-combo
      </button>
      <button type="button" onClick={() => updatePreferences({ largeText: true })}>
        change-pref
      </button>
      <button type="button" onClick={() => toggleFavorite('beg-01')}>
        toggle-favorite
      </button>
      <button
        type="button"
        onClick={() =>
          setDailyDrill({
            dateKey: '2026-09-11:muay-thai',
            comboId: 'beg-01',
            martialArt: 'muay-thai',
            slowDone: true,
            normalDone: false,
            fightDone: false,
            completed: false,
          })
        }
      >
        save-daily
      </button>
      <button
        type="button"
        onClick={() => {
          void exportData().then((json) => {
            document.querySelector('[data-testid="export-payload"]')!.textContent = json
          })
        }}
      >
        export-now
      </button>
      <button
        type="button"
        onClick={() => {
          const json = document.querySelector('[data-testid="export-payload"]')!.textContent ?? ''
          void importData(json).then((result) => {
            document.querySelector('[data-testid="import-message"]')!.textContent = result.message
          })
        }}
      >
        import-exported
      </button>
      <span data-testid="history-ids">{history.map((item) => item.id).join(',')}</span>
      <span data-testid="history-ready">{historyReady ? 'yes' : 'no'}</span>
      <span data-testid="combo-ids">{customCombos.map((item) => item.id).join(',')}</span>
      <span data-testid="large-text">{String(preferences.largeText)}</span>
      <span data-testid="favorites">{favorites.join(',')}</span>
      <span data-testid="drill-ids">{Object.keys(dailyDrills).sort().join(',')}</span>
      <span data-testid="issue-reason">{storageIssue?.reason ?? 'none'}</span>
      <span data-testid="issue-message">{storageIssue?.message ?? 'none'}</span>
      <pre data-testid="export-payload" />
      <span data-testid="import-message">none</span>
    </div>
  )
}

function renderExportApp() {
  return render(
    <AppProvider>
      <ExportHarness />
    </AppProvider>,
  )
}

async function waitReady() {
  await waitFor(() => expect(screen.getByTestId('history-ready')).toHaveTextContent('yes'))
}

function parseExport() {
  return JSON.parse(screen.getByTestId('export-payload').textContent ?? '{}') as {
    history: SessionSummary[]
    customCombos: CustomCombo[]
    preferences: { largeText?: boolean; stance?: string }
    favorites: string[]
    dailyDrills: DailyDrillMap
  }
}

describe('L3 recovery-safe generated backups', () => {
  beforeEach(() => {
    localStorage.clear()
    savePreferences({ ...DEFAULT_PREFERENCES, onboardingComplete: true, customComboMigrationNoticeShown: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('current export omits a visible workout whose IndexedDB write failed', async () => {
    const user = userEvent.setup()
    expect(await saveSession(session('old-session'))).toEqual({ ok: true })
    spyIdbPut((value, original) => {
      if (sessionIdOf(value) === 'new-session') throw quotaError()
      return original(value)
    })
    renderExportApp()
    await waitReady()
    await user.click(screen.getByRole('button', { name: 'complete-workout' }))
    await waitFor(() => expect(screen.getByTestId('history-ids').textContent).toContain('new-session'))
    expect((await loadHistory()).map((item) => item.id)).toEqual(['old-session'])
    expect(screen.getByTestId('issue-message')).toHaveTextContent(HISTORY_QUOTA_MESSAGE)

    await user.click(screen.getByRole('button', { name: 'export-now' }))
    await waitFor(() => expect(screen.getByTestId('export-payload').textContent).toContain('old-session'))
    const parsed = parseExport()
    expect(parsed.history.map((item) => item.id)).toEqual(expect.arrayContaining(['new-session', 'old-session']))
    expect(parsed.history).toHaveLength(2)
  })

  it('includes a visible custom combo whose localStorage write failed', async () => {
    const user = userEvent.setup()
    spySetItem((key, value, original) => {
      if (key === 'strikecaller:custom-combos') throw quotaError()
      original(key, value)
    })
    renderExportApp()
    await waitReady()
    await user.click(screen.getByRole('button', { name: 'save-combo' }))
    await waitFor(() => expect(screen.getByTestId('combo-ids')).toHaveTextContent('visible-combo'))
    expect(loadCustomCombos()).toEqual([])

    await user.click(screen.getByRole('button', { name: 'export-now' }))
    await waitFor(() => expect(screen.getByTestId('export-payload').textContent).toContain('visible-combo'))
    expect(parseExport().customCombos.map((item) => item.id)).toEqual(['visible-combo'])
  })

  it('includes a visible preference change whose localStorage write failed', async () => {
    const user = userEvent.setup()
    spySetItem((key, value, original) => {
      if (key === 'strikecaller:preferences' && value.includes('"largeText":true')) throw quotaError()
      original(key, value)
    })
    renderExportApp()
    await waitReady()
    await user.click(screen.getByRole('button', { name: 'change-pref' }))
    await waitFor(() => expect(screen.getByTestId('large-text')).toHaveTextContent('true'))
    expect(loadPreferences().largeText).toBe(false)

    await user.click(screen.getByRole('button', { name: 'export-now' }))
    await waitFor(() => expect(screen.getByTestId('export-payload').textContent).toContain('"largeText": true'))
    expect(parseExport().preferences.largeText).toBe(true)
  })

  it('storage-level export omits salvaged future rows so the generated backup imports', async () => {
    const now = Date.now()
    expect(await saveSession(session('past', { startedAt: now - 60_000, endedAt: now - 1_000 }))).toEqual({ ok: true })
    expect(
      await saveSession(
        session('future', { startedAt: now + 30 * 24 * 60 * 60 * 1000, endedAt: now + 30 * 24 * 60 * 60 * 1000 + 60_000 }),
      ),
    ).toEqual({ ok: true })
    const json = await exportUserData()
    const parsed = JSON.parse(json) as { history: SessionSummary[] }
    expect(parsed.history.map((item) => item.id)).toEqual(['past'])
    localStorage.clear()
    const result = await importUserData(json)
    expect(result.ok).toBe(true)
    expect((await loadHistory()).map((item) => item.id)).toEqual(['past'])
  })
})

describe('L3 canonical export contracts after recovery-safe export', () => {
  beforeEach(() => {
    localStorage.clear()
    savePreferences({
      ...DEFAULT_PREFERENCES,
      onboardingComplete: true,
      stance: 'southpaw',
      customComboMigrationNoticeShown: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('roundtrips ordinary valid state through AppContext export and strict import', async () => {
    const user = userEvent.setup()
    expect(await saveSession(session('keep-me'))).toEqual({ ok: true })
    saveFavorites(['beg-01'])
    saveCustomCombos([customCombo('keep-combo')])
    saveDailyDrillMap({
      '2026-01-01:muay-thai': {
        dateKey: '2026-01-01:muay-thai',
        comboId: 'beg-01',
        martialArt: 'muay-thai',
        slowDone: true,
        normalDone: false,
        fightDone: false,
        completed: false,
      },
    })
    renderExportApp()
    await waitReady()
    await user.click(screen.getByRole('button', { name: 'export-now' }))
    await waitFor(() => expect(screen.getByTestId('export-payload').textContent).toContain('keep-me'))
    const json = screen.getByTestId('export-payload').textContent ?? ''
    localStorage.clear()
    const result = await importUserData(json)
    expect(result.ok).toBe(true)
    expect((await loadHistory()).map((item) => item.id)).toEqual(['keep-me'])
    expect(loadFavorites()).toEqual(['beg-01'])
    expect(loadCustomCombos().map((item) => item.id)).toEqual(['keep-combo'])
    expect(loadDailyDrillMap()['2026-01-01:muay-thai']?.slowDone).toBe(true)
    expect(loadPreferences().stance).toBe('southpaw')
  })

  it('omits a salvaged future row from canonical export so the backup imports', async () => {
    const user = userEvent.setup()
    const now = Date.now()
    expect(await saveSession(session('past', { startedAt: now - 120_000, endedAt: now - 60_000 }))).toEqual({ ok: true })
    expect(
      await saveSession(
        session('future', {
          startedAt: now + 14 * 24 * 60 * 60 * 1000,
          endedAt: now + 14 * 24 * 60 * 60 * 1000 + 60_000,
        }),
      ),
    ).toEqual({ ok: true })
    renderExportApp()
    await waitReady()
    expect(screen.getByTestId('history-ids').textContent).toContain('future')
    await user.click(screen.getByRole('button', { name: 'export-now' }))
    await waitFor(() => expect(screen.getByTestId('export-payload').textContent).toContain('past'))
    const parsed = parseExport()
    expect(parsed.history.map((item) => item.id)).toEqual(['past'])
    expect(parsed.history.every((item) => isTemporallyPlausibleSession(item))).toBe(true)
    localStorage.clear()
    const result = await importUserData(screen.getByTestId('export-payload').textContent ?? '')
    expect(result.ok).toBe(true)
    expect((await loadHistory()).map((item) => item.id)).toEqual(['past'])
  })

  it('preserves cancelled persistable sessions and does not introduce duplicate IDs', async () => {
    const user = userEvent.setup()
    expect(await saveSession(session('done'))).toEqual({ ok: true })
    expect(await saveSession(session('stopped', { cancelled: true, combinationsCompleted: 1 }))).toEqual({ ok: true })
    renderExportApp()
    await waitReady()
    await user.click(screen.getByRole('button', { name: 'export-now' }))
    await waitFor(() => expect(screen.getByTestId('export-payload').textContent).toContain('stopped'))
    const parsed = parseExport()
    expect(parsed.history.map((item) => item.id).sort()).toEqual(['done', 'stopped'])
    expect(new Set(parsed.history.map((item) => item.id)).size).toBe(parsed.history.length)
    localStorage.clear()
    expect((await importUserData(screen.getByTestId('export-payload').textContent ?? '')).ok).toBe(true)
    expect((await loadHistory()).some((item) => item.id === 'stopped' && item.cancelled)).toBe(true)
  })

  it('stresses failed-write export recovery and strict import 20 times', async () => {
    const user = userEvent.setup()
    let blockNew = true
    spyIdbPut((value, original) => {
      if (blockNew && sessionIdOf(value) === 'new-session') throw quotaError()
      return original(value)
    })
    for (let i = 0; i < 20; i++) {
      localStorage.clear()
      resetHistoryDbConnection()
      Object.defineProperty(globalThis, 'indexedDB', {
        value: new IDBFactory(),
        configurable: true,
        writable: true,
      })
      savePreferences({ ...DEFAULT_PREFERENCES, onboardingComplete: true, customComboMigrationNoticeShown: true })
      expect(await saveSession(session(`old-${i}`))).toEqual({ ok: true })
      const view = renderExportApp()
      await waitReady()
      await user.click(screen.getByRole('button', { name: 'complete-workout' }))
      await waitFor(() => expect(screen.getByTestId('history-ids').textContent).toContain('new-session'))
      await user.click(screen.getByRole('button', { name: 'export-now' }))
      await waitFor(() => expect(screen.getByTestId('export-payload').textContent).toContain('new-session'))
      const json = screen.getByTestId('export-payload').textContent ?? ''
      expect(JSON.parse(json).history.map((item: SessionSummary) => item.id).sort()).toEqual(
        ['new-session', `old-${i}`].sort(),
      )
      view.unmount()
      localStorage.clear()
      blockNew = false
      expect((await importUserData(json)).ok).toBe(true)
      expect((await loadHistory()).map((item) => item.id).sort()).toEqual(['new-session', `old-${i}`].sort())
      blockNew = true
    }
  })
})

describe('L3 export size self-compatibility audit', () => {
  it('records whether max permitted app state can exceed MAX_IMPORT_BYTES', () => {
    const sample = JSON.stringify(session('size-probe'), null, 2)
    const comboSample = JSON.stringify(customCombo('size-combo'), null, 2)
    const envelope = 400
    const estimatedMax =
      envelope + MAX_IMPORT_HISTORY * sample.length + MAX_IMPORT_CUSTOM_COMBOS * comboSample.length
    const sessionsThatFit = Math.floor((MAX_IMPORT_BYTES - envelope) / sample.length)
    expect(sample.length).toBeGreaterThan(200)
    expect(MAX_IMPORT_BYTES).toBe(2 * 1024 * 1024)
    expect(sessionsThatFit).toBeGreaterThan(500)
    if (estimatedMax > MAX_IMPORT_BYTES) {
      expect(sessionsThatFit).toBeLessThan(MAX_IMPORT_HISTORY)
    }
  })
})
