import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AppProvider } from '../context/AppContext'
import { appRoutes } from '../routes'
import { SessionEngine } from '../engines/sessionEngine'
import { audioEngine } from '../engines/audioEngine'
import * as primeAudio from '../utils/primeAudio'
import { primeTrainingAudio, type AudioPreparationResult } from '../utils/primeAudio'
import { DEFAULT_PREFERENCES, DEFAULT_SPEECH, createDefaultWorkout } from '../data/defaults'
import type { WorkoutConfig } from '../types'

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

function sessionConfig(partial: Partial<WorkoutConfig> = {}): WorkoutConfig {
  return createDefaultWorkout({
    mode: 'coach',
    sessionDurationSec: 45,
    roundDurationSec: 45,
    speech: {
      ...DEFAULT_SPEECH,
      volume: 0,
      spokenCallsEnabled: false,
      countdownEnabled: false,
      roundCallsEnabled: false,
      coachingCuesEnabled: false,
      captionsEnabled: true,
    },
    sound: { bellsEnabled: true, tonesEnabled: true, vibrationEnabled: false, masterVolume: 0.5 },
    ...partial,
  })
}

function renderSession(options?: { audioPrimed?: boolean; config?: WorkoutConfig }) {
  const router = createMemoryRouter(appRoutes, {
    initialEntries: [
      {
        pathname: '/session',
        state: {
          audioPrimed: options?.audioPrimed ?? false,
          config: options?.config ?? sessionConfig(),
        },
      },
    ],
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

class RunningAudioContext {
  state: AudioContextState = 'running'
  currentTime = 0
  destination = {} as AudioDestinationNode
  resume() {
    this.state = 'running'
    return Promise.resolve()
  }
  close() {
    this.state = 'closed'
    return Promise.resolve()
  }
  createOscillator() {
    return {
      type: 'sine',
      frequency: { value: 0 },
      connect() {},
      start() {},
      stop() {},
      onended: null,
    } as unknown as OscillatorNode
  }
  createGain() {
    return {
      gain: {
        value: 0,
        setValueAtTime() {},
        exponentialRampToValueAtTime() {},
      },
      connect() {},
    } as unknown as GainNode
  }
}

class ResumeRejectAudioContext {
  state: AudioContextState = 'suspended'
  currentTime = 0
  destination = {} as AudioDestinationNode
  resume() {
    return Promise.reject(new Error('resume blocked'))
  }
  close() {
    this.state = 'closed'
    return Promise.resolve()
  }
}

class ThrowingAudioContext {
  constructor() {
    throw new Error('AudioContext construction denied')
  }
}

class ResumeHangAudioContext {
  state: AudioContextState = 'suspended'
  currentTime = 0
  destination = {} as AudioDestinationNode
  resume() {
    return new Promise<void>(() => {})
  }
  close() {
    this.state = 'closed'
    return Promise.resolve()
  }
}

describe('audio startup reliability', () => {
  beforeEach(() => {
    localStorage.clear()
    seedCompletedOnboarding()
    audioEngine.resetForTests()
  })

  afterEach(() => {
    audioEngine.resetForTests()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('prepare succeeds when AudioContext is running', async () => {
    vi.stubGlobal('AudioContext', RunningAudioContext)
    vi.stubGlobal('webkitAudioContext', undefined)
    await expect(audioEngine.prepare()).resolves.toBe(true)
    expect(audioEngine.isReady()).toBe(true)
    await expect(primeTrainingAudio({ timeoutMs: 80 })).resolves.toEqual({ ok: true, timedOut: false })
  })

  it('prepare fails safely when AudioContext is unsupported', async () => {
    vi.stubGlobal('AudioContext', undefined)
    vi.stubGlobal('webkitAudioContext', undefined)
    await expect(audioEngine.prepare()).resolves.toBe(false)
    expect(audioEngine.isReady()).toBe(false)
    await expect(primeTrainingAudio({ timeoutMs: 80 })).resolves.toEqual({ ok: false, timedOut: false })
  })

  it('prepare fails safely when AudioContext constructor throws', async () => {
    const tracker = trackUnhandled()
    vi.stubGlobal('AudioContext', ThrowingAudioContext)
    vi.stubGlobal('webkitAudioContext', undefined)
    await expect(audioEngine.prepare()).resolves.toBe(false)
    expect(audioEngine.isReady()).toBe(false)
    await expect(primeTrainingAudio({ timeoutMs: 80 })).resolves.toEqual({ ok: false, timedOut: false })
    expect(tracker.reasons).toEqual([])
    tracker.stop()
  })

  it('prepare fails safely when resume() rejects', async () => {
    const tracker = trackUnhandled()
    vi.stubGlobal('AudioContext', ResumeRejectAudioContext)
    vi.stubGlobal('webkitAudioContext', undefined)
    await expect(audioEngine.prepare()).resolves.toBe(false)
    expect(audioEngine.isReady()).toBe(false)
    await expect(primeTrainingAudio({ timeoutMs: 80 })).resolves.toEqual({ ok: false, timedOut: false })
    expect(tracker.reasons).toEqual([])
    tracker.stop()
  })

  it('primeTrainingAudio resolves false when lower-level prepare rejects', async () => {
    const tracker = trackUnhandled()
    vi.spyOn(audioEngine, 'prepare').mockRejectedValue(new Error('prepare exploded'))
    await expect(primeTrainingAudio({ timeoutMs: 80 })).resolves.toEqual({ ok: false, timedOut: false })
    expect(tracker.reasons).toEqual([])
    tracker.stop()
  })

  it('SessionPage clears preparing and starts after audio is unsupported', async () => {
    vi.stubGlobal('AudioContext', undefined)
    vi.stubGlobal('webkitAudioContext', undefined)
    const startSpy = vi.spyOn(SessionEngine.prototype, 'start')
    renderSession({ audioPrimed: false })
    await waitFor(() => {
      expect(screen.getByRole('toolbar', { name: /session controls/i })).toBeInTheDocument()
    })
    expect(screen.queryByText(/preparing audio/i)).toBeNull()
    expect(screen.getByText(/audio unavailable — workout will continue with visual cues/i)).toBeInTheDocument()
    expect(startSpy).toHaveBeenCalledTimes(1)
    expect(audioEngine.isReady()).toBe(false)
  })

  it('SessionPage starts when AudioContext constructor throws', async () => {
    vi.stubGlobal('AudioContext', ThrowingAudioContext)
    vi.stubGlobal('webkitAudioContext', undefined)
    const startSpy = vi.spyOn(SessionEngine.prototype, 'start')
    renderSession({ audioPrimed: false })
    await waitFor(() => {
      expect(screen.getByRole('toolbar', { name: /session controls/i })).toBeInTheDocument()
    })
    expect(screen.queryByText(/preparing audio/i)).toBeNull()
    expect(startSpy).toHaveBeenCalledTimes(1)
    expect(audioEngine.isReady()).toBe(false)
  })

  it('SessionPage starts when resume() rejects without an unhandled rejection', async () => {
    const tracker = trackUnhandled()
    vi.stubGlobal('AudioContext', ResumeRejectAudioContext)
    vi.stubGlobal('webkitAudioContext', undefined)
    const startSpy = vi.spyOn(SessionEngine.prototype, 'start')
    renderSession({ audioPrimed: false })
    await waitFor(() => {
      expect(screen.getByRole('toolbar', { name: /session controls/i })).toBeInTheDocument()
    })
    expect(screen.queryByText(/preparing audio/i)).toBeNull()
    expect(startSpy).toHaveBeenCalledTimes(1)
    expect(audioEngine.isReady()).toBe(false)
    expect(tracker.reasons).toEqual([])
    tracker.stop()
  })

  it('SessionPage catches unexpected primeTrainingAudio rejection and still starts once', async () => {
    const tracker = trackUnhandled()
    vi.spyOn(primeAudio, 'primeTrainingAudio').mockRejectedValue(new Error('prime exploded'))
    const startSpy = vi.spyOn(SessionEngine.prototype, 'start')
    renderSession({ audioPrimed: false })
    await waitFor(() => {
      expect(screen.getByRole('toolbar', { name: /session controls/i })).toBeInTheDocument()
    })
    expect(screen.queryByText(/preparing audio/i)).toBeNull()
    expect(startSpy).toHaveBeenCalledTimes(1)
    expect(tracker.reasons).toEqual([])
    tracker.stop()
  })

  it('successful prime does not show the audio-unavailable status', async () => {
    vi.spyOn(primeAudio, 'primeTrainingAudio').mockResolvedValue({ ok: true, timedOut: false })
    const startSpy = vi.spyOn(SessionEngine.prototype, 'start')
    renderSession({ audioPrimed: false, config: sessionConfig() })
    await waitFor(() => {
      expect(screen.getByRole('toolbar', { name: /session controls/i })).toBeInTheDocument()
    })
    expect(screen.queryByText(/audio unavailable/i)).toBeNull()
    expect(startSpy).toHaveBeenCalledTimes(1)
  })

  it('does not mark audio primed on Home when preparation fails', async () => {
    vi.spyOn(primeAudio, 'primeTrainingAudio').mockResolvedValue({ ok: false, timedOut: false })
    const user = userEvent.setup()
    const router = createMemoryRouter(appRoutes, { initialEntries: ['/'] })
    render(
      <AppProvider>
        <RouterProvider router={router} />
      </AppProvider>,
    )
    await user.click(screen.getAllByRole('button', { name: /quick train/i })[0]!)
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/session')
    })
    expect(router.state.location.state).toMatchObject({ audioPrimed: false })
  })

  it('unmount during pending preparation does not start or leak rejections', async () => {
    const tracker = trackUnhandled()
    let release!: (value: AudioPreparationResult) => void
    vi.spyOn(primeAudio, 'primeTrainingAudio').mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    const startSpy = vi.spyOn(SessionEngine.prototype, 'start')
    const { unmount } = renderSession({ audioPrimed: false })
    expect(screen.getByText(/preparing audio/i)).toBeInTheDocument()
    unmount()
    await act(async () => {
      release({ ok: false, timedOut: false })
      await Promise.resolve()
    })
    expect(startSpy).not.toHaveBeenCalled()
    expect(tracker.reasons).toEqual([])
    tracker.stop()
  })

  it('double tap Start during preparation starts the session only once', async () => {
    let invocations = 0
    let releaseHome!: (value: AudioPreparationResult) => void
    vi.spyOn(primeAudio, 'primeTrainingAudio').mockImplementation(() => {
      invocations += 1
      if (invocations === 1) {
        return new Promise((resolve) => {
          releaseHome = resolve
        })
      }
      return Promise.resolve({ ok: false, timedOut: false })
    })
    const startSpy = vi.spyOn(SessionEngine.prototype, 'start')
    const user = userEvent.setup()
    const router = createMemoryRouter(appRoutes, { initialEntries: ['/'] })
    render(
      <AppProvider>
        <RouterProvider router={router} />
      </AppProvider>,
    )
    const start = screen.getAllByRole('button', { name: /quick train/i })[0]!
    await user.click(start)
    await user.click(start)
    expect(invocations).toBe(1)
    await act(async () => {
      releaseHome({ ok: false, timedOut: false })
    })
    await waitFor(() => {
      expect(screen.getByRole('toolbar', { name: /session controls/i })).toBeInTheDocument()
    })
    expect(startSpy).toHaveBeenCalledTimes(1)
  })

  it('captions remain visible when audio preparation fails', async () => {
    vi.spyOn(primeAudio, 'primeTrainingAudio').mockResolvedValue({ ok: false, timedOut: false })
    renderSession({
      audioPrimed: false,
      config: sessionConfig({
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
      }),
    })
    await waitFor(() => {
      expect(screen.getByText(/current call/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/get ready/i)).toBeInTheDocument()
    expect(screen.queryByText(/audio unavailable/i)).toBeNull()
  })

  it('prepare gives up when AudioContext.resume never settles', async () => {
    vi.stubGlobal('AudioContext', ResumeHangAudioContext)
    vi.stubGlobal('webkitAudioContext', undefined)
    const started = Date.now()
    await expect(audioEngine.prepare()).resolves.toBe(false)
    expect(Date.now() - started).toBeLessThan(2000)
    expect(audioEngine.isReady()).toBe(false)
  })

  it('session resume unpauses even if audio prepare never settles', async () => {
    vi.spyOn(audioEngine, 'prepare').mockReturnValue(new Promise(() => {}))
    const engine = new SessionEngine(
      sessionConfig({
        sound: { bellsEnabled: false, tonesEnabled: false, vibrationEnabled: false, masterVolume: 0 },
      }),
      { wakeLock: false },
    )
    void engine.start()
    await waitFor(() => {
      expect(['countdown', 'work', 'paused']).toContain(engine.snapshot().phase)
    })
    engine.pause()
    expect(engine.snapshot().paused).toBe(true)
    void engine.resume()
    await waitFor(() => {
      expect(engine.snapshot().paused).toBe(false)
    })
    engine.dispose()
  })
})
