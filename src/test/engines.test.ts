import { describe, expect, it } from 'vitest'
import { validateTechniqueSequence, mirrorTechniqueIds, mirrorMovementId } from '../engines/comboValidator'
import { formatTechniqueCall, formatComboCall } from '../engines/speechEngine'
import { getTechnique } from '../data/techniques'
import {
  computeTechniqueDurationById,
  compareKickVsJabTiming,
  getPaceMultiplier,
  MIN_TECHNIQUE_MS,
} from '../engines/timingEngine'
import { getComboStats, CURATED_COMBOS } from '../data/combos'
import { validatePreferences } from '../storage/localStore'
import { nextCombo, getDemoCombos } from '../engines/comboGenerator'

describe('combo validation', () => {
  it('accepts a valid beginner combo', () => {
    const result = validateTechniqueSequence(['jab', 'cross', 'lead-hook'])
    expect(result.valid).toBe(true)
  })

  it('accepts repeated jabs', () => {
    const result = validateTechniqueSequence(['jab', 'jab', 'jab'])
    expect(result.valid).toBe(true)
  })

  it('rejects invalid stance transition (opposite slips)', () => {
    const result = validateTechniqueSequence(['slip-left', 'slip-right'])
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.code === 'invalid-stance-transition')).toBe(true)
  })

  it('rejects impossible range transition', () => {
    const result = validateTechniqueSequence(['lead-teep', 'curved-knee'])
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.code === 'impossible-range' || i.code === 'incompatible-follow-up')).toBe(
      true,
    )
  })

  it('rejects excessive combo length', () => {
    const ids = Array.from({ length: 10 }, () => 'jab')
    const result = validateTechniqueSequence(ids)
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.code === 'excessive-length')).toBe(true)
  })

  it('rejects incompatible follow-up', () => {
    const result = validateTechniqueSequence(['cross', 'rear-hook'])
    expect(result.valid).toBe(false)
    expect(
      result.issues.some((i) => i.code === 'incompatible-follow-up' || i.code === 'side-consistency'),
    ).toBe(true)
  })

  it('mirrors southpaw movement', () => {
    expect(mirrorMovementId('pivot-left', 'southpaw')).toBe('pivot-right')
    expect(mirrorTechniqueIds(['jab', 'cross', 'pivot-left'], 'southpaw')).toEqual([
      'jab',
      'cross',
      'pivot-right',
    ])
  })

  it('accepts a valid defense counter', () => {
    const result = validateTechniqueSequence(['parry', 'cross', 'lead-hook'])
    expect(result.valid).toBe(true)
  })

  it('accepts a valid movement exit', () => {
    const result = validateTechniqueSequence(['jab', 'cross', 'pivot-left'])
    expect(result.valid).toBe(true)
  })
})

describe('timing engine', () => {
  it('gives kicks more time than jabs', () => {
    const { jabMs, kickMs } = compareKickVsJabTiming('normal')
    expect(kickMs).toBeGreaterThan(jabMs)
  })

  it('gives movement additional time vs jab floor', () => {
    const jab = computeTechniqueDurationById('jab', 'normal', 1)
    const pivot = computeTechniqueDurationById('pivot-left', 'normal', 1)
    expect(pivot).toBeGreaterThan(jab)
  })

  it('applies custom pace multiplier', () => {
    const slow = computeTechniqueDurationById('jab', 'custom', 2)
    const fast = computeTechniqueDurationById('jab', 'custom', 0.7)
    expect(slow).toBeGreaterThan(fast)
  })

  it('enforces minimum timing limit', () => {
    const duration = computeTechniqueDurationById('jab', 'fight', 0.55)
    expect(duration).toBeGreaterThanOrEqual(MIN_TECHNIQUE_MS * 0.55)
    expect(getPaceMultiplier('custom', 0.4)).toBeGreaterThanOrEqual(0.55)
  })
})

describe('call styles', () => {
  it('formats names mode', () => {
    expect(formatTechniqueCall(getTechnique('jab'), 'names')).toBe('Jab')
    expect(formatTechniqueCall(getTechnique('rear-low-kick'), 'names')).toBe('Rear low kick')
  })

  it('formats numbers mode', () => {
    expect(formatTechniqueCall(getTechnique('jab'), 'numbers')).toBe('1')
    expect(formatTechniqueCall(getTechnique('cross'), 'numbers')).toBe('2')
    expect(formatTechniqueCall(getTechnique('rear-low-kick'), 'numbers')).toBe('Rear low kick')
  })

  it('formats hybrid mode', () => {
    expect(formatComboCall(['jab', 'cross', 'lead-hook', 'rear-low-kick'], 'hybrid')).toBe(
      'One, Two, Three, Rear low kick',
    )
  })
})

describe('settings persistence validation', () => {
  it('ignores malformed storage safely', () => {
    const prefs = validatePreferences({ theme: 'neon', stance: 'switch', speech: 'bad' })
    expect(prefs.theme).toBe('dark')
    expect(prefs.stance).toBe('orthodox')
    expect(prefs.speech.callStyle).toBeDefined()
  })

  it('persists known theme and stance values', () => {
    const prefs = validatePreferences({ theme: 'light', stance: 'southpaw', callStyle: 'numbers' })
    expect(prefs.theme).toBe('light')
    expect(prefs.stance).toBe('southpaw')
    expect(prefs.callStyle).toBe('numbers')
  })
})

describe('curated library and generator', () => {
  it('seeds required combo counts', () => {
    const stats = getComboStats()
    expect(stats.muayThai).toBeGreaterThanOrEqual(125)
    expect(stats.boxing).toBeGreaterThanOrEqual(100)
    expect(stats.total).toBeGreaterThanOrEqual(225)
    expect(stats.beginner).toBeGreaterThanOrEqual(25)
    expect(CURATED_COMBOS.length).toBe(stats.total)
  })

  it('every curated combo validates', () => {
    for (const combo of CURATED_COMBOS) {
      const ids = combo.techniques.map((t) => t.techniqueId)
      const result = validateTechniqueSequence(ids)
      expect(result.valid, `${combo.id}: ${result.issues.map((i) => i.message).join('; ')}`).toBe(true)
    }
  })

  it('demo combos use real curated data', () => {
    const demos = getDemoCombos('orthodox')
    expect(demos.length).toBe(5)
    demos.forEach((c) => {
      expect(c.techniques.length).toBeGreaterThan(0)
      expect(validateTechniqueSequence(c.techniques.map((t) => t.techniqueId)).valid).toBe(true)
    })
  })

  it('generator returns validated combos', () => {
    const combo = nextCombo({
      difficulty: 'beginner',
      stance: 'orthodox',
      mode: 'coach',
      equipment: 'shadowboxing',
      categories: ['punch', 'kick', 'teep', 'defense', 'movement'],
      defenseFrequency: 0.3,
      movementFrequency: 0.4,
      repetitionFrequency: 0.2,
      comboLength: { min: 2, max: 4 },
      includeHeadKicks: false,
      includeElbows: false,
      includeKnees: false,
      includeClinch: false,
      seed: 42,
    })
    expect(
      validateTechniqueSequence(combo.techniques.map((t) => t.techniqueId)).valid,
    ).toBe(true)
  })
})
