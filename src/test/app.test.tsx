import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppProvider } from '../context/AppContext'
import { HomePage } from '../pages/HomePage'
import { SessionEngine } from '../engines/sessionEngine'
import { createDefaultWorkout } from '../data/defaults'
import { createSpeechEngine } from '../engines/speechEngine'
import App from '../App'

function renderApp(route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AppProvider>
        <HomePage />
      </AppProvider>
    </MemoryRouter>,
  )
}

describe('accessibility and UI', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('home screen exposes major branded controls', () => {
    renderApp()
    expect(screen.getByRole('heading', { name: /strikecaller/i })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /start training/i }).length).toBeGreaterThan(0)
    expect(screen.getByText(/more martial arts coming soon/i)).toBeInTheDocument()
  })

  it('theme switch has accessible pressed state', async () => {
    const user = userEvent.setup()
    render(<App />)
    const light = screen.getByRole('button', { name: /light theme/i })
    await user.click(light)
    expect(light).toHaveAttribute('aria-pressed', 'true')
  })

  it('spoken calls have visible text region on home caption philosophy', () => {
    renderApp()
    expect(screen.getByText(/hear the combo/i)).toBeInTheDocument()
  })
})

describe('session engine controls', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('pause and resume update phase', async () => {
    const engine = new SessionEngine(
      createDefaultWorkout({
        mode: 'coach',
        sessionDurationSec: 30,
        roundDurationSec: 30,
        speech: {
          voiceURI: null,
          rate: 1,
          pitch: 1,
          volume: 0,
          callStyle: 'names',
          coachingCuesEnabled: false,
          countdownEnabled: false,
          roundCallsEnabled: false,
        },
        sound: {
          bellsEnabled: false,
          tonesEnabled: false,
          vibrationEnabled: false,
          masterVolume: 0,
        },
      }),
    )
    void engine.start()
    await vi.advanceTimersByTimeAsync(4000)
    engine.pause()
    expect(engine.snapshot().phase).toBe('paused')
    engine.resume()
    expect(engine.snapshot().paused).toBe(false)
    engine.clearSpeechQueue()
    engine.stop()
    expect(engine.snapshot().phase).toBe('summary')
  }, 10000)

  it('skip combo advances without throwing', async () => {
    const engine = new SessionEngine(
      createDefaultWorkout({
        mode: 'coach',
        sessionDurationSec: 20,
        sound: { bellsEnabled: false, tonesEnabled: false, vibrationEnabled: false, masterVolume: 0 },
        speech: {
          voiceURI: null,
          rate: 1,
          pitch: 1,
          volume: 0,
          callStyle: 'hybrid',
          coachingCuesEnabled: false,
          countdownEnabled: false,
          roundCallsEnabled: false,
        },
      }),
    )
    void engine.start()
    await vi.advanceTimersByTimeAsync(4000)
    void engine.skipCombo()
    await vi.advanceTimersByTimeAsync(500)
    engine.clearSpeechQueue()
    engine.stop()
    expect(engine.snapshot().phase).toBe('summary')
  }, 10000)

  it('clears speech queue when stopped', () => {
    const engine = new SessionEngine(createDefaultWorkout())
    const speech = engine.getSpeechEngine()
    const cancel = vi.spyOn(speech, 'cancel')
    engine.clearSpeechQueue()
    engine.stop()
    expect(cancel).toHaveBeenCalled()
  })
})

describe('speech engine unsupported fallback', () => {
  it('reports support honestly and resolves speak when unsupported', async () => {
    const original = window.speechSynthesis
    Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true })
    const engine = createSpeechEngine(() => ({
      voiceURI: null,
      rate: 1,
      pitch: 1,
      volume: 1,
      callStyle: 'names',
      coachingCuesEnabled: true,
      countdownEnabled: true,
      roundCallsEnabled: true,
    }))
    expect(engine.supported).toBe(false)
    await expect(engine.speak('Jab')).resolves.toBeUndefined()
    Object.defineProperty(window, 'speechSynthesis', { value: original, configurable: true })
  })
})
