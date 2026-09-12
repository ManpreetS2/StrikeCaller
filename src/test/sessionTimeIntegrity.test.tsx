import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppProvider } from '../context/AppContext'
import { HomePage } from '../pages/HomePage'
import { DEFAULT_PREFERENCES } from '../data/defaults'
import {
  computeStatsPreview,
  computeStreaks,
  computeTrainingStats,
  filterHistory,
  unlockMilestones,
} from '../engines/statsEngine'
import { importUserData } from '../storage/userData'
import { loadHistory, saveSession } from '../storage/historyStore'
import {
  loadCustomCombos,
  loadDailyDrillMap,
  loadFavorites,
  loadPreferences,
  saveCustomCombos,
  saveDailyDrillMap,
  saveFavorites,
  savePreferences,
} from '../storage/localStore'
import { validateSessionSummary } from '../storage/sessionValidation'
import { addLocalDays, startOfLocalDay } from '../utils/localDate'
import { isTemporallyPlausibleSession, SESSION_FUTURE_SKEW_MS } from '../utils/sessionTime'
import type { SessionSummary } from '../types'

const DAY_MS = 24 * 60 * 60 * 1000
const MINUTE_MS = 60 * 1000

function session(id: string, extra: Partial<SessionSummary> = {}): SessionSummary {
  const startedAt = extra.startedAt ?? 1_700_000_000_000
  const endedAt = extra.endedAt ?? startedAt + 60_000
  return {
    id,
    martialArt: 'muay-thai',
    mode: 'coach',
    stance: 'orthodox',
    pace: 'technical',
    totalTrainingMs: 600_000,
    roundsCompleted: 2,
    combinationsCompleted: 8,
    techniquesCalled: 16,
    techniqueCounts: { jab: 8 },
    techniqueCategoryCounts: { punch: 16 },
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

function spyImportMutations() {
  const setItem = vi.spyOn(Storage.prototype, 'setItem')
  const put = vi.spyOn(IDBObjectStore.prototype, 'put')
  const clear = vi.spyOn(IDBObjectStore.prototype, 'clear')
  setItem.mockClear()
  put.mockClear()
  clear.mockClear()
  return {
    setItem,
    put,
    clear,
    restore() {
      setItem.mockRestore()
      put.mockRestore()
      clear.mockRestore()
    },
  }
}

async function seedExistingUserData() {
  savePreferences({ ...DEFAULT_PREFERENCES, stance: 'southpaw' })
  saveFavorites(['keep-fav'])
  saveCustomCombos([
    {
      id: 'keep-combo',
      title: 'Keep',
      techniqueIds: ['jab', 'cross'],
      createdAt: 1,
      updatedAt: 1,
      favorite: false,
      repeatCount: 1,
      martialArt: 'muay-thai',
    },
  ])
  saveDailyDrillMap({
    '2026-01-01:muay-thai': {
      dateKey: '2026-01-01:muay-thai',
      comboId: 'beg-01',
      martialArt: 'muay-thai',
      slowDone: false,
      normalDone: false,
      fightDone: false,
      completed: false,
    },
  })
  expect(await saveSession(session('existing', { startedAt: 1_700_000_000_000 }))).toEqual({ ok: true })
}

async function expectExistingUserDataUnchanged() {
  expect(loadPreferences().stance).toBe('southpaw')
  expect(loadFavorites()).toEqual(['keep-fav'])
  expect(loadCustomCombos().map((combo) => combo.id)).toEqual(['keep-combo'])
  expect(loadDailyDrillMap()['2026-01-01:muay-thai']?.comboId).toBe('beg-01')
  expect((await loadHistory()).map((item) => item.id)).toEqual(['existing'])
}

describe('S3 future session timestamps', () => {
  beforeEach(async () => {
    localStorage.clear()
  })

  it('rejects a strictly imported session with a future startedAt before any writes', async () => {
    await seedExistingUserData()
    const now = Date.now()
    const spies = spyImportMutations()
    try {
      const result = await importUserData(
        JSON.stringify({
          version: 3,
          history: [session('future-start', { startedAt: now + 30 * DAY_MS, endedAt: now + 30 * DAY_MS + 60_000 })],
        }),
      )
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.message).toMatch(/future/i)
      expect(spies.setItem).not.toHaveBeenCalled()
      expect(spies.put).not.toHaveBeenCalled()
      expect(spies.clear).not.toHaveBeenCalled()
      await expectExistingUserDataUnchanged()
    } finally {
      spies.restore()
    }
  })

  it('rejects a strictly imported session with a future endedAt before any writes', async () => {
    await seedExistingUserData()
    const now = Date.now()
    const spies = spyImportMutations()
    try {
      const result = await importUserData(
        JSON.stringify({
          version: 3,
          history: [session('future-end', { startedAt: now - 60_000, endedAt: now + 30 * DAY_MS })],
        }),
      )
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.message).toMatch(/future/i)
      expect(spies.setItem).not.toHaveBeenCalled()
      expect(spies.put).not.toHaveBeenCalled()
      expect(spies.clear).not.toHaveBeenCalled()
      await expectExistingUserDataUnchanged()
    } finally {
      spies.restore()
    }
  })

  it('still accepts a strictly imported historical session', async () => {
    const result = await importUserData(
      JSON.stringify({
        version: 3,
        history: [session('past', { startedAt: 1_700_000_000_000, endedAt: 1_700_000_060_000 })],
      }),
    )
    expect(result.ok).toBe(true)
    expect((await loadHistory()).map((item) => item.id)).toEqual(['past'])
  })

  it('excludes a future row from 7d aggregates and keeps weekly bars consistent', () => {
    const now = Date.parse('2026-09-09T12:00:00')
    const history = [
      session('recent', { startedAt: now - DAY_MS, endedAt: now - DAY_MS + 10 * MINUTE_MS, totalTrainingMs: 600_000 }),
      session('future', {
        startedAt: now + 30 * DAY_MS,
        endedAt: now + 30 * DAY_MS + 10 * MINUTE_MS,
        totalTrainingMs: 600_000,
      }),
    ]
    const week = filterHistory(history, { range: '7d', now })
    const stats7 = computeTrainingStats(history, { range: '7d' }, now)
    const stats30 = computeTrainingStats(history, { range: '30d' }, now)
    const preview = computeStatsPreview(history, now)
    const weeklySessionSum = stats7.weeklyMinutes.reduce((sum, day) => sum + day.sessions, 0)

    expect(week.map((row) => row.id)).toEqual(['recent'])
    expect(stats7.totalSessions).toBe(1)
    expect(stats30.totalSessions).toBe(1)
    expect(preview.sessionsThisWeek).toBe(1)
    expect(weeklySessionSum).toBe(stats7.totalSessions)
    expect(weeklySessionSum).toBe(1)
  })

  it('threads the supplied now through preview and training stats instead of Date.now()', () => {
    const suppliedNow = Date.parse('2024-01-15T12:00:00')
    const aroundSupplied = session('around-supplied', {
      startedAt: suppliedNow - 2 * DAY_MS,
      endedAt: suppliedNow - 2 * DAY_MS + 60_000,
    })
    const aroundWallClock = session('around-wall', {
      startedAt: Date.now() - DAY_MS,
      endedAt: Date.now() - DAY_MS + 60_000,
    })

    expect(filterHistory([aroundSupplied, aroundWallClock], { range: '7d', now: suppliedNow }).map((row) => row.id)).toEqual([
      'around-supplied',
    ])
    expect(computeStatsPreview([aroundSupplied, aroundWallClock], suppliedNow).sessionsThisWeek).toBe(1)
    expect(computeTrainingStats([aroundSupplied, aroundWallClock], { range: '7d' }, suppliedNow).totalSessions).toBe(1)
  })

  it('allows exact now and small clock skew, but not tomorrow or later', () => {
    const now = Date.parse('2026-03-08T12:00:00')
    const cases: Array<{ id: string; offset: number; allowed: boolean }> = [
      { id: 'exact', offset: 0, allowed: true },
      { id: 'plus-30s', offset: 30_000, allowed: true },
      { id: 'plus-4m', offset: 4 * MINUTE_MS, allowed: true },
      { id: 'plus-5m', offset: 5 * MINUTE_MS, allowed: true },
      { id: 'plus-6m', offset: 6 * MINUTE_MS, allowed: false },
      { id: 'yesterday', offset: -DAY_MS, allowed: true },
      { id: 'this-morning', offset: startOfLocalDay(now) - now, allowed: true },
      { id: 'tomorrow', offset: addLocalDays(startOfLocalDay(now), 1) - now + 12 * 60 * MINUTE_MS, allowed: false },
      { id: 'month', offset: 30 * DAY_MS, allowed: false },
      { id: 'year', offset: 365 * DAY_MS, allowed: false },
    ]

    for (const row of cases) {
      const startedAt = now + row.offset
      const summary = session(row.id, { startedAt, endedAt: startedAt })
      const included = filterHistory([summary], { range: 'all', now }).length === 1
      expect({ id: row.id, included }).toEqual({ id: row.id, included: row.allowed })
    }
    expect(SESSION_FUTURE_SKEW_MS).toBe(5 * 60 * 1000)
    expect(isTemporallyPlausibleSession({ startedAt: now, endedAt: now + 60_000 }, now)).toBe(true)
    expect(
      isTemporallyPlausibleSession(
        { startedAt: now + SESSION_FUTURE_SKEW_MS + 1, endedAt: now + SESSION_FUTURE_SKEW_MS + 60_000 },
        now,
      ),
    ).toBe(false)
  })

  it('does not let a salvaged future row unlock milestones or inflate streaks', () => {
    const now = Date.parse('2026-09-09T12:00:00')
    const past = session('past', { startedAt: now - DAY_MS, endedAt: now - DAY_MS + 60_000, roundsCompleted: 1 })
    const future = session('future', {
      startedAt: now + 40 * DAY_MS,
      endedAt: now + 40 * DAY_MS + 60_000,
      roundsCompleted: 25,
      combinationsCompleted: 500,
      totalTrainingMs: 300 * 60_000,
      martialArt: 'boxing',
    })
    const milestones = unlockMilestones([past, future], now)
    const first = milestones.find((item) => item.id === 'first-session')
    expect(first?.unlockedAt).toBe(past.endedAt)
    expect(milestones.some((item) => item.id === 'rounds-25')).toBe(false)
    expect(milestones.some((item) => item.id === 'first-boxing')).toBe(false)
    expect(computeStreaks([past, future], now).current).toBe(1)
    expect(computeStreaks([past, future], now).longest).toBe(1)
  })

  it('keeps existing local midnight and DST streak behavior', () => {
    const day0 = startOfLocalDay(Date.parse('2026-03-08T15:00:00'))
    const history = [0, 1, 2].map((offset) =>
      session(`d-${offset}`, {
        startedAt: addLocalDays(day0, -offset) + 12 * 60 * MINUTE_MS,
        endedAt: addLocalDays(day0, -offset) + 12 * 60 * MINUTE_MS + 60_000,
      }),
    )
    const now = day0 + 12 * 60 * MINUTE_MS
    expect(computeStreaks(history, now).current).toBe(3)
    expect(filterHistory(history, { range: '7d', now })).toHaveLength(3)
    expect(filterHistory(history, { range: '30d', now })).toHaveLength(3)
  })

  it('salvages a locally stored future row but hides it from Stats and Home', async () => {
    const now = Date.now()
    const future = session('stored-future', {
      startedAt: now + 60 * DAY_MS,
      endedAt: now + 60 * DAY_MS + 60_000,
    })
    expect(validateSessionSummary(future)).not.toBeNull()
    expect(await saveSession(future)).toEqual({ ok: true })
    expect((await loadHistory()).map((item) => item.id)).toEqual(['stored-future'])
    expect(computeTrainingStats(await loadHistory(), { range: 'all' }, now).totalSessions).toBe(0)

    savePreferences({ ...DEFAULT_PREFERENCES, onboardingComplete: true, customComboMigrationNoticeShown: true })
    render(
      <AppProvider>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </AppProvider>,
    )
    await waitFor(() => {
      expect(screen.getByText(/no sessions yet/i)).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /train again/i })).not.toBeInTheDocument()
  })

  it('selects a genuine past session as Home recent workout instead of a future row', async () => {
    const now = Date.now()
    expect(
      await saveSession(
        session('future-home', {
          startedAt: now + 10 * DAY_MS,
          endedAt: now + 10 * DAY_MS + 60_000,
          martialArt: 'boxing',
        }),
      ),
    ).toEqual({ ok: true })
    expect(
      await saveSession(
        session('past-home', {
          startedAt: now - DAY_MS,
          endedAt: now - DAY_MS + 60_000,
          martialArt: 'muay-thai',
          mode: 'round',
        }),
      ),
    ).toEqual({ ok: true })

    savePreferences({ ...DEFAULT_PREFERENCES, onboardingComplete: true, customComboMigrationNoticeShown: true })
    render(
      <AppProvider>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </AppProvider>,
    )
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /train again/i })).toBeInTheDocument()
    })
    const recent = screen.getByText(/last session/i)
    expect(recent).toHaveTextContent(/muay thai/i)
    expect(recent).not.toHaveTextContent(/boxing/i)
  })

  it('survives 20 deterministic future-filter cycles', () => {
    for (let i = 0; i < 20; i += 1) {
      const now = Date.parse('2026-01-01T12:00:00') + i * DAY_MS
      const history = [
        session(`ok-${i}`, { startedAt: now - DAY_MS, endedAt: now - DAY_MS + 60_000 }),
        session(`future-${i}`, { startedAt: now + 14 * DAY_MS, endedAt: now + 14 * DAY_MS + 60_000 }),
      ]
      expect(filterHistory(history, { range: '7d', now })).toHaveLength(1)
      expect(computeTrainingStats(history, { range: '7d' }, now).totalSessions).toBe(1)
      expect(computeStatsPreview(history, now).sessionsThisWeek).toBe(1)
      expect(unlockMilestones(history, now).every((item) => item.unlockedAt <= now + 5 * MINUTE_MS)).toBe(true)
    }
  })
})
