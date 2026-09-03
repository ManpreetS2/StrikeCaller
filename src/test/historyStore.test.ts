import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { DEFAULT_PREFERENCES, createDefaultWorkout } from '../data/defaults'
import {
  EXPORT_VERSION,
  LEGACY_HISTORY_KEY,
  loadLegacyHistory,
  loadPreferences,
  savePreferences,
} from '../storage/localStore'
import { exportUserData, importUserData } from '../storage/userData'
import {
  clearHistory,
  initHistory,
  loadHistory,
  replaceHistory,
  resetHistoryDbConnection,
  saveSession,
  sortHistory,
} from '../storage/historyStore'
import type { Combo, SessionSummary } from '../types'

function session(id: string, extra: Partial<SessionSummary> = {}): SessionSummary {
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

function fatCombo(index: number): Combo {
  return {
    id: `snap-${index}`,
    title: `Combo ${index}`,
    difficulty: 'beginner',
    stance: 'orthodox',
    trainingModes: ['coach'],
    purpose: 'establish-jab',
    techniques: [{ techniqueId: 'jab' }, { techniqueId: 'cross' }],
    recommendedPace: 'technical',
    setupExplanation: 't',
    endingPosition: 'base',
    safeExit: 'reset',
    coachingNotes: 'x'.repeat(80),
    tags: [],
    equipment: ['shadowboxing'],
    martialArt: 'muay-thai',
  }
}

function fatSession(index: number): SessionSummary {
  const combo = fatCombo(index)
  return session(`s-${String(index).padStart(3, '0')}`, {
    startedAt: 1_700_000_000_000 + index,
    comboSnapshots: [combo],
    queuedCombos: [combo],
    workoutConfig: createDefaultWorkout({
      martialArt: 'muay-thai',
      mode: 'coach',
    }),
    techniqueCounts: { jab: index + 1, cross: index + 2 },
  })
}

function ids(history: SessionSummary[]): string[] {
  return history.map((item) => item.id)
}

function spyPut(
  impl: (value: unknown, original: (value: unknown) => IDBRequest) => IDBRequest,
) {
  const original = IDBObjectStore.prototype.put
  return vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    value: unknown,
    key?: IDBValidKey,
  ) {
    return impl(value, (v) => original.call(this, v, key))
  })
}

describe('IndexedDB history store and legacy migration', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('starts with no legacy history and an empty database', async () => {
    const result = await initHistory()
    expect(result.write).toEqual({ ok: true })
    expect(result.history).toEqual([])
    expect(await loadHistory()).toEqual([])
    expect(localStorage.getItem(LEGACY_HISTORY_KEY)).toBeNull()
  })

  it('migrates valid legacy localStorage history into IndexedDB', async () => {
    const legacy = [session('b', { startedAt: 20 }), session('a', { startedAt: 10 })]
    localStorage.setItem(LEGACY_HISTORY_KEY, JSON.stringify(legacy))
    const result = await initHistory()
    expect(result.write.ok).toBe(true)
    expect(ids(result.history)).toEqual(['b', 'a'])
    expect(ids(await loadHistory())).toEqual(['b', 'a'])
    expect(localStorage.getItem(LEGACY_HISTORY_KEY)).toBeNull()
  })

  it('does not remove legacy history until IndexedDB puts have run', async () => {
    const order: string[] = []
    localStorage.setItem(LEGACY_HISTORY_KEY, JSON.stringify([session('keep-until-commit')]))
    const originalPut = IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      order.push('put')
      expect(localStorage.getItem(LEGACY_HISTORY_KEY)).toBeTruthy()
      return originalPut.call(this, value, key)
    })
    const originalRemove = Storage.prototype.removeItem
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, key: string) {
      if (key === LEGACY_HISTORY_KEY) order.push('remove')
      return originalRemove.call(this, key)
    })

    const result = await initHistory()
    expect(result.write.ok).toBe(true)
    expect(order.filter((step) => step === 'remove')).toHaveLength(1)
    expect(order.indexOf('remove')).toBeGreaterThan(order.lastIndexOf('put'))
    expect(localStorage.getItem(LEGACY_HISTORY_KEY)).toBeNull()
  })

  it('removes legacy localStorage history only after a successful commit', async () => {
    localStorage.setItem(LEGACY_HISTORY_KEY, JSON.stringify([session('committed')]))
    expect((await initHistory()).write.ok).toBe(true)
    expect(localStorage.getItem(LEGACY_HISTORY_KEY)).toBeNull()
    expect(ids(await loadHistory())).toEqual(['committed'])
  })

  it('keeps localStorage history when IndexedDB cannot open', async () => {
    localStorage.setItem(LEGACY_HISTORY_KEY, JSON.stringify([session('legacy-open-fail')]))
    resetHistoryDbConnection()
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new DOMException('open failed', 'UnknownError')
    })
    const result = await initHistory()
    expect(result.write.ok).toBe(false)
    expect(ids(result.history)).toEqual(['legacy-open-fail'])
    expect(loadLegacyHistory().map((item) => item.id)).toEqual(['legacy-open-fail'])
    expect(localStorage.getItem(LEGACY_HISTORY_KEY)).toBeTruthy()
  })

  it('keeps localStorage history when the IndexedDB transaction fails', async () => {
    localStorage.setItem(LEGACY_HISTORY_KEY, JSON.stringify([session('legacy-tx-fail')]))
    spyPut(() => {
      throw new DOMException('transaction failed', 'UnknownError')
    })
    const result = await initHistory()
    expect(result.write.ok).toBe(false)
    expect(ids(result.history)).toEqual(['legacy-tx-fail'])
    expect(localStorage.getItem(LEGACY_HISTORY_KEY)).toBeTruthy()
  })

  it('does not duplicate sessions when migration runs twice', async () => {
    localStorage.setItem(LEGACY_HISTORY_KEY, JSON.stringify([session('once')]))
    expect((await initHistory()).write.ok).toBe(true)
    localStorage.setItem(LEGACY_HISTORY_KEY, JSON.stringify([session('once')]))
    const second = await initHistory()
    expect(second.write.ok).toBe(true)
    expect(ids(await loadHistory())).toEqual(['once'])
  })

  it('merges existing IndexedDB records with leftover legacy using IndexedDB-wins', async () => {
    expect(await saveSession(session('abc', { techniqueCounts: { jab: 99 } }))).toEqual({ ok: true })
    localStorage.setItem(
      LEGACY_HISTORY_KEY,
      JSON.stringify([
        session('abc', { techniqueCounts: { jab: 1 } }),
        session('def', { startedAt: 1_700_000_000_100 }),
      ]),
    )
    const result = await initHistory()
    expect(result.write.ok).toBe(true)
    expect(ids(result.history)).toEqual(['def', 'abc'])
    expect(result.history.find((item) => item.id === 'abc')?.techniqueCounts.jab).toBe(99)
    expect(result.history.find((item) => item.id === 'def')?.id).toBe('def')
    expect(ids(await loadHistory())).toEqual(['def', 'abc'])
  })

  it('does not crash on corrupted localStorage history', async () => {
    localStorage.setItem(LEGACY_HISTORY_KEY, '{not-json')
    const result = await initHistory()
    expect(result.write.ok).toBe(true)
    expect(result.history).toEqual([])
    expect(localStorage.getItem(LEGACY_HISTORY_KEY)).toBe('{not-json')
  })

  it('skips invalid legacy sessions using existing validation semantics', async () => {
    localStorage.setItem(
      LEGACY_HISTORY_KEY,
      JSON.stringify([{ id: 12, startedAt: 'nope' }, session('valid-only')]),
    )
    const result = await initHistory()
    expect(result.write.ok).toBe(true)
    expect(ids(result.history)).toEqual(['valid-only'])
    expect(ids(await loadHistory())).toEqual(['valid-only'])
  })

  it('migrates more than 200 sessions', async () => {
    const many = Array.from({ length: 250 }, (_, index) =>
      session(`s-${index}`, { startedAt: 1_700_000_000_000 + index }),
    )
    localStorage.setItem(LEGACY_HISTORY_KEY, JSON.stringify(many))
    const result = await initHistory()
    expect(result.write.ok).toBe(true)
    expect(result.history).toHaveLength(250)
    expect(await loadHistory()).toHaveLength(250)
    expect(localStorage.getItem(LEGACY_HISTORY_KEY)).toBeNull()
  })

  it('does not keep a large migrated history in localStorage', async () => {
    const many = Array.from({ length: 220 }, (_, index) => fatSession(index))
    localStorage.setItem(LEGACY_HISTORY_KEY, JSON.stringify(many))
    expect(localStorage.getItem(LEGACY_HISTORY_KEY)?.length).toBeGreaterThan(10_000)
    expect((await initHistory()).write.ok).toBe(true)
    expect(localStorage.getItem(LEGACY_HISTORY_KEY)).toBeNull()
    const loaded = await loadHistory()
    expect(loaded).toHaveLength(220)
    expect(loaded[0]?.comboSnapshots?.[0]?.id).toBe('snap-219')
    expect(loaded[0]?.queuedCombos?.[0]?.id).toBe('snap-219')
    expect(loaded[0]?.workoutConfig).toBeTruthy()
  })

  it('loads history from IndexedDB after a reconnect', async () => {
    expect(await saveSession(session('persist-1'))).toEqual({ ok: true })
    resetHistoryDbConnection()
    expect(ids(await loadHistory())).toEqual(['persist-1'])
  })

  it('persists a new workout as an individual session record', async () => {
    expect(await saveSession(session('a'))).toEqual({ ok: true })
    const putIds: string[] = []
    spyPut((value, original) => {
      const id = typeof value === 'object' && value && 'id' in value ? String(value.id) : ''
      if (id) putIds.push(id)
      return original(value)
    })
    expect(await saveSession(session('b', { startedAt: 1_700_000_000_050 }))).toEqual({ ok: true })
    expect(putIds).toEqual(['b'])
    expect(ids(await loadHistory())).toEqual(['b', 'a'])
  })

  it('keeps a newly saved workout after reload', async () => {
    expect(await saveSession(session('reload-me'))).toEqual({ ok: true })
    resetHistoryDbConnection()
    expect(ids(await initHistory().then((result) => result.history))).toEqual(['reload-me'])
  })

  it('returns a structured failure when a new session cannot be written', async () => {
    spyPut((value, original) => {
      if (typeof value === 'object' && value && 'id' in value && value.id === 'new-session') {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      }
      return original(value)
    })
    const result = await saveSession(session('new-session'))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('quota-exceeded')
    expect(ids(await loadHistory())).toEqual([])
  })

  it('clears IndexedDB history and leftover legacy data', async () => {
    await saveSession(session('keep-then-clear'))
    localStorage.setItem(LEGACY_HISTORY_KEY, JSON.stringify([session('leftover')]))
    expect((await clearHistory()).ok).toBe(true)
    expect(await loadHistory()).toEqual([])
    expect(localStorage.getItem(LEGACY_HISTORY_KEY)).toBeNull()
  })

  it('does not pretend history was cleared when IndexedDB clear fails', async () => {
    await saveSession(session('still-there'))
    vi.spyOn(IDBObjectStore.prototype, 'clear').mockImplementation(function (this: IDBObjectStore) {
      throw new DOMException('clear failed', 'UnknownError')
    })
    const result = await clearHistory()
    expect(result.ok).toBe(false)
    expect(ids(await loadHistory())).toEqual(['still-there'])
  })

  it('includes IndexedDB history in exports without duplicating migrated records', async () => {
    localStorage.setItem(LEGACY_HISTORY_KEY, JSON.stringify([session('a'), session('b', { startedAt: 2 })]))
    expect((await initHistory()).write.ok).toBe(true)
    const parsed = JSON.parse(await exportUserData()) as { version: number; history: SessionSummary[] }
    expect(parsed.version).toBe(EXPORT_VERSION)
    expect(ids(parsed.history)).toEqual(['a', 'b'])
  })

  it('imports existing v1, v2, and v3 export payloads into IndexedDB', async () => {
    for (const version of [1, 2, 3]) {
      await clearHistory()
      const result = await importUserData(
        JSON.stringify({
          version,
          preferences: { ...DEFAULT_PREFERENCES, onboardingComplete: true },
          history: [session(`v${version}-session`)],
        }),
      )
      expect(result.ok).toBe(true)
      expect(ids(await loadHistory())).toEqual([`v${version}-session`])
      expect(localStorage.getItem(LEGACY_HISTORY_KEY)).toBeNull()
    }
  })

  it('persists imported history to IndexedDB', async () => {
    const result = await importUserData(
      JSON.stringify({
        version: 3,
        history: [session('imported-durable')],
      }),
    )
    expect(result.ok).toBe(true)
    resetHistoryDbConnection()
    expect(ids(await loadHistory())).toEqual(['imported-durable'])
  })

  it('does not leave a partial successful import when IndexedDB history replace fails', async () => {
    savePreferences({ ...DEFAULT_PREFERENCES, stance: 'southpaw' })
    expect(await saveSession(session('existing-session'))).toEqual({ ok: true })
    spyPut((value, original) => {
      if (typeof value === 'object' && value && 'id' in value && value.id === 'imported-should-not-stick') {
        throw new DOMException('import blocked', 'UnknownError')
      }
      return original(value)
    })
    const result = await importUserData(
      JSON.stringify({
        version: 3,
        preferences: { ...DEFAULT_PREFERENCES, stance: 'orthodox' },
        history: [session('imported-should-not-stick')],
      }),
    )
    expect(result.ok).toBe(false)
    expect(loadPreferences().stance).toBe('southpaw')
    expect(ids(await loadHistory())).toEqual(['existing-session'])
  })

  it('does not duplicate leftover legacy records after a successful migration', async () => {
    localStorage.setItem(LEGACY_HISTORY_KEY, JSON.stringify([session('dup-a'), session('dup-b', { startedAt: 3 })]))
    expect((await initHistory()).write.ok).toBe(true)
    localStorage.setItem(LEGACY_HISTORY_KEY, JSON.stringify([session('dup-a'), session('dup-b', { startedAt: 3 })]))
    expect((await initHistory()).write.ok).toBe(true)
    expect(ids(await loadHistory())).toEqual(['dup-a', 'dup-b'])
  })

  it('preserves newest-first ordering expected by Stats and Home', async () => {
    const unordered = [
      session('old', { startedAt: 10 }),
      session('new', { startedAt: 30 }),
      session('mid', { startedAt: 20 }),
    ]
    await replaceHistory(unordered)
    expect(ids(await loadHistory())).toEqual(['new', 'mid', 'old'])
    expect(ids(sortHistory(unordered))).toEqual(['new', 'mid', 'old'])
  })

  it('does not delete legacy-only history when IndexedDB is unavailable during clear', async () => {
    localStorage.setItem(LEGACY_HISTORY_KEY, JSON.stringify([session('A'), session('B', { startedAt: 2 })]))
    resetHistoryDbConnection()
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true, writable: true })
    const result = await clearHistory()
    expect(result.ok).toBe(false)
    expect(loadLegacyHistory().map((item) => item.id)).toEqual(['A', 'B'])
  })

  it('does not delete leftover legacy history when IndexedDB clear fails', async () => {
    localStorage.setItem(LEGACY_HISTORY_KEY, JSON.stringify([session('only-copy')]))
    vi.spyOn(IDBObjectStore.prototype, 'clear').mockImplementation(function (this: IDBObjectStore) {
      throw new DOMException('clear failed', 'UnknownError')
    })
    const result = await clearHistory()
    expect(result.ok).toBe(false)
    expect(loadLegacyHistory().map((item) => item.id)).toEqual(['only-copy'])
  })

  it('keeps IndexedDB history when leftover localStorage cleanup fails after a successful migration', async () => {
    localStorage.setItem(LEGACY_HISTORY_KEY, JSON.stringify([session('abc', { techniqueCounts: { jab: 1 } })]))
    const originalRemove = Storage.prototype.removeItem
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, key: string) {
      if (key === LEGACY_HISTORY_KEY) throw new Error('blocked remove')
      return originalRemove.call(this, key)
    })
    const first = await initHistory()
    expect(first.write.ok).toBe(true)
    expect(ids(first.history)).toEqual(['abc'])
    expect(localStorage.getItem(LEGACY_HISTORY_KEY)).toBeTruthy()
    expect(ids(await loadHistory())).toEqual(['abc'])
  })

  it('keeps a newer IndexedDB session when leftover legacy still has an older copy of the same id', async () => {
    expect(await saveSession(session('abc', { techniqueCounts: { jab: 99 } }))).toEqual({ ok: true })
    localStorage.setItem(LEGACY_HISTORY_KEY, JSON.stringify([session('abc', { techniqueCounts: { jab: 1 } })]))
    const result = await initHistory()
    expect(result.write.ok).toBe(true)
    expect(result.history.find((item) => item.id === 'abc')?.techniqueCounts.jab).toBe(99)
    expect(ids(await loadHistory()).filter((id) => id === 'abc')).toEqual(['abc'])
  })

  it('rolls back IndexedDB when a later put in the same import transaction fails', async () => {
    expect(await saveSession(session('existing-session'))).toEqual({ ok: true })
    let puts = 0
    spyPut((value, original) => {
      puts += 1
      if (puts >= 2) throw new DOMException('second put failed', 'UnknownError')
      return original(value)
    })
    const result = await importUserData(
      JSON.stringify({
        version: 3,
        history: [session('imported-1'), session('imported-2')],
      }),
    )
    expect(result.ok).toBe(false)
    expect(ids(await loadHistory())).toEqual(['existing-session'])
  })

  it('does not remigrate leftover legacy after a successful clear and restart', async () => {
    await saveSession(session('A'))
    await saveSession(session('B', { startedAt: 2 }))
    localStorage.setItem(LEGACY_HISTORY_KEY, JSON.stringify([session('A'), session('B', { startedAt: 2 })]))
    expect((await clearHistory()).ok).toBe(true)
    expect(localStorage.getItem(LEGACY_HISTORY_KEY)).toBeNull()
    expect(await loadHistory()).toEqual([])
    resetHistoryDbConnection()
    const again = await initHistory()
    expect(again.write.ok).toBe(true)
    expect(again.history).toEqual([])
    expect(await loadHistory()).toEqual([])
  })

  it('loads legacy history when IndexedDB cannot open and does not clear the key', async () => {
    localStorage.setItem(LEGACY_HISTORY_KEY, JSON.stringify([session('A'), session('B', { startedAt: 2 })]))
    resetHistoryDbConnection()
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true, writable: true })
    const result = await initHistory()
    expect(result.write.ok).toBe(false)
    expect(ids(result.history)).toEqual(['A', 'B'])
    expect(loadLegacyHistory().map((item) => item.id)).toEqual(['A', 'B'])
  })

  it('lets a new user keep in-memory workouts when IndexedDB is unavailable', async () => {
    resetHistoryDbConnection()
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true, writable: true })
    const result = await initHistory()
    expect(result.history).toEqual([])
    expect(result.write.ok).toBe(false)
    const saved = await saveSession(session('new'))
    expect(saved.ok).toBe(false)
    expect(await loadHistory()).toEqual([])
  })
})

