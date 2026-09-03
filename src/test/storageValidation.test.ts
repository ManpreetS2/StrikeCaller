import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { createDefaultWorkout, DEFAULT_PREFERENCES, DEFAULT_SPEECH } from '../data/defaults'
import { getCombo } from '../data/combos'
import { SessionEngine } from '../engines/sessionEngine'
import { computeTrainingStats } from '../engines/statsEngine'
import {
  loadCustomCombos,
  loadDailyDrillMap,
  loadFavorites,
  loadPreferences,
  migrateCustomCombo,
  saveCustomCombos,
  saveDailyDrillMap,
  saveFavorites,
  savePreferences,
  validateMusicCompatibility,
  validatePreferences,
} from '../storage/localStore'
import {
  copyCountMap,
  validateCombo,
  validateSessionSummary,
  validateWorkoutConfig,
} from '../storage/sessionValidation'
import { exportUserData, importUserData } from '../storage/userData'
import { transactSessions } from '../storage/idb'
import { clearHistory, loadHistory, saveSession } from '../storage/historyStore'
import { migrateDailyDrillMap } from '../utils/dailyDrill'
import type { CustomCombo, DailyDrillState, SessionSummary, UserPreferences } from '../types'

function validSession(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const startedAt = typeof extra.startedAt === 'number' ? extra.startedAt : 1_700_000_000_000
  const endedAt = typeof extra.endedAt === 'number' ? extra.endedAt : startedAt + 60_000
  return {
    id,
    startedAt,
    endedAt,
    martialArt: 'muay-thai',
    mode: 'coach',
    stance: 'orthodox',
    pace: 'technical',
    totalTrainingMs: 60_000,
    roundsCompleted: 1,
    combinationsCompleted: 4,
    techniquesCalled: 8,
    techniqueCounts: { jab: 4 },
    techniqueCategoryCounts: { punch: 8 },
    comboIds: ['beg-01'],
    defenseActions: 0,
    movementActions: 0,
    averagePaceLabel: 'technical',
    dailyDrillCompleted: false,
    cancelled: false,
    favoriteComboIds: [],
    usedCustomCombo: false,
    ...extra,
    ...(typeof extra.startedAt === 'number' || typeof extra.endedAt === 'number'
      ? {
          startedAt: extra.startedAt ?? startedAt,
          endedAt: extra.endedAt ?? endedAt,
        }
      : {}),
  }
}

function validCombo(id = 'beg-01') {
  return {
    id,
    title: 'Jab cross',
    difficulty: 'beginner' as const,
    stance: 'orthodox' as const,
    trainingModes: ['coach' as const],
    purpose: 'establish-jab' as const,
    techniques: [{ techniqueId: 'jab' }, { techniqueId: 'cross' }],
    recommendedPace: 'technical' as const,
    setupExplanation: 't',
    endingPosition: 'base',
    safeExit: 'reset',
    coachingNotes: 'n',
    tags: [],
    equipment: ['shadowboxing' as const],
    martialArt: 'muay-thai' as const,
  }
}

async function putRawSession(value: unknown) {
  await transactSessions('readwrite', (store) => {
    store.put(value)
  })
}

async function rawSessionIds(): Promise<string[]> {
  let rows: unknown[] = []
  await transactSessions('readonly', (store) => {
    const request = store.getAll()
    request.onsuccess = () => {
      rows = request.result as unknown[]
    }
  })
  return rows
    .map((row) => {
      if (!row || typeof row !== 'object' || !('id' in row)) return null
      return typeof row.id === 'string' ? row.id : null
    })
    .filter((id): id is string => id != null)
}

function dailyState(
  dateKey: string,
  comboId: string,
  extra: Partial<DailyDrillState> = {},
): DailyDrillState {
  return {
    dateKey,
    comboId,
    martialArt: 'muay-thai',
    slowDone: false,
    normalDone: false,
    fightDone: false,
    completed: false,
    ...extra,
  }
}

function customCombo(id: string, extra: Record<string, unknown> = {}): CustomCombo {
  return {
    id,
    title: `Combo ${id}`,
    techniqueIds: ['jab', 'cross'],
    createdAt: 1,
    updatedAt: 2,
    favorite: false,
    repeatCount: 1,
    martialArt: 'muay-thai',
    ...extra,
  } as CustomCombo
}

describe('P1 #7 preferences validation', () => {
  it('preserves valid preferences', () => {
    const prefs = validatePreferences({
      ...DEFAULT_PREFERENCES,
      theme: 'light',
      stance: 'southpaw',
      customPaceMultiplier: 1.2,
      largeText: true,
    })
    expect(prefs.theme).toBe('light')
    expect(prefs.stance).toBe('southpaw')
    expect(prefs.customPaceMultiplier).toBe(1.2)
    expect(prefs.largeText).toBe(true)
  })

  it('defaults bad sound values instead of spreading them', () => {
    const prefs = validatePreferences({
      sound: { bellsEnabled: 'yes', masterVolume: 9, extra: 1 },
    })
    expect(prefs.sound.bellsEnabled).toBe(DEFAULT_PREFERENCES.sound.bellsEnabled)
    expect(prefs.sound.masterVolume).toBe(DEFAULT_PREFERENCES.sound.masterVolume)
    expect('extra' in prefs.sound).toBe(false)
  })

  it('defaults out-of-range timing multipliers', () => {
    const prefs = validatePreferences({
      timingMultipliers: { punch: 99, pauseBetweenCombosMs: -5 },
    })
    expect(prefs.timingMultipliers.punch).toBe(DEFAULT_PREFERENCES.timingMultipliers.punch)
    expect(prefs.timingMultipliers.pauseBetweenCombosMs).toBe(
      DEFAULT_PREFERENCES.timingMultipliers.pauseBetweenCombosMs,
    )
  })

  it('blocks NaN, Infinity, and out-of-range custom pace', () => {
    expect(validatePreferences({ customPaceMultiplier: Number.NaN }).customPaceMultiplier).toBe(1)
    expect(validatePreferences({ customPaceMultiplier: Number.POSITIVE_INFINITY }).customPaceMultiplier).toBe(1)
    expect(validatePreferences({ customPaceMultiplier: 0 }).customPaceMultiplier).toBe(1)
    expect(validatePreferences({ customPaceMultiplier: 9 }).customPaceMultiplier).toBe(1)
    expect(validatePreferences({ customPaceMultiplier: 0.8 }).customPaceMultiplier).toBe(0.8)
  })

  it('does not treat the string "false" as boolean true', () => {
    const prefs = validatePreferences({
      largeText: 'false',
      onboardingComplete: 'false',
      wakeLock: 'false',
      includeDefense: 'false',
    })
    expect(prefs.largeText).toBe(false)
    expect(prefs.onboardingComplete).toBe(false)
    expect(prefs.wakeLock).toBe(true)
    expect(prefs.includeDefense).toBe(true)
  })
})

describe('P1 #7 session summary validation', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects unknown mode and pace instead of casting them', () => {
    expect(validateSessionSummary(validSession('s1', { mode: 'laser-tag' }))).toBeNull()
    expect(validateSessionSummary(validSession('s1', { pace: 'ludicrous' }))).toBeNull()
  })

  it('rejects string "false" for session booleans instead of coercing it to true', () => {
    expect(validateSessionSummary(validSession('s1', { cancelled: 'false' }))).toBeNull()
    expect(validateSessionSummary(validSession('s1', { dailyDrillCompleted: 'false' }))).toBeNull()
    expect(validateSessionSummary(validSession('s1', { cancelled: false }))?.cancelled).toBe(false)
  })

  it('rejects bad timestamps', () => {
    expect(validateSessionSummary(validSession('s1', { startedAt: Number.NaN }))).toBeNull()
    expect(validateSessionSummary(validSession('s1', { startedAt: -1 }))).toBeNull()
    expect(validateSessionSummary(validSession('s1', { endedAt: Number.POSITIVE_INFINITY }))).toBeNull()
  })

  it('rejects negative and NaN counts', () => {
    expect(validateSessionSummary(validSession('s1', { totalTrainingMs: -1 }))).toBeNull()
    expect(validateSessionSummary(validSession('s1', { roundsCompleted: Number.NaN }))).toBeNull()
    expect(validateSessionSummary(validSession('s1', { techniquesCalled: 1.5 }))).toBeNull()
  })

  it('normalizes count maps and copies prototype-bearing objects safely', () => {
    const polluted = Object.assign(Object.create({ inherited: 99 }), { jab: 4, cross: -2 })
    const summary = validateSessionSummary(validSession('s1', { techniqueCounts: polluted }))
    expect(summary?.techniqueCounts).toEqual({ jab: 4 })
    expect(Object.getPrototypeOf(summary?.techniqueCounts)).toBe(Object.prototype)
    expect(copyCountMap(['not', 'a', 'map'])).toBeNull()
    expect(validateSessionSummary(validSession('s1', { techniqueCounts: 12 }))).toBeNull()
  })

  it('rejects malformed workoutConfig, queuedCombos, and comboSnapshots', () => {
    expect(validateSessionSummary(validSession('s1', { workoutConfig: { boom: true } }))).toBeNull()
    expect(validateWorkoutConfig({ boom: true })).toBeNull()
    expect(
      validateSessionSummary(validSession('s1', { queuedCombos: [{ id: '', title: 'x', techniques: [] }] })),
    ).toBeNull()
    expect(
      validateSessionSummary(validSession('s1', { comboSnapshots: [{ id: 'x' }] })),
    ).toBeNull()
    expect(validateCombo({ id: 'ok', title: 'ok', techniques: [{ techniqueId: 'jab' }] })?.id).toBe('ok')
    const nested = validateSessionSummary(
      validSession('s1', { queuedCombos: [validCombo('q1')], comboSnapshots: [validCombo('s1')], workoutConfig: createDefaultWorkout() }),
    )
    expect(nested?.queuedCombos?.[0]?.id).toBe('q1')
    expect(nested?.comboSnapshots?.[0]?.id).toBe('s1')
    expect(nested?.workoutConfig?.mode).toBe('round')
  })

  it('round-trips a real SessionEngine summary with optional fields populated', async () => {
    const combo = getCombo('beg-02')
    const config = createDefaultWorkout({
      mode: 'custom',
      pace: 'custom',
      customPaceMultiplier: 0.8,
      finishWhenQueueEmpty: true,
      customComboId: 'custom-1',
      selectedComboIds: ['beg-02'],
      repeatCount: 1,
      coachingCues: false,
      includeHeadKicks: false,
      includeElbows: false,
      includeKnees: false,
      includeClinch: false,
      showNextTechnique: false,
      minimalMode: false,
      largeText: true,
      sound: {
        bellsEnabled: false,
        tonesEnabled: false,
        vibrationEnabled: false,
        masterVolume: 0,
      },
      speech: {
        ...DEFAULT_SPEECH,
        volume: 0,
        coachingCuesEnabled: false,
        countdownEnabled: false,
        roundCallsEnabled: false,
        musicFriendly: false,
      },
      timingMultipliers: {
        ...createDefaultWorkout().timingMultipliers,
        pauseBetweenCombosMs: 20,
        pauseBeforeRepeatMs: 20,
      },
    })
    const engine = new SessionEngine(config, { wakeLock: false })
    vi.useFakeTimers()
    try {
      void engine.start({ comboQueue: [combo] })
      engine.markFavorite(combo.id)
      await vi.advanceTimersByTimeAsync(8_000)
      const source: SessionSummary = {
        ...engine.getSummary(),
        dailyPhase: 'slowDone',
        dailyDrillCompleted: true,
      }
      expect(source.queuedCombos?.length).toBe(1)
      expect(source.workoutConfig).toBeDefined()
      expect(source.customPaceMultiplier).toBe(0.8)
      expect(source.comboSnapshots?.length).toBeGreaterThan(0)
      expect(Object.keys(source.techniqueCounts).length).toBeGreaterThan(0)
      expect(Object.keys(source.techniqueCategoryCounts).length).toBeGreaterThan(0)
      expect(source.favoriteComboIds).toContain(combo.id)
      expect(source.workoutConfig?.speech.volume).toBe(0)
      expect(source.workoutConfig?.sound.masterVolume).toBe(0)
      expect(source.workoutConfig?.finishWhenQueueEmpty).toBe(true)

      const parsed = validateSessionSummary(source)
      expect(parsed).not.toBeNull()
      expect(parsed).toEqual(source)
    } finally {
      engine.dispose()
      vi.useRealTimers()
    }
  })
})

describe('P1 #7 IndexedDB mixed records', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('loads only valid sessions from a mixed database', async () => {
    await putRawSession(validSession('valid-a'))
    await putRawSession({ id: 'invalid-b', startedAt: 1, mode: 'not-a-mode' })
    await putRawSession(validSession('valid-c', { startedAt: 1_700_000_000_100 }))
    const loaded = await loadHistory()
    expect(loaded.map((item) => item.id)).toEqual(['valid-c', 'valid-a'])
  })

  it('does not let a malformed DB record crash Stats', async () => {
    await putRawSession(validSession('ok', { totalTrainingMs: 60_000, roundsCompleted: 2 }))
    await putRawSession({
      id: 'bad-stats',
      startedAt: 1,
      mode: 'coach',
      totalTrainingMs: Number.NaN,
      roundsCompleted: -8,
    })
    const stats = computeTrainingStats(await loadHistory())
    expect(stats.totalSessions).toBe(1)
    expect(Number.isFinite(stats.totalTrainingMs)).toBe(true)
    expect(stats.totalTrainingMs).toBe(60_000)
    expect(stats.roundsCompleted).toBe(2)
    expect(stats.currentStreak).toBeGreaterThanOrEqual(0)
    expect(stats.longestStreak).toBeGreaterThanOrEqual(0)
  })

  it('omits malformed DB records from export without deleting them', async () => {
    await putRawSession(validSession('keep-a'))
    await putRawSession({ id: 'malformed-b', startedAt: 2, pace: 'nope' })
    await putRawSession(validSession('keep-c', { startedAt: 1_700_000_000_200 }))
    const exported = JSON.parse(await exportUserData()) as { history: SessionSummary[] }
    expect(exported.history.map((item) => item.id)).toEqual(['keep-c', 'keep-a'])
    expect(await rawSessionIds()).toEqual(expect.arrayContaining(['keep-a', 'malformed-b', 'keep-c']))

    await clearHistory()
    localStorage.clear()
    const imported = await importUserData(JSON.stringify(exported))
    expect(imported.ok).toBe(true)
    expect((await loadHistory()).map((item) => item.id)).toEqual(['keep-c', 'keep-a'])
  })
})

describe('P1 #7 custom combos', () => {
  it('drops malformed combos and keeps valid legacy migration', () => {
    expect(migrateCustomCombo({ id: '', title: 'x', techniqueIds: ['jab'] })).toBeNull()
    expect(migrateCustomCombo({ id: 'c', title: '', techniqueIds: ['jab'] })).toBeNull()
    expect(migrateCustomCombo({ id: 'c', title: 'x', techniqueIds: [] })).toBeNull()
    const migrated = migrateCustomCombo({
      id: 'custom-old',
      title: 'Long',
      techniqueIds: ['jab', 'cross', 'jab', 'cross', 'jab', 'cross', 'jab', 'cross', 'jab'],
      createdAt: 1,
      updatedAt: 1,
      favorite: false,
      repeatCount: 99,
    })
    expect(migrated?.techniqueIds).toHaveLength(8)
    expect(migrated?.migrated).toBe(true)
    expect(migrated?.repeatCount).toBe(20)
    expect(migrated?.martialArt).toBe('muay-thai')
  })

  it('loads 9+ techniques by truncating, but import rejects them', async () => {
    const nine = ['jab', 'cross', 'jab', 'cross', 'jab', 'cross', 'jab', 'cross', 'jab']
    localStorage.setItem(
      'strikecaller:custom-combos',
      JSON.stringify([
        {
          id: 'legacy-long',
          title: 'Long',
          techniqueIds: nine,
          createdAt: 1,
          updatedAt: 1,
          favorite: false,
          repeatCount: 1,
        },
      ]),
    )
    const loaded = loadCustomCombos()
    expect(loaded).toHaveLength(1)
    expect(loaded[0]?.techniqueIds).toHaveLength(8)
    expect(loaded[0]?.migrated).toBe(true)

    const imported = await importUserData(
      JSON.stringify({
        version: 2,
        customCombos: [
          {
            id: 'c-bad',
            title: 'Too long',
            techniqueIds: nine,
            createdAt: 1,
            updatedAt: 1,
            favorite: false,
            repeatCount: 1,
          },
        ],
      }),
    )
    expect(imported.ok).toBe(false)
  })

  it('rejects an out-of-range repeatCount on import while load still clamps it', async () => {
    expect(
      migrateCustomCombo({
        id: 'clamp',
        title: 'Clamp',
        techniqueIds: ['jab'],
        createdAt: 1,
        updatedAt: 1,
        repeatCount: 99,
      })?.repeatCount,
    ).toBe(20)
    const imported = await importUserData(
      JSON.stringify({
        version: 2,
        customCombos: [
          {
            id: 'c-repeat',
            title: 'Too many repeats',
            techniqueIds: ['jab'],
            createdAt: 1,
            updatedAt: 1,
            favorite: false,
            repeatCount: 99,
          },
        ],
      }),
    )
    expect(imported.ok).toBe(false)
  })

  it('defaults missing legacy custom-combo fields', () => {
    const migrated = migrateCustomCombo({
      id: 'legacy-sparse',
      title: 'Sparse',
      techniqueIds: ['jab'],
    })
    expect(migrated).not.toBeNull()
    expect(migrated?.repeatCount).toBe(1)
    expect(migrated?.martialArt).toBe('muay-thai')
    expect(migrated?.favorite).toBe(false)
    expect(typeof migrated?.createdAt).toBe('number')
    expect(typeof migrated?.updatedAt).toBe('number')
  })

  it('accepts a title longer than 200 characters on load', () => {
    const title = 'T'.repeat(500)
    const migrated = migrateCustomCombo({
      id: 'long-title',
      title,
      techniqueIds: ['jab'],
      createdAt: 1,
      updatedAt: 1,
    })
    expect(migrated?.title).toBe(title)
  })

  it('requires actual booleans and finite timestamps', () => {
    expect(
      migrateCustomCombo({
        id: 'c',
        title: 'T',
        techniqueIds: ['jab'],
        favorite: 'false',
        createdAt: 1,
        updatedAt: 1,
      }),
    ).toBeNull()
    expect(
      migrateCustomCombo({
        id: 'c',
        title: 'T',
        techniqueIds: ['jab'],
        createdAt: Number.NaN,
        updatedAt: 1,
      }),
    ).toBeNull()
  })
})

describe('P1 #7 import is all-or-nothing', () => {
  beforeEach(async () => {
    localStorage.clear()
    savePreferences({ ...DEFAULT_PREFERENCES, stance: 'southpaw' })
    saveFavorites(['keep-fav'])
    saveCustomCombos([
      {
        id: 'keep-combo',
        title: 'Keep',
        techniqueIds: ['jab'],
        createdAt: 1,
        updatedAt: 1,
        favorite: false,
        repeatCount: 1,
        martialArt: 'muay-thai',
      },
    ])
    expect(await saveSession(validateSessionSummary(validSession('existing')) as SessionSummary)).toEqual({ ok: true })
  })

  it('rejects malformed nested history before any writes', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const put = vi.spyOn(IDBObjectStore.prototype, 'put')
    const clear = vi.spyOn(IDBObjectStore.prototype, 'clear')
    setItem.mockClear()
    put.mockClear()
    clear.mockClear()

    try {
      const result = await importUserData(
        JSON.stringify({
          version: 3,
          preferences: { ...DEFAULT_PREFERENCES, stance: 'orthodox' },
          favorites: ['beg-01'],
          customCombos: [customCombo('ok-combo')],
          history: [validSession('ok'), validSession('bad', { workoutConfig: { boom: true } })],
        }),
      )
      expect(result.ok).toBe(false)
      expect(setItem).not.toHaveBeenCalled()
      expect(put).not.toHaveBeenCalled()
      expect(clear).not.toHaveBeenCalled()
      expect(loadPreferences().stance).toBe('southpaw')
      expect((await loadHistory()).map((item) => item.id)).toEqual(['existing'])
    } finally {
      setItem.mockRestore()
      put.mockRestore()
      clear.mockRestore()
    }
  })

  it('rejects malformed preferences with zero writes', async () => {
    const result = await importUserData(
      JSON.stringify({
        version: 3,
        preferences: { ...DEFAULT_PREFERENCES, largeText: 'false' },
        favorites: ['imported-fav'],
      }),
    )
    expect(result.ok).toBe(false)
    expect(loadPreferences().stance).toBe('southpaw')
    expect(loadFavorites()).toEqual(['keep-fav'])
  })

  it('rejects a malformed combo with zero writes', async () => {
    const result = await importUserData(
      JSON.stringify({
        version: 3,
        preferences: { ...DEFAULT_PREFERENCES, stance: 'orthodox' },
        customCombos: [{ id: '', title: 'Nope', techniqueIds: ['jab'], createdAt: 1, updatedAt: 1 }],
      }),
    )
    expect(result.ok).toBe(false)
    expect(loadPreferences().stance).toBe('southpaw')
    expect(loadCustomCombos().map((combo) => combo.id)).toEqual(['keep-combo'])
  })

  it('imports distinct v1, v2, and v3 payloads', async () => {
    const v1 = {
      version: 1,
      preferences: { ...DEFAULT_PREFERENCES, onboardingComplete: true },
      favorites: [],
      customCombos: [],
      history: [
        {
          id: 'legacy-v1',
          startedAt: 1_700_000_000_000,
          endedAt: 1_700_000_005_000,
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
    const v1Result = await importUserData(JSON.stringify(v1))
    expect(v1Result.ok).toBe(true)
    const v1Session = (await loadHistory())[0]
    expect(v1Session?.id).toBe('legacy-v1')
    expect(v1Session?.martialArt).toBe('muay-thai')
    expect(v1Session?.migrated).toBe(true)
    expect(v1Session?.workoutConfig).toBeUndefined()
    expect(v1Session?.techniqueCategoryCounts).toEqual({})
    expect(v1Session?.favoriteComboIds).toEqual([])
    expect(v1Session?.usedCustomCombo).toBe(false)

    const v2 = {
      version: 2,
      preferences: { ...DEFAULT_PREFERENCES, onboardingComplete: true, stance: 'southpaw' },
      customCombos: [
        {
          id: 'v2-combo',
          title: 'Legacy combo',
          techniqueIds: ['jab', 'cross', 'jab', 'cross', 'hook-lead', 'cross', 'jab', 'cross'],
          createdAt: 10,
          updatedAt: 20,
          favorite: false,
          repeatCount: 2,
        },
      ],
      history: [
        {
          id: 'legacy-v2',
          startedAt: 1_700_000_100_000,
          endedAt: 1_700_000_160_000,
          martialArt: 'boxing',
          mode: 'coach',
          stance: 'southpaw',
          pace: 'normal',
          totalTrainingMs: 60_000,
          roundsCompleted: 1,
          combinationsCompleted: 3,
          techniquesCalled: 6,
          techniqueCounts: { jab: 3 },
          defenseActions: 0,
          movementActions: 0,
          averagePaceLabel: 'normal',
          dailyDrillCompleted: false,
          cancelled: false,
          favoriteComboIds: ['beg-01'],
          usedCustomCombo: true,
        },
      ],
      dailyDrill: dailyState('2026-03-01', 'beg-02', { slowDone: true }),
    }
    const v2Result = await importUserData(JSON.stringify(v2))
    expect(v2Result.ok).toBe(true)
    expect(loadCustomCombos()[0]?.martialArt).toBe('muay-thai')
    expect(loadCustomCombos()[0]?.techniqueIds).toHaveLength(8)
    expect((await loadHistory())[0]?.martialArt).toBe('boxing')
    expect((await loadHistory())[0]?.workoutConfig).toBeUndefined()
    expect(loadDailyDrillMap()['2026-03-01:muay-thai']?.slowDone).toBe(true)

    const v3 = {
      version: 3,
      preferences: { ...DEFAULT_PREFERENCES, onboardingComplete: true, largeText: true },
      favorites: ['beg-02'],
      customCombos: [customCombo('v3-combo', { martialArt: 'boxing', favorite: true })],
      history: [
        validSession('modern-v3', {
          workoutConfig: createDefaultWorkout({ mode: 'daily' }),
          queuedCombos: [validCombo('q-v3')],
          comboSnapshots: [validCombo('q-v3')],
          dailyPhase: 'fightDone',
          customPaceMultiplier: 1.1,
        }),
      ],
      dailyDrills: {
        '2026-04-01:boxing': dailyState('2026-04-01:boxing', 'beg-01', { martialArt: 'boxing', fightDone: true }),
      },
    }
    const v3Result = await importUserData(JSON.stringify(v3))
    expect(v3Result.ok).toBe(true)
    const v3Session = (await loadHistory())[0]
    expect(v3Session?.id).toBe('modern-v3')
    expect(v3Session?.workoutConfig?.mode).toBe('daily')
    expect(v3Session?.queuedCombos?.[0]?.id).toBe('q-v3')
    expect(v3Session?.dailyPhase).toBe('fightDone')
    expect(loadDailyDrillMap()['2026-04-01:boxing']?.fightDone).toBe(true)
    expect(loadFavorites()).toEqual(['beg-02'])
  })

  it('keeps export → import → export semantically equivalent', async () => {
    const prefs: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      onboardingComplete: true,
      stance: 'southpaw',
      largeText: true,
      wakeLock: false,
      includeDefense: false,
      includeMovement: false,
      preferMinimalMode: true,
      customPaceMultiplier: 1.25,
      theme: 'light',
    }
    savePreferences(prefs)
    saveFavorites(['beg-01', 'beg-02'])
    saveCustomCombos([
      customCombo('mine', { favorite: false, martialArt: 'boxing', title: 'Mine' }),
      customCombo('yours', { favorite: true, repeatCount: 3 }),
    ])
    saveDailyDrillMap({
      '2026-05-01:muay-thai': dailyState('2026-05-01:muay-thai', 'beg-01', { slowDone: false, normalDone: true }),
      '2026-05-01:boxing': dailyState('2026-05-01:boxing', 'beg-02', { martialArt: 'boxing', fightDone: true }),
    })
    expect(
      await saveSession(
        validateSessionSummary(
          validSession('sess-a', {
            workoutConfig: createDefaultWorkout({ mode: 'coach', largeText: true }),
            queuedCombos: [validCombo('qa')],
            comboSnapshots: [validCombo('qa')],
            techniqueCounts: { jab: 2, cross: 1 },
            techniqueCategoryCounts: { punch: 3 },
            favoriteComboIds: ['qa'],
            customPaceMultiplier: 0.9,
            dailyPhase: 'slowDone',
          }),
        ) as SessionSummary,
      ),
    ).toEqual({ ok: true })
    expect(
      await saveSession(
        validateSessionSummary(
          validSession('sess-b', {
            startedAt: 1_700_000_100_000,
            endedAt: 1_700_000_160_000,
            martialArt: 'boxing',
            cancelled: false,
            usedCustomCombo: true,
          }),
        ) as SessionSummary,
      ),
    ).toEqual({ ok: true })

    const first = JSON.parse(await exportUserData()) as {
      version: number
      exportedAt: string
      preferences: UserPreferences
      favorites: string[]
      customCombos: CustomCombo[]
      history: SessionSummary[]
      dailyDrills: Record<string, unknown>
    }
    expect(first.version).toBe(3)

    localStorage.clear()
    await clearHistory()
    const imported = await importUserData(JSON.stringify(first))
    expect(imported.ok).toBe(true)
    const second = JSON.parse(await exportUserData()) as typeof first
    const strip = ({ exportedAt: _exportedAt, dailyDrill: _dailyDrill, ...rest }: Record<string, unknown>) => rest
    expect(strip(second as unknown as Record<string, unknown>)).toEqual(strip(first as unknown as Record<string, unknown>))
  })
})

describe('P1 #7 corruption at localStorage boundaries', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('does not crash on broken preferences JSON', () => {
    localStorage.setItem('strikecaller:preferences', '{not-json')
    expect(loadPreferences().theme).toBe('dark')
  })

  it('skips malformed daily drill entries', () => {
    localStorage.setItem(
      'strikecaller:daily-drill',
      JSON.stringify({
        '2026-01-01:muay-thai': dailyState('2026-01-01:muay-thai', 'beg-01', { slowDone: true }),
        bad: { dateKey: 12, comboId: 'x' },
        also: { dateKey: '2026-01-02:muay-thai', comboId: 'beg-02', slowDone: 'false' },
      }),
    )
    const map = loadDailyDrillMap()
    expect(Object.keys(map)).toEqual(['2026-01-01:muay-thai'])
    expect(map['2026-01-01:muay-thai']?.slowDone).toBe(true)
  })

  it('preserves valid daily entries around malformed and prototype-like keys', () => {
    const raw: Record<string, unknown> = {
      '2026-06-01:muay-thai': dailyState('2026-06-01:muay-thai', 'beg-01', { slowDone: true }),
      '2026-06-02:muay-thai': { dateKey: 12, comboId: 'nope' },
      '2026-06-03:muay-thai': dailyState('2026-06-03:muay-thai', 'beg-03', { slowDone: false, normalDone: true }),
    }
    Object.defineProperty(raw, '__proto__', { value: { polluted: true }, enumerable: true })
    Object.defineProperty(raw, 'constructor', { value: dailyState('constructor', 'beg-x'), enumerable: true })
    const map = migrateDailyDrillMap(raw)
    expect(Object.keys(map).sort()).toEqual(['2026-06-01:muay-thai', '2026-06-03:muay-thai'])
    expect(map['2026-06-01:muay-thai']?.slowDone).toBe(true)
    expect(map['2026-06-03:muay-thai']?.slowDone).toBe(false)
    expect(map['2026-06-03:muay-thai']?.normalDone).toBe(true)
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined()
  })

  it('still migrates a legacy single daily record', () => {
    localStorage.setItem(
      'strikecaller:daily-drill',
      JSON.stringify(dailyState('2026-07-01', 'beg-01', { slowDone: false, fightDone: true })),
    )
    const map = loadDailyDrillMap()
    expect(map['2026-07-01:muay-thai']?.comboId).toBe('beg-01')
    expect(map['2026-07-01:muay-thai']?.slowDone).toBe(false)
    expect(map['2026-07-01:muay-thai']?.fightDone).toBe(true)
  })

  it('skips malformed music compatibility records', () => {
    expect(validateMusicCompatibility({ result: 'music-lowered', testedAt: 1, userAgent: 'ua' })).toBeNull()
    expect(
      validateMusicCompatibility({
        result: 'music-lowered',
        testedAt: 1,
        userAgent: 'ua',
        audioSessionSupported: 'false',
      }),
    ).toBeNull()
    expect(validatePreferences({ musicCompatibility: { result: 'nope' } }).musicCompatibility).toBeNull()
  })

  it('normalizes favorites by dropping blanks and duplicates', () => {
    localStorage.setItem('strikecaller:favorites', JSON.stringify(['beg-01', ' ', '', 'beg-01', 'beg-02']))
    expect(loadFavorites()).toEqual(['beg-01', 'beg-02'])
  })
})

describe('P1 #7 missing vs invalid fields', () => {
  it('defaults absent legacy session fields but rejects present invalid values', () => {
    const missing = validateSessionSummary({
      id: 'legacy',
      startedAt: 1000,
      totalTrainingMs: 10,
      roundsCompleted: 1,
      combinationsCompleted: 1,
      techniquesCalled: 1,
      defenseActions: 0,
      movementActions: 0,
    })
    expect(missing?.mode).toBe('coach')
    expect(missing?.pace).toBe('technical')
    expect(missing?.stance).toBe('orthodox')
    expect(missing?.martialArt).toBe('muay-thai')
    expect(missing?.endedAt).toBe(1000)
    expect(missing?.averagePaceLabel).toBe('technical')
    expect(missing?.workoutConfig).toBeUndefined()
    expect(missing?.queuedCombos).toBeUndefined()
    expect(missing?.comboSnapshots).toBeUndefined()
    expect(missing?.customPaceMultiplier).toBeUndefined()
    expect(missing?.cancelled).toBe(false)
    expect(missing?.migrated).toBe(true)

    expect(validateSessionSummary(validSession('x', { mode: 'banana' }))).toBeNull()
    expect(validateSessionSummary(validSession('x', { pace: 'banana' }))).toBeNull()
    expect(validateSessionSummary(validSession('x', { stance: 'banana' }))).toBeNull()
    expect(validateSessionSummary(validSession('x', { martialArt: 'banana' }))).toBeNull()
    expect(validateSessionSummary(validSession('x', { endedAt: 'soon' }))).toBeNull()
    expect(validateSessionSummary(validSession('x', { averagePaceLabel: 'banana' }))).toBeNull()
    expect(validateSessionSummary(validSession('x', { workoutConfig: { mode: 'banana' } }))).toBeNull()
    expect(validateSessionSummary(validSession('x', { queuedCombos: [{ id: 1 }] }))).toBeNull()
    expect(validateSessionSummary(validSession('x', { comboSnapshots: [null] }))).toBeNull()
    expect(validateSessionSummary(validSession('x', { customPaceMultiplier: 99 }))).toBeNull()
    expect(validateSessionSummary(validSession('x', { cancelled: 'false' }))).toBeNull()
    expect(validateSessionSummary(validSession('x', { comboIds: ['ok', ''] }))).toBeNull()
    expect(validateSessionSummary(validSession('x', { comboIds: ['ok', 12] }))).toBeNull()
    expect(validateSessionSummary(validSession('x', { favoriteComboIds: ['ok', '', 12] }))?.favoriteComboIds).toEqual([
      'ok',
    ])
  })

  it('rejects endedAt before startedAt and empty identity strings', () => {
    expect(validateSessionSummary(validSession('x', { startedAt: 2000, endedAt: 1000 }))).toBeNull()
    expect(validateSessionSummary(validSession('', {}))).toBeNull()
    expect(validateSessionSummary(validSession('x', { queuedCombos: [validCombo('')] }))).toBeNull()
  })

  it('does not fill a partial present workoutConfig from modern defaults', () => {
    expect(validateWorkoutConfig({ martialArt: 'muay-thai', mode: 'coach' })).toBeNull()
    expect(validateWorkoutConfig({ ...createDefaultWorkout(), mode: 'banana' })).toBeNull()
    expect(validateWorkoutConfig({ ...createDefaultWorkout(), sound: { masterVolume: 9 } })).toBeNull()
    const complete = validateWorkoutConfig(createDefaultWorkout({ speech: { ...DEFAULT_SPEECH, volume: 0 } }))
    expect(complete?.speech.volume).toBe(0)
    const nestedMissing = validateWorkoutConfig({
      ...createDefaultWorkout(),
      sound: { bellsEnabled: false },
    })
    expect(nestedMissing?.sound.bellsEnabled).toBe(false)
    expect(nestedMissing?.sound.masterVolume).toBe(DEFAULT_PREFERENCES.sound.masterVolume)
  })
})

describe('P1 #7 prototype safety', () => {
  it('does not pollute Object.prototype from count-map keys', () => {
    const raw: Record<string, unknown> = { jab: 4 }
    Object.defineProperty(raw, '__proto__', { value: { polluted: true }, enumerable: true, configurable: true })
    Object.defineProperty(raw, 'constructor', { value: 1, enumerable: true, configurable: true })
    Object.defineProperty(raw, 'prototype', { value: 2, enumerable: true, configurable: true })
    const parsed = copyCountMap(raw)
    expect(parsed).toEqual({ jab: 4 })
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype)
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined()
    expect(Object.prototype.hasOwnProperty('polluted')).toBe(false)

    const json = JSON.parse('{"__proto__":{"polluted":true},"jab":3,"constructor":1,"prototype":2}') as unknown
    const fromJson = copyCountMap(json)
    expect(fromJson).toEqual({ jab: 3 })
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined()

    const summary = validateSessionSummary(validSession('s1', { techniqueCounts: raw, techniqueCategoryCounts: json }))
    expect(summary?.techniqueCounts).toEqual({ jab: 4 })
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined()
  })
})

describe('P1 #7 boolean false preservation', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('keeps real false values across preferences, sessions, combos, daily, and music', () => {
    savePreferences({
      ...DEFAULT_PREFERENCES,
      wakeLock: false,
      includeDefense: false,
      includeMovement: false,
      largeText: false,
      onboardingComplete: false,
      preferMinimalMode: false,
    })
    expect(loadPreferences().wakeLock).toBe(false)
    expect(loadPreferences().includeDefense).toBe(false)
    expect(loadPreferences().includeMovement).toBe(false)

    const session = validateSessionSummary(
      validSession('s-false', {
        cancelled: false,
        dailyDrillCompleted: false,
        usedCustomCombo: false,
        excludeFromStats: false,
        isDemo: false,
      }),
    )
    expect(session?.cancelled).toBe(false)
    expect(session?.dailyDrillCompleted).toBe(false)
    expect(session?.usedCustomCombo).toBe(false)
    expect(session?.excludeFromStats).toBe(false)
    expect(session?.isDemo).toBe(false)

    const combo = migrateCustomCombo({
      id: 'c-false',
      title: 'False favorite',
      techniqueIds: ['jab'],
      favorite: false,
      createdAt: 1,
      updatedAt: 1,
    })
    expect(combo?.favorite).toBe(false)

    saveDailyDrillMap({
      '2026-08-01:muay-thai': dailyState('2026-08-01:muay-thai', 'beg-01', { slowDone: false, completed: false }),
    })
    expect(loadDailyDrillMap()['2026-08-01:muay-thai']?.slowDone).toBe(false)

    const music = validateMusicCompatibility({
      result: 'music-continued',
      testedAt: 1,
      userAgent: 'ua',
      audioSessionSupported: false,
    })
    expect(music?.audioSessionSupported).toBe(false)

    expect(validatePreferences({ wakeLock: 'false' }).wakeLock).toBe(true)
    expect(validatePreferences({ includeDefense: 0 }).includeDefense).toBe(true)
    expect(validatePreferences({ onboardingComplete: 'true' }).onboardingComplete).toBe(false)
  })
})

describe('P1 #7 import rejects malformed daily before writes', () => {
  beforeEach(() => {
    localStorage.clear()
    savePreferences({ ...DEFAULT_PREFERENCES, stance: 'southpaw' })
  })

  it('fails the whole import when a supplied daily map contains a bad entry', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    setItem.mockClear()
    try {
      const result = await importUserData(
        JSON.stringify({
          version: 3,
          preferences: { ...DEFAULT_PREFERENCES, stance: 'orthodox' },
          dailyDrills: {
            '2026-01-01:muay-thai': dailyState('2026-01-01:muay-thai', 'beg-01'),
            bad: { dateKey: 12, comboId: 'x' },
          },
        }),
      )
      expect(result.ok).toBe(false)
      expect(setItem).not.toHaveBeenCalled()
      expect(loadPreferences().stance).toBe('southpaw')
    } finally {
      setItem.mockRestore()
    }
  })
})

describe('P1 #7 session validator performance sanity', () => {
  it('validates 5,000 representative sessions without a multi-second stall', () => {
    const sample = validSession('bench', {
      workoutConfig: createDefaultWorkout({ mode: 'coach' }),
      queuedCombos: [validCombo('q1'), validCombo('q2')],
      comboSnapshots: [validCombo('q1')],
      techniqueCounts: { jab: 4, cross: 2 },
      techniqueCategoryCounts: { punch: 6 },
      favoriteComboIds: ['q1'],
      customPaceMultiplier: 1.1,
      dailyPhase: 'normalDone',
    })
    const started = Date.now()
    for (let i = 0; i < 5000; i++) {
      expect(validateSessionSummary(sample)).not.toBeNull()
    }
    expect(Date.now() - started).toBeLessThan(4000)
  })
})
