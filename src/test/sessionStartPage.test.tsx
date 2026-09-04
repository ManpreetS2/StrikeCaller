import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AppProvider } from '../context/AppContext'
import { appRoutes } from '../routes'
import { SessionEngine } from '../engines/sessionEngine'
import { DEFAULT_PREFERENCES, DEFAULT_SPEECH, createDefaultWorkout } from '../data/defaults'
import { loadHistory } from '../storage/historyStore'
import * as primeAudio from '../utils/primeAudio'
import { buildTrainAgainPayload } from '../utils/trainAgain'
import type { Combo, CustomCombo, SessionSummary, WorkoutConfig } from '../types'

function seedCompletedOnboarding() {
  localStorage.setItem(
    'strikecaller:preferences',
    JSON.stringify({
      ...DEFAULT_PREFERENCES,
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

function silentConfig(partial: Partial<WorkoutConfig> = {}): WorkoutConfig {
  return createDefaultWorkout({
    mode: 'coach',
    sessionDurationSec: 90,
    roundDurationSec: 90,
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
      pauseBetweenCombosMs: 20,
    },
    ...partial,
  })
}

function runtimeCombo(
  id: string,
  techniqueIds: string[],
  martialArt: Combo['martialArt'] = 'muay-thai',
): Combo {
  return {
    id,
    title: `Combo ${id}`,
    difficulty: 'beginner',
    stance: 'orthodox',
    trainingModes: ['custom', 'coach', 'round', 'learn', 'daily', 'demo', 'reaction'],
    purpose: 'conditioning',
    techniques: techniqueIds.map((techniqueId) => ({ techniqueId })),
    recommendedPace: 'technical',
    setupExplanation: 't',
    endingPosition: 'base',
    safeExit: 'reset',
    coachingNotes: 'n',
    tags: ['custom'],
    equipment: ['shadowboxing'],
    martialArt,
  }
}

function renderApp(initialEntry: string | { pathname: string; state?: unknown } = '/') {
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

function trackUnhandled() {
  const reasons: unknown[] = []
  const onWindow = (event: PromiseRejectionEvent) => {
    reasons.push(event.reason)
  }
  const onProcess = (reason: unknown) => {
    reasons.push(reason)
  }
  window.addEventListener('unhandledrejection', onWindow)
  const proc = (
    globalThis as {
      process?: {
        on: (event: string, listener: (reason: unknown) => void) => void
        off: (event: string, listener: (reason: unknown) => void) => void
      }
    }
  ).process
  proc?.on('unhandledRejection', onProcess)
  return {
    reasons,
    stop() {
      window.removeEventListener('unhandledrejection', onWindow)
      proc?.off('unhandledRejection', onProcess)
    },
  }
}

async function expectUnavailable() {
  expect(await screen.findByRole('heading', { name: 'Session unavailable' })).toBeInTheDocument()
  expect(screen.queryByRole('toolbar', { name: /session controls/i })).not.toBeInTheDocument()
  expect(screen.queryByText(/preparing audio/i)).not.toBeInTheDocument()
}

describe('A5 SessionPage start-state gate', () => {
  let startSpy: ReturnType<typeof vi.spyOn>
  let primeSpy: ReturnType<typeof vi.spyOn>
  let wakeRequest: ReturnType<typeof vi.fn>

  beforeEach(() => {
    localStorage.clear()
    seedCompletedOnboarding()
    startSpy = vi.spyOn(SessionEngine.prototype, 'start')
    primeSpy = vi.spyOn(primeAudio, 'primeTrainingAudio').mockResolvedValue({ ok: true, timedOut: false })
    wakeRequest = vi.fn().mockResolvedValue({ release: vi.fn() })
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: wakeRequest },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows Session unavailable for a direct /session visit with null state', async () => {
    const addListener = vi.spyOn(window, 'addEventListener')
    renderApp({ pathname: '/session', state: null })
    await expectUnavailable()
    expect(startSpy).not.toHaveBeenCalled()
    expect(primeSpy).not.toHaveBeenCalled()
    expect(wakeRequest).not.toHaveBeenCalled()
    expect(addListener.mock.calls.some((call) => call[0] === 'beforeunload')).toBe(false)
    expect(await loadHistory()).toEqual([])
  })

  it('shows Session unavailable for an incomplete WorkoutConfig', async () => {
    renderApp({ pathname: '/session', state: { config: { martialArt: 'boxing' } } })
    await expectUnavailable()
    expect(startSpy).not.toHaveBeenCalled()
    expect(primeSpy).not.toHaveBeenCalled()
  })

  it('starts a valid createDefaultWorkout config', async () => {
    renderApp({
      pathname: '/session',
      state: { config: silentConfig(), audioPrimed: true },
    })
    await waitFor(() => {
      expect(screen.getByRole('toolbar', { name: /session controls/i })).toBeInTheDocument()
    })
    expect(startSpy).toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: 'Session unavailable' })).not.toBeInTheDocument()
  })

  it('rejects a malformed comboQueue without starting the engine', async () => {
    const tracked = trackUnhandled()
    renderApp({
      pathname: '/session',
      state: { config: silentConfig(), comboQueue: [{}], audioPrimed: true },
    })
    await expectUnavailable()
    expect(startSpy).not.toHaveBeenCalled()
    expect(primeSpy).not.toHaveBeenCalled()
    expect(tracked.reasons).toEqual([])
    tracked.stop()
  })

  it('rejects a structurally valid combo with an unknown technique', async () => {
    renderApp({
      pathname: '/session',
      state: {
        config: silentConfig({ martialArt: 'boxing' }),
        comboQueue: [runtimeCombo('bad', ['does-not-exist'], 'boxing')],
        audioPrimed: true,
      },
    })
    await expectUnavailable()
    expect(startSpy).not.toHaveBeenCalled()
  })

  it('rejects a known-id wrong-sport combo in the route queue', async () => {
    renderApp({
      pathname: '/session',
      state: {
        config: silentConfig({ martialArt: 'boxing' }),
        comboQueue: [runtimeCombo('kick', ['jab', 'rear-low-kick'], 'boxing')],
        audioPrimed: true,
      },
    })
    await expectUnavailable()
    expect(startSpy).not.toHaveBeenCalled()
  })

  it('starts a valid finite combo queue', async () => {
    renderApp({
      pathname: '/session',
      state: {
        config: silentConfig({
          mode: 'custom',
          martialArt: 'boxing',
          finishWhenQueueEmpty: true,
        }),
        comboQueue: [runtimeCombo('keep', ['jab', 'cross'], 'boxing')],
        audioPrimed: true,
      },
    })
    await waitFor(() => {
      expect(screen.getByRole('toolbar', { name: /session controls/i })).toBeInTheDocument()
    })
    expect(startSpy).toHaveBeenCalled()
  })

  it('rejects present-but-invalid audioPrimed without starting', async () => {
    renderApp({
      pathname: '/session',
      state: { config: silentConfig(), audioPrimed: 'yes' },
    })
    await expectUnavailable()
    expect(startSpy).not.toHaveBeenCalled()
    expect(primeSpy).not.toHaveBeenCalled()
  })

  it('Back to Train leaves the unavailable screen', async () => {
    const user = userEvent.setup()
    const { router } = renderApp({ pathname: '/session', state: null })
    await expectUnavailable()
    await user.click(screen.getByRole('link', { name: 'Back to Train' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/train')
    })
    expect(screen.getByRole('heading', { name: /customize workout/i })).toBeInTheDocument()
  })

  it('hash navigation to /session without state is unavailable', async () => {
    const { router } = renderApp('/')
    expect(screen.getByRole('heading', { name: /^strikecaller$/i })).toBeInTheDocument()
    await act(async () => {
      await router.navigate('/session')
    })
    await expectUnavailable()
    expect(startSpy).not.toHaveBeenCalled()
    expect(primeSpy).not.toHaveBeenCalled()
  })
})

describe('A5 legitimate session entry points', () => {
  beforeEach(() => {
    localStorage.clear()
    seedCompletedOnboarding()
    vi.spyOn(primeAudio, 'primeTrainingAudio').mockResolvedValue({ ok: true, timedOut: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('TrainPage starts the distinctive configured workout, not a default', async () => {
    const user = userEvent.setup()
    const { router } = renderApp('/train')
    await user.click(screen.getByRole('radio', { name: /boxing/i }))
    await user.selectOptions(screen.getByLabelText('Stance'), 'southpaw')
    await user.selectOptions(screen.getByLabelText('Pace'), 'technical')
    await user.clear(screen.getByLabelText('Number of rounds'))
    await user.type(screen.getByLabelText('Number of rounds'), '2')
    await user.clear(screen.getByLabelText('Round duration in seconds'))
    await user.type(screen.getByLabelText('Round duration in seconds'), '120')
    await user.click(screen.getByRole('button', { name: 'Start Workout' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/session')
    })
    const state = router.state.location.state as { config: WorkoutConfig }
    expect(state.config.martialArt).toBe('boxing')
    expect(state.config.stance).toBe('southpaw')
    expect(state.config.rounds).toBe(2)
    expect(state.config.roundDurationSec).toBe(120)
    expect(state.config.pace).toBe('technical')
    await waitFor(() => {
      expect(screen.getByText(/round · southpaw · technical/i)).toBeInTheDocument()
    })
  })

  it('DemoPage starts a 60-second demo without mutating saved preferences', async () => {
    const user = userEvent.setup()
    const prefsBefore = JSON.parse(localStorage.getItem('strikecaller:preferences') ?? '{}') as {
      stance?: string
      speech?: { callStyle?: string }
    }
    const { router } = renderApp('/demo')
    await user.click(screen.getByRole('button', { name: /start guided demo/i }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/session')
    })
    const state = router.state.location.state as { config: WorkoutConfig; demo?: boolean }
    expect(state.config.mode).toBe('demo')
    expect(state.config.roundDurationSec).toBe(60)
    expect(state.config.sessionDurationSec).toBe(60)
    expect(state.demo).toBe(true)
    const prefsAfter = JSON.parse(localStorage.getItem('strikecaller:preferences') ?? '{}') as {
      stance?: string
      speech?: { callStyle?: string }
    }
    expect(prefsAfter.stance).toBe(prefsBefore.stance)
    expect(prefsAfter.speech?.callStyle).toBe(prefsBefore.speech?.callStyle)
    await waitFor(() => {
      expect(screen.getByText(/demo · orthodox · technical/i)).toBeInTheDocument()
    })
  })

  it('Builder Train Combo starts a valid finite custom queue', async () => {
    const user = userEvent.setup()
    const saved: CustomCombo = {
      id: 'custom-a5',
      title: 'A5 jab cross',
      techniqueIds: ['jab', 'cross'],
      createdAt: 1,
      updatedAt: 1,
      favorite: false,
      repeatCount: 2,
      martialArt: 'muay-thai',
    }
    localStorage.setItem('strikecaller:custom-combos', JSON.stringify([saved]))
    const { router } = renderApp('/builder')
    await user.click(screen.getByRole('button', { name: /train combo/i }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/session')
    })
    const state = router.state.location.state as { config: WorkoutConfig; comboQueue: Combo[] }
    expect(state.config.mode).toBe('custom')
    expect(state.config.finishWhenQueueEmpty).toBe(true)
    expect(state.comboQueue.length).toBeGreaterThan(0)
    expect(state.comboQueue.every((combo) => combo.id === 'custom-a5')).toBe(true)
    await waitFor(() => {
      expect(screen.getByRole('toolbar', { name: /session controls/i })).toBeInTheDocument()
    })
  })

  it('Train Again of a generated workout starts with that config', async () => {
    const user = userEvent.setup()
    const summary = {
      id: 'session-train-again',
      startedAt: 1_700_000_000_000,
      endedAt: 1_700_000_060_000,
      martialArt: 'boxing',
      mode: 'round',
      stance: 'southpaw',
      pace: 'fast',
      totalTrainingMs: 60_000,
      roundsCompleted: 2,
      combinationsCompleted: 4,
      techniquesCalled: 8,
      techniqueCounts: { jab: 4 },
      techniqueCategoryCounts: { punch: 8 },
      comboIds: ['bx-b01'],
      defenseActions: 0,
      movementActions: 0,
      averagePaceLabel: 'fast',
      dailyDrillCompleted: false,
      cancelled: false,
      favoriteComboIds: [],
      usedCustomCombo: false,
      workoutConfig: silentConfig({
        martialArt: 'boxing',
        mode: 'round',
        stance: 'southpaw',
        pace: 'fast',
        rounds: 2,
        roundDurationSec: 120,
      }),
    } satisfies SessionSummary
    const { router } = renderApp({ pathname: '/summary', state: { summary } })
    await user.click(screen.getByRole('button', { name: /train again/i }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/session')
    })
    const state = router.state.location.state as { config: WorkoutConfig }
    expect(state.config.martialArt).toBe('boxing')
    expect(state.config.stance).toBe('southpaw')
    expect(state.config.pace).toBe('fast')
    await waitFor(() => {
      expect(screen.getByText(/round · southpaw · fast/i)).toBeInTheDocument()
    })
  })

  it('Train Again of an all-corrupt finite-safe empty queue is accepted', async () => {
    const payload = buildTrainAgainPayload(
      {
        id: 'hist-all-bad',
        martialArt: 'boxing',
        mode: 'custom',
        usedCustomCombo: true,
        workoutConfig: silentConfig({
          mode: 'custom',
          martialArt: 'boxing',
          finishWhenQueueEmpty: true,
          customComboId: 'A',
        }),
        queuedCombos: [runtimeCombo('A', ['cross', 'rear-hook'], 'boxing')],
      } as SessionSummary,
      [],
    )
    const startSpy = vi.spyOn(SessionEngine.prototype, 'start')
    renderApp({
      pathname: '/session',
      state: { config: payload.config, comboQueue: payload.comboQueue, audioPrimed: true },
    })
    expect(screen.queryByRole('heading', { name: 'Session unavailable' })).not.toBeInTheDocument()
    await waitFor(() => {
      expect(startSpy).toHaveBeenCalled()
    })
    expect(startSpy.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ comboQueue: [] }),
    )
  })

  it('Daily Slow Practice starts with a valid dailyPhase', async () => {
    const user = userEvent.setup()
    const { router } = renderApp('/daily')
    await user.click(screen.getAllByRole('button', { name: /slow practice/i })[0]!)
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/session')
    })
    const state = router.state.location.state as { config: WorkoutConfig; dailyPhase: string }
    expect(state.config.mode).toBe('daily')
    expect(state.dailyPhase).toBe('slowDone')
    await waitFor(() => {
      expect(screen.getByText(/daily · /i)).toBeInTheDocument()
    })
  })
})

describe('A5 beforeunload protection', () => {
  beforeEach(() => {
    localStorage.clear()
    seedCompletedOnboarding()
    vi.spyOn(primeAudio, 'primeTrainingAudio').mockResolvedValue({ ok: true, timedOut: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('does not install beforeunload on the unavailable screen', async () => {
    const addListener = vi.spyOn(window, 'addEventListener')
    renderApp({ pathname: '/session', state: null })
    await expectUnavailable()
    expect(addListener.mock.calls.some((call) => call[0] === 'beforeunload')).toBe(false)
  })

  it('still protects a valid workout after meaningful progress', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderApp({
      pathname: '/session',
      state: {
        config: silentConfig({
          mode: 'coach',
          sessionDurationSec: 120,
          roundDurationSec: 120,
          timingMultipliers: {
            ...createDefaultWorkout().timingMultipliers,
            pauseBetweenCombosMs: 20,
            punch: 0.7,
          },
        }),
        audioPrimed: true,
      },
    })
    await waitFor(() => {
      expect(screen.getByRole('toolbar', { name: /session controls/i })).toBeInTheDocument()
    })
    await vi.advanceTimersByTimeAsync(5000)
    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent
    Object.defineProperty(event, 'preventDefault', { value: vi.fn(event.preventDefault.bind(event)) })
    window.dispatchEvent(event)
    expect(event.preventDefault).toHaveBeenCalled()
  })
})
