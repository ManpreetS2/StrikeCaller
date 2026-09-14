import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AppProvider } from '../context/AppContext'
import { appRoutes } from '../routes'
import { SessionEngine } from '../engines/sessionEngine'
import { DEFAULT_PREFERENCES, DEFAULT_SPEECH, createDefaultWorkout } from '../data/defaults'
import { loadDailyDrillMap } from '../storage/localStore'
import * as primeAudio from '../utils/primeAudio'
import {
  dailyDrillKey,
  emptyDailyDrill,
  parseDailyDrillKey,
  pickDailyComboId,
} from '../utils/dailyDrill'
import { parseSessionStartState } from '../utils/sessionStart'
import type { Combo, DailyDrillMap, DailyDrillState, MartialArt, WorkoutConfig } from '../types'

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

function silentDailyConfig(art: MartialArt = 'boxing', extra: Partial<WorkoutConfig> = {}): WorkoutConfig {
  return createDefaultWorkout({
    mode: 'daily',
    martialArt: art,
    sessionDurationSec: 20,
    roundDurationSec: 20,
    rounds: 1,
    finishWhenQueueEmpty: true,
    selectedComboIds: [art === 'boxing' ? 'bx-b01' : 'beg-01'],
    speech: {
      ...DEFAULT_SPEECH,
      volume: 0,
      spokenCallsEnabled: false,
      countdownEnabled: false,
      roundCallsEnabled: false,
      coachingCuesEnabled: false,
      captionsEnabled: true,
    },
    sound: { bellsEnabled: false, tonesEnabled: false, vibrationEnabled: false, masterVolume: 0 },
    timingMultipliers: {
      ...createDefaultWorkout().timingMultipliers,
      pauseBetweenCombosMs: 10,
      punch: 0.7,
    },
    ...extra,
  })
}

function jabCross(art: MartialArt = 'boxing'): Combo {
  return {
    id: art === 'boxing' ? 'bx-b01' : 'beg-01',
    title: 'Jab cross',
    difficulty: 'beginner',
    stance: 'orthodox',
    trainingModes: ['daily', 'coach', 'round', 'custom', 'learn', 'demo', 'reaction'],
    purpose: 'establish-jab',
    techniques: [{ techniqueId: 'jab' }, { techniqueId: 'cross' }],
    recommendedPace: 'technical',
    setupExplanation: 't',
    endingPosition: 'base',
    safeExit: 'reset',
    coachingNotes: 'n',
    tags: [],
    equipment: ['shadowboxing'],
    martialArt: art,
  }
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

describe('parseDailyDrillKey', () => {
  it('accepts canonical boxing and Muay Thai keys without comparing to today', () => {
    expect(parseDailyDrillKey('2026-09-08:boxing')).toEqual({
      ok: true,
      key: '2026-09-08:boxing',
      civilDate: '2026-09-08',
      martialArt: 'boxing',
    })
    expect(parseDailyDrillKey('2026-09-08:mma-striking')).toEqual({
      ok: true,
      key: '2026-09-08:mma-striking',
      civilDate: '2026-09-08',
      martialArt: 'mma-striking',
    })
  })

  it('rejects malformed, unpadded, impossible, and unknown-art keys', () => {
    expect(parseDailyDrillKey('banana').ok).toBe(false)
    expect(parseDailyDrillKey('2026-9-8:boxing').ok).toBe(false)
    expect(parseDailyDrillKey('2026-09-99:boxing').ok).toBe(false)
    expect(parseDailyDrillKey('2026-02-31:boxing').ok).toBe(false)
    expect(parseDailyDrillKey('2026-09-08:karate').ok).toBe(false)
    expect(parseDailyDrillKey('').ok).toBe(false)
    expect(parseDailyDrillKey(null).ok).toBe(false)
  })
})

describe('A8 Daily origin date at click time', () => {
  beforeEach(() => {
    localStorage.clear()
    seedCompletedOnboarding('boxing')
    vi.spyOn(primeAudio, 'primeTrainingAudio').mockResolvedValue({ ok: true, timedOut: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('DailyPage passes the originating key into /session at click time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 8, 12, 0, 0))
    const { router } = renderApp('/daily')
    await screen.findByRole('heading', { name: /daily drill/i })
    fireEvent.click(screen.getAllByRole('button', { name: /^slow practice/i })[0]!)
    expect(router.state.location.pathname).toBe('/session')
    const state = router.state.location.state as {
      dailyPhase: string
      dailyDrillKey: string
      config: WorkoutConfig
    }
    expect(state.dailyPhase).toBe('slowDone')
    expect(state.dailyDrillKey).toBe('2026-09-08:boxing')
    expect(state.config.mode).toBe('daily')
    expect(state.config.martialArt).toBe('boxing')
  })

  it('stale /daily page across midnight refreshes before a second click starts today', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 8, 23, 59, 0))
    const { router } = renderApp('/daily')
    await screen.findByRole('heading', { name: /daily drill/i })
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
    expect(loadDailyDrillMap()['2026-09-09:boxing']?.comboId).toBe(state.config.selectedComboIds?.[0])
    expect(loadDailyDrillMap()['2026-09-08:boxing']).toBeUndefined()
  })

  it("yesterday's Slow does not unlock today's Normal on a stale Daily page", async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 8, 23, 59, 0))
    seedDailyMap({
      '2026-09-08:boxing': drill('2026-09-08', 'boxing', { slowDone: true, comboId: 'bx-b01' }),
    })
    const { router } = renderApp('/daily')
    await screen.findByRole('heading', { name: /daily drill/i })
    vi.setSystemTime(new Date(2026, 8, 9, 0, 1, 0))
    fireEvent.click(screen.getAllByRole('button', { name: /^normal practice/i })[0]!)
    expect(router.state.location.pathname).toBe('/daily')
    expect(screen.getAllByRole('button', { name: /^normal practice/i })[0]).toBeDisabled()
    expect(loadDailyDrillMap()['2026-09-08:boxing']?.slowDone).toBe(true)

    fireEvent.click(screen.getAllByRole('button', { name: /^slow practice/i })[0]!)
    expect(router.state.location.pathname).toBe('/session')
    const state = router.state.location.state as { dailyDrillKey: string; dailyPhase: string }
    expect(state.dailyDrillKey).toBe('2026-09-09:boxing')
    expect(state.dailyPhase).toBe('slowDone')
  })

  it('preserves an existing new-day combo when a stale Daily page starts Normal', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 8, 23, 59, 0))
    seedDailyMap({
      '2026-09-08:boxing': drill('2026-09-08', 'boxing', { slowDone: true, comboId: 'bx-b01' }),
      '2026-09-09:boxing': drill('2026-09-09', 'boxing', { slowDone: true, comboId: 'bx-b02' }),
    })
    const { router } = renderApp('/daily')
    await screen.findByRole('heading', { name: /daily drill/i })
    vi.setSystemTime(new Date(2026, 8, 9, 0, 1, 0))
    fireEvent.click(screen.getAllByRole('button', { name: /^normal practice/i })[0]!)
    expect(router.state.location.pathname).toBe('/daily')
    fireEvent.click(screen.getAllByRole('button', { name: /^normal practice/i })[0]!)
    expect(router.state.location.pathname).toBe('/session')
    const state = router.state.location.state as {
      dailyDrillKey: string
      config: WorkoutConfig
    }
    expect(state.dailyDrillKey).toBe('2026-09-09:boxing')
    expect(state.config.selectedComboIds).toEqual(['bx-b02'])
    expect(loadDailyDrillMap()['2026-09-09:boxing']?.comboId).toBe('bx-b02')
  })
})

describe('A8 Daily completion uses the captured origin key', () => {
  beforeEach(() => {
    localStorage.clear()
    seedCompletedOnboarding('boxing')
    vi.spyOn(primeAudio, 'primeTrainingAudio').mockResolvedValue({ ok: true, timedOut: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  async function completeRoutedDaily(args: {
    civilStart: Date
    originKey: string
    phase: 'slowDone' | 'normalDone' | 'fightDone'
  }) {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(args.civilStart)
    const view = renderApp({
      pathname: '/session',
      state: {
        config: silentDailyConfig('boxing'),
        comboQueue: [jabCross('boxing')],
        dailyPhase: args.phase,
        dailyDrillKey: args.originKey,
        audioPrimed: true,
      },
    })
    const { router } = view
    await act(async () => {
      for (let i = 0; i < 80; i++) {
        await vi.advanceTimersByTimeAsync(250)
        if (screen.queryByRole('heading', { name: /^summary$/i })) break
      }
    })
    expect(router.state.location.pathname).toMatch(/^\/summary\//)
    view.unmount()
    return router
  }

  it('start before midnight and finish after midnight credits only the origin day', async () => {
    seedDailyMap({
      '2026-09-08:boxing': drill('2026-09-08', 'boxing', { slowDone: false }),
    })
    await completeRoutedDaily({
      civilStart: new Date(2026, 8, 8, 23, 59, 50),
      originKey: '2026-09-08:boxing',
      phase: 'slowDone',
    })
    const stored = loadDailyDrillMap()
    expect(stored['2026-09-08:boxing']?.slowDone).toBe(true)
    expect(stored['2026-09-08:boxing']?.completed).toBe(false)
    expect(stored['2026-09-09:boxing']).toBeUndefined()
  })

  it('same-day completion credits the same civil date', async () => {
    await completeRoutedDaily({
      civilStart: new Date(2026, 8, 8, 12, 0, 0),
      originKey: '2026-09-08:boxing',
      phase: 'slowDone',
    })
    const stored = loadDailyDrillMap()
    expect(stored['2026-09-08:boxing']?.slowDone).toBe(true)
    expect(stored['2026-09-09:boxing']).toBeUndefined()
  })

  it('cancelled Daily phase does not credit the origin record', async () => {
    seedDailyMap({
      '2026-09-08:boxing': drill('2026-09-08', 'boxing', { slowDone: false }),
    })
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 8, 8, 12, 0, 0))
    renderApp({
      pathname: '/session',
      state: {
        config: silentDailyConfig('boxing'),
        comboQueue: [jabCross('boxing')],
        dailyPhase: 'slowDone',
        dailyDrillKey: '2026-09-08:boxing',
        audioPrimed: true,
      },
    })
    await act(async () => {
      for (let i = 0; i < 40; i++) {
        await vi.advanceTimersByTimeAsync(250)
        if (screen.queryByLabelText(/end session/i)) break
      }
    })
    fireEvent.click(screen.getByLabelText(/end session/i))
    fireEvent.click(screen.getByRole('button', { name: /^end session$/i }))
    await act(async () => {
      for (let i = 0; i < 40; i++) {
        await vi.advanceTimersByTimeAsync(250)
        if (screen.queryByRole('heading', { name: /^summary$/i })) break
      }
    })
    expect(screen.getByRole('heading', { name: 'Summary' })).toBeInTheDocument()
    expect(loadDailyDrillMap()['2026-09-08:boxing']?.slowDone).toBe(false)
  })

  it('three-phase same-day completion reaches completed=true on the origin key', async () => {
    for (const phase of ['slowDone', 'normalDone', 'fightDone'] as const) {
      await completeRoutedDaily({
        civilStart: new Date(2026, 8, 8, 12, 0, 0),
        originKey: '2026-09-08:boxing',
        phase,
      })
    }
    const stored = loadDailyDrillMap()
    expect(stored['2026-09-08:boxing']?.slowDone).toBe(true)
    expect(stored['2026-09-08:boxing']?.normalDone).toBe(true)
    expect(stored['2026-09-08:boxing']?.fightDone).toBe(true)
    expect(stored['2026-09-08:boxing']?.completed).toBe(true)
    expect(stored['2026-09-09:boxing']).toBeUndefined()
  })

  it('durable Daily map matches React after midnight completion', async () => {
    await completeRoutedDaily({
      civilStart: new Date(2026, 8, 8, 23, 59, 50),
      originKey: '2026-09-08:boxing',
      phase: 'slowDone',
    })
    const stored = loadDailyDrillMap()
    expect(stored['2026-09-08:boxing']?.slowDone).toBe(true)
    expect(Object.keys(stored)).toEqual(['2026-09-08:boxing'])
  })
})

describe('A8 session-start Daily origin key contract', () => {
  it('does not require the origin key to equal today', () => {
    const config = createDefaultWorkout({ mode: 'daily', martialArt: 'boxing' })
    const parsed = parseSessionStartState({
      config,
      dailyPhase: 'slowDone',
      dailyDrillKey: '2026-09-08:boxing',
    })
    expect(parsed.ok).toBe(true)
  })

  it('rejects a Daily origin key for the wrong martial art', () => {
    const config = createDefaultWorkout({ mode: 'daily', martialArt: 'boxing' })
    expect(
      parseSessionStartState({
        config,
        dailyPhase: 'slowDone',
        dailyDrillKey: '2026-09-08:muay-thai',
      }).ok,
    ).toBe(false)
  })
})

describe('A8 malformed Daily route side effects', () => {
  beforeEach(() => {
    localStorage.clear()
    seedCompletedOnboarding('boxing')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('malformed Daily route never starts SessionEngine, audio, or wake lock', async () => {
    const startSpy = vi.spyOn(SessionEngine.prototype, 'start')
    const primeSpy = vi.spyOn(primeAudio, 'primeTrainingAudio').mockResolvedValue({ ok: true, timedOut: false })
    const wakeRequest = vi.fn().mockResolvedValue({ release: vi.fn() })
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: wakeRequest },
    })
    renderApp({
      pathname: '/session',
      state: {
        config: silentDailyConfig('boxing'),
        dailyPhase: 'slowDone',
        dailyDrillKey: 'garbage',
        audioPrimed: true,
      },
    })
    expect(await screen.findByRole('heading', { name: 'Session unavailable' })).toBeInTheDocument()
    expect(startSpy).not.toHaveBeenCalled()
    expect(primeSpy).not.toHaveBeenCalled()
    expect(wakeRequest).not.toHaveBeenCalled()
  })
})
