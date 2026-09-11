import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AppProvider } from '../context/AppContext'
import { appRoutes } from '../routes'
import { DEFAULT_PREFERENCES, DEFAULT_SPEECH, createDefaultWorkout } from '../data/defaults'
import * as primeAudio from '../utils/primeAudio'
import type { WorkoutConfig } from '../types'

function seedCompletedOnboarding(preferMinimalMode: boolean) {
  localStorage.setItem(
    'strikecaller:preferences',
    JSON.stringify({
      ...DEFAULT_PREFERENCES,
      onboardingComplete: true,
      wakeLock: false,
      preferMinimalMode,
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

function mockSpeechEnvironment() {
  class MockUtterance {
    text = ''
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

function renderSession(config: WorkoutConfig) {
  const router = createMemoryRouter(appRoutes, {
    initialEntries: [{ pathname: '/session', state: { config } }],
  })
  const view = render(
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>,
  )
  return { ...view, router }
}

describe('minimal session Next preview', () => {
  beforeEach(() => {
    localStorage.clear()
    mockSpeechEnvironment()
    vi.spyOn(primeAudio, 'primeTrainingAudio').mockResolvedValue({ ok: true, timedOut: false })
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('prefer-minimal at start never shows Next preview', async () => {
    seedCompletedOnboarding(true)
    renderSession(silentConfig({ minimalMode: true, showNextTechnique: false }))
    await waitFor(() => expect(screen.getByRole('toolbar', { name: /session controls/i })).toBeInTheDocument())
    await vi.advanceTimersByTimeAsync(5000)
    await waitFor(() => expect(screen.getByLabelText(/end session/i)).toBeEnabled())
    expect(screen.queryByText(/^Next:/i)).not.toBeInTheDocument()
  }, 20000)

  it('toggling Minimal during an active workout hides Next preview', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    seedCompletedOnboarding(false)
    renderSession(silentConfig({ minimalMode: false, showNextTechnique: true }))
    await waitFor(() => expect(screen.getByRole('toolbar', { name: /session controls/i })).toBeInTheDocument())
    await vi.advanceTimersByTimeAsync(5000)
    await waitFor(() => expect(document.querySelector('.session-call-next')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /enter minimal mode/i }))
    expect(document.querySelector('.session-call-next')).not.toBeInTheDocument()
    expect(screen.queryByText(/^Next:/i)).not.toBeInTheDocument()
  }, 20000)
})
