import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, MemoryRouter } from 'react-router-dom'
import { AppProvider } from '../context/AppContext'
import { appRoutes } from '../routes'
import { SessionControlDock } from '../components/SessionControlDock'
import { CompactComboPath } from '../components/CompactComboPath'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { TrainPage } from '../pages/TrainPage'
import { SessionEngine } from '../engines/sessionEngine'
import { audioEngine } from '../engines/audioEngine'
import { primeTrainingAudio } from '../utils/primeAudio'
import { DEFAULT_PREFERENCES, DEFAULT_SPEECH, createDefaultWorkout, APP_VERSION } from '../data/defaults'
import type { Combo } from '../types'

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

const eightCombo: Combo = {
  id: 'eight',
  title: 'Eight path',
  difficulty: 'beginner',
  stance: 'orthodox',
  trainingModes: ['custom'],
  purpose: 'conditioning',
  techniques: [
    { techniqueId: 'jab' },
    { techniqueId: 'cross' },
    { techniqueId: 'lead-hook' },
    { techniqueId: 'cross' },
    { techniqueId: 'jab' },
    { techniqueId: 'cross' },
    { techniqueId: 'lead-hook' },
    { techniqueId: 'cross' },
  ],
  recommendedPace: 'technical',
  setupExplanation: 's',
  endingPosition: 'base',
  safeExit: 'reset',
  coachingNotes: 'n',
  tags: [],
  equipment: ['shadowboxing'],
  martialArt: 'muay-thai',
}

describe('v1.2.1 mobile gym experience', () => {
  beforeEach(() => {
    localStorage.clear()
    mockSpeechEnvironment()
  })

  it('reports APP_VERSION 1.2.1', () => {
    expect(APP_VERSION).toBe('1.2.1')
  })

  it('Session control dock exposes Pause/Resume, Repeat, Skip, End labels', async () => {
    const user = userEvent.setup()
    const onPause = vi.fn()
    const onEnd = vi.fn()
    const { rerender } = render(
      <SessionControlDock
        paused={false}
        skipDisabled={false}
        repeatDisabled={false}
        pauseDisabled={false}
        minimal={false}
        onPause={onPause}
        onResume={vi.fn()}
        onSkip={vi.fn()}
        onRepeat={vi.fn()}
        onEnd={onEnd}
      />,
    )
    expect(screen.getByLabelText(/pause session/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/repeat combination/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/skip combination/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/end session/i)).toBeInTheDocument()
    await user.click(screen.getByLabelText(/pause session/i))
    expect(onPause).toHaveBeenCalled()

    rerender(
      <SessionControlDock
        paused
        skipDisabled={false}
        repeatDisabled={false}
        pauseDisabled={false}
        minimal
        onPause={vi.fn()}
        onResume={vi.fn()}
        onSkip={vi.fn()}
        onRepeat={vi.fn()}
        onEnd={onEnd}
      />,
    )
    expect(screen.getByLabelText(/resume session/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/skip combination/i)).not.toBeInTheDocument()
    expect(document.querySelector('.session-dock')).toBeTruthy()
  })

  it('safe-area session dock and nav classes exist in document styles', () => {
    seedCompletedOnboarding()
    const router = createMemoryRouter(appRoutes, { initialEntries: ['/'] })
    const { container } = render(
      <AppProvider>
        <RouterProvider router={router} />
      </AppProvider>,
    )
    expect(container.querySelector('.mobile-nav')).toBeTruthy()
    expect(getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom') !== undefined).toBe(true)
  })

  it('hides mobile navigation during an active Session route', async () => {
    seedCompletedOnboarding()
    const router = createMemoryRouter(appRoutes, {
      initialEntries: [
        {
          pathname: '/session',
          state: {
            audioPrimed: true,
            config: createDefaultWorkout({
              mode: 'round',
              rounds: 1,
              roundDurationSec: 45,
              speech: {
                ...DEFAULT_SPEECH,
                volume: 0,
                spokenCallsEnabled: false,
                countdownEnabled: false,
                roundCallsEnabled: false,
                coachingCuesEnabled: false,
              },
              sound: { bellsEnabled: false, tonesEnabled: false, vibrationEnabled: false, masterVolume: 0 },
            }),
          },
        },
      ],
    })
    const { container } = render(
      <AppProvider>
        <RouterProvider router={router} />
      </AppProvider>,
    )
    await waitFor(() => {
      expect(container.querySelector('.app-shell.session-active')).toBeTruthy()
    })
    expect(container.querySelector('.mobile-nav')).toBeTruthy()
  })

  it('Train sticky start action respects validation', async () => {
    seedCompletedOnboarding()
    render(
      <MemoryRouter>
        <AppProvider>
          <TrainPage />
        </AppProvider>
      </MemoryRouter>,
    )
    const start = screen.getByRole('button', { name: /start workout/i })
    expect(start).toBeEnabled()
    expect(document.querySelector('.sticky-start-bar')).toBeTruthy()
    const rounds = screen.getByLabelText(/number of rounds/i)
    await userEvent.clear(rounds)
    await userEvent.type(rounds, '99')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start workout/i })).toBeDisabled()
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })

  it('primeTrainingAudio does not throw when AudioContext is unavailable', async () => {
    const spy = vi.spyOn(audioEngine, 'prepare').mockResolvedValue(false)
    await expect(primeTrainingAudio({ timeoutMs: 50 })).resolves.toMatchObject({ ok: expect.any(Boolean) })
    spy.mockRestore()
  })

  it('visibility interruption pauses and cancels speech without crashing', async () => {
    vi.useFakeTimers()
    const engine = new SessionEngine(
      createDefaultWorkout({
        mode: 'coach',
        sessionDurationSec: 60,
        roundDurationSec: 60,
        speech: {
          ...DEFAULT_SPEECH,
          volume: 0,
          spokenCallsEnabled: true,
          countdownEnabled: false,
          roundCallsEnabled: false,
          coachingCuesEnabled: false,
        },
        sound: { bellsEnabled: false, tonesEnabled: false, vibrationEnabled: false, masterVolume: 0 },
      }),
      { wakeLock: false },
    )
    const cancel = vi.spyOn(engine.getSpeechEngine(), 'cancel')
    void engine.start()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(engine.snapshot().paused || engine.snapshot().phase === 'paused').toBe(true)
    expect(engine.snapshot().interrupted).toBe(true)
    expect(cancel).toHaveBeenCalled()
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(engine.snapshot().caption.toLowerCase()).toMatch(/interrupt|resume|paused/)
    engine.dispose()
    vi.useRealTimers()
  })

  it('unsupported wake lock does not crash session start', async () => {
    vi.useFakeTimers()
    const engine = new SessionEngine(
      createDefaultWorkout({
        mode: 'round',
        rounds: 1,
        roundDurationSec: 30,
        speech: { ...DEFAULT_SPEECH, volume: 0, spokenCallsEnabled: false, countdownEnabled: false },
        sound: { bellsEnabled: false, tonesEnabled: false, vibrationEnabled: false, masterVolume: 0 },
      }),
      { wakeLock: true },
    )
    const started = engine.start()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000)
    })
    expect(engine.snapshot().wakeLockActive).toBe(false)
    engine.dispose()
    await started.catch(() => undefined)
    vi.useRealTimers()
  }, 15000)

  it('compact combo path handles eight techniques', () => {
    render(<CompactComboPath combo={eightCombo} activeIndex={3} />)
    expect(screen.getByLabelText(/combination: eight path/i)).toBeInTheDocument()
    expect(screen.getByText('+3')).toBeInTheDocument()
  })

  it('confirm dialog uses scrollable panel class for short viewports', () => {
    render(
      <ConfirmDialog title="End?" confirmLabel="End" onConfirm={() => undefined} onCancel={() => undefined}>
        Body
      </ConfirmDialog>,
    )
    expect(document.querySelector('.dialog-scroll')).toBeTruthy()
  })
})

describe('v1.2.1 session entry regressions via appRoutes', () => {
  beforeEach(() => {
    localStorage.clear()
    seedCompletedOnboarding()
    mockSpeechEnvironment()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('Quick Train style session mounts with Preparing or controls', async () => {
    const router = createMemoryRouter(appRoutes, {
      initialEntries: [
        {
          pathname: '/session',
          state: {
            audioPrimed: true,
            config: createDefaultWorkout({
              mode: 'coach',
              sessionDurationSec: 40,
              speech: {
                ...DEFAULT_SPEECH,
                volume: 0,
                spokenCallsEnabled: false,
                countdownEnabled: false,
                roundCallsEnabled: false,
                coachingCuesEnabled: false,
              },
              sound: { bellsEnabled: false, tonesEnabled: false, vibrationEnabled: false, masterVolume: 0 },
            }),
          },
        },
      ],
    })
    render(
      <AppProvider>
        <RouterProvider router={router} />
      </AppProvider>,
    )
    await waitFor(
      () => {
        expect(screen.getByRole('toolbar', { name: /session controls/i })).toBeInTheDocument()
      },
      { timeout: 8000 },
    )
  }, 15000)
})
