import { describe, expect, it } from 'vitest'
import { BOXING_COMBOS } from '../data/boxing'
import { CURATED_COMBOS, MUAY_THAI_COMBOS, filterCombos } from '../data/combos'
import { validateTechniqueSequence, MAX_COMBO_LENGTH, mirrorTechniqueIds } from '../engines/comboValidator'
import { formatTechniqueCall, formatComboCall, createSpeechEngine } from '../engines/speechEngine'
import { getTechnique, getTechniquesForSport } from '../data/techniques'
import { getQuickStartPresets } from '../data/quickStart'
import { createDefaultWorkout, DEFAULT_PREFERENCES, DEFAULT_SPEECH } from '../data/defaults'
import { migrateCustomCombo, validatePreferences, validateSessionSummary } from '../storage/localStore'
import { computeTrainingStats, computeStreaks, unlockMilestones } from '../engines/statsEngine'
import { SessionEngine } from '../engines/sessionEngine'
import type { SessionSummary } from '../types'

describe('Customize Workout config wiring', () => {
  it('selected configuration reaches SessionEngine with boxing flags', () => {
    const config = createDefaultWorkout({
      martialArt: 'boxing',
      mode: 'reaction',
      stance: 'southpaw',
      callStyle: 'numbers',
      defenseFrequency: 0.7,
    })
    expect(new SessionEngine(config).getSummary().martialArt).toBe('boxing')
    expect(config.mode).toBe('reaction')
    expect(config.includeKnees).toBe(false)
    expect(config.categories).not.toContain('kick')
  })

  it('round and coach defaults differ', () => {
    const round = createDefaultWorkout({ mode: 'round', rounds: 3, restDurationSec: 60 })
    const coach = createDefaultWorkout({ mode: 'coach', sessionDurationSec: 300, rounds: 1 })
    expect(round.mode).toBe('round')
    expect(coach.sessionDurationSec).toBe(300)
  })
})

describe('voice removal', () => {
  it('legacy voice preferences do not crash and spoken calls still work', async () => {
    const prefs = validatePreferences({
      speech: { voiceURI: 'old-voice', rate: 1.4, pitch: 0.5, volume: 0.2, callStyle: 'names' },
    })
    expect(prefs.speech.voiceURI).toBeNull()
    expect(prefs.speech.rate).toBe(1)
    expect(prefs.speech.callStyle).toBe('names')
    const engine = createSpeechEngine(() => ({ ...DEFAULT_SPEECH, spokenCallsEnabled: true }))
    await expect(engine.speak('Jab')).resolves.toBeUndefined()
  })

  it('names numbers hybrid still work for boxing', () => {
    expect(formatTechniqueCall(getTechnique('jab'), 'names')).toBe('Jab')
    expect(formatTechniqueCall(getTechnique('cross'), 'numbers')).toBe('2')
    expect(formatComboCall(['jab', 'cross', 'lead-hook', 'body-cross'], 'hybrid')).toBe(
      'One, Two, Three, Body cross',
    )
    expect(formatTechniqueCall(getTechnique('triple-jab'), 'numbers')).toBe('One, one, one')
  })
})

describe('custom combo maximum eight', () => {
  it('enforces eight technique maximum in domain and migration', () => {
    expect(MAX_COMBO_LENGTH).toBe(8)
    expect(validateTechniqueSequence(Array(8).fill('jab')).valid).toBe(true)
    expect(validateTechniqueSequence(Array(9).fill('jab')).valid).toBe(false)
    const migrated = migrateCustomCombo({
      id: 'custom-old',
      title: 'Long',
      techniqueIds: ['jab', 'cross', 'jab', 'cross', 'jab', 'cross', 'jab', 'cross', 'jab'],
      createdAt: 1,
      updatedAt: 1,
      favorite: false,
      repeatCount: 1,
    })
    expect(migrated?.techniqueIds).toHaveLength(8)
    expect(migrated?.migrated).toBe(true)
  })

  it('allows repeated valid strikes', () => {
    expect(validateTechniqueSequence(['jab', 'jab', 'cross']).valid).toBe(true)
  })
})

describe('boxing library', () => {
  it('loads 100+ boxing combos and all validate', () => {
    expect(BOXING_COMBOS.length).toBeGreaterThanOrEqual(100)
    expect(MUAY_THAI_COMBOS.length).toBeGreaterThanOrEqual(125)
    expect(CURATED_COMBOS.length).toBeGreaterThanOrEqual(225)
    for (const combo of BOXING_COMBOS) {
      expect(combo.martialArt).toBe('boxing')
      expect(combo.techniques.length).toBeLessThanOrEqual(8)
      const result = validateTechniqueSequence(combo.techniques.map((t) => t.techniqueId))
      expect(result.valid, combo.id).toBe(true)
      const ids = combo.techniques.map((t) => t.techniqueId)
      expect(
        ids.some(
          (id) =>
            id.includes('kick') ||
            id.includes('teep') ||
            id.includes('knee') ||
            id.includes('elbow') ||
            id.includes('clinch'),
        ),
      ).toBe(false)
    }
  })

  it('boxing techniques exclude muay-thai-only weapons', () => {
    const boxing = getTechniquesForSport('boxing')
    expect(boxing.every((t) => t.martialArts.includes('boxing'))).toBe(true)
    expect(boxing.some((t) => t.category === 'kick')).toBe(false)
  })

  it('southpaw mirrors boxing movement', () => {
    expect(mirrorTechniqueIds(['jab', 'cross', 'circle-left'], 'southpaw')).toEqual([
      'jab',
      'cross',
      'circle-right',
    ])
  })

  it('boxing quick starts use boxing data', () => {
    const presets = getQuickStartPresets('boxing')
    expect(presets.map((p) => p.title)).toEqual([
      'Quick Boxing',
      'Boxing Bag',
      'Shadowboxing',
      'Defense & Counters',
      'Boxing Conditioning',
      'Daily Boxing Drill',
    ])
    const config = presets[0]!.build({ ...DEFAULT_PREFERENCES, martialArt: 'boxing', stance: 'southpaw' })
    expect(config.martialArt).toBe('boxing')
    expect(config.stance).toBe('southpaw')
    expect(config.includeKnees).toBe(false)
    expect(filterCombos({ martialArt: 'boxing' }).length).toBeGreaterThanOrEqual(100)
  })
})

describe('training stats', () => {
  const sample: SessionSummary[] = [
    {
      id: '1',
      startedAt: Date.now() - 86400000,
      endedAt: Date.now() - 86400000 + 600000,
      martialArt: 'muay-thai',
      mode: 'round',
      stance: 'orthodox',
      pace: 'technical',
      totalTrainingMs: 600000,
      roundsCompleted: 3,
      combinationsCompleted: 12,
      techniquesCalled: 40,
      techniqueCounts: { jab: 10, cross: 8 },
      techniqueCategoryCounts: { punch: 30, kick: 10 },
      comboIds: ['beg-01', 'beg-02'],
      defenseActions: 2,
      movementActions: 3,
      averagePaceLabel: 'technical',
      dailyDrillCompleted: false,
      cancelled: false,
      favoriteComboIds: [],
      usedCustomCombo: false,
    },
    {
      id: '2',
      startedAt: Date.now(),
      endedAt: Date.now() + 300000,
      martialArt: 'boxing',
      mode: 'coach',
      stance: 'southpaw',
      pace: 'fight',
      totalTrainingMs: 300000,
      roundsCompleted: 1,
      combinationsCompleted: 8,
      techniquesCalled: 20,
      techniqueCounts: { jab: 5 },
      techniqueCategoryCounts: { punch: 20 },
      comboIds: ['bx-b01'],
      defenseActions: 1,
      movementActions: 1,
      averagePaceLabel: 'fight',
      dailyDrillCompleted: false,
      cancelled: false,
      favoriteComboIds: [],
      usedCustomCombo: false,
    },
  ]

  it('computes totals, filters, streaks, records, milestones', () => {
    const stats = computeTrainingStats(sample, { range: 'all' })
    expect(stats.totalSessions).toBe(2)
    expect(stats.combinationsCompleted).toBe(20)
    expect(computeStreaks(sample).current).toBeGreaterThanOrEqual(1)
    expect(stats.personalRecords.mostCombos).toBe(12)
    expect(unlockMilestones(sample).some((m) => m.id === 'first-session')).toBe(true)
    expect(unlockMilestones(sample).some((m) => m.id === 'both-sports')).toBe(true)
    expect(computeTrainingStats(sample, { martialArt: 'boxing' }).totalSessions).toBe(1)
  })

  it('empty stats and legacy / malformed history migration', () => {
    expect(computeTrainingStats([], { range: 'all' }).totalSessions).toBe(0)
    const legacy = validateSessionSummary({
      id: 'old',
      startedAt: 1000,
      endedAt: 2000,
      mode: 'coach',
      stance: 'orthodox',
      pace: 'normal',
      totalTrainingMs: 1000,
      roundsCompleted: 1,
      combinationsCompleted: 2,
      techniquesCalled: 4,
      techniqueCounts: {},
      defenseActions: 0,
      movementActions: 0,
      averagePaceLabel: 'normal',
      dailyDrillCompleted: false,
      cancelled: false,
      favoriteComboIds: [],
    })
    expect(legacy?.martialArt).toBe('muay-thai')
    expect(legacy?.migrated).toBe(true)
    expect(validateSessionSummary(null)).toBeNull()
    expect(validateSessionSummary({ id: 1 })).toBeNull()
  })
})
