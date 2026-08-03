import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AppProvider } from '../context/AppContext'
import { appRoutes } from '../routes'
import { DEFAULT_PREFERENCES, DEFAULT_SPEECH, createDefaultWorkout } from '../data/defaults'
import type { CustomCombo } from '../types'

function seedCompletedOnboarding() {
  localStorage.setItem(
    'strikecaller:preferences',
    JSON.stringify({
      ...DEFAULT_PREFERENCES,
      onboardingComplete: true,
      wakeLock: false,
      martialArt: 'muay-thai',
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

function seedCustomCombo(combo?: Partial<CustomCombo>) {
  const saved: CustomCombo = {
    id: 'custom-smoke-1',
    title: 'Smoke jab cross',
    techniqueIds: ['jab', 'cross'],
    createdAt: 1,
    updatedAt: 1,
    favorite: false,
    repeatCount: 1,
    martialArt: 'muay-thai',
    ...combo,
  }
  localStorage.setItem('strikecaller:custom-combos', JSON.stringify([saved]))
  return saved
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
      const root = document.getElementById('root') ?? document.body
      expect(root.textContent?.trim().length).toBeGreaterThan(0)
      const ready =
        screen.queryByText(/get ready/i) ||
        screen.queryByText(/^round\b/i) ||
        screen.queryByText(/current call/i) ||
        screen.queryByText(/preparing session/i) ||
        screen.queryByLabelText(/end session/i)
      expect(ready).toBeTruthy()
    },
    { timeout: 8000 },
  )
}

describe('v1.1.3 data-router session entry integration', () => {
  beforeEach(() => {
    localStorage.clear()
    seedCompletedOnboarding()
    mockSpeechEnvironment()
  })

  it('Quick Train opens Session without useBlocker crash', async () => {
    const user = userEvent.setup()
    const errors: unknown[] = []
    const onError = (event: ErrorEvent) => errors.push(event.error ?? event.message)
    window.addEventListener('error', onError)

    renderApp('/')
    expect(screen.getByRole('heading', { name: /^strikecaller$/i })).toBeInTheDocument()
    const quick = screen.getAllByRole('button', { name: /^quick train$/i })[0]!
    await user.click(quick)
    await assertSessionVisible()
    expect(errors.some((e) => String(e).includes('useBlocker'))).toBe(false)
    window.removeEventListener('error', onError)
  }, 20000)

  it('Guided Demo starts Session', async () => {
    const user = userEvent.setup()
    renderApp('/demo')
    await user.click(screen.getByRole('button', { name: /start guided demo/i }))
    await assertSessionVisible()
  }, 15000)

  it('Train Combo from Builder opens Session', async () => {
    const user = userEvent.setup()
    seedCustomCombo()
    renderApp('/builder')
    expect(screen.getByRole('heading', { name: /custom combo builder/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /train combo/i }))
    await assertSessionVisible()
  }, 15000)

  it('Daily Drill Slow Practice opens Session', async () => {
    const user = userEvent.setup()
    renderApp('/daily')
    expect(screen.getByRole('heading', { name: /daily drill/i })).toBeInTheDocument()
    const slow = screen.getAllByRole('button', { name: /slow practice/i })[0]!
    await user.click(slow)
    await assertSessionVisible()
  }, 15000)

  it('Learn Mode practice opens Session', async () => {
    const user = userEvent.setup()
    renderApp('/learn')
    expect(screen.getByRole('heading', { name: /learn mode/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /practice with coach calls/i }))
    await assertSessionVisible()
  }, 15000)
})

describe('v1.1.3 session navigation blocking', () => {
  beforeEach(() => {
    localStorage.clear()
    seedCompletedOnboarding()
    mockSpeechEnvironment()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('Stay keeps Session; Leave navigates without throwing', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderApp({
      pathname: '/session',
      state: {
        config: createDefaultWorkout({
          mode: 'coach',
          sessionDurationSec: 120,
          roundDurationSec: 120,
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
          timingMultipliers: {
            ...createDefaultWorkout().timingMultipliers,
            pauseBetweenCombosMs: 20,
            punch: 0.15,
          },
        }),
      },
    })

    await assertSessionVisible()
    // Advance past countdown into work with progress
    await vi.advanceTimersByTimeAsync(5000)
    await waitFor(() => {
      expect(screen.getByLabelText(/end session/i)).toBeInTheDocument()
    })

    // Trigger blocker via primary Home nav
    const homeLinks = screen.getAllByRole('link', { name: /home/i })
    await user.click(homeLinks[0]!)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /leave this workout/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /^stay$/i }))
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /leave this workout/i })).not.toBeInTheDocument()
    })
    expect(screen.getByLabelText(/end session/i)).toBeInTheDocument()

    await user.click(homeLinks[0]!)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /leave this workout/i })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /leave session/i }))
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: /summary/i }) ||
          screen.queryByRole('heading', { name: /^strikecaller$/i }),
      ).toBeTruthy()
    })
  }, 20000)

  it('finite custom queue reaches Summary', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const combo = {
      id: 'custom-finite',
      title: 'Finite',
      difficulty: 'beginner' as const,
      stance: 'orthodox' as const,
      trainingModes: ['custom' as const],
      purpose: 'conditioning' as const,
      techniques: [{ techniqueId: 'jab' }, { techniqueId: 'cross' }],
      recommendedPace: 'technical' as const,
      setupExplanation: 't',
      endingPosition: 'base',
      safeExit: 'reset',
      coachingNotes: 'n',
      tags: ['custom'],
      equipment: ['shadowboxing' as const],
      martialArt: 'muay-thai' as const,
    }
    renderApp({
      pathname: '/session',
      state: {
        config: createDefaultWorkout({
          mode: 'custom',
          finishWhenQueueEmpty: true,
          repeatCount: 1,
          customComboId: 'custom-finite',
          sessionDurationSec: 900,
          roundDurationSec: 900,
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
          timingMultipliers: {
            ...createDefaultWorkout().timingMultipliers,
            pauseBetweenCombosMs: 10,
            punch: 0.1,
          },
        }),
        comboQueue: [combo],
      },
    })

    await assertSessionVisible()
    for (let i = 0; i < 80; i++) {
      await vi.advanceTimersByTimeAsync(250)
      if (screen.queryByRole('heading', { name: /summary/i })) break
    }
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /summary/i })).toBeInTheDocument()
    })
    expect(within(document.body).getByRole('button', { name: /train again/i })).toBeInTheDocument()
    void user
  }, 20000)
})
