import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AppProvider } from '../context/AppContext'
import { SessionPage } from '../pages/SessionPage'
import { SessionEngine } from '../engines/sessionEngine'
import { createDefaultWorkout, DEFAULT_PREFERENCES, DEFAULT_SPEECH } from '../data/defaults'
import { generateRuleBasedCombo, getDemoCombos, nextCombo } from '../engines/comboGenerator'
import { BOXING_COMBOS } from '../data/boxing'
import { validateTechniqueSequence, MAX_COMBO_LENGTH } from '../engines/comboValidator'
import {
  importUserData,
  migrateCustomCombo,
  saveHistory,
  loadHistory,
  clearHistory,
  MAX_IMPORT_BYTES,
  validateSessionSummary,
} from '../storage/localStore'
import { computeStreaks, computeTrainingStats, filterHistory } from '../engines/statsEngine'
import { customComboToRuntime, clampRepeatCount } from '../utils/customCombo'
import { addLocalDays, localDateKey, startOfLocalDay } from '../utils/localDate'
import { resolveCombo } from '../utils/resolveCombo'
import type { Combo, CustomCombo, SessionSummary, WorkoutConfig } from '../types'

function silentWorkout(partial: Partial<WorkoutConfig> = {}): WorkoutConfig {
  return createDefaultWorkout({
    mode: 'coach',
    sessionDurationSec: 90,
    roundDurationSec: 90,
    speech: { ...DEFAULT_SPEECH, volume: 0, spokenCallsEnabled: false, countdownEnabled: false, roundCallsEnabled: false },
    sound: { bellsEnabled: false, tonesEnabled: false, vibrationEnabled: false, masterVolume: 0 },
    timingMultipliers: {
      ...createDefaultWorkout().timingMultipliers,
      pauseBetweenCombosMs: 20,
      pauseBeforeRepeatMs: 20,
    },
    ...partial,
  })
}

function jabCross(id = 'test-jc'): Combo {
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

describe('v1.1.1 session volume removal', () => {
  it('Session volume slider is absent', () => {
    const router = createMemoryRouter(
      [{ path: '/session', element: <SessionPage /> }],
      {
        initialEntries: [
          {
            pathname: '/session',
            state: { config: silentWorkout({ sessionDurationSec: 30 }) },
          },
        ],
      },
    )
    render(
      <AppProvider>
        <RouterProvider router={router} />
      </AppProvider>,
    )
    expect(screen.queryByLabelText(/session volume/i)).toBeNull()
    expect(screen.queryByRole('slider', { name: /session volume/i })).toBeNull()
  })
})

describe('v1.1.1 custom combo training', () => {
  it('converts custom combo and clamps repeats', () => {
    const custom: CustomCombo = {
      id: 'custom-1',
      title: 'My ones',
      techniqueIds: ['jab', 'cross', 'jab'],
      createdAt: 1,
      updatedAt: 1,
      favorite: false,
      repeatCount: 99,
      martialArt: 'boxing',
    }
    expect(clampRepeatCount(custom.repeatCount)).toBe(20)
    const runtime = customComboToRuntime(custom)
    expect(runtime.id).toBe('custom-1')
    expect(runtime.martialArt).toBe('boxing')
    expect(runtime.techniques).toHaveLength(3)
  })

  it('enforces eight techniques through migration', () => {
    const migrated = migrateCustomCombo({
      id: 'custom-long',
      title: 'Long',
      techniqueIds: Array.from({ length: 12 }, (_, i) => (i % 2 === 0 ? 'jab' : 'cross')),
      createdAt: 1,
      updatedAt: 1,
      favorite: false,
      repeatCount: 3,
    })
    expect(migrated?.techniqueIds).toHaveLength(8)
    expect(migrated?.migrated).toBe(true)
    expect(validateTechniqueSequence(Array(9).fill('jab')).valid).toBe(false)
    expect(MAX_COMBO_LENGTH).toBe(8)
  })
})

describe('v1.1.1 learn/daily handoff and demo isolation', () => {
  it('Learn and Daily seeds preserve customize config fields', () => {
    const seed = createDefaultWorkout({
      martialArt: 'boxing',
      stance: 'southpaw',
      difficulty: 'advanced',
      callStyle: 'numbers',
      equipment: 'heavy-bag',
      mode: 'learn',
    })
    expect(seed.martialArt).toBe('boxing')
    expect(seed.stance).toBe('southpaw')
    expect(seed.callStyle).toBe('numbers')
  })

  it('demo summary is excluded from genuine stats and does not require preference mutation', () => {
    const summary: SessionSummary = {
      id: 'demo-1',
      startedAt: Date.now(),
      endedAt: Date.now(),
      martialArt: 'boxing',
      mode: 'demo',
      stance: 'orthodox',
      pace: 'technical',
      totalTrainingMs: 60000,
      roundsCompleted: 1,
      combinationsCompleted: 3,
      techniquesCalled: 10,
      techniqueCounts: { jab: 5 },
      techniqueCategoryCounts: { punch: 10 },
      comboIds: ['bx-b01'],
      defenseActions: 0,
      movementActions: 0,
      averagePaceLabel: 'technical',
      dailyDrillCompleted: false,
      cancelled: false,
      favoriteComboIds: [],
      usedCustomCombo: false,
      isDemo: true,
      excludeFromStats: true,
    }
    expect(filterHistory([summary])).toHaveLength(0)
    expect(DEFAULT_PREFERENCES.stance).toBe('orthodox')
  })
})

describe('v1.1.1 history and stats', () => {
  beforeEach(() => {
    clearHistory()
    localStorage.clear()
  })

  it('keeps more than 200 history entries for All Time stats', () => {
    const many: SessionSummary[] = Array.from({ length: 250 }, (_, i) => ({
      id: `s-${i}`,
      startedAt: Date.now() - i * 1000,
      endedAt: Date.now() - i * 1000 + 1000,
      martialArt: 'muay-thai',
      mode: 'coach',
      stance: 'orthodox',
      pace: 'technical',
      totalTrainingMs: 1000,
      roundsCompleted: 1,
      combinationsCompleted: 1,
      techniquesCalled: 2,
      techniqueCounts: { jab: 1 },
      techniqueCategoryCounts: { punch: 1 },
      comboIds: ['beg-01'],
      defenseActions: 0,
      movementActions: 0,
      averagePaceLabel: 'technical',
      dailyDrillCompleted: false,
      cancelled: false,
      favoriteComboIds: [],
      usedCustomCombo: false,
    }))
    saveHistory(many)
    expect(loadHistory().length).toBe(250)
    expect(computeTrainingStats(loadHistory(), { range: 'all' }).totalSessions).toBe(250)
  })

  it('skip does not increment completed combos', async () => {
    vi.useFakeTimers()
    const engine = new SessionEngine(silentWorkout(), { wakeLock: false })
    const speak = vi.spyOn(engine.getSpeechEngine(), 'speak').mockResolvedValue()
    void engine.start({ comboQueue: [jabCross('a'), jabCross('b'), jabCross('c')] })
    await vi.advanceTimersByTimeAsync(4500)
    speak.mockClear()
    const before = engine.snapshot().combinationsCompleted
    expect(engine.snapshot().canSkipOrRepeat).toBe(true)
    void engine.skipCombo()
    await vi.advanceTimersByTimeAsync(50)
    expect(engine.snapshot().combinationsCompleted).toBe(before)
    engine.dispose()
    vi.useRealTimers()
  })

  it('unfinished rounds are not counted', async () => {
    vi.useFakeTimers()
    const engine = new SessionEngine(
      silentWorkout({ mode: 'round', rounds: 3, roundDurationSec: 5, restDurationSec: 1 }),
      { wakeLock: false },
    )
    vi.spyOn(engine.getSpeechEngine(), 'speak').mockResolvedValue()
    void engine.start({ comboQueue: [jabCross()] })
    await vi.advanceTimersByTimeAsync(2000)
    engine.stop()
    expect(engine.getSummary().roundsCompleted).toBe(0)
    vi.useRealTimers()
  })

  it('skip and repeat cannot escape rest countdown or pause', async () => {
    vi.useFakeTimers()
    const engine = new SessionEngine(
      silentWorkout({ mode: 'round', rounds: 2, roundDurationSec: 2, restDurationSec: 5 }),
      { wakeLock: false },
    )
    vi.spyOn(engine.getSpeechEngine(), 'speak').mockResolvedValue()
    void engine.start({ comboQueue: [jabCross('x'), jabCross('y')] })
    await vi.advanceTimersByTimeAsync(4500)
    await vi.advanceTimersByTimeAsync(2500)
    expect(engine.snapshot().phase).toBe('rest')
    void engine.skipCombo()
    expect(engine.snapshot().phase).toBe('rest')
    engine.pause()
    expect(engine.snapshot().phase).toBe('paused')
    void engine.repeatCombo()
    expect(engine.snapshot().phase).toBe('paused')
    engine.dispose()
    vi.useRealTimers()
  })

  it('uses local dates for streaks across DST-safe day steps', () => {
    const day0 = startOfLocalDay(Date.now())
    const history: SessionSummary[] = [0, 1, 2].map((offset) => ({
      id: `d-${offset}`,
      startedAt: addLocalDays(day0, -offset) + 12 * 3600_000,
      endedAt: addLocalDays(day0, -offset) + 13 * 3600_000,
      martialArt: 'muay-thai',
      mode: 'coach',
      stance: 'orthodox',
      pace: 'technical',
      totalTrainingMs: 60000,
      roundsCompleted: 1,
      combinationsCompleted: 1,
      techniquesCalled: 1,
      techniqueCounts: {},
      techniqueCategoryCounts: {},
      comboIds: ['beg-01'],
      defenseActions: 0,
      movementActions: 0,
      averagePaceLabel: 'technical',
      dailyDrillCompleted: false,
      cancelled: false,
      favoriteComboIds: [],
      usedCustomCombo: false,
    }))
    const streaks = computeStreaks(history, day0 + 12 * 3600_000)
    expect(streaks.current).toBe(3)
    expect(localDateKey(new Date(day0))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('does not rank every custom pace faster than fight', () => {
    const slowCustom: SessionSummary = {
      id: 'c1',
      startedAt: 1,
      endedAt: 2,
      martialArt: 'muay-thai',
      mode: 'coach',
      stance: 'orthodox',
      pace: 'custom',
      customPaceMultiplier: 2,
      totalTrainingMs: 1000,
      roundsCompleted: 1,
      combinationsCompleted: 1,
      techniquesCalled: 1,
      techniqueCounts: {},
      techniqueCategoryCounts: {},
      comboIds: [],
      defenseActions: 0,
      movementActions: 0,
      averagePaceLabel: 'custom',
      dailyDrillCompleted: false,
      cancelled: false,
      favoriteComboIds: [],
      usedCustomCombo: false,
    }
    const fight: SessionSummary = { ...slowCustom, id: 'f1', pace: 'fight', customPaceMultiplier: undefined }
    const stats = computeTrainingStats([slowCustom, fight])
    expect(stats.personalRecords.fastestPace).toBe('fight')
  })

  it('shows no favorite combo fallback without a favorite', () => {
    expect(resolveCombo('missing-id', { customCombos: [], history: [] })).toBeNull()
  })
})

describe('v1.1.1 JSON import', () => {
  beforeEach(() => {
    localStorage.clear()
    clearHistory()
  })

  it('rejects oversized and invalid imports without partial writes', () => {
    const huge = 'x'.repeat(MAX_IMPORT_BYTES + 10)
    expect(importUserData(huge).ok).toBe(false)

    saveHistory([])
    const historyBefore = loadHistory().length
    const bad = JSON.stringify({
      version: 99,
      preferences: { stance: 'orthodox' },
      history: [{ id: 'bad' }],
    })
    expect(importUserData(bad).ok).toBe(false)
    expect(loadHistory().length).toBe(historyBefore)
  })

  it('migrates valid older exports and preserves Muay Thai history', () => {
    const payload = {
      version: 1,
      preferences: { ...DEFAULT_PREFERENCES, onboardingComplete: true },
      favorites: [],
      customCombos: [],
      history: [
        {
          id: 'legacy-mt',
          startedAt: Date.now(),
          endedAt: Date.now(),
          mode: 'coach',
          stance: 'orthodox',
          pace: 'technical',
          totalTrainingMs: 5000,
          roundsCompleted: 1,
          combinationsCompleted: 2,
          techniquesCalled: 4,
          techniqueCounts: { jab: 2 },
          defenseActions: 0,
          movementActions: 0,
          averagePaceLabel: 'technical',
          dailyDrillCompleted: false,
          cancelled: false,
        },
      ],
      dailyDrill: null,
    }
    const result = importUserData(JSON.stringify(payload))
    expect(result.ok).toBe(true)
    const history = loadHistory()
    expect(history[0]?.martialArt).toBe('muay-thai')
    expect(history[0]?.id).toBe('legacy-mt')
  })

  it('rejects custom combos longer than eight on import', () => {
    const payload = {
      version: 2,
      customCombos: [
        {
          id: 'c-bad',
          title: 'Too long',
          techniqueIds: Array.from({ length: 9 }, () => 'jab'),
          createdAt: 1,
          updatedAt: 1,
          favorite: false,
          repeatCount: 1,
        },
      ],
    }
    expect(importUserData(JSON.stringify(payload)).ok).toBe(false)
  })
})

describe('v1.1.1 boxing generation and titles', () => {
  it('boxing generation never returns Muay Thai-only data', () => {
    for (let i = 0; i < 20; i++) {
      const combo = nextCombo({
        martialArt: 'boxing',
        difficulty: 'beginner',
        stance: 'orthodox',
        mode: 'coach',
        equipment: 'shadowboxing',
        categories: ['punch', 'defense', 'movement', 'counter'],
        defenseFrequency: 0.2,
        movementFrequency: 0.3,
        repetitionFrequency: 0.1,
        comboLength: { min: 2, max: 4 },
        includeHeadKicks: false,
        includeElbows: false,
        includeKnees: false,
        includeClinch: false,
        seed: i * 17,
      })
      expect(combo.martialArt).toBe('boxing')
      expect(combo.techniques.every((t) => !['rear-low-kick', 'lead-teep', 'curved-knee'].includes(t.techniqueId))).toBe(
        true,
      )
    }
  })

  it('generated exits respect maximum combo length', () => {
    const combo = generateRuleBasedCombo(
      {
        martialArt: 'boxing',
        difficulty: 'beginner',
        stance: 'orthodox',
        mode: 'coach',
        equipment: 'shadowboxing',
        categories: ['punch', 'movement'],
        defenseFrequency: 0,
        movementFrequency: 1,
        repetitionFrequency: 0,
        comboLength: { min: 3, max: 3 },
        includeHeadKicks: false,
        includeElbows: false,
        includeKnees: false,
        includeClinch: false,
      },
      () => 0.99,
    )
    if (combo) expect(combo.techniques.length).toBeLessThanOrEqual(3)
  })

  it('boxing demo queue remains boxing', () => {
    const demos = getDemoCombos('southpaw', 'boxing')
    expect(demos.every((c) => c.martialArt === 'boxing')).toBe(true)
    expect(demos.every((c) => !c.techniques.some((t) => t.techniqueId.includes('kick')))).toBe(true)
  })

  it('known boxing title/sequence mismatches are fixed', () => {
    const a15 = BOXING_COMBOS.find((c) => c.id === 'bx-a15')!
    const a17 = BOXING_COMBOS.find((c) => c.id === 'bx-a17')!
    const ids15 = a15.techniques.map((t) => t.techniqueId)
    const ids17 = a17.techniques.map((t) => t.techniqueId)
    expect(ids15[ids15.length - 1]).toBe('rear-uppercut')
    expect(a15.title.toLowerCase()).toContain('rear uppercut')
    expect(ids17[ids17.length - 1]).toBe('rear-hook')
    expect(a17.title.toLowerCase()).toContain('rear hook')
    expect(validateTechniqueSequence(ids15).valid).toBe(true)
    expect(validateTechniqueSequence(ids17).valid).toBe(true)
  })
})

describe('v1.1.1 train again and wake lock', () => {
  it('stores exact workout config for Train Again', () => {
    const config = silentWorkout({ martialArt: 'boxing', pace: 'fast', stance: 'southpaw' })
    const engine = new SessionEngine(config)
    const summary = engine.getSummary()
    expect(summary.workoutConfig?.martialArt).toBe('boxing')
    expect(summary.workoutConfig?.pace).toBe('fast')
    expect(summary.workoutConfig?.stance).toBe('southpaw')
  })

  it('respects wakeLock preference', async () => {
    const request = vi.fn().mockResolvedValue({ release: vi.fn() })
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request },
    })
    const engine = new SessionEngine(silentWorkout({ sessionDurationSec: 5 }), { wakeLock: false })
    void engine.start({ comboQueue: [jabCross()] })
    await Promise.resolve()
    expect(request).not.toHaveBeenCalled()
    engine.dispose()
  })
})

describe('v1.1.1 validate session migration', () => {
  it('assigns Muay Thai to legacy history without martialArt', () => {
    const summary = validateSessionSummary({
      id: 'old',
      startedAt: 1,
      mode: 'coach',
      totalTrainingMs: 10,
    })
    expect(summary?.martialArt).toBe('muay-thai')
    expect(summary?.migrated).toBe(true)
  })
})
