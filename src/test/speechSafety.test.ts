import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { SessionEngine } from '../engines/sessionEngine'
import { createSpeechEngine } from '../engines/speechEngine'
import { createDefaultWorkout, DEFAULT_SPEECH } from '../data/defaults'
import type { Combo, SpeechSettings, WorkoutConfig } from '../types'

function spokenSpeech(overrides: Partial<SpeechSettings> = {}): SpeechSettings {
  return {
    ...DEFAULT_SPEECH,
    volume: 1,
    spokenCallsEnabled: true,
    countdownEnabled: false,
    roundCallsEnabled: false,
    coachingCuesEnabled: false,
    captionsEnabled: true,
    musicFriendly: false,
    ...overrides,
  }
}

function spokenWorkout(partial: Partial<WorkoutConfig> = {}): WorkoutConfig {
  return createDefaultWorkout({
    mode: 'coach',
    sessionDurationSec: 90,
    roundDurationSec: 90,
    callStyle: 'names',
    speech: spokenSpeech(),
    sound: { bellsEnabled: false, tonesEnabled: false, vibrationEnabled: false, masterVolume: 0 },
    timingMultipliers: {
      ...createDefaultWorkout().timingMultipliers,
      pauseBetweenCombosMs: 40,
      pauseBeforeRepeatMs: 40,
    },
    ...partial,
  })
}

function jabCross(id = 'speech-jc'): Combo {
  return {
    id,
    title: 'Jab cross',
    difficulty: 'beginner',
    stance: 'orthodox',
    trainingModes: ['coach', 'round', 'custom', 'learn', 'daily', 'demo', 'reaction'],
    purpose: 'establish-jab',
    techniques: [{ techniqueId: 'jab' }, { techniqueId: 'cross' }],
    recommendedPace: 'technical',
    setupExplanation: 't',
    endingPosition: 'base',
    safeExit: 'reset',
    coachingNotes: 'n',
    tags: [],
    equipment: ['shadowboxing'],
    martialArt: 'muay-thai',
  }
}

type Pending = {
  utterance: SpeechSynthesisUtterance
  fireEnd: () => void
  fireError: (error: string) => void
}

function installFakeSpeech(options?: { speakThrows?: boolean; cancelThrows?: boolean }) {
  const pending: Pending[] = []

  class FakeUtterance {
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

  const synth = {
    pending: false,
    speaking: false,
    paused: false,
    onvoiceschanged: null,
    getVoices: () => [] as SpeechSynthesisVoice[],
    pause: vi.fn(),
    resume: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    speak(u: SpeechSynthesisUtterance) {
      if (options?.speakThrows) throw new Error('speak denied')
      synth.speaking = true
      pending.push({
        utterance: u,
        fireEnd() {
          synth.speaking = false
          u.onend?.(new Event('end') as SpeechSynthesisEvent)
        },
        fireError(error: string) {
          synth.speaking = false
          const event = new Event('error') as SpeechSynthesisErrorEvent
          Object.defineProperty(event, 'error', { value: error })
          u.onerror?.(event)
        },
      })
    },
    cancel() {
      if (options?.cancelThrows) throw new Error('cancel denied')
      const current = pending.splice(0, pending.length)
      for (const item of current) item.fireError('canceled')
    },
  }

  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
  Object.defineProperty(window, 'speechSynthesis', {
    value: synth,
    configurable: true,
    writable: true,
  })
  return { pending, synth }
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

const originalSpeechDescriptor = Object.getOwnPropertyDescriptor(window, 'speechSynthesis')

describe('speech synthesis safety', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    if (originalSpeechDescriptor) {
      Object.defineProperty(window, 'speechSynthesis', originalSpeechDescriptor)
    } else {
      Reflect.deleteProperty(window, 'speechSynthesis')
    }
  })

  it('resolves a successful utterance', async () => {
    const { pending } = installFakeSpeech()
    const speech = createSpeechEngine(() => spokenSpeech())
    const done = speech.speak('Jab')
    expect(pending).toHaveLength(1)
    pending[0]!.fireEnd()
    await expect(done).resolves.toBeUndefined()
  })

  it('resolves when speechSynthesis is unsupported', async () => {
    vi.stubGlobal('SpeechSynthesisUtterance', class {})
    Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true })
    const speech = createSpeechEngine(() => spokenSpeech())
    expect(speech.supported).toBe(false)
    await expect(speech.speak('Jab')).resolves.toBeUndefined()
  })

  it('resolves when SpeechSynthesisUtterance is unsupported', async () => {
    installFakeSpeech()
    vi.stubGlobal('SpeechSynthesisUtterance', undefined)
    Reflect.deleteProperty(window, 'SpeechSynthesisUtterance')
    const speech = createSpeechEngine(() => spokenSpeech())
    expect(speech.supported).toBe(false)
    await expect(speech.speak('Jab')).resolves.toBeUndefined()
  })

  it('resolves when speechSynthesis.speak throws', async () => {
    const tracker = trackUnhandled()
    installFakeSpeech({ speakThrows: true })
    const speech = createSpeechEngine(() => spokenSpeech())
    await expect(speech.speak('Jab')).resolves.toBeUndefined()
    expect(tracker.reasons).toEqual([])
    tracker.stop()
  })

  it('resolves non-cancelled utterance errors', async () => {
    const tracker = trackUnhandled()
    const { pending } = installFakeSpeech()
    const speech = createSpeechEngine(() => spokenSpeech())
    const done = speech.speak('Jab')
    pending[0]!.fireError('synthesis-failed')
    await expect(done).resolves.toBeUndefined()
    expect(tracker.reasons).toEqual([])
    tracker.stop()
  })

  it('treats canceled and interrupted errors as success', async () => {
    const { pending } = installFakeSpeech()
    const speech = createSpeechEngine(() => spokenSpeech())
    const canceled = speech.speak('Jab')
    pending[0]!.fireError('canceled')
    await expect(canceled).resolves.toBeUndefined()

    const interrupted = speech.speak('Cross')
    pending.at(-1)!.fireError('interrupted')
    await expect(interrupted).resolves.toBeUndefined()
  })

  it('explicit cancel while speaking settles the Promise', async () => {
    const { pending } = installFakeSpeech()
    const speech = createSpeechEngine(() => spokenSpeech())
    const done = speech.speak('Jab')
    expect(pending).toHaveLength(1)
    speech.cancel()
    await expect(done).resolves.toBeUndefined()
  })

  it('cancel() throwing does not crash SpeechEngine', () => {
    installFakeSpeech({ cancelThrows: true })
    const speech = createSpeechEngine(() => spokenSpeech())
    expect(() => speech.cancel()).not.toThrow()
  })

  it('rapid calls cancel the previous utterance without a rejection storm', async () => {
    const tracker = trackUnhandled()
    const { pending } = installFakeSpeech()
    const speech = createSpeechEngine(() => spokenSpeech())
    const first = speech.speak('Jab')
    const second = speech.speak('Cross')
    expect(pending).toHaveLength(1)
    expect(pending[0]!.utterance.text).toBe('Cross')
    pending[0]!.fireEnd()
    await expect(first).resolves.toBeUndefined()
    await expect(second).resolves.toBeUndefined()
    expect(tracker.reasons).toEqual([])
    tracker.stop()
  })

  it('late onerror after a newer utterance is harmless', async () => {
    const tracker = trackUnhandled()
    const { pending } = installFakeSpeech()
    const speech = createSpeechEngine(() => spokenSpeech())
    const first = speech.speak('Jab')
    const firstUtterance = pending[0]!.utterance
    const second = speech.speak('Cross')
    const event = new Event('error') as SpeechSynthesisErrorEvent
    Object.defineProperty(event, 'error', { value: 'audio-busy' })
    firstUtterance.onerror?.(event)
    pending[0]!.fireEnd()
    await expect(first).resolves.toBeUndefined()
    await expect(second).resolves.toBeUndefined()
    expect(tracker.reasons).toEqual([])
    tracker.stop()
  })

  it('music-friendly mode still settles on synthesis error', async () => {
    const { pending } = installFakeSpeech()
    const speech = createSpeechEngine(() => spokenSpeech({ musicFriendly: true }))
    const done = speech.speak('Jab')
    pending[0]!.fireError('not-allowed')
    await expect(done).resolves.toBeUndefined()
  })

  it('combo speech error does not stop the workout or captions', async () => {
    const tracker = trackUnhandled()
    const { pending } = installFakeSpeech()
    const engine = new SessionEngine(
      spokenWorkout({
        finishWhenQueueEmpty: true,
        speech: spokenSpeech({ musicFriendly: true }),
      }),
      { wakeLock: false },
    )
    void engine.start({ comboQueue: [jabCross()] })
    await vi.advanceTimersByTimeAsync(3200)
    expect(engine.snapshot().phase).toBe('work')
    expect(engine.snapshot().caption).toBe('Jab')
    pending.at(-1)?.fireError('synthesis-failed')
    await Promise.resolve()
    expect(engine.snapshot().paused).toBe(false)
    expect(engine.snapshot().phase).toBe('work')
    await vi.advanceTimersByTimeAsync(800)
    expect(engine.snapshot().caption).toBe('Cross')
    expect(engine.snapshot().techniquesCalled).toBeGreaterThan(1)
    expect(tracker.reasons).toEqual([])
    tracker.stop()
    engine.dispose()
  })

  it('countdown speech error does not gate countdown completion', async () => {
    const tracker = trackUnhandled()
    const { pending } = installFakeSpeech()
    const engine = new SessionEngine(spokenWorkout({ speech: spokenSpeech({ countdownEnabled: true }) }), {
      wakeLock: false,
    })
    void engine.start({ comboQueue: [jabCross()] })
    await vi.advanceTimersByTimeAsync(10)
    expect(engine.snapshot().phase).toBe('countdown')
    expect(engine.snapshot().caption).toBe('3')
    pending[0]?.fireError('audio-hardware')
    await vi.advanceTimersByTimeAsync(900)
    expect(engine.snapshot().caption).toBe('2')
    expect(engine.snapshot().phase).toBe('countdown')
    await vi.advanceTimersByTimeAsync(2500)
    expect(engine.snapshot().phase).toBe('work')
    expect(tracker.reasons).toEqual([])
    tracker.stop()
    engine.dispose()
  })

  it('round-call speech error does not stop round transitions', async () => {
    const tracker = trackUnhandled()
    const { pending } = installFakeSpeech()
    const engine = new SessionEngine(
      spokenWorkout({
        mode: 'round',
        rounds: 2,
        roundDurationSec: 2,
        restDurationSec: 2,
        speech: spokenSpeech({ roundCallsEnabled: true }),
      }),
      { wakeLock: false },
    )
    void engine.start({ comboQueue: [jabCross('a'), jabCross('b'), jabCross('c')] })
    await vi.advanceTimersByTimeAsync(2700)
    expect(engine.snapshot().caption).toBe('Fight')
    const fight = pending.find((p) => p.utterance.text === 'Fight')
    fight?.fireError('network')
    await vi.advanceTimersByTimeAsync(500)
    expect(engine.snapshot().phase).toBe('work')
    await vi.advanceTimersByTimeAsync(2500)
    expect(engine.snapshot().phase).toBe('rest')
    const rest = pending.find((p) => p.utterance.text === 'Rest')
    rest?.fireError('synthesis-unavailable')
    expect(engine.snapshot().phase).toBe('rest')
    expect(engine.snapshot().caption).toBe('Rest')
    expect(tracker.reasons).toEqual([])
    tracker.stop()
    engine.dispose()
  })

  it('speech error with coachingCuesEnabled still continues the session', async () => {
    const { pending } = installFakeSpeech()
    const engine = new SessionEngine(
      spokenWorkout({ speech: spokenSpeech({ coachingCuesEnabled: true }) }),
      { wakeLock: false },
    )
    void engine.start({ comboQueue: [jabCross()] })
    await vi.advanceTimersByTimeAsync(3200)
    pending.at(-1)?.fireError('voice-unavailable')
    await vi.advanceTimersByTimeAsync(800)
    expect(engine.snapshot().phase).toBe('work')
    expect(engine.snapshot().techniquesCalled).toBeGreaterThan(1)
    engine.dispose()
  })

  it('skip after a speech error does not leak unhandled rejection', async () => {
    const tracker = trackUnhandled()
    const { pending } = installFakeSpeech()
    const engine = new SessionEngine(spokenWorkout(), { wakeLock: false })
    void engine.start({ comboQueue: [jabCross('a'), jabCross('b')] })
    await vi.advanceTimersByTimeAsync(3200)
    const uttered = pending.at(-1)!.utterance
    void engine.skipCombo()
    await vi.advanceTimersByTimeAsync(50)
    const event = new Event('error') as SpeechSynthesisErrorEvent
    Object.defineProperty(event, 'error', { value: 'audio-busy' })
    uttered.onerror?.(event)
    expect(engine.snapshot().phase).toBe('work')
    expect(tracker.reasons).toEqual([])
    tracker.stop()
    engine.dispose()
  })

  it('dispose during active speech cancels safely', async () => {
    const tracker = trackUnhandled()
    const { pending } = installFakeSpeech()
    const engine = new SessionEngine(spokenWorkout({ speech: spokenSpeech({ countdownEnabled: true }) }), {
      wakeLock: false,
    })
    void engine.start({ comboQueue: [jabCross()] })
    await vi.advanceTimersByTimeAsync(10)
    expect(pending.length).toBeGreaterThan(0)
    const uttered = pending[0]!.utterance
    engine.dispose()
    const event = new Event('error') as SpeechSynthesisErrorEvent
    Object.defineProperty(event, 'error', { value: 'canceled' })
    uttered.onerror?.(event)
    expect(engine.snapshot().phase).not.toBe('work')
    expect(tracker.reasons).toEqual([])
    tracker.stop()
  })

  it('SessionEngine swallows a rejecting speak() without stopping timers', async () => {
    const tracker = trackUnhandled()
    installFakeSpeech()
    const engine = new SessionEngine(spokenWorkout({ speech: spokenSpeech({ countdownEnabled: true }) }), {
      wakeLock: false,
    })
    vi.spyOn(engine.getSpeechEngine(), 'speak').mockRejectedValue(new Error('synthesis-failed'))
    void engine.start({ comboQueue: [jabCross()] })
    await vi.advanceTimersByTimeAsync(10)
    await Promise.resolve()
    expect(engine.snapshot().phase).toBe('countdown')
    await vi.advanceTimersByTimeAsync(3200)
    expect(engine.snapshot().phase).toBe('work')
    expect(engine.snapshot().caption.length).toBeGreaterThan(0)
    expect(tracker.reasons).toEqual([])
    tracker.stop()
    engine.dispose()
  })

  it('cancel() throwing does not crash SessionEngine pause', async () => {
    installFakeSpeech({ cancelThrows: true })
    const engine = new SessionEngine(spokenWorkout(), { wakeLock: false })
    void engine.start({ comboQueue: [jabCross()] })
    await vi.advanceTimersByTimeAsync(3200)
    expect(() => engine.pause()).not.toThrow()
    expect(engine.snapshot().phase).toBe('paused')
    engine.dispose()
  })

  it('unsupported speech still runs captions and combo progression', async () => {
    Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true })
    vi.stubGlobal('SpeechSynthesisUtterance', undefined)
    const engine = new SessionEngine(spokenWorkout({ finishWhenQueueEmpty: true }), { wakeLock: false })
    expect(engine.snapshot().speechSupported).toBe(false)
    void engine.start({ comboQueue: [jabCross()] })
    await vi.advanceTimersByTimeAsync(3200)
    expect(engine.snapshot().phase).toBe('work')
    expect(engine.snapshot().caption).toBe('Jab')
    await vi.advanceTimersByTimeAsync(800)
    expect(engine.snapshot().caption).toBe('Cross')
    engine.dispose()
  })
})
