import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppProvider } from '../context/AppContext'
import { HomePage } from '../pages/HomePage'
import { CURATED_COMBOS } from '../data/combos'
import { MMA_STRIKING_COMBOS, MMA_BEGINNER, MMA_INTERMEDIATE } from '../data/mma-striking'
import { getTechniquesForSport, lookupTechnique } from '../data/techniques'
import { generateRuleBasedCombo, getDemoCombos, nextCombo } from '../engines/comboGenerator'
import type { GeneratorOptions } from '../engines/comboGenerator'
import { validateTechniqueSequence } from '../engines/comboValidator'
import { validateRuntimeComboSemantics, validateTechniqueIdsForArt } from '../utils/comboSemantics'
import { createDefaultWorkout, DEFAULT_PREFERENCES } from '../data/defaults'
import { getQuickStartPresets } from '../data/quickStart'
import { pickDailyComboId, parseDailyDrillKey } from '../utils/dailyDrill'
import { MARTIAL_ARTS, validateWorkoutConfig, validateSessionSummary } from '../storage/sessionValidation'
import { importUserData } from '../storage/userData'
import { loadHistory, clearHistory } from '../storage/historyStore'
import { loadPreferences, savePreferences } from '../storage/localStore'
import { martialArtLabel } from '../utils/martialArt'
import { buildTechniqueCategories } from '../utils/techniqueCategories'
import { SessionEngine } from '../engines/sessionEngine'
import { computeTrainingStats } from '../engines/statsEngine'
import type { SessionSummary } from '../types'

describe('MMA Striking sport model', () => {
  it('accepts mma-striking and rejects unknown sports', () => {
    expect(MARTIAL_ARTS).toEqual(['muay-thai', 'boxing', 'mma-striking'])
    expect(martialArtLabel('mma-striking')).toBe('MMA Striking')
    expect(validateWorkoutConfig(createDefaultWorkout({ martialArt: 'mma-striking' }))).not.toBeNull()
    expect(validateWorkoutConfig({ ...createDefaultWorkout(), martialArt: 'kickboxing' as never })).toBeNull()
    expect(parseDailyDrillKey('2026-09-12:karate').ok).toBe(false)
  })

  it('keeps boxing and muay-thai valid', () => {
    expect(validateWorkoutConfig(createDefaultWorkout({ martialArt: 'boxing' }))).not.toBeNull()
    expect(validateWorkoutConfig(createDefaultWorkout({ martialArt: 'muay-thai' }))).not.toBeNull()
  })
})

describe('MMA Striking curated library', () => {
  it('has 75 unique MMA combos inside a 300-combo library', () => {
    expect(MMA_STRIKING_COMBOS).toHaveLength(75)
    expect(CURATED_COMBOS).toHaveLength(300)
    const ids = MMA_STRIKING_COMBOS.map((c) => c.id)
    expect(new Set(ids).size).toBe(75)
    expect(ids.every((id) => id.startsWith('mma-'))).toBe(true)
  })

  it('validates every MMA combo for sport and sequence', () => {
    for (const combo of MMA_STRIKING_COMBOS) {
      expect(combo.martialArt).toBe('mma-striking')
      const ids = combo.techniques.map((t) => t.techniqueId)
      expect(ids.some((id) => id.includes('clinch') || id === 'posture-control' || id === 'frame-and-knee')).toBe(
        false,
      )
      const sequence = validateTechniqueSequence(ids)
      expect(sequence.valid, `${combo.id}: ${sequence.issues.map((i) => i.message).join('; ')}`).toBe(true)
      const semantic = validateRuntimeComboSemantics(combo, 'mma-striking')
      expect(semantic.ok, `${combo.id}: ${semantic.ok ? '' : semantic.message}`).toBe(true)
      expect(validateTechniqueIdsForArt(ids, 'mma-striking').ok).toBe(true)
    }
  })

  it('does not duplicate shared techniques with MMA names', () => {
    const mmaTechs = getTechniquesForSport('mma-striking')
    expect(mmaTechs.some((t) => t.id === 'jab')).toBe(true)
    expect(mmaTechs.some((t) => /mma/i.test(t.id) || /mma/i.test(t.name))).toBe(false)
    expect(mmaTechs.some((t) => t.id === 'clinch-entry')).toBe(false)
    expect(mmaTechs.some((t) => t.category === 'kick')).toBe(true)
  })
})

describe('MMA Striking generator', () => {
  const options: GeneratorOptions = {
    martialArt: 'mma-striking' as const,
    difficulty: 'beginner' as const,
    stance: 'orthodox' as const,
    mode: 'coach' as const,
    equipment: 'shadowboxing' as const,
    categories: ['punch', 'kick', 'teep', 'defense', 'movement'],
    defenseFrequency: 0.35,
    movementFrequency: 0.5,
    repetitionFrequency: 0.15,
    comboLength: { min: 2, max: 6 },
    includeHeadKicks: false,
    includeElbows: false,
    includeKnees: false,
    includeClinch: true,
    preferCurated: false,
  }

  it('emits MMA-compatible combos without clinch or stacked kicks', () => {
    for (let i = 0; i < 24; i++) {
      const combo = generateRuleBasedCombo({ ...options, seed: i * 13 }, () => (i * 17 + 3) % 100 / 100)
      expect(combo, `seed ${i}`).not.toBeNull()
      expect(combo!.martialArt).toBe('mma-striking')
      expect(combo!.techniques.length).toBeGreaterThanOrEqual(2)
      expect(combo!.techniques.length).toBeLessThanOrEqual(5)
      const techs = combo!.techniques.map((t) => lookupTechnique(t.techniqueId)!)
      expect(techs.every((t) => t.martialArts.includes('mma-striking'))).toBe(true)
      expect(techs.some((t) => t.category === 'clinch')).toBe(false)
      const kicks = techs.filter((t) => t.category === 'kick' || t.category === 'teep')
      expect(kicks.length).toBeLessThanOrEqual(1)
      expect(validateTechniqueSequence(combo!.techniques.map((t) => t.techniqueId)).valid).toBe(true)
    }
  })

  it('does not leak boxing-only or muay-thai-only techniques', () => {
    for (let i = 0; i < 12; i++) {
      const combo = nextCombo({ ...options, preferCurated: true, seed: 40 + i })
      expect(combo).not.toBeNull()
      expect(combo!.martialArt).toBe('mma-striking')
      expect(combo!.id.startsWith('bx-') || combo!.id.startsWith('beg-')).toBe(false)
    }
  })

  it('keeps beginner work free of head kicks', () => {
    const combo = nextCombo({ ...options, preferCurated: true, seed: 2 })
    const ids = combo?.techniques.map((t) => t.techniqueId) ?? []
    expect(ids.some((id) => id.includes('head-kick'))).toBe(false)
  })
})

describe('MMA Striking product surfaces', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('Home exposes three sports and exact library counts', () => {
    render(
      <MemoryRouter>
        <AppProvider>
          <HomePage />
        </AppProvider>
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Muay Thai' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Boxing' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'MMA Striking' })).toBeInTheDocument()
    expect(screen.getByText(/300 built-in combos/i)).toBeInTheDocument()
    expect(screen.getByText(/125 Muay Thai, 100 Boxing, 75 MMA Striking/i)).toBeInTheDocument()
  })

  it('MMA quick starts preserve stance and stay MMA', () => {
    const presets = getQuickStartPresets('mma-striking')
    expect(presets.map((p) => p.title)).toEqual([
      'MMA Fundamentals',
      'Hands to Low Kick',
      'Defense & Exit',
      'MMA Fight Pace',
      'MMA Shadowboxing',
      'Daily MMA Drill',
    ])
    const config = presets[0]!.build({
      ...DEFAULT_PREFERENCES,
      martialArt: 'mma-striking',
      stance: 'southpaw',
      experience: 'intermediate',
    })
    expect(config.martialArt).toBe('mma-striking')
    expect(config.stance).toBe('southpaw')
    expect(config.difficulty).toBe('intermediate')
    expect(config.includeClinch).toBe(false)
    expect(config.comboLength.max).toBeLessThanOrEqual(4)
    expect(buildTechniqueCategories({
      martialArt: 'mma-striking',
      defenseFrequency: 0.3,
      movementFrequency: 0.4,
      includeKnees: true,
      includeElbows: false,
      includeClinch: true,
      equipment: 'heavy-bag',
    })).not.toContain('clinch')
  })

  it('Daily MMA pick stays in the MMA beginner/intermediate pool', () => {
    const key = '2026-09-12:mma-striking'
    const id = pickDailyComboId(key, 'mma-striking')
    const pool = [...MMA_BEGINNER, ...MMA_INTERMEDIATE].map((c) => c.id)
    expect(pool).toContain(id)
    expect(pickDailyComboId(key, 'mma-striking')).toBe(id)
    expect(parseDailyDrillKey(key)).toMatchObject({ ok: true, martialArt: 'mma-striking' })
  })

  it('SessionEngine preserves MMA configuration', () => {
    const config = createDefaultWorkout({ martialArt: 'mma-striking', mode: 'coach', stance: 'southpaw' })
    const engine = new SessionEngine(config)
    expect(engine.getSummary().martialArt).toBe('mma-striking')
    expect(getDemoCombos('orthodox', 'mma-striking').every((c) => c.martialArt === 'mma-striking')).toBe(true)
  })

  it('Stats counts MMA separately from Muay Thai', () => {
    const sample: SessionSummary[] = [
      {
        id: 'mma-1',
        startedAt: Date.now() - 1000,
        endedAt: Date.now(),
        martialArt: 'mma-striking',
        mode: 'coach',
        stance: 'orthodox',
        pace: 'technical',
        totalTrainingMs: 120000,
        roundsCompleted: 1,
        combinationsCompleted: 3,
        techniquesCalled: 8,
        techniqueCounts: { jab: 3 },
        techniqueCategoryCounts: { punch: 8 },
        comboIds: ['mma-b01', 'mma-b05'],
        defenseActions: 0,
        movementActions: 1,
        averagePaceLabel: 'technical',
        dailyDrillCompleted: false,
        cancelled: false,
        favoriteComboIds: [],
        usedCustomCombo: false,
      },
    ]
    const stats = computeTrainingStats(sample, { range: 'all' })
    expect(stats.mmaStrikingCombos).toBe(2)
    expect(stats.muayThaiCombos).toBe(0)
    expect(stats.sportBreakdownMs.find((row) => row.martialArt === 'mma-striking')?.ms).toBe(120000)
  })
})

describe('MMA Striking import compatibility', () => {
  beforeEach(async () => {
    localStorage.clear()
    await clearHistory()
  })

  it('accepts a v1.4 boxing/muay-thai export without rewriting sport', async () => {
    const payload = {
      version: 2,
      preferences: { ...DEFAULT_PREFERENCES, martialArt: 'boxing', onboardingComplete: true },
      favorites: [],
      customCombos: [],
      history: [
        {
          id: 'session-old-bx',
          startedAt: Date.now() - 5000,
          endedAt: Date.now() - 1000,
          martialArt: 'boxing',
          mode: 'coach',
          stance: 'orthodox',
          pace: 'technical',
          totalTrainingMs: 4000,
          roundsCompleted: 1,
          combinationsCompleted: 2,
          techniquesCalled: 4,
          techniqueCounts: { jab: 2 },
          defenseActions: 0,
          movementActions: 0,
          averagePaceLabel: 'technical',
          dailyDrillCompleted: false,
          cancelled: false,
          favoriteComboIds: [],
        },
      ],
      dailyDrills: {
        '2026-09-08:muay-thai': {
          dateKey: '2026-09-08:muay-thai',
          comboId: 'beg-01',
          martialArt: 'muay-thai',
          slowDone: true,
          normalDone: false,
          fightDone: false,
          completed: false,
        },
      },
    }
    const result = await importUserData(JSON.stringify(payload))
    expect(result.ok).toBe(true)
    expect(loadPreferences().martialArt).toBe('boxing')
    const history = await loadHistory()
    expect(history[0]?.martialArt).toBe('boxing')
  })

  it('accepts a valid MMA export', async () => {
    const payload = {
      version: 2,
      preferences: { ...DEFAULT_PREFERENCES, martialArt: 'mma-striking', onboardingComplete: true },
      favorites: ['mma-b01'],
      customCombos: [
        {
          id: 'custom-mma-1',
          title: 'MMA jab cross',
          techniqueIds: ['jab', 'cross'],
          createdAt: 1,
          updatedAt: 1,
          favorite: false,
          repeatCount: 2,
          martialArt: 'mma-striking',
        },
      ],
      history: [],
      dailyDrills: {},
    }
    const result = await importUserData(JSON.stringify(payload))
    expect(result.ok).toBe(true)
    expect(loadPreferences().martialArt).toBe('mma-striking')
  })

  it('rejects an unknown sport with zero writes', async () => {
    savePreferences({ ...DEFAULT_PREFERENCES, martialArt: 'muay-thai', onboardingComplete: true })
    const before = loadPreferences()
    const result = await importUserData(
      JSON.stringify({
        version: 2,
        preferences: { ...DEFAULT_PREFERENCES, martialArt: 'kickboxing' as never },
        history: [],
      }),
    )
    expect(result.ok).toBe(false)
    expect(loadPreferences().martialArt).toBe(before.martialArt)
  })
})

describe('MMA session summary identity', () => {
  it('stores MMA on a completed session summary', () => {
    const summary = validateSessionSummary({
      id: 'session-mma-test',
      startedAt: 1_000,
      endedAt: 2_000,
      martialArt: 'mma-striking',
      mode: 'coach',
      stance: 'orthodox',
      pace: 'technical',
      totalTrainingMs: 1000,
      roundsCompleted: 1,
      combinationsCompleted: 1,
      techniquesCalled: 2,
      techniqueCounts: { jab: 1 },
      defenseActions: 0,
      movementActions: 0,
      averagePaceLabel: 'technical',
      dailyDrillCompleted: false,
      cancelled: false,
      favoriteComboIds: [],
    })
    expect(summary?.martialArt).toBe('mma-striking')
  })
})
