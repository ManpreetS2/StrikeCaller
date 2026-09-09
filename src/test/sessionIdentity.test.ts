import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionEngine } from '../engines/sessionEngine'
import { createDefaultWorkout, DEFAULT_PREFERENCES, DEFAULT_SPEECH } from '../data/defaults'
import { getCombo } from '../data/combos'
import { getSessionById, loadHistory, saveSession } from '../storage/historyStore'
import { importUserData } from '../storage/userData'
import { loadCustomCombos, loadPreferences, savePreferences, STORAGE_KEYS } from '../storage/localStore'
import { parseSessionRouteId } from '../storage/sessionValidation'
import type { CustomCombo, SessionSummary, WorkoutConfig } from '../types'

const FROZEN_START = 1_788_911_639_863

function silentWorkout(partial: Partial<WorkoutConfig> = {}): WorkoutConfig {
  return createDefaultWorkout({
    mode: 'coach',
    sessionDurationSec: 90,
    roundDurationSec: 90,
    speech: {
      ...DEFAULT_SPEECH,
      volume: 0,
      coachingCuesEnabled: false,
      countdownEnabled: false,
      roundCallsEnabled: false,
      spokenCallsEnabled: false,
    },
    sound: { bellsEnabled: false, tonesEnabled: false, vibrationEnabled: false, masterVolume: 0 },
    ...partial,
  })
}

function summary(id: string, extra: Partial<SessionSummary> = {}): SessionSummary {
  const startedAt = extra.startedAt ?? 1_700_000_000_000
  const endedAt = extra.endedAt ?? startedAt + 60_000
  return {
    id,
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
    startedAt,
    endedAt,
  }
}

function comboRecord(id: string, extra: Partial<CustomCombo> = {}): CustomCombo {
  return {
    id,
    title: extra.title ?? `Combo ${id}`,
    techniqueIds: extra.techniqueIds ?? ['jab', 'cross'],
    createdAt: extra.createdAt ?? 1,
    updatedAt: extra.updatedAt ?? 2,
    favorite: extra.favorite ?? false,
    repeatCount: extra.repeatCount ?? 1,
    martialArt: extra.martialArt ?? 'muay-thai',
    migrated: extra.migrated ?? false,
  }
}

async function startEngine(engine: SessionEngine) {
  const started = engine.start({ comboQueue: [getCombo('beg-01')] })
  started.catch(() => undefined)
  return started
}

describe('collision-resistant session IDs', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.spyOn(Date, 'now').mockReturnValue(FROZEN_START)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('gives two same-millisecond engines distinct durable IDs that both persist', async () => {
    const a = new SessionEngine(silentWorkout(), { wakeLock: false })
    const b = new SessionEngine(silentWorkout(), { wakeLock: false })
    const startedA = startEngine(a)
    const startedB = startEngine(b)
    const summaryA = { ...a.getSummary(), combinationsCompleted: 11 }
    const summaryB = { ...b.getSummary(), combinationsCompleted: 22 }
    a.dispose()
    b.dispose()
    await Promise.allSettled([startedA, startedB])

    expect(summaryA.startedAt).toBe(FROZEN_START)
    expect(summaryB.startedAt).toBe(FROZEN_START)
    expect(summaryA.id).not.toBe(summaryB.id)
    expect(summaryA.id).toMatch(/^session-\d+-[0-9a-f]+$/)
    expect(summaryB.id).toMatch(/^session-\d+-[0-9a-f]+$/)

    expect(await saveSession(summaryA)).toEqual({ ok: true })
    expect(await saveSession(summaryB)).toEqual({ ok: true })
    const history = await loadHistory()
    expect(history.map((row) => row.id).sort()).toEqual([summaryA.id, summaryB.id].sort())
    expect(history).toHaveLength(2)

    const loadedA = await getSessionById(summaryA.id)
    const loadedB = await getSessionById(summaryB.id)
    expect(loadedA).toEqual({ status: 'found', session: expect.objectContaining({ id: summaryA.id, combinationsCompleted: 11 }) })
    expect(loadedB).toEqual({ status: 'found', session: expect.objectContaining({ id: summaryB.id, combinationsCompleted: 22 }) })
  })

  it('keeps one engine ID stable across repeated getSummary, pause, and stop', async () => {
    const engine = new SessionEngine(silentWorkout(), { wakeLock: false })
    const started = startEngine(engine)
    const first = engine.getSummary().id
    expect(engine.getSummary().id).toBe(first)
    expect(engine.getSummary().id).toBe(first)
    engine.pause()
    expect(engine.getSummary().id).toBe(first)
    engine.stop()
    expect(engine.getSummary().id).toBe(first)
    expect(engine.getSummary().startedAt).toBe(FROZEN_START)
    engine.dispose()
    await Promise.allSettled([started])
  })

  it('assigns a new ID only when a new session starts', async () => {
    const engine = new SessionEngine(silentWorkout(), { wakeLock: false })
    const firstRun = startEngine(engine)
    const firstId = engine.getSummary().id
    engine.stop()
    await Promise.allSettled([firstRun])
    vi.spyOn(Date, 'now').mockReturnValue(FROZEN_START + 5_000)
    const secondRun = startEngine(engine)
    const secondId = engine.getSummary().id
    engine.dispose()
    await Promise.allSettled([secondRun])
    expect(secondId).not.toBe(firstId)
  })

  it('does not change startedAt when minting a collision-resistant ID', async () => {
    const engine = new SessionEngine(silentWorkout(), { wakeLock: false })
    const started = startEngine(engine)
    const snapshot = engine.getSummary()
    engine.dispose()
    await Promise.allSettled([started])
    expect(snapshot.startedAt).toBe(FROZEN_START)
    expect(snapshot.id.startsWith(`session-${FROZEN_START}`)).toBe(true)
  })

  it('accepts legacy timestamp IDs and new collision-resistant IDs on the summary route', async () => {
    const legacyId = `session-${FROZEN_START}`
    const modernId = `session-${FROZEN_START}-a1b2c3d4e5f60789`
    expect(parseSessionRouteId(legacyId)).toBe(legacyId)
    expect(parseSessionRouteId(modernId)).toBe(modernId)
    expect(parseSessionRouteId('')).toBeNull()
    expect(parseSessionRouteId('x'.repeat(201))).toBeNull()

    expect(await saveSession(summary(legacyId, { combinationsCompleted: 3 }))).toEqual({ ok: true })
    expect(await saveSession(summary(modernId, { startedAt: FROZEN_START + 1, combinationsCompleted: 9 }))).toEqual({
      ok: true,
    })
    expect(await getSessionById(legacyId)).toEqual({
      status: 'found',
      session: expect.objectContaining({ id: legacyId, combinationsCompleted: 3 }),
    })
    expect(await getSessionById(modernId)).toEqual({
      status: 'found',
      session: expect.objectContaining({ id: modernId, combinationsCompleted: 9 }),
    })
  })

  it('keeps Stats chronological order by startedAt, not by ID suffix', async () => {
    const older = summary('session-10-zzzz', { startedAt: 10, combinationsCompleted: 1 })
    const newer = summary('session-30-aaaa', { startedAt: 30, combinationsCompleted: 2 })
    const mid = summary('session-20-mmmm', { startedAt: 20, combinationsCompleted: 3 })
    expect(await saveSession(older)).toEqual({ ok: true })
    expect(await saveSession(newer)).toEqual({ ok: true })
    expect(await saveSession(mid)).toEqual({ ok: true })
    expect((await loadHistory()).map((row) => row.id)).toEqual([newer.id, mid.id, older.id])
  })

  it('produces 20 distinct same-millisecond IDs without flaking', async () => {
    const ids = new Set<string>()
    for (let i = 0; i < 20; i++) {
      const engine = new SessionEngine(silentWorkout(), { wakeLock: false })
      const started = startEngine(engine)
      ids.add(engine.getSummary().id)
      engine.dispose()
      await Promise.allSettled([started])
    }
    expect(ids.size).toBe(20)
  })
})

describe('strict import duplicate identities', () => {
  beforeEach(() => {
    localStorage.clear()
    savePreferences({ ...DEFAULT_PREFERENCES, stance: 'southpaw' })
  })

  it('rejects duplicate history IDs before any writes', async () => {
    const duplicateId = 'session-1788911639863'
    const result = await importUserData(
      JSON.stringify({
        version: 3,
        preferences: { ...DEFAULT_PREFERENCES, stance: 'orthodox' },
        history: [
          summary(duplicateId, { combinationsCompleted: 4, startedAt: 10 }),
          summary(duplicateId, { combinationsCompleted: 9, startedAt: 20 }),
        ],
      }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message.toLowerCase()).toMatch(/duplicate/)
    expect(loadPreferences().stance).toBe('southpaw')
    expect(await loadHistory()).toEqual([])
  })

  it('rejects duplicate custom-combo IDs before any writes', async () => {
    localStorage.setItem(STORAGE_KEYS.customCombos, JSON.stringify([comboRecord('keep-me', { title: 'Keep' })]))
    const result = await importUserData(
      JSON.stringify({
        version: 3,
        preferences: { ...DEFAULT_PREFERENCES, stance: 'orthodox' },
        customCombos: [
          comboRecord('custom-same', { title: 'First title' }),
          comboRecord('custom-same', { title: 'Second title' }),
        ],
      }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message.toLowerCase()).toMatch(/duplicate/)
    expect(loadPreferences().stance).toBe('southpaw')
    expect(loadCustomCombos().map((combo) => combo.title)).toEqual(['Keep'])
  })
})
