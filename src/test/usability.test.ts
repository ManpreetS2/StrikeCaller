import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { SessionEngine } from '../engines/sessionEngine'
import { createDefaultWorkout, DEFAULT_PREFERENCES, DEFAULT_SPEECH } from '../data/defaults'
import { getQuickStartPreset, QUICK_START_PRESETS } from '../data/quickStart'
import {
  isAudioSessionSupported,
  prepareCoachingAudioSession,
  setAudioSessionType,
  resetAudioSession,
} from '../engines/audioSession'
import { createSpeechEngine } from '../engines/speechEngine'
import { validateMusicCompatibility, validatePreferences } from '../storage/localStore'
import type { Combo, WorkoutConfig } from '../types'

function silentSpeech(overrides: Partial<typeof DEFAULT_SPEECH> = {}) {
  return {
    ...DEFAULT_SPEECH,
    volume: 0,
    coachingCuesEnabled: false,
    countdownEnabled: false,
    roundCallsEnabled: false,
    musicFriendly: false,
    ...overrides,
  }
}

function silentWorkout(partial: Partial<WorkoutConfig> = {}): WorkoutConfig {
  return createDefaultWorkout({
    mode: 'coach',
    sessionDurationSec: 90,
    roundDurationSec: 90,
    speech: silentSpeech(),
    sound: {
      bellsEnabled: false,
      tonesEnabled: false,
      vibrationEnabled: false,
      masterVolume: 0,
    },
    timingMultipliers: {
      ...createDefaultWorkout().timingMultipliers,
      pauseBetweenCombosMs: 50,
    },
    resumeBehavior: 'restart-combo',
    ...partial,
  })
}

function jabCrossCombo(id = 'test-jab-cross'): Combo {
  return {
    id,
    title: 'Test jab cross',
    difficulty: 'beginner',
    stance: 'orthodox',
    trainingModes: ['coach', 'round', 'learn', 'reaction', 'custom', 'daily', 'demo'],
    purpose: 'establish-jab',
    techniques: [{ techniqueId: 'jab' }, { techniqueId: 'cross' }],
    recommendedPace: 'technical',
    setupExplanation: 'Test setup',
    endingPosition: 'Base',
    safeExit: 'Reset',
    coachingNotes: 'Test',
    tags: [],
    equipment: ['shadowboxing', 'heavy-bag'],
  }
}

describe('deterministic pause and resume', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('pause cancels speech', async () => {
    const engine = new SessionEngine(silentWorkout())
    const cancel = vi.spyOn(engine.getSpeechEngine(), 'cancel')
    void engine.start({ comboQueue: [jabCrossCombo()] })
    await vi.advanceTimersByTimeAsync(4500)
    engine.pause()
    expect(engine.snapshot().phase).toBe('paused')
    expect(cancel).toHaveBeenCalled()
    engine.stop()
  })

  it('resume restarts current combo from the beginning', async () => {
    const engine = new SessionEngine(silentWorkout({ resumeBehavior: 'restart-combo' }))
    void engine.start({ comboQueue: [jabCrossCombo('a'), jabCrossCombo('b')] })
    await vi.advanceTimersByTimeAsync(4500)
    await vi.advanceTimersByTimeAsync(400)
    expect(engine.snapshot().currentStepIndex).toBeGreaterThanOrEqual(0)
    const comboId = engine.snapshot().currentCombo?.id
    expect(comboId).toBeTruthy()
    // Move into the combo past the first technique when possible
    await vi.advanceTimersByTimeAsync(600)
    if (engine.snapshot().currentCombo?.id === comboId && engine.snapshot().currentStepIndex === 0) {
      await vi.advanceTimersByTimeAsync(400)
    }
    const pausedComboId = engine.snapshot().currentCombo?.id
    engine.pause()
    void engine.resume()
    // Advance only through the resume countdown so the restarted combo has not finished.
    await vi.advanceTimersByTimeAsync(3200)
    expect(engine.snapshot().paused).toBe(false)
    expect(engine.snapshot().currentCombo?.id).toBe(pausedComboId)
    expect(engine.snapshot().currentStepIndex).toBe(0)
    engine.stop()
  })

  it('resume does not create duplicate combo schedules', async () => {
    const engine = new SessionEngine(silentWorkout())
    const speak = vi.spyOn(engine.getSpeechEngine(), 'speak').mockResolvedValue()
    void engine.start({ comboQueue: [jabCrossCombo('dup')] })
    await vi.advanceTimersByTimeAsync(4500)
    speak.mockClear()
    engine.pause()
    void engine.resume()
    void engine.resume()
    await vi.advanceTimersByTimeAsync(4500)
    const afterResume = speak.mock.calls.length
    expect(afterResume).toBeGreaterThan(0)
    expect(afterResume).toBeLessThanOrEqual(4)
    engine.stop()
  })

  it('supports multiple pause/resume cycles', async () => {
    const engine = new SessionEngine(silentWorkout())
    void engine.start({ comboQueue: [jabCrossCombo('c1'), jabCrossCombo('c2'), jabCrossCombo('c3')] })
    await vi.advanceTimersByTimeAsync(4500)
    for (let i = 0; i < 3; i++) {
      engine.pause()
      expect(engine.snapshot().phase).toBe('paused')
      void engine.resume()
      await vi.advanceTimersByTimeAsync(4500)
      expect(engine.snapshot().paused).toBe(false)
      await vi.advanceTimersByTimeAsync(400)
    }
    engine.stop()
    expect(engine.snapshot().phase).toBe('summary')
  })

  it('end while paused cancels audio and finishes', async () => {
    const engine = new SessionEngine(silentWorkout())
    const cancel = vi.spyOn(engine.getSpeechEngine(), 'cancel')
    void engine.start({ comboQueue: [jabCrossCombo()] })
    await vi.advanceTimersByTimeAsync(4500)
    engine.pause()
    cancel.mockClear()
    engine.stop()
    expect(cancel).toHaveBeenCalled()
    expect(engine.snapshot().phase).toBe('summary')
    expect(engine.snapshot().paused).toBe(false)
  })

  it('skip-to-next resume behavior advances combo', async () => {
    const engine = new SessionEngine(silentWorkout({ resumeBehavior: 'next-combo' }))
    void engine.start({ comboQueue: [jabCrossCombo('first'), jabCrossCombo('second')] })
    await vi.advanceTimersByTimeAsync(4500)
    expect(engine.snapshot().currentCombo?.id).toBe('first')
    engine.pause()
    void engine.resume()
    await vi.advanceTimersByTimeAsync(4500)
    expect(engine.snapshot().currentCombo?.id).toBe('second')
    engine.stop()
  })
})

describe('Quick Start presets', () => {
  it('uses saved preferences', () => {
    const prefs = {
      ...DEFAULT_PREFERENCES,
      stance: 'southpaw' as const,
      experience: 'advanced' as const,
      callStyle: 'numbers' as const,
      pace: 'fight' as const,
      resumeBehavior: 'next-combo' as const,
      speech: { ...DEFAULT_SPEECH, voiceURI: 'test-voice', callStyle: 'numbers' as const },
    }
    const config = getQuickStartPreset('quick-train').build(prefs)
    expect(config.stance).toBe('southpaw')
    expect(config.difficulty).toBe('advanced')
    expect(config.callStyle).toBe('numbers')
    expect(config.pace).toBe('fight')
    expect(config.speech.voiceURI).toBe('test-voice')
    expect(config.resumeBehavior).toBe('next-combo')
    expect(config.sessionDurationSec).toBe(300)
  })

  it('works with default preferences', () => {
    const config = getQuickStartPreset('heavy-bag').build(DEFAULT_PREFERENCES)
    expect(config.mode).toBe('round')
    expect(config.rounds).toBe(3)
    expect(config.roundDurationSec).toBe(120)
    expect(config.stance).toBe(DEFAULT_PREFERENCES.stance)
    expect(config.resumeBehavior).toBe('restart-combo')
  })

  it('exposes required Quick Start cards', () => {
    expect(QUICK_START_PRESETS.map((p) => p.title)).toEqual([
      'Quick Train',
      'Heavy Bag',
      'Shadowboxing',
      'Conditioning',
      'Daily Drill',
    ])
  })
})

describe('onboarding shape', () => {
  it('defaults leave only stance, experience, and calling style as primary setup fields', () => {
    const prefs = validatePreferences({})
    expect(prefs.stance).toBeDefined()
    expect(prefs.experience).toBeDefined()
    expect(prefs.callStyle).toBeDefined()
    expect(prefs.onboardingComplete).toBe(false)
  })
})

describe('Audio Session API paths', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'audioSession')
  })

  it('supported path sets transient session type', () => {
    const session = { type: 'auto' }
    Object.defineProperty(navigator, 'audioSession', {
      value: session,
      configurable: true,
      enumerable: true,
    })
    expect(isAudioSessionSupported()).toBe(true)
    prepareCoachingAudioSession(true)
    expect(session.type).toBe('transient')
    resetAudioSession()
    expect(session.type).toBe('auto')
  })

  it('unsupported path falls back without throwing', () => {
    Reflect.deleteProperty(navigator, 'audioSession')
    expect(isAudioSessionSupported()).toBe(false)
    expect(() => prepareCoachingAudioSession(true)).not.toThrow()
    expect(setAudioSessionType('transient')).toBe(false)
    expect(() => resetAudioSession()).not.toThrow()
  })

  it('speech engine still works without Audio Session API', async () => {
    Reflect.deleteProperty(navigator, 'audioSession')
    const engine = createSpeechEngine(() => silentSpeech({ musicFriendly: true }))
    await expect(engine.speak('Jab')).resolves.toBeUndefined()
    engine.cancel()
  })
})

describe('music compatibility storage', () => {
  it('stores a valid compatibility result', () => {
    const record = validateMusicCompatibility({
      result: 'music-lowered',
      testedAt: 1000,
      userAgent: 'test-agent',
      audioSessionSupported: true,
    })
    expect(record).toEqual({
      result: 'music-lowered',
      testedAt: 1000,
      userAgent: 'test-agent',
      audioSessionSupported: true,
    })
  })

  it('rejects malformed compatibility storage', () => {
    expect(validateMusicCompatibility(null)).toBeNull()
    expect(validateMusicCompatibility({ result: 'teleport' })).toBeNull()
    expect(validateMusicCompatibility({ result: 'music-paused', testedAt: 'now' })).toBeNull()
    expect(
      validateMusicCompatibility({
        result: 'music-continued',
        testedAt: 1,
        userAgent: 99,
      }),
    ).toBeNull()
  })

  it('preferences validation keeps malformed musicCompatibility null', () => {
    const prefs = validatePreferences({
      musicCompatibility: { result: 'nope' },
      resumeBehavior: 'restart-combo',
    })
    expect(prefs.musicCompatibility).toBeNull()
    expect(prefs.resumeBehavior).toBe('restart-combo')
    expect(prefs.speech.musicFriendly).toBe(true)
  })
})
