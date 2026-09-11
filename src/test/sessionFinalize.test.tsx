import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AppProvider } from '../context/AppContext'
import { appRoutes } from '../routes'
import { DEFAULT_PREFERENCES, DEFAULT_SPEECH, createDefaultWorkout } from '../data/defaults'
import * as historyStore from '../storage/historyStore'
import * as primeAudio from '../utils/primeAudio'
import type { Combo, WorkoutConfig } from '../types'

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

function mockSpeechEnvironment() {
  class MockUtterance {
    text = ''
    rate = 1
    pitch = 1
    volume = 1
    lang = 'en-US'
    voice = null
    onend: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => void) | null = null
    onerror: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisErrorEvent) => void) | null = null
    constructor(text?: string) {
      this.text = text ?? ''
    }
  }
  // @ts-expect-error test mock
  globalThis.SpeechSynthesisUtterance = MockUtterance
  window.speechSynthesis = {
    getVoices: () => [],
    speak: (u: SpeechSynthesisUtterance) => {
      queueMicrotask(() => u.onend?.(new Event('end') as SpeechSynthesisEvent))
    },
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    pending: false,
    speaking: false,
    paused: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onvoiceschanged: null,
  } as unknown as SpeechSynthesis
}

function silentConfig(partial: Partial<WorkoutConfig> = {}): WorkoutConfig {
  return createDefaultWorkout({
    mode: 'coach',
    sessionDurationSec: 120,
    roundDurationSec: 120,
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
      punch: 0.7,
    },
    ...partial,
  })
}

function finiteCombo(): Combo {
  return {
    id: 'custom-finite',
    title: 'Finite',
    difficulty: 'beginner',
    stance: 'orthodox',
    trainingModes: ['custom', 'coach', 'round', 'learn', 'daily', 'demo', 'reaction'],
    purpose: 'conditioning',
    techniques: [{ techniqueId: 'jab' }, { techniqueId: 'cross' }],
    recommendedPace: 'technical',
    setupExplanation: 't',
    endingPosition: 'base',
    safeExit: 'reset',
    coachingNotes: 'n',
    tags: ['custom'],
    equipment: ['shadowboxing'],
    martialArt: 'muay-thai',
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

async function assertSessionVisible() {
  await waitFor(
    () => {
      expect(screen.getByRole('toolbar', { name: /session controls/i })).toBeInTheDocument()
    },
    { timeout: 8000 },
  )
}

function deferCommit(write: { ok: true } | { ok: false; reason: 'write-failed'; message: string } = { ok: true }) {
  let release!: (value?: unknown) => void
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const spy = vi.spyOn(historyStore, 'commitSessionWrite').mockImplementation(async () => {
    await gate
    return { write, generation: historyStore.getHistoryWriteGeneration() }
  })
  return {
    spy,
    release: () => {
      release()
    },
  }
}

describe('session finalization navigation lock', () => {
  beforeEach(() => {
    localStorage.clear()
    seedCompletedOnboarding()
    mockSpeechEnvironment()
    vi.spyOn(primeAudio, 'primeTrainingAudio').mockResolvedValue({ ok: true, timedOut: false })
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('manual End with delayed addHistory keeps Session and does not yank after Back', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { spy, release } = deferCommit()
    const { router } = renderApp({ pathname: '/session', state: { config: silentConfig() } })
    await assertSessionVisible()
    await vi.advanceTimersByTimeAsync(5000)
    await waitFor(() => expect(screen.getByLabelText(/end session/i)).toBeEnabled())
    await user.click(screen.getByLabelText(/end session/i))
    await user.click(screen.getByRole('button', { name: /^end session$/i }))
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('status', { name: /finishing workout/i })).toBeInTheDocument()
    expect(screen.getByText(/saving your training summary/i)).toBeInTheDocument()
    expect(screen.queryByRole('toolbar', { name: /session controls/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /round/i })).not.toBeInTheDocument()

    await act(async () => {
      await router.navigate('/')
    })
    expect(router.state.location.pathname).toBe('/session')
    expect(screen.queryByRole('heading', { name: /leave this workout/i })).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: /finishing workout/i })).toBeInTheDocument()

    await act(async () => {
      release()
    })
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/summary\/session-\d+-[0-9a-f]+$/)
    })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading', { name: 'Summary' })).toBeInTheDocument()
  }, 20000)

  it('natural completion with delayed addHistory stays on Session until save resolves', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { spy, release } = deferCommit()
    const { router } = renderApp({
      pathname: '/session',
      state: {
        config: silentConfig({
          mode: 'custom',
          finishWhenQueueEmpty: true,
          repeatCount: 1,
          customComboId: 'custom-finite',
          sessionDurationSec: 900,
          roundDurationSec: 900,
        }),
        comboQueue: [finiteCombo()],
      },
    })
    await assertSessionVisible()
    for (let i = 0; i < 80; i += 1) {
      await vi.advanceTimersByTimeAsync(250)
      if (spy.mock.calls.length > 0) break
    }
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('status', { name: /finishing workout/i })).toBeInTheDocument()
    expect(screen.queryByRole('toolbar', { name: /session controls/i })).not.toBeInTheDocument()

    await act(async () => {
      await router.navigate('/')
    })
    expect(router.state.location.pathname).toBe('/session')
    expect(screen.queryByRole('heading', { name: /leave this workout/i })).not.toBeInTheDocument()

    await act(async () => {
      release()
    })
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/summary\/session-\d+-[0-9a-f]+$/)
    })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('heading', { name: 'Summary' })).toBeInTheDocument()
    void user
  }, 20000)

  it('failed persistence still routes once to the transient Summary', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { spy, release } = deferCommit({ ok: false, reason: 'write-failed', message: 'nope' })
    const { router } = renderApp({ pathname: '/session', state: { config: silentConfig() } })
    await assertSessionVisible()
    await vi.advanceTimersByTimeAsync(5000)
    await waitFor(() => expect(screen.getByLabelText(/end session/i)).toBeEnabled())
    await user.click(screen.getByLabelText(/end session/i))
    await user.click(screen.getByRole('button', { name: /^end session$/i }))
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1))
    await act(async () => {
      release()
    })
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/summary')
    })
    expect(screen.getByRole('heading', { name: 'Summary' })).toBeInTheDocument()
    expect(spy).toHaveBeenCalledTimes(1)
  }, 20000)
})
