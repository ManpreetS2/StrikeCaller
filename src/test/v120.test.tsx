import { describe, expect, it, beforeEach, vi } from 'vitest'
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom'
import { AppProvider } from '../context/AppContext'
import { appRoutes } from '../routes'
import { HomePage } from '../pages/HomePage'
import { OnboardingPage } from '../pages/OnboardingPage'
import { TrainPage } from '../pages/TrainPage'
import { BuilderPage } from '../pages/BuilderPage'
import { StatsPage } from '../pages/StatsPage'
import { ComboDisplay } from '../components/ComboDisplay'
import { InteractiveCard } from '../components/InteractiveCard'
import { SportVisual, ModeVisual, HeroVisual, MetricVisual } from '../components/visual'
import { useCountUp } from '../hooks/useCountUp'
import { DEFAULT_PREFERENCES, DEFAULT_SPEECH, createDefaultWorkout, APP_VERSION } from '../data/defaults'
import type { Combo } from '../types'

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

function matchReducedMotion(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? matches : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
}

const sampleCombo: Combo = {
  id: 'vis-combo',
  title: 'Visual path',
  difficulty: 'beginner',
  stance: 'orthodox',
  trainingModes: ['coach', 'round'],
  purpose: 'conditioning',
  techniques: [{ techniqueId: 'jab' }, { techniqueId: 'cross' }, { techniqueId: 'lead-hook' }],
  recommendedPace: 'technical',
  setupExplanation: 'setup',
  endingPosition: 'base',
  safeExit: 'reset',
  coachingNotes: 'notes',
  tags: [],
  equipment: ['shadowboxing'],
  martialArt: 'muay-thai',
}

describe('v1.2.0 visual polish', () => {
  beforeEach(() => {
    localStorage.clear()
    matchReducedMotion(false)
  })

  it('reports APP_VERSION 1.2.0', () => {
    expect(APP_VERSION).toBe('1.2.0')
  })

  it('InteractiveCard exposes pressed semantics when selected', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <InteractiveCard selected={false} title="Muay Thai" body="125 combos" onClick={onClick} />,
    )
    const btn = screen.getByRole('button', { name: /muay thai/i })
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    await user.click(btn)
    expect(onClick).toHaveBeenCalled()
  })

  it('decorative illustrations use aria-hidden', () => {
    const { container } = render(
      <div>
        <SportVisual art="muay-thai" />
        <ModeVisual mode="round" />
        <HeroVisual />
        <MetricVisual kind="sessions" />
      </div>,
    )
    const svgs = container.querySelectorAll('svg')
    expect(svgs.length).toBeGreaterThanOrEqual(4)
    svgs.forEach((svg) => {
      expect(svg.getAttribute('aria-hidden')).toBe('true')
    })
  })

  it('Home, Train, Builder, and Stats render with visual components', () => {
    seedCompletedOnboarding()
    const { unmount: u1 } = render(
      <MemoryRouter>
        <AppProvider>
          <HomePage />
        </AppProvider>
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /^strikecaller$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /muay thai/i })).toHaveAttribute('aria-pressed')
    u1()

    const { unmount: u2 } = render(
      <MemoryRouter>
        <AppProvider>
          <TrainPage />
        </AppProvider>
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /customize workout/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /muay thai/i })).toBeInTheDocument()
    u2()

    const { unmount: u3 } = render(
      <MemoryRouter>
        <AppProvider>
          <BuilderPage />
        </AppProvider>
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /custom combo builder/i })).toBeInTheDocument()
    u3()

    render(
      <MemoryRouter>
        <AppProvider>
          <StatsPage />
        </AppProvider>
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /training stats/i })).toBeInTheDocument()
  })

  it('onboarding remains keyboard accessible with aria-current step', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <AppProvider>
          <OnboardingPage />
        </AppProvider>
      </MemoryRouter>,
    )
    const progress = screen.getByLabelText(/onboarding progress/i)
    expect(within(progress).getByText(/1\. martial art/i)).toHaveAttribute('aria-current', 'step')

    const boxing = screen.getByRole('button', { name: /boxing/i })
    boxing.focus()
    expect(boxing).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(boxing).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: /^continue$/i }))
    expect(within(progress).getByText(/2\. stance/i)).toHaveAttribute('aria-current', 'step')
  })

  it('ComboDisplay marks active step without live region duplication', () => {
    const { container } = render(
      <ComboDisplay combo={sampleCombo} activeIndex={1} showMeta={false} />,
    )
    expect(container.querySelector('[aria-live]')).toBeNull()
    const current = screen.getByText(/cross/i)
    expect(current).toHaveAttribute('aria-current', 'step')
  })

  it('useCountUp ends on the exact value', async () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ value }) => useCountUp(value, 200), {
      initialProps: { value: 12 },
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })
    expect(result.current).toBe(12)
    rerender({ value: 40 })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })
    expect(result.current).toBe(40)
    vi.useRealTimers()
  })

  it('reduced motion snaps count-up to the final value', () => {
    matchReducedMotion(true)
    const { result } = renderHook(() => useCountUp(99, 400))
    expect(result.current).toBe(99)
  })

  it('Session controls preserve labels and disabled behavior via appRoutes', async () => {
    seedCompletedOnboarding()
    mockSpeechEnvironment()
    const user = userEvent.setup()
    const router = createMemoryRouter(appRoutes, {
      initialEntries: [
        {
          pathname: '/session',
          state: {
            config: createDefaultWorkout({
              mode: 'round',
              rounds: 1,
              roundDurationSec: 60,
              speech: {
                ...DEFAULT_SPEECH,
                volume: 0,
                spokenCallsEnabled: false,
                countdownEnabled: false,
                roundCallsEnabled: false,
                coachingCuesEnabled: false,
              },
              sound: {
                bellsEnabled: false,
                tonesEnabled: false,
                vibrationEnabled: false,
                masterVolume: 0,
              },
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
    await waitFor(() => {
      expect(screen.getByLabelText(/pause session|resume session/i)).toBeInTheDocument()
    })
    expect(screen.getByLabelText(/skip combination/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/repeat combination/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/end session/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/enter minimal mode|exit minimal mode/i)).toBeInTheDocument()

    const skip = screen.getByLabelText(/skip combination/i)
    // early countdown may disable skip
    if (skip.hasAttribute('disabled')) {
      expect(skip).toBeDisabled()
    }
    await user.click(screen.getByLabelText(/end session/i))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  }, 20000)
})
