import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppProvider } from '../context/AppContext'
import { AppReactContext, useApp, type AppContextValue } from '../context/useApp'
import { BuilderPage } from '../pages/BuilderPage'
import { createDefaultWorkout, DEFAULT_PREFERENCES, DEFAULT_SPEECH } from '../data/defaults'
import { SessionEngine } from '../engines/sessionEngine'
import { validateTechniqueSequence } from '../engines/comboValidator'
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
  STORAGE_KEYS,
} from '../storage/localStore'
import { validateSessionSummary } from '../storage/sessionValidation'
import { importUserData } from '../storage/userData'
import { loadHistory, saveSession } from '../storage/historyStore'
import {
  CUSTOM_COMBO_INVALID_SEQUENCE_MESSAGE,
  CUSTOM_COMBO_UNKNOWN_TECHNIQUE_MESSAGE,
  customComboSportUnavailableMessage,
  tryCustomComboToRuntime,
  validateCustomComboSemantics,
} from '../utils/customCombo'
import * as primeAudio from '../utils/primeAudio'
import type { Combo, CustomCombo, DailyDrillState, SessionSummary, WorkoutConfig } from '../types'

function comboRecord(
  id: string,
  extra: Partial<CustomCombo> & { techniqueIds?: string[] } = {},
): CustomCombo {
  const combo: CustomCombo = {
    id,
    title: extra.title ?? `Combo ${id}`,
    techniqueIds: extra.techniqueIds ?? ['jab', 'cross'],
    createdAt: extra.createdAt ?? 1,
    updatedAt: extra.updatedAt ?? 2,
    favorite: extra.favorite ?? false,
    repeatCount: extra.repeatCount ?? 1,
    martialArt: extra.martialArt ?? 'muay-thai',
  }
  if (extra.migrated != null) combo.migrated = extra.migrated
  return combo
}

function validSession(id: string): Record<string, unknown> {
  return {
    id,
    startedAt: 1_700_000_000_000,
    endedAt: 1_700_000_060_000,
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
  }
}

function dailyState(dateKey: string, comboId: string): DailyDrillState {
  return {
    dateKey,
    comboId,
    martialArt: 'muay-thai',
    slowDone: false,
    normalDone: false,
    fightDone: false,
    completed: false,
  }
}

function runtimeCombo(id: string, techniqueIds: string[]): Combo {
  return {
    id,
    title: `Combo ${id}`,
    difficulty: 'beginner',
    stance: 'orthodox',
    trainingModes: ['custom', 'coach', 'round', 'learn', 'daily', 'demo', 'reaction'],
    purpose: 'conditioning',
    techniques: techniqueIds.map((techniqueId) => ({ techniqueId })),
    recommendedPace: 'technical',
    setupExplanation: 't',
    endingPosition: 'base',
    safeExit: 'reset',
    coachingNotes: 'n',
    tags: ['custom'],
    equipment: ['shadowboxing'],
    martialArt: 'muay-thai',
  }
}

function silentWorkout(partial: Partial<WorkoutConfig> = {}): WorkoutConfig {
  return createDefaultWorkout({
    mode: 'custom',
    sessionDurationSec: 900,
    roundDurationSec: 900,
    rounds: 1,
    finishWhenQueueEmpty: true,
    showNextTechnique: true,
    speech: {
      ...DEFAULT_SPEECH,
      volume: 0,
      coachingCuesEnabled: false,
      countdownEnabled: false,
      roundCallsEnabled: false,
      musicFriendly: false,
      captionsEnabled: true,
      spokenCallsEnabled: false,
    },
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

async function runUntilSummary(engine: SessionEngine, queue: Combo[]) {
  const started = engine.start({ comboQueue: queue })
  for (let i = 0; i < 200; i++) {
    await vi.advanceTimersByTimeAsync(200)
    if (engine.snapshot().phase === 'summary') break
  }
  return started
}

async function seedExistingUserData() {
  savePreferences({ ...DEFAULT_PREFERENCES, stance: 'southpaw' })
  saveFavorites(['keep-fav'])
  saveCustomCombos([comboRecord('keep-combo')])
  saveDailyDrillMap({ '2026-01-01:muay-thai': dailyState('2026-01-01:muay-thai', 'beg-01') })
  expect(await saveSession(validateSessionSummary(validSession('existing')) as SessionSummary)).toEqual({
    ok: true,
  })
}

async function expectExistingUserDataUnchanged() {
  expect(loadPreferences().stance).toBe('southpaw')
  expect(loadFavorites()).toEqual(['keep-fav'])
  expect(loadCustomCombos().map((combo) => combo.id)).toEqual(['keep-combo'])
  expect(loadDailyDrillMap()['2026-01-01:muay-thai']?.comboId).toBe('beg-01')
  expect((await loadHistory()).map((item) => item.id)).toEqual(['existing'])
}

function spyImportMutations() {
  const setItem = vi.spyOn(Storage.prototype, 'setItem')
  const put = vi.spyOn(IDBObjectStore.prototype, 'put')
  const clear = vi.spyOn(IDBObjectStore.prototype, 'clear')
  setItem.mockClear()
  put.mockClear()
  clear.mockClear()
  return {
    setItem,
    put,
    clear,
    restore() {
      setItem.mockRestore()
      put.mockRestore()
      clear.mockRestore()
    },
  }
}

function builderContext(overrides: Partial<AppContextValue> = {}): AppContextValue {
  return {
    preferences: { ...DEFAULT_PREFERENCES, onboardingComplete: true },
    setPreferences: vi.fn(),
    updatePreferences: vi.fn(),
    resolvedTheme: 'dark',
    setTheme: vi.fn(),
    favorites: [],
    toggleFavorite: vi.fn(),
    customCombos: [],
    upsertCustomCombo: vi.fn(),
    removeCustomCombo: vi.fn(),
    history: [],
    historyReady: true,
    dataMutationPending: false,
    addHistory: vi.fn(async () => ({ status: 'skipped' as const })),
    clearHistory: vi.fn(async () => {}),
    resetPreferences: vi.fn(),
    dailyDrills: {},
    setDailyDrill: vi.fn(),
    getDailyDrill: vi.fn(() => null),
    exportData: vi.fn(async () => '{}'),
    importData: vi.fn(async () => ({ ok: true, message: 'Import successful.' })),
    deleteAllUserData: vi.fn(async () => ({ ok: true as const })),
    storageIssue: null,
    storageWarningVisible: false,
    dismissStorageIssue: vi.fn(),
    ...overrides,
  }
}

function UpsertProbe({ combo }: { combo: CustomCombo }) {
  const { upsertCustomCombo, customCombos, storageIssue } = useApp()
  return (
    <div>
      <button type="button" onClick={() => upsertCustomCombo(combo)}>
        upsert
      </button>
      <span data-testid="combo-ids">{customCombos.map((item) => item.id).join(',')}</span>
      <span data-testid="issue">{storageIssue?.message ?? ''}</span>
    </div>
  )
}

describe('A3 custom combo semantic validator', () => {
  it('rejects unknown techniques without salvaging the rest of the combo', () => {
    const result = validateCustomComboSemantics({
      techniqueIds: ['jab', 'does-not-exist', 'cross'],
      martialArt: 'boxing',
    })
    expect(result).toEqual({
      ok: false,
      reason: 'unknown-technique',
      message: CUSTOM_COMBO_UNKNOWN_TECHNIQUE_MESSAGE,
    })
  })

  it('rejects techniques that do not list the combo martial art', () => {
    const result = validateCustomComboSemantics({
      techniqueIds: ['jab', 'rear-low-kick'],
      martialArt: 'boxing',
    })
    expect(result).toEqual({
      ok: false,
      reason: 'sport-incompatible',
      message: customComboSportUnavailableMessage('boxing'),
    })
  })

  it('accepts shared boxing/muay thai punches on a boxing combo', () => {
    expect(validateCustomComboSemantics({ techniqueIds: ['jab', 'cross'], martialArt: 'boxing' })).toEqual({
      ok: true,
    })
  })

  it('rejects error-level sequences and ignores warnings', () => {
    expect(validateTechniqueSequence(['cross', 'rear-hook']).valid).toBe(false)
    expect(
      validateCustomComboSemantics({ techniqueIds: ['cross', 'rear-hook'], martialArt: 'muay-thai' }),
    ).toEqual({
      ok: false,
      reason: 'invalid-sequence',
      message: CUSTOM_COMBO_INVALID_SEQUENCE_MESSAGE,
    })

    const warned = validateTechniqueSequence(['clinch-entry'])
    expect(warned.valid).toBe(true)
    expect(warned.issues.some((issue) => issue.severity === 'warning')).toBe(true)
    expect(validateCustomComboSemantics({ techniqueIds: ['clinch-entry'], martialArt: 'muay-thai' })).toEqual({
      ok: true,
    })
  })

  it('tryCustomComboToRuntime returns null for semantically invalid data', () => {
    expect(tryCustomComboToRuntime(comboRecord('ok'))).not.toBeNull()
    expect(
      tryCustomComboToRuntime(comboRecord('bad', { techniqueIds: ['jab', 'does-not-exist'] })),
    ).toBeNull()
  })
})

describe('A3 strict custom-combo import', () => {
  beforeEach(async () => {
    localStorage.clear()
    await seedExistingUserData()
  })

  it('rejects an unknown technique and performs zero writes', async () => {
    const spies = spyImportMutations()
    try {
      const result = await importUserData(
        JSON.stringify({
          version: 3,
          preferences: { ...DEFAULT_PREFERENCES, stance: 'orthodox' },
          favorites: ['imported-fav'],
          customCombos: [
            {
              id: 'bad',
              title: 'Bad combo',
              techniqueIds: ['jab', 'does-not-exist'],
              martialArt: 'boxing',
              repeatCount: 1,
            },
          ],
          history: [validSession('imported')],
          dailyDrills: {
            '2026-02-01:muay-thai': dailyState('2026-02-01:muay-thai', 'beg-02'),
          },
        }),
      )
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.message).toBe(CUSTOM_COMBO_UNKNOWN_TECHNIQUE_MESSAGE)
      expect(spies.setItem).not.toHaveBeenCalled()
      expect(spies.put).not.toHaveBeenCalled()
      expect(spies.clear).not.toHaveBeenCalled()
      await expectExistingUserDataUnchanged()
    } finally {
      spies.restore()
    }
  })

  it('rejects a boxing combo that includes a Muay Thai-only technique', async () => {
    const spies = spyImportMutations()
    try {
      const result = await importUserData(
        JSON.stringify({
          version: 3,
          customCombos: [
            {
              id: 'wrong-sport',
              title: 'Kickboxing by accident',
              techniqueIds: ['jab', 'rear-low-kick'],
              martialArt: 'boxing',
              repeatCount: 1,
            },
          ],
        }),
      )
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.message).toBe(customComboSportUnavailableMessage('boxing'))
      expect(spies.setItem).not.toHaveBeenCalled()
      await expectExistingUserDataUnchanged()
    } finally {
      spies.restore()
    }
  })

  it('accepts a boxing combo of shared jab and cross', async () => {
    const result = await importUserData(
      JSON.stringify({
        version: 3,
        customCombos: [
          {
            id: 'box-valid',
            title: 'Jab cross',
            techniqueIds: ['jab', 'cross'],
            martialArt: 'boxing',
            repeatCount: 1,
          },
        ],
      }),
    )
    expect(result.ok).toBe(true)
    expect(loadCustomCombos()).toEqual([
      expect.objectContaining({
        id: 'box-valid',
        techniqueIds: ['jab', 'cross'],
        martialArt: 'boxing',
      }),
    ])
  })

  it('rejects an invalid technique sequence with zero writes', async () => {
    expect(validateTechniqueSequence(['cross', 'rear-hook']).valid).toBe(false)
    const spies = spyImportMutations()
    try {
      const result = await importUserData(
        JSON.stringify({
          version: 3,
          preferences: { ...DEFAULT_PREFERENCES, stance: 'orthodox' },
          customCombos: [
            {
              id: 'bad-seq',
              title: 'Rear power',
              techniqueIds: ['cross', 'rear-hook'],
              martialArt: 'muay-thai',
              repeatCount: 1,
            },
          ],
        }),
      )
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.message).toBe(CUSTOM_COMBO_INVALID_SEQUENCE_MESSAGE)
      expect(spies.setItem).not.toHaveBeenCalled()
      await expectExistingUserDataUnchanged()
    } finally {
      spies.restore()
    }
  })

  it('rejects the entire payload when one of several custom combos is invalid', async () => {
    const spies = spyImportMutations()
    try {
      const result = await importUserData(
        JSON.stringify({
          version: 3,
          customCombos: [
            comboRecord('good'),
            comboRecord('bad', { techniqueIds: ['jab', 'does-not-exist'] }),
          ],
        }),
      )
      expect(result.ok).toBe(false)
      expect(spies.setItem).not.toHaveBeenCalled()
      await expectExistingUserDataUnchanged()
    } finally {
      spies.restore()
    }
  })
})

describe('A3 load salvage and save defense', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('loads valid combos and drops unknown, wrong-sport, and invalid-sequence records', () => {
    localStorage.setItem(
      STORAGE_KEYS.customCombos,
      JSON.stringify([
        comboRecord('A'),
        comboRecord('B', { techniqueIds: ['jab', 'does-not-exist'] }),
        comboRecord('C', { martialArt: 'boxing', techniqueIds: ['jab', 'rear-low-kick'] }),
        comboRecord('D', { techniqueIds: ['cross', 'rear-hook'] }),
        comboRecord('E', { techniqueIds: ['jab', 'cross', 'lead-hook'] }),
      ]),
    )
    expect(loadCustomCombos().map((combo) => combo.id)).toEqual(['A', 'E'])
  })

  it('still truncates legacy lists longer than eight before semantic validation', () => {
    const nine = ['jab', 'cross', 'jab', 'cross', 'jab', 'cross', 'jab', 'cross', 'jab']
    const migrated = migrateCustomCombo({
      id: 'legacy-long',
      title: 'Long',
      techniqueIds: nine,
      createdAt: 1,
      updatedAt: 1,
      favorite: false,
      repeatCount: 1,
    })
    expect(migrated?.techniqueIds).toHaveLength(8)
    expect(migrated?.migrated).toBe(true)
    expect(validateCustomComboSemantics(migrated!).ok).toBe(true)

    localStorage.setItem(
      STORAGE_KEYS.customCombos,
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
  })

  it('does not persist semantically invalid combos through saveCustomCombos', () => {
    const invalid = comboRecord('bad', { techniqueIds: ['jab', 'does-not-exist'] })
    expect(saveCustomCombos([invalid])).toEqual({ ok: true })
    expect(loadCustomCombos()).toEqual([])
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.customCombos) ?? '[]')).toEqual([])

    expect(saveCustomCombos([comboRecord('good'), invalid, comboRecord('also-good')])).toEqual({ ok: true })
    expect(loadCustomCombos().map((combo) => combo.id)).toEqual(['good', 'also-good'])
  })

  it('upsertCustomCombo surfaces a write failure instead of keeping invalid in-memory state', async () => {
    const user = userEvent.setup()
    render(
      <AppProvider>
        <UpsertProbe combo={comboRecord('bad', { techniqueIds: ['does-not-exist'] })} />
      </AppProvider>,
    )
    await user.click(screen.getByRole('button', { name: /^upsert$/i }))
    expect(screen.getByTestId('combo-ids')).toHaveTextContent('')
    expect(screen.getByTestId('issue')).toHaveTextContent(CUSTOM_COMBO_UNKNOWN_TECHNIQUE_MESSAGE)
    expect(loadCustomCombos()).toEqual([])
  })
})

describe('A3 Builder corrupted in-memory combo', () => {
  it('renders, displays a fallback id, allows delete, and refuses Train Combo', async () => {
    const user = userEvent.setup()
    const corrupt = comboRecord('corrupt', {
      title: 'Corrupt combo',
      techniqueIds: ['jab', 'does-not-exist'],
      martialArt: 'boxing',
    })
    const removeCustomCombo = vi.fn()
    const primeSpy = vi.spyOn(primeAudio, 'primeTrainingAudio')
    render(
      <AppReactContext.Provider value={builderContext({ customCombos: [corrupt], removeCustomCombo })}>
        <MemoryRouter initialEntries={['/builder']}>
          <Routes>
            <Route path="/builder" element={<BuilderPage />} />
            <Route path="/session" element={<div data-testid="session-page">session</div>} />
          </Routes>
        </MemoryRouter>
      </AppReactContext.Provider>,
    )

    expect(screen.getByRole('heading', { name: /custom combo builder/i })).toBeInTheDocument()
    expect(screen.getByText('Corrupt combo')).toBeInTheDocument()
    expect(screen.getByText(/does-not-exist/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /train combo/i }))
    expect(screen.queryByTestId('session-page')).not.toBeInTheDocument()
    expect(primeSpy).not.toHaveBeenCalled()
    expect(screen.getAllByText(CUSTOM_COMBO_UNKNOWN_TECHNIQUE_MESSAGE).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: /^delete$/i }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /^delete$/i }))
    expect(removeCustomCombo).toHaveBeenCalledWith('corrupt')
    primeSpy.mockRestore()
  })
})

describe('A3 SessionEngine malformed custom queue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('skips an invalid first combo, plays the valid one, and does not count invalid techniques', async () => {
    const tracked = trackUnhandled()
    const engine = new SessionEngine(silentWorkout(), { wakeLock: false })
    const started = runUntilSummary(engine, [
      runtimeCombo('bad', ['does-not-exist']),
      runtimeCombo('good', ['jab', 'cross']),
    ])
    await started
    const summary = engine.getSummary()
    expect(engine.snapshot().phase).toBe('summary')
    expect(summary.combinationsCompleted).toBe(1)
    expect(summary.comboIds).toEqual(['good'])
    expect(summary.techniqueCounts['does-not-exist']).toBeUndefined()
    expect(summary.techniqueCounts.jab).toBeGreaterThan(0)
    expect(tracked.reasons).toEqual([])
    tracked.stop()
    engine.stop()
  })

  it('finishes a finite all-invalid queue without hanging or rejecting', async () => {
    const tracked = trackUnhandled()
    const engine = new SessionEngine(silentWorkout(), { wakeLock: false })
    const started = runUntilSummary(engine, [
      runtimeCombo('bad-1', ['does-not-exist']),
      runtimeCombo('bad-2', ['also-missing']),
    ])
    await expect(started).resolves.toBeUndefined()
    expect(engine.snapshot().phase).toBe('summary')
    expect(engine.getSummary().combinationsCompleted).toBe(0)
    expect(engine.getSummary().techniquesCalled).toBe(0)
    expect(tracked.reasons).toEqual([])
    tracked.stop()
    engine.stop()
  })

  it('snapshot() does not throw when the next technique id is corrupt', () => {
    const engine = new SessionEngine(silentWorkout(), { wakeLock: false })
    const internals = engine as unknown as { combo: Combo | null; stepIndex: number }
    internals.combo = runtimeCombo('corrupt-next', ['jab', 'does-not-exist'])
    internals.stepIndex = 0
    expect(() => engine.snapshot()).not.toThrow()
    expect(engine.snapshot().nextTechniqueLabel).toBeNull()
    engine.stop()
  })
})
