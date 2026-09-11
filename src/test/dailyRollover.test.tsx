import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AppProvider } from '../context/AppContext'
import { appRoutes } from '../routes'
import { DEFAULT_PREFERENCES, DEFAULT_SPEECH } from '../data/defaults'
import { getCombo } from '../data/combos'
import * as primeAudio from '../utils/primeAudio'
import { dailyDrillKey, emptyDailyDrill, pickDailyComboId } from '../utils/dailyDrill'
import { addLocalDays, localDateKey, msUntilNextLocalMidnight, startOfLocalDay } from '../utils/localDate'
import type { DailyDrillMap, DailyDrillState, MartialArt, WorkoutConfig } from '../types'

function seedCompletedOnboarding(martialArt: MartialArt = 'boxing') {
  localStorage.setItem(
    'strikecaller:preferences',
    JSON.stringify({
      ...DEFAULT_PREFERENCES,
      martialArt,
      onboardingComplete: true,
      wakeLock: false,
      preferMinimalMode: false,
      wakeLockNoticeDismissed: true,
      speech: {
        ...DEFAULT_SPEECH,
        volume: 0,
        countdownEnabled: false,
        roundCallsEnabled: false,
        coachingCuesEnabled: false,
        spokenCallsEnabled: false,
        captionsEnabled: true,
      },
      sound: {
        bellsEnabled: false,
        tonesEnabled: false,
        vibrationEnabled: false,
        masterVolume: 0,
      },
      customComboMigrationNoticeShown: true,
    }),
  )
}

function seedDailyMap(map: DailyDrillMap) {
  localStorage.setItem('strikecaller:daily-drill', JSON.stringify(map))
}

function drill(
  civil: string,
  art: MartialArt,
  partial: Partial<DailyDrillState> = {},
): DailyDrillState {
  return {
    ...emptyDailyDrill(civil, art, partial.comboId ?? 'bx-b01'),
    ...partial,
    dateKey: dailyDrillKey(civil, art),
    martialArt: art,
  }
}

function comboTitle(civil: string, art: MartialArt = 'boxing') {
  return getCombo(pickDailyComboId(dailyDrillKey(civil, art), art)).title
}

function renderApp(initialEntry: string | { pathname: string; state?: unknown }) {
  const router = createMemoryRouter(appRoutes, {
    initialEntries: [typeof initialEntry === 'string' ? initialEntry : initialEntry],
  })
  const view = render(
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>,
  )
  return { ...view, router }
}

function combinationName(civil: string, art: MartialArt = 'boxing') {
  return `Combination: ${comboTitle(civil, art)}`
}

describe('L1 Daily Drill local-date rollover', () => {
  beforeEach(() => {
    localStorage.clear()
    seedCompletedOnboarding('boxing')
    vi.spyOn(primeAudio, 'primeTrainingAudio').mockResolvedValue({ ok: true, timedOut: false })
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('keeps stale day-A UI after midnight until a scheduled refresh, proving the mismatch', () => {
    vi.setSystemTime(new Date(2026, 8, 8, 23, 59, 0))
    const dayA = comboTitle('2026-09-08')
    const dayB = comboTitle('2026-09-09')
    expect(dayA).not.toBe(dayB)

    const { router } = renderApp('/daily')
    expect(screen.getByRole('heading', { name: /daily drill/i })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: combinationName('2026-09-08') })).toBeInTheDocument()

    vi.setSystemTime(new Date(2026, 8, 9, 0, 1, 0))
    expect(screen.getByRole('article', { name: combinationName('2026-09-08') })).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: /^slow practice/i })[0]!)
    expect(router.state.location.pathname).toBe('/daily')
    expect(screen.getByRole('article', { name: combinationName('2026-09-09') })).toBeInTheDocument()
    expect(router.state.location.state).toBeNull()
  })

  it('refreshes combo and completion state when the midnight timer fires', async () => {
    vi.setSystemTime(new Date(2026, 8, 8, 23, 59, 50))
    seedDailyMap({
      '2026-09-08:boxing': drill('2026-09-08', 'boxing', {
        comboId: pickDailyComboId('2026-09-08:boxing', 'boxing'),
        slowDone: true,
        normalDone: true,
        fightDone: true,
        completed: true,
      }),
    })
    renderApp('/daily')
    expect(screen.getByRole('heading', { name: /daily drill/i })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/consistency beats intensity/i)
    expect(screen.getByRole('article', { name: combinationName('2026-09-08') })).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(msUntilNextLocalMidnight() + 25)
    })

    expect(localDateKey()).toBe('2026-09-09')
    expect(screen.getByRole('article', { name: combinationName('2026-09-09') })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^slow practice/i })[0]).not.toBeDisabled()
  })

  it('does not treat yesterday complete as today complete after rollover', async () => {
    vi.setSystemTime(new Date(2026, 8, 8, 23, 59, 50))
    seedDailyMap({
      '2026-09-08:boxing': drill('2026-09-08', 'boxing', {
        slowDone: true,
        normalDone: true,
        fightDone: true,
        completed: true,
      }),
    })
    renderApp('/daily')
    expect(screen.getByRole('heading', { name: /daily drill/i })).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(msUntilNextLocalMidnight() + 25)
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^normal practice/i })[0]).toBeDisabled()
  })

  it("locks today's Normal after rollover even if yesterday Slow was done", async () => {
    vi.setSystemTime(new Date(2026, 8, 8, 23, 59, 50))
    seedDailyMap({
      '2026-09-08:boxing': drill('2026-09-08', 'boxing', { slowDone: true, comboId: 'bx-b01' }),
    })
    renderApp('/daily')
    expect(screen.getByRole('heading', { name: /daily drill/i })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^normal practice/i })[0]).not.toBeDisabled()

    await act(async () => {
      vi.advanceTimersByTime(msUntilNextLocalMidnight() + 25)
    })
    expect(screen.getAllByRole('button', { name: /^normal practice/i })[0]).toBeDisabled()
    expect(screen.getAllByRole('button', { name: /^slow practice/i })[0]).not.toBeDisabled()
  })

  it('stale click after midnight refreshes and does not start a mismatched combo', async () => {
    vi.setSystemTime(new Date(2026, 8, 8, 23, 59, 0))
    const { router } = renderApp('/daily')
    expect(screen.getByRole('heading', { name: /daily drill/i })).toBeInTheDocument()
    const dayA = pickDailyComboId('2026-09-08:boxing', 'boxing')
    const dayB = pickDailyComboId('2026-09-09:boxing', 'boxing')
    expect(dayA).not.toBe(dayB)

    vi.setSystemTime(new Date(2026, 8, 9, 0, 1, 0))
    fireEvent.click(screen.getAllByRole('button', { name: /^slow practice/i })[0]!)
    expect(router.state.location.pathname).toBe('/daily')
    expect(screen.getByRole('article', { name: combinationName('2026-09-09') })).toBeInTheDocument()
  })

  it('second click after stale-click refresh starts the displayed current-day combo', async () => {
    vi.setSystemTime(new Date(2026, 8, 8, 23, 59, 0))
    const { router } = renderApp('/daily')
    expect(screen.getByRole('heading', { name: /daily drill/i })).toBeInTheDocument()
    vi.setSystemTime(new Date(2026, 8, 9, 0, 1, 0))
    fireEvent.click(screen.getAllByRole('button', { name: /^slow practice/i })[0]!)
    expect(router.state.location.pathname).toBe('/daily')

    fireEvent.click(screen.getAllByRole('button', { name: /^slow practice/i })[0]!)
    expect(router.state.location.pathname).toBe('/session')
    const state = router.state.location.state as {
      dailyDrillKey: string
      config: WorkoutConfig
    }
    expect(state.dailyDrillKey).toBe('2026-09-09:boxing')
    expect(state.config.selectedComboIds).toEqual([pickDailyComboId('2026-09-09:boxing', 'boxing')])
  })

  it('refreshes when a hidden tab becomes visible after midnight', async () => {
    vi.setSystemTime(new Date(2026, 8, 8, 23, 59, 0))
    renderApp('/daily')
    expect(screen.getByRole('heading', { name: /daily drill/i })).toBeInTheDocument()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    vi.setSystemTime(new Date(2026, 8, 9, 0, 1, 0))
    expect(screen.getByRole('article', { name: combinationName('2026-09-08') })).toBeInTheDocument()

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(screen.getByRole('article', { name: combinationName('2026-09-09') })).toBeInTheDocument()
  })

  it('refreshes on window focus after midnight', async () => {
    vi.setSystemTime(new Date(2026, 8, 8, 23, 59, 0))
    renderApp('/daily')
    expect(screen.getByRole('heading', { name: /daily drill/i })).toBeInTheDocument()
    vi.setSystemTime(new Date(2026, 8, 9, 0, 1, 0))
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(screen.getByRole('article', { name: combinationName('2026-09-09') })).toBeInTheDocument()
  })

  it('clears the midnight timer on unmount', () => {
    vi.setSystemTime(new Date(2026, 8, 8, 23, 59, 0))
    const { unmount } = renderApp('/daily')
    expect(screen.getByRole('heading', { name: /daily drill/i })).toBeInTheDocument()
    const pendingBeforeUnmount = vi.getTimerCount()
    expect(pendingBeforeUnmount).toBeGreaterThan(0)
    unmount()
    expect(vi.getTimerCount()).toBeLessThan(pendingBeforeUnmount)
    expect(() => {
      vi.advanceTimersByTime(msUntilNextLocalMidnight() + 60_000)
    }).not.toThrow()
  })

  it('schedules the next local midnight with DST-safe day math', () => {
    const evening = new Date(2026, 2, 7, 23, 15, 0).getTime()
    const delay = msUntilNextLocalMidnight(evening)
    const firedAt = evening + delay
    expect(startOfLocalDay(firedAt)).toBe(addLocalDays(evening, 1))
    expect(localDateKey(new Date(firedAt))).toBe(localDateKey(new Date(addLocalDays(evening, 1))))
    expect(new Date(firedAt).getHours()).toBe(0)
    expect(new Date(firedAt).getMinutes()).toBe(0)
    expect(new Date(firedAt).getSeconds()).toBe(0)
  })

  it('stresses 20 deterministic civil-date rollover cycles', async () => {
    for (let i = 0; i < 20; i++) {
      const start = new Date(2026, 8, 8 + i, 23, 59, 50)
      const civil = localDateKey(start)
      const nextCivil = localDateKey(new Date(addLocalDays(start.getTime(), 1)))
      vi.setSystemTime(start)
      seedDailyMap({
        [dailyDrillKey(civil, 'boxing')]: drill(civil, 'boxing', {
          comboId: pickDailyComboId(dailyDrillKey(civil, 'boxing'), 'boxing'),
          slowDone: true,
          normalDone: true,
          fightDone: true,
          completed: true,
        }),
      })
      const { unmount } = renderApp('/daily')
      expect(screen.getByRole('heading', { name: /daily drill/i })).toBeInTheDocument()
      expect(screen.getByRole('status')).toBeInTheDocument()
      expect(screen.getByRole('article', { name: combinationName(civil) })).toBeInTheDocument()

      await act(async () => {
        vi.advanceTimersByTime(msUntilNextLocalMidnight(start.getTime()) + 25)
      })
      expect(localDateKey()).toBe(nextCivil)
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
      expect(screen.getByRole('article', { name: combinationName(nextCivil) })).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: /^normal practice/i })[0]).toBeDisabled()
      unmount()
      localStorage.removeItem('strikecaller:daily-drill')
    }
  })
})
