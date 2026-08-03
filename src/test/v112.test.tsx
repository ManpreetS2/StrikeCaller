import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { SessionEngine } from '../engines/sessionEngine'
import { createDefaultWorkout, definedPartial, DEFAULT_SPEECH, DEFAULT_PREFERENCES } from '../data/defaults'
import { computeTrainingStats } from '../engines/statsEngine'
import { migrateDailyDrillMap, dailyDrillKey, dailyDrillCompleteMessage } from '../utils/dailyDrill'
import { buildTrainAgainPayload } from '../utils/trainAgain'
import { validateWorkoutFields, parseIntegerInput, parseNumberInput } from '../utils/workoutValidation'
import { customComboToRuntime } from '../utils/customCombo'
import { AppProvider } from '../context/AppContext'
import { DailyPage } from '../pages/DailyPage'
import { LearnPage } from '../pages/LearnPage'
import { OnboardingPage } from '../pages/OnboardingPage'
import type { Combo, CustomCombo, SessionSummary, WorkoutConfig } from '../types'

function silentSpeech(overrides: Partial<typeof DEFAULT_SPEECH> = {}) {
  return {
    ...DEFAULT_SPEECH,
    volume: 0,
    coachingCuesEnabled: false,
    countdownEnabled: false,
    roundCallsEnabled: false,
    musicFriendly: false,
    captionsEnabled: true,
    spokenCallsEnabled: true,
    ...overrides,
  }
}

function silentWorkout(partial: Partial<WorkoutConfig> = {}): WorkoutConfig {
  return createDefaultWorkout({
    mode: 'custom',
    sessionDurationSec: 900,
    roundDurationSec: 900,
    rounds: 1,
    finishWhenQueueEmpty: true,
    speech: silentSpeech(),
    sound: {
      bellsEnabled: false,
      tonesEnabled: false,
      vibrationEnabled: false,
      masterVolume: 0,
    },
    timingMultipliers: {
      ...createDefaultWorkout().timingMultipliers,
      pauseBetweenCombosMs: 20,
      pauseBeforeRepeatMs: 20,
      punch: 0.2,
    },
    resumeBehavior: 'restart-combo',
    ...partial,
  })
}

function combo(id: string, art: 'muay-thai' | 'boxing' = 'muay-thai'): Combo {
  return {
    id,
    title: `Combo ${id}`,
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
    martialArt: art,
  }
}

function queueOf(n: number, id = 'custom-1'): Combo[] {
  const c = combo(id)
  return Array.from({ length: n }, () => ({ ...c, techniques: [...c.techniques] }))
}

describe('v1.1.2 finite custom combo sessions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  async function runFinite(repeats: number) {
    const engine = new SessionEngine(silentWorkout({ repeatCount: repeats, customComboId: 'custom-1' }), {
      wakeLock: false,
    })
    const phases: string[] = []
    engine.subscribe((s) => phases.push(s.phase))
    void engine.start({ comboQueue: queueOf(repeats) })
    // countdown ~3.1s + combos
    for (let i = 0; i < 200; i++) {
      await vi.advanceTimersByTimeAsync(200)
      if (engine.snapshot().phase === 'summary') break
    }
    const summary = engine.getSummary()
    return { summary, phases, snap: engine.snapshot() }
  }

  it.each([1, 3, 20])('plays exactly %i repetitions then finishes', async (n) => {
    const { summary } = await runFinite(n)
    expect(summary.combinationsCompleted).toBe(n)
    expect(summary.queuedCombos?.length).toBe(n)
    expect(summary.workoutConfig?.finishWhenQueueEmpty).toBe(true)
  })

  it('does not start generated combinations after queue empties', async () => {
    const { summary } = await runFinite(2)
    expect(summary.combinationsCompleted).toBe(2)
    expect(summary.comboIds.every((id) => id === 'custom-1')).toBe(true)
  })

  it('does not count interrupted repetitions', async () => {
    const engine = new SessionEngine(silentWorkout({ repeatCount: 3 }), { wakeLock: false })
    void engine.start({ comboQueue: queueOf(3) })
    await vi.advanceTimersByTimeAsync(4000)
    await vi.advanceTimersByTimeAsync(300)
    const before = engine.snapshot().combinationsCompleted
    void engine.skipCombo()
    await vi.advanceTimersByTimeAsync(200)
    for (let i = 0; i < 200; i++) {
      await vi.advanceTimersByTimeAsync(200)
      if (engine.snapshot().phase === 'summary') break
    }
    const summary = engine.getSummary()
    expect(summary.combinationsCompleted).toBeLessThanOrEqual(2)
    expect(summary.combinationsCompleted).toBeGreaterThanOrEqual(before)
    engine.stop()
  }, 15000)

  it('repeat on fixed queue restarts without increasing target', async () => {
    const engine = new SessionEngine(silentWorkout({ repeatCount: 2 }), { wakeLock: false })
    void engine.start({ comboQueue: queueOf(2) })
    await vi.advanceTimersByTimeAsync(4000)
    await vi.advanceTimersByTimeAsync(200)
    void engine.repeatCombo()
    await vi.advanceTimersByTimeAsync(500)
    for (let i = 0; i < 200; i++) {
      await vi.advanceTimersByTimeAsync(200)
      if (engine.snapshot().phase === 'summary') break
    }
    const summary = engine.getSummary()
    expect(summary.queuedCombos?.length).toBe(2)
    expect(summary.combinationsCompleted).toBeLessThanOrEqual(2)
    engine.stop()
  }, 15000)
})

describe('v1.1.2 Train Again custom rebuild', () => {
  it('rebuilds queue from queuedCombos', () => {
    const q = queueOf(3, 'custom-xyz')
    const summary = {
      id: 's1',
      usedCustomCombo: true,
      martialArt: 'boxing' as const,
      mode: 'custom' as const,
      stance: 'orthodox' as const,
      pace: 'technical' as const,
      workoutConfig: createDefaultWorkout({
        mode: 'custom',
        customComboId: 'custom-xyz',
        finishWhenQueueEmpty: true,
        repeatCount: 3,
        martialArt: 'boxing',
      }),
      queuedCombos: q,
      comboSnapshots: [q[0]!],
    } as SessionSummary
    const payload = buildTrainAgainPayload(summary, [])
    expect(payload.comboQueue?.length).toBe(3)
    expect(payload.config.finishWhenQueueEmpty).toBe(true)
    expect(payload.config.customComboId).toBe('custom-xyz')
  })

  it('uses snapshot when saved combo was deleted', () => {
    const snap = combo('custom-gone', 'muay-thai')
    const summary = {
      id: 's2',
      usedCustomCombo: true,
      martialArt: 'muay-thai' as const,
      mode: 'custom' as const,
      stance: 'orthodox' as const,
      pace: 'technical' as const,
      workoutConfig: createDefaultWorkout({
        mode: 'custom',
        customComboId: 'custom-gone',
        finishWhenQueueEmpty: true,
        repeatCount: 2,
      }),
      comboSnapshots: [snap],
    } as SessionSummary
    const payload = buildTrainAgainPayload(summary, [])
    expect(payload.comboQueue?.length).toBe(2)
    expect(payload.comboQueue?.[0]?.id).toBe('custom-gone')
    expect(payload.config.finishWhenQueueEmpty).toBe(true)
  })

  it('prefers live custom combo when still saved', () => {
    const live: CustomCombo = {
      id: 'custom-live',
      title: 'Live',
      techniqueIds: ['jab', 'cross', 'hook-lead'],
      createdAt: 1,
      updatedAt: 1,
      favorite: false,
      repeatCount: 4,
      martialArt: 'boxing',
    }
    const summary = {
      id: 's3',
      usedCustomCombo: true,
      martialArt: 'boxing' as const,
      mode: 'custom' as const,
      stance: 'orthodox' as const,
      pace: 'technical' as const,
      workoutConfig: createDefaultWorkout({
        mode: 'custom',
        customComboId: 'custom-live',
        repeatCount: 4,
        finishWhenQueueEmpty: true,
        martialArt: 'boxing',
      }),
      comboSnapshots: [customComboToRuntime({ ...live, techniqueIds: ['jab', 'cross'] })],
    } as SessionSummary
    const payload = buildTrainAgainPayload(summary, [live])
    expect(payload.comboQueue?.length).toBe(4)
    expect(payload.comboQueue?.[0]?.techniques.length).toBe(3)
  })
})

describe('v1.1.2 createDefaultWorkout defined merge', () => {
  it('ignores undefined optional fields', () => {
    const base = createDefaultWorkout()
    const merged = createDefaultWorkout({
      ...definedPartial({
        includeKnees: undefined,
        defenseFrequency: undefined,
        categories: undefined,
        speech: undefined,
      }),
      mode: 'daily',
    })
    expect(merged.includeKnees).toBe(base.includeKnees)
    expect(merged.defenseFrequency).toBe(base.defenseFrequency)
    expect(merged.categories.length).toBeGreaterThan(0)
    expect(merged.speech.rate).toBe(base.speech.rate)
    expect(merged.sound.masterVolume).toBe(base.sound.masterVolume)
    expect(merged.timingMultipliers.punch).toBe(base.timingMultipliers.punch)
    expect(merged.comboLength.min).toBe(base.comboLength.min)
    expect(merged.movementFrequency).toBeDefined()
    expect(merged.repetitionFrequency).toBeDefined()
    expect(merged.includeElbows).toBeDefined()
    expect(merged.includeHeadKicks).toBeDefined()
    expect(merged.includeClinch).toBeDefined()
  })
})

describe('v1.1.2 Daily Drill map', () => {
  it('migrates legacy single record', () => {
    const map = migrateDailyDrillMap({
      dateKey: '2026-07-31',
      comboId: 'c1',
      martialArt: 'muay-thai',
      slowDone: true,
      normalDone: false,
      fightDone: false,
      completed: false,
    })
    expect(Object.keys(map)).toEqual(['2026-07-31:muay-thai'])
    expect(map['2026-07-31:muay-thai']?.slowDone).toBe(true)
  })

  it('keeps boxing and muay thai progress on same day', () => {
    const map = migrateDailyDrillMap({
      [dailyDrillKey('2026-07-31', 'muay-thai')]: {
        dateKey: dailyDrillKey('2026-07-31', 'muay-thai'),
        comboId: 'mt',
        martialArt: 'muay-thai',
        slowDone: true,
        normalDone: true,
        fightDone: true,
        completed: true,
      },
      [dailyDrillKey('2026-07-31', 'boxing')]: {
        dateKey: dailyDrillKey('2026-07-31', 'boxing'),
        comboId: 'bx',
        martialArt: 'boxing',
        slowDone: true,
        normalDone: false,
        fightDone: false,
        completed: false,
      },
    })
    expect(map['2026-07-31:muay-thai']?.completed).toBe(true)
    expect(map['2026-07-31:boxing']?.slowDone).toBe(true)
    expect(map['2026-07-31:boxing']?.normalDone).toBe(false)
  })

  it('formats human completion text without storage keys', () => {
    expect(dailyDrillCompleteMessage('boxing')).toBe('Today’s Boxing drill is complete.')
    expect(dailyDrillCompleteMessage('muay-thai')).toBe('Today’s Muay Thai drill is complete.')
    expect(dailyDrillCompleteMessage('boxing')).not.toContain(':')
  })
})

describe('v1.1.2 pause/resume phases', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('resume during rest continues rest without Fight', async () => {
    const engine = new SessionEngine(
      silentWorkout({
        mode: 'round',
        rounds: 2,
        roundDurationSec: 2,
        restDurationSec: 5,
        finishWhenQueueEmpty: false,
        speech: silentSpeech({ roundCallsEnabled: true }),
      }),
      { wakeLock: false },
    )
    const captions: string[] = []
    engine.subscribe((s) => {
      if (s.caption) captions.push(s.caption)
    })
    const speak = vi.spyOn(engine.getSpeechEngine(), 'speak')
    void engine.start({ comboQueue: [combo('a'), combo('b'), combo('c'), combo('d')] })
    // finish countdown + short work
    await vi.advanceTimersByTimeAsync(4000)
    await vi.advanceTimersByTimeAsync(2500)
    // wait until rest
    for (let i = 0; i < 40; i++) {
      await vi.advanceTimersByTimeAsync(200)
      if (engine.snapshot().phase === 'rest') break
    }
    expect(engine.snapshot().phase).toBe('rest')
    speak.mockClear()
    captions.length = 0
    engine.pause()
    expect(engine.snapshot().paused).toBe(true)
    await engine.resume()
    expect(engine.snapshot().phase).toBe('rest')
    expect(speak).not.toHaveBeenCalledWith('Fight')
    expect(captions.some((c) => c === 'Fight')).toBe(false)
    engine.stop()
  })

  it('resume during work uses countdown', async () => {
    const engine = new SessionEngine(silentWorkout({ finishWhenQueueEmpty: false, mode: 'coach' }), {
      wakeLock: false,
    })
    void engine.start({ comboQueue: [combo('a'), combo('b')] })
    await vi.advanceTimersByTimeAsync(4000)
    await vi.advanceTimersByTimeAsync(300)
    expect(engine.snapshot().phase).toBe('work')
    engine.pause()
    void engine.resume()
    await vi.advanceTimersByTimeAsync(100)
    expect(engine.snapshot().phase).toBe('countdown')
    await vi.advanceTimersByTimeAsync(4000)
    expect(['work', 'countdown']).toContain(engine.snapshot().phase)
    engine.stop()
  }, 15000)

  it('resume during countdown restarts countdown', async () => {
    const engine = new SessionEngine(silentWorkout({ finishWhenQueueEmpty: false }), { wakeLock: false })
    void engine.start({ comboQueue: [combo('a')] })
    await vi.advanceTimersByTimeAsync(500)
    expect(engine.snapshot().phase).toBe('countdown')
    engine.pause()
    void engine.resume()
    await vi.advanceTimersByTimeAsync(50)
    expect(engine.snapshot().phase).toBe('countdown')
    await vi.advanceTimersByTimeAsync(4000)
    engine.stop()
  }, 15000)
})

describe('v1.1.2 stats filters', () => {
  function summary(partial: Partial<SessionSummary>): SessionSummary {
    return {
      id: partial.id ?? 'x',
      startedAt: partial.startedAt ?? Date.now(),
      endedAt: partial.endedAt ?? Date.now(),
      martialArt: partial.martialArt ?? 'muay-thai',
      mode: partial.mode ?? 'round',
      stance: 'orthodox',
      pace: partial.pace ?? 'technical',
      customPaceMultiplier: partial.customPaceMultiplier,
      totalTrainingMs: partial.totalTrainingMs ?? 60_000,
      roundsCompleted: 1,
      combinationsCompleted: partial.combinationsCompleted ?? 1,
      techniquesCalled: 2,
      techniqueCounts: partial.techniqueCounts ?? { jab: 2 },
      techniqueCategoryCounts: partial.techniqueCategoryCounts ?? { punch: 2 },
      comboIds: partial.comboIds ?? ['gen-1'],
      comboSnapshots: partial.comboSnapshots,
      defenseActions: 0,
      movementActions: 0,
      averagePaceLabel: 'technical',
      dailyDrillCompleted: false,
      cancelled: false,
      favoriteComboIds: [],
      usedCustomCombo: false,
      ...partial,
    }
  }

  it('streaks respect sport filter', () => {
    const day = Date.now()
    const history = [
      summary({ id: 'mt', martialArt: 'muay-thai', startedAt: day }),
      summary({ id: 'bx', martialArt: 'boxing', startedAt: day - 86400000 }),
    ]
    const all = computeTrainingStats(history, { range: 'all', martialArt: 'all' })
    const boxing = computeTrainingStats(history, { range: 'all', martialArt: 'boxing' })
    expect(all.currentStreak).toBeGreaterThanOrEqual(boxing.currentStreak)
    expect(boxing.totalSessions).toBe(1)
  })

  it('counts generated boxing combos from session martial art', () => {
    const history = [
      summary({
        id: 'bx-gen',
        martialArt: 'boxing',
        comboIds: ['gen-abc', 'gen-def'],
        comboSnapshots: [
          { ...combo('gen-abc', 'boxing') },
          { ...combo('gen-def', 'boxing') },
        ],
        combinationsCompleted: 2,
      }),
    ]
    const stats = computeTrainingStats(history, { range: 'all', martialArt: 'boxing' })
    expect(stats.boxingCombos).toBe(2)
    expect(stats.muayThaiCombos).toBe(0)
  })

  it('resolves technique names and includes zero categories', () => {
    const stats = computeTrainingStats(
      [summary({ techniqueCounts: { jab: 5 }, techniqueCategoryCounts: { punch: 5 }, martialArt: 'boxing' })],
      { martialArt: 'boxing' },
    )
    expect(stats.mostCalledTechniqueName).toMatch(/jab/i)
    expect(stats.categoryDistribution.some((c) => c.category === 'defense' && c.count === 0)).toBe(true)
    expect(stats.leastTrainedCategory).toBeTruthy()
  })

  it('shows custom pace multiplier for fastest custom pace', () => {
    const stats = computeTrainingStats([
      summary({ pace: 'custom', customPaceMultiplier: 0.7, id: 'fast' }),
      summary({ pace: 'slow', id: 'slow' }),
    ])
    expect(stats.personalRecords.fastestPace).toBe('custom')
    expect(stats.personalRecords.fastestPaceMultiplier).toBe(0.7)
  })
})

describe('v1.1.2 workout validation', () => {
  it('rejects empty and NaN inputs', () => {
    expect(parseIntegerInput('')).toBeNull()
    expect(parseIntegerInput('abc')).toBeNull()
    expect(parseNumberInput('')).toBeNull()
    const errors = validateWorkoutFields({
      rounds: Number.NaN,
      roundDurationSec: 180,
      restDurationSec: 60,
      sessionDurationSec: 180,
      comboMin: 2,
      comboMax: 5,
      customPaceMultiplier: 1,
      defenseFrequency: 0.3,
      movementFrequency: 0.3,
      repetitionFrequency: 0.2,
    })
    expect(errors.some((e) => e.toLowerCase().includes('rounds'))).toBe(true)
  })

  it('rejects out-of-range values', () => {
    const errors = validateWorkoutFields({
      rounds: 99,
      roundDurationSec: 10,
      restDurationSec: 5,
      sessionDurationSec: 10,
      comboMin: 1,
      comboMax: 20,
      customPaceMultiplier: 9,
      defenseFrequency: 2,
      movementFrequency: -1,
      repetitionFrequency: 0.2,
    })
    expect(errors.length).toBeGreaterThan(3)
  })
})

describe('v1.1.2 route defaults', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem(
      'strikecaller:preferences',
      JSON.stringify({
        ...DEFAULT_PREFERENCES,
        onboardingComplete: true,
        wakeLock: false,
        customComboMigrationNoticeShown: true,
      }),
    )
  })

  function mount(path: string, state?: unknown) {
    return render(
      <AppProvider>
        <MemoryRouter initialEntries={[{ pathname: path, state }]}>
          <Routes>
            <Route path="/daily" element={<DailyPage />} />
            <Route path="/learn" element={<LearnPage />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
          </Routes>
        </MemoryRouter>
      </AppProvider>,
    )
  }

  it('direct Daily route builds with defaults', () => {
    mount('/daily')
    expect(screen.getByRole('heading', { name: /daily drill/i })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /slow practice/i }).length).toBeGreaterThan(0)
  })

  it('customized Daily seed does not wipe defaults via undefined', () => {
    const seed = createDefaultWorkout({
      mode: 'daily',
      includeKnees: undefined as unknown as boolean,
    })
    // Simulate partial seed with explicit undefined via definedPartial path
    const cleaned = createDefaultWorkout(definedPartial({ mode: 'daily', martialArt: 'boxing' }))
    expect(cleaned.defenseFrequency).toBeGreaterThanOrEqual(0)
    expect(cleaned.categories.length).toBeGreaterThan(0)
    mount('/daily', { workoutSeed: cleaned })
    expect(screen.getByText(/boxing/i)).toBeInTheDocument()
    void seed
  })

  it('direct Learn route builds with defaults', () => {
    mount('/learn')
    expect(screen.getByRole('heading', { name: /learn mode/i })).toBeInTheDocument()
  })

  it('customized Learn seed keeps defined optionals', () => {
    const seed = createDefaultWorkout({ mode: 'learn', pace: 'slow', martialArt: 'boxing' })
    mount('/learn', { workoutSeed: seed })
    expect(screen.getByRole('heading', { name: /learn mode/i })).toBeInTheDocument()
  })
})

describe('v1.1.2 onboarding', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('lists martial art as first step', () => {
    render(
      <AppProvider>
        <MemoryRouter initialEntries={['/onboarding']}>
          <Routes>
            <Route path="/onboarding" element={<OnboardingPage />} />
          </Routes>
        </MemoryRouter>
      </AppProvider>,
    )
    expect(screen.getByText(/1\. Martial art/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /muay thai/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /boxing/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /skip remaining/i })).toBeInTheDocument()
    const progress = screen.getByLabelText(/onboarding progress/i)
    expect(within(progress).getByText(/1\. Martial art/i)).toHaveAttribute('aria-current', 'step')
  })
})
