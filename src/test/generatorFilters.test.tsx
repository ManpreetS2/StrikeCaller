import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AppProvider } from '../context/AppContext'
import { appRoutes } from '../routes'
import { DEFAULT_PREFERENCES, DEFAULT_SPEECH, createDefaultWorkout } from '../data/defaults'
import { lookupTechnique, TECHNIQUES } from '../data/techniques'
import { SessionEngine } from '../engines/sessionEngine'
import {
  comboGeneration,
  generateRuleBasedCombo,
  matchesRuleGeneratorDifficulty,
  nextCombo,
  selectCuratedCombos,
  type GeneratorOptions,
} from '../engines/comboGenerator'
import {
  isComboEligibleForGenerator,
  isTechniqueEligibleForGenerator,
  selectEligibleCuratedCombos,
} from '../engines/generatorEligibility'
import * as generatorEligibility from '../engines/generatorEligibility'
import { validateTechniqueSequence } from '../engines/comboValidator'
import { validateRuntimeComboSemantics } from '../utils/comboSemantics'
import { buildTechniqueCategories } from '../utils/techniqueCategories'
import * as primeAudio from '../utils/primeAudio'
import type { Combo, Technique, TechniqueCategory, WorkoutConfig } from '../types'

function mulberry32(seed: number) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function baseOptions(partial: Partial<GeneratorOptions> = {}): GeneratorOptions {
  return {
    martialArt: 'muay-thai',
    difficulty: 'beginner',
    stance: 'orthodox',
    mode: 'coach',
    equipment: 'shadowboxing',
    categories: ['punch', 'kick', 'teep', 'defense', 'movement'],
    defenseFrequency: 0.35,
    movementFrequency: 0.4,
    repetitionFrequency: 0.2,
    comboLength: { min: 2, max: 4 },
    includeHeadKicks: false,
    includeElbows: false,
    includeKnees: false,
    includeClinch: false,
    preferCurated: true,
    seed: 1,
    ...partial,
  }
}

function techniquesOf(combo: Combo): Technique[] {
  return combo.techniques.map((step) => {
    const technique = lookupTechnique(step.techniqueId)
    expect(technique, `unknown technique ${step.techniqueId}`).not.toBeNull()
    return technique!
  })
}

function categoriesOf(combo: Combo): TechniqueCategory[] {
  return techniquesOf(combo).map((t) => t.category)
}

function assertComboRespectsOptions(combo: Combo, options: GeneratorOptions) {
  expect(isComboEligibleForGenerator(combo, options)).toBe(true)
  expect(validateTechniqueSequence(combo.techniques.map((t) => t.techniqueId)).valid).toBe(true)
  const art = options.martialArt ?? combo.martialArt
  expect(validateRuntimeComboSemantics(combo, art).ok).toBe(true)
  for (const technique of techniquesOf(combo)) {
    expect(isTechniqueEligibleForGenerator(technique, options)).toBe(true)
    if (options.martialArt) {
      expect(technique.martialArts.includes(options.martialArt)).toBe(true)
    }
  }
}

function assertNeverCategories(combo: Combo, banned: TechniqueCategory[]) {
  expect(categoriesOf(combo).some((category) => banned.includes(category))).toBe(false)
}

function ruleAllowed(options: GeneratorOptions): Technique[] {
  return TECHNIQUES.filter(
    (t) =>
      isTechniqueEligibleForGenerator(t, options) &&
      matchesRuleGeneratorDifficulty(t, options.difficulty),
  )
}

function starterPool(options: GeneratorOptions): Technique[] {
  return ruleAllowed(options).filter((t) =>
    ['punch', 'teep', 'defense', 'kick', 'knee', 'elbow', 'clinch', 'counter'].includes(t.category),
  )
}

function generateStartingAt(
  options: GeneratorOptions,
  match: (technique: Technique) => boolean,
): Combo | null {
  const starters = starterPool(options)
  const index = starters.findIndex(match)
  expect(index).toBeGreaterThanOrEqual(0)
  return generateRuleBasedCombo(options, () => (index + 0.5) / starters.length)
}

function seedCompletedOnboarding() {
  localStorage.setItem(
    'strikecaller:preferences',
    JSON.stringify({
      ...DEFAULT_PREFERENCES,
      onboardingComplete: true,
      wakeLock: false,
      preferMinimalMode: false,
      wakeLockNoticeDismissed: true,
      speech: {
        ...DEFAULT_SPEECH,
        volume: 0,
        countdownEnabled: false,
        roundCallsEnabled: false,
        coachingCuesEnabled: false,
        spokenCallsEnabled: false,
        captionsEnabled: true,
      },
      sound: {
        bellsEnabled: false,
        tonesEnabled: false,
        vibrationEnabled: false,
        masterVolume: 0,
      },
      customComboMigrationNoticeShown: true,
    }),
  )
}

function renderApp(path: string) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] })
  const view = render(
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>,
  )
  return { ...view, router }
}

describe('buildTechniqueCategories', () => {
  it('Boxing with defense 0 and movement 0 does not advertise those families', () => {
    expect(
      buildTechniqueCategories({
        martialArt: 'boxing',
        defenseFrequency: 0,
        movementFrequency: 0,
        includeKnees: true,
        includeElbows: true,
        includeClinch: true,
        equipment: 'partner',
      }),
    ).toEqual(['punch'])
  })

  it('Boxing with defense > 0 includes defense and counter', () => {
    expect(
      buildTechniqueCategories({
        martialArt: 'boxing',
        defenseFrequency: 0.35,
        movementFrequency: 0,
        includeKnees: false,
        includeElbows: false,
        includeClinch: false,
        equipment: 'shadowboxing',
      }),
    ).toEqual(['punch', 'defense', 'counter'])
  })

  it('Boxing with movement > 0 includes movement', () => {
    expect(
      buildTechniqueCategories({
        martialArt: 'boxing',
        defenseFrequency: 0,
        movementFrequency: 0.4,
        includeKnees: false,
        includeElbows: false,
        includeClinch: false,
        equipment: 'shadowboxing',
      }),
    ).toEqual(['punch', 'movement'])
  })

  it('Muay Thai + knees includes knee', () => {
    expect(
      buildTechniqueCategories({
        martialArt: 'muay-thai',
        defenseFrequency: 0,
        movementFrequency: 0,
        includeKnees: true,
        includeElbows: false,
        includeClinch: false,
        equipment: 'heavy-bag',
      }),
    ).toEqual(['punch', 'kick', 'teep', 'knee'])
  })

  it('Muay Thai + elbows includes elbow', () => {
    expect(
      buildTechniqueCategories({
        martialArt: 'muay-thai',
        defenseFrequency: 0,
        movementFrequency: 0,
        includeKnees: false,
        includeElbows: true,
        includeClinch: false,
        equipment: 'heavy-bag',
      }),
    ).toContain('elbow')
  })

  it('Muay Thai + clinch with valid equipment includes clinch', () => {
    expect(
      buildTechniqueCategories({
        martialArt: 'muay-thai',
        defenseFrequency: 0,
        movementFrequency: 0,
        includeKnees: false,
        includeElbows: false,
        includeClinch: true,
        equipment: 'partner',
      }),
    ).toContain('clinch')
  })

  it('shadowboxing does not keep clinch in the category list', () => {
    expect(
      buildTechniqueCategories({
        martialArt: 'muay-thai',
        defenseFrequency: 0,
        movementFrequency: 0,
        includeKnees: false,
        includeElbows: false,
        includeClinch: true,
        equipment: 'shadowboxing',
      }),
    ).not.toContain('clinch')
  })
})

describe('A6 hard exclusions despite stale categories', () => {
  const staleDefense = baseOptions({
    categories: ['punch', 'defense', 'counter'],
    defenseFrequency: 0,
    movementFrequency: 0,
    includeKnees: false,
    includeElbows: false,
    includeClinch: false,
    includeHeadKicks: false,
  })

  const staleMovement = baseOptions({
    categories: ['punch', 'kick', 'teep', 'movement'],
    defenseFrequency: 0,
    movementFrequency: 0,
  })

  it('defenseFrequency 0 excludes defense/counter from rule generation', () => {
    for (let seed = 0; seed < 25; seed++) {
      const combo = generateRuleBasedCombo(staleDefense, mulberry32(seed))
      if (!combo) continue
      assertNeverCategories(combo, ['defense', 'counter'])
      assertComboRespectsOptions(combo, staleDefense)
    }
  })

  it('defenseFrequency 0 excludes defense/counter from the primary curated pool', () => {
    const pool = selectEligibleCuratedCombos(staleDefense, { broadenDifficulty: false })
    expect(pool.length).toBeGreaterThan(0)
    for (const combo of pool) {
      assertNeverCategories(combo, ['defense', 'counter'])
      assertComboRespectsOptions(combo, staleDefense)
    }
  })

  it('defenseFrequency 0 excludes defense/counter from nextCombo', () => {
    for (let seed = 0; seed < 20; seed++) {
      const combo = nextCombo({ ...staleDefense, seed })
      expect(combo).not.toBeNull()
      assertNeverCategories(combo!, ['defense', 'counter'])
      assertComboRespectsOptions(combo!, staleDefense)
    }
  })

  it('movementFrequency 0 excludes movement from rule generation and exits', () => {
    for (let seed = 0; seed < 25; seed++) {
      const combo = generateRuleBasedCombo(staleMovement, mulberry32(seed))
      if (!combo) continue
      assertNeverCategories(combo, ['movement'])
      assertComboRespectsOptions(combo, staleMovement)
    }
  })

  it('movementFrequency 0 excludes movement from nextCombo', () => {
    for (let seed = 0; seed < 20; seed++) {
      const combo = nextCombo({ ...staleMovement, seed })
      expect(combo).not.toBeNull()
      assertNeverCategories(combo!, ['movement'])
      assertComboRespectsOptions(combo!, staleMovement)
    }
  })

  it('curated <5 fallback preserves defense 0', () => {
    const options = baseOptions({
      martialArt: 'boxing',
      difficulty: 'advanced',
      mode: 'reaction',
      categories: ['punch', 'defense', 'counter'],
      defenseFrequency: 0,
      movementFrequency: 0,
      comboLength: { min: 2, max: 2 },
    })
    const strict = selectEligibleCuratedCombos(options, { broadenDifficulty: false })
    expect(strict.length).toBeLessThan(5)
    const selected = selectCuratedCombos(options)
    expect(selected.length).toBeGreaterThan(0)
    expect(selected.some((combo) => combo.difficulty !== 'advanced')).toBe(true)
    for (const combo of selected) {
      assertNeverCategories(combo, ['defense', 'counter', 'movement'])
      assertComboRespectsOptions(combo, options)
    }
  })

  it('curated <5 fallback preserves movement 0', () => {
    const options = baseOptions({
      martialArt: 'boxing',
      difficulty: 'advanced',
      mode: 'reaction',
      categories: ['punch', 'movement'],
      defenseFrequency: 0,
      movementFrequency: 0,
      comboLength: { min: 2, max: 2 },
    })
    const strict = selectEligibleCuratedCombos(options, { broadenDifficulty: false })
    expect(strict.length).toBeLessThan(5)
    const selected = selectCuratedCombos(options)
    expect(selected.length).toBeGreaterThan(0)
    for (const combo of selected) {
      assertNeverCategories(combo, ['movement'])
      assertComboRespectsOptions(combo, options)
    }
  })
})

describe('A6 knees, elbows, clinch, and head kicks', () => {
  it('includeKnees false excludes knees even if categories contain knee', () => {
    const options = baseOptions({
      categories: ['punch', 'kick', 'teep', 'knee'],
      includeKnees: false,
      defenseFrequency: 0,
      movementFrequency: 0,
    })
    expect(TECHNIQUES.some((t) => t.category === 'knee' && isTechniqueEligibleForGenerator(t, options))).toBe(
      false,
    )
    for (let seed = 0; seed < 20; seed++) {
      const combo = nextCombo({ ...options, seed })
      expect(combo).not.toBeNull()
      assertNeverCategories(combo!, ['knee'])
      assertComboRespectsOptions(combo!, options)
    }
  })

  it('includeKnees true is eligible and reachable despite stale categories omitting knee', () => {
    const options = baseOptions({
      difficulty: 'intermediate',
      categories: ['punch', 'kick', 'teep'],
      includeKnees: true,
      includeElbows: false,
      includeClinch: false,
      defenseFrequency: 0,
      movementFrequency: 0,
      equipment: 'heavy-bag',
      preferCurated: false,
    })
    const leadKnee = lookupTechnique('lead-knee')!
    expect(leadKnee.difficulty).toBe('intermediate')
    expect(isTechniqueEligibleForGenerator(leadKnee, options)).toBe(true)
    expect(matchesRuleGeneratorDifficulty(leadKnee, options.difficulty)).toBe(true)
    expect(ruleAllowed(options).some((t) => t.category === 'knee')).toBe(true)
    const combo = generateStartingAt(options, (t) => t.category === 'knee')
    expect(combo).not.toBeNull()
    expect(categoriesOf(combo!).includes('knee')).toBe(true)
    expect(techniquesOf(combo!).every((t) => matchesRuleGeneratorDifficulty(t, options.difficulty))).toBe(true)
    assertComboRespectsOptions(combo!, options)
  })

  it('includeElbows false excludes elbows even if categories contain elbow', () => {
    const options = baseOptions({
      categories: ['punch', 'kick', 'teep', 'elbow'],
      includeElbows: false,
      defenseFrequency: 0,
      movementFrequency: 0,
    })
    for (let seed = 0; seed < 20; seed++) {
      const combo = nextCombo({ ...options, seed })
      expect(combo).not.toBeNull()
      assertNeverCategories(combo!, ['elbow'])
      assertComboRespectsOptions(combo!, options)
    }
  })

  it('includeElbows true is eligible and reachable despite stale categories omitting elbow', () => {
    const options = baseOptions({
      difficulty: 'advanced',
      categories: ['punch', 'kick', 'teep'],
      includeElbows: true,
      includeKnees: false,
      includeClinch: false,
      defenseFrequency: 0,
      movementFrequency: 0,
      equipment: 'heavy-bag',
      preferCurated: false,
    })
    const leadElbow = lookupTechnique('lead-horizontal-elbow')!
    expect(leadElbow.difficulty).toBe('advanced')
    expect(isTechniqueEligibleForGenerator(leadElbow, options)).toBe(true)
    expect(matchesRuleGeneratorDifficulty(leadElbow, options.difficulty)).toBe(true)
    expect(ruleAllowed(options).some((t) => t.category === 'elbow')).toBe(true)
    const combo = generateStartingAt(options, (t) => t.category === 'elbow')
    expect(combo).not.toBeNull()
    expect(categoriesOf(combo!).includes('elbow')).toBe(true)
    expect(techniquesOf(combo!).every((t) => matchesRuleGeneratorDifficulty(t, options.difficulty))).toBe(true)
    assertComboRespectsOptions(combo!, options)
  })

  it('includeClinch false excludes clinch', () => {
    const options = baseOptions({
      categories: ['punch', 'kick', 'teep', 'clinch'],
      includeClinch: false,
      equipment: 'partner',
      defenseFrequency: 0,
      movementFrequency: 0,
    })
    for (let seed = 0; seed < 20; seed++) {
      const combo = nextCombo({ ...options, seed })
      expect(combo).not.toBeNull()
      assertNeverCategories(combo!, ['clinch'])
      assertComboRespectsOptions(combo!, options)
    }
  })

  it('includeClinch true is reachable with compatible equipment despite omitted category', () => {
    const options = baseOptions({
      difficulty: 'intermediate',
      categories: ['punch', 'kick', 'teep'],
      includeClinch: true,
      includeKnees: false,
      includeElbows: false,
      defenseFrequency: 0,
      movementFrequency: 0,
      equipment: 'partner',
      preferCurated: false,
    })
    const exitClinch = lookupTechnique('exit-clinch')!
    expect(exitClinch.difficulty).toBe('intermediate')
    expect(isTechniqueEligibleForGenerator(exitClinch, options)).toBe(true)
    expect(matchesRuleGeneratorDifficulty(exitClinch, options.difficulty)).toBe(true)
    expect(ruleAllowed(options).some((t) => t.category === 'clinch')).toBe(true)
    const combo = generateStartingAt(options, (t) => t.category === 'clinch')
    expect(combo).not.toBeNull()
    expect(categoriesOf(combo!).includes('clinch')).toBe(true)
    expect(techniquesOf(combo!).every((t) => matchesRuleGeneratorDifficulty(t, options.difficulty))).toBe(true)
    assertComboRespectsOptions(combo!, options)
  })

  it('shadowboxing still excludes partner clinch when includeClinch is true', () => {
    const options = baseOptions({
      categories: ['punch', 'kick', 'teep', 'clinch'],
      includeClinch: true,
      equipment: 'shadowboxing',
      defenseFrequency: 0,
      movementFrequency: 0,
    })
    expect(
      TECHNIQUES.some(
        (t) =>
          t.category === 'clinch' &&
          t.requiresEquipment.includes('partner') &&
          isTechniqueEligibleForGenerator(t, options),
      ),
    ).toBe(false)
    for (let seed = 0; seed < 15; seed++) {
      const combo = nextCombo({ ...options, seed })
      if (!combo) continue
      assertNeverCategories(combo, ['clinch'])
      assertComboRespectsOptions(combo, options)
    }
  })

  it('includeHeadKicks false excludes head-kick tagged techniques', () => {
    const options = baseOptions({
      categories: ['punch', 'kick', 'teep'],
      includeHeadKicks: false,
      defenseFrequency: 0,
      movementFrequency: 0,
    })
    expect(
      TECHNIQUES.some((t) => t.tags.includes('head-kick') && isTechniqueEligibleForGenerator(t, options)),
    ).toBe(false)
    for (let seed = 0; seed < 20; seed++) {
      const combo = nextCombo({ ...options, seed })
      expect(combo).not.toBeNull()
      expect(techniquesOf(combo!).some((t) => t.tags.includes('head-kick'))).toBe(false)
      assertComboRespectsOptions(combo!, options)
    }
  })

  it('includeHeadKicks true is reachable in Muay Thai when kick is allowed', () => {
    const options = baseOptions({
      difficulty: 'advanced',
      categories: ['punch', 'kick', 'teep'],
      includeHeadKicks: true,
      includeKnees: false,
      defenseFrequency: 0,
      movementFrequency: 0,
      equipment: 'open-space',
      preferCurated: false,
    })
    const leadHeadKick = lookupTechnique('lead-head-kick')!
    expect(leadHeadKick.difficulty).toBe('advanced')
    expect(isTechniqueEligibleForGenerator(leadHeadKick, options)).toBe(true)
    expect(matchesRuleGeneratorDifficulty(leadHeadKick, options.difficulty)).toBe(true)
    expect(ruleAllowed(options).some((t) => t.tags.includes('head-kick'))).toBe(true)
    const combo = generateStartingAt(options, (t) => t.tags.includes('head-kick'))
    expect(combo).not.toBeNull()
    expect(techniquesOf(combo!).some((t) => t.tags.includes('head-kick'))).toBe(true)
    expect(techniquesOf(combo!).every((t) => matchesRuleGeneratorDifficulty(t, options.difficulty))).toBe(true)
    assertComboRespectsOptions(combo!, options)
  })
})

describe('A6 boxing isolation, reaction mode, and last-resort', () => {
  it('Boxing never receives Muay Thai-only techniques across curated, rule-based, and fallback', () => {
    const options = baseOptions({
      martialArt: 'boxing',
      categories: ['punch', 'defense', 'movement', 'counter'],
      includeKnees: true,
      includeElbows: true,
      includeHeadKicks: true,
      includeClinch: true,
      defenseFrequency: 0.3,
      movementFrequency: 0.3,
    })
    const curated = selectCuratedCombos(options)
    expect(curated.length).toBeGreaterThan(0)
    for (const combo of curated) {
      for (const technique of techniquesOf(combo)) {
        expect(technique.martialArts.includes('boxing')).toBe(true)
      }
      assertComboRespectsOptions(combo, options)
    }
    for (let seed = 0; seed < 30; seed++) {
      const generated = generateRuleBasedCombo(options, mulberry32(seed))
      if (generated) {
        for (const technique of techniquesOf(generated)) {
          expect(technique.martialArts.includes('boxing')).toBe(true)
        }
        assertComboRespectsOptions(generated, options)
      }
      const combo = nextCombo({ ...options, seed })
      expect(combo).not.toBeNull()
      for (const technique of techniquesOf(combo!)) {
        expect(technique.martialArts.includes('boxing')).toBe(true)
      }
      assertComboRespectsOptions(combo!, options)
    }
  })

  it('Reaction Mode keeps defense and movement eligible', () => {
    const options = baseOptions({
      mode: 'reaction',
      defenseFrequency: 0.45,
      movementFrequency: 0.4,
      categories: buildTechniqueCategories({
        martialArt: 'muay-thai',
        defenseFrequency: 0.45,
        movementFrequency: 0.4,
        includeKnees: false,
        includeElbows: false,
        includeClinch: false,
        equipment: 'shadowboxing',
      }),
    })
    expect(
      TECHNIQUES.some((t) => t.category === 'defense' && isTechniqueEligibleForGenerator(t, options)),
    ).toBe(true)
    expect(
      TECHNIQUES.some((t) => t.category === 'counter' && isTechniqueEligibleForGenerator(t, options)),
    ).toBe(true)
    expect(
      TECHNIQUES.some((t) => t.category === 'movement' && isTechniqueEligibleForGenerator(t, options)),
    ).toBe(true)
  })

  it('last-resort fallback never violates filters', () => {
    const options = baseOptions({
      preferCurated: false,
      categories: ['punch', 'defense', 'movement'],
      defenseFrequency: 0,
      movementFrequency: 0,
    })
    const spy = vi.spyOn(comboGeneration, 'generateRuleBasedCombo').mockReturnValue(null)
    const combo = nextCombo(options)
    spy.mockRestore()
    expect(combo).not.toBeNull()
    assertNeverCategories(combo!, ['defense', 'counter', 'movement'])
    assertComboRespectsOptions(combo!, options)
  })

  it('returns null instead of a prohibited combo when nothing is eligible', () => {
    const options = baseOptions({
      categories: [],
      defenseFrequency: 0,
      movementFrequency: 0,
      includeKnees: false,
      includeElbows: false,
      includeClinch: false,
      includeHeadKicks: false,
    })
    expect(nextCombo(options)).toBeNull()
    const engine = new SessionEngine(
      createDefaultWorkout({
        martialArt: 'muay-thai',
        categories: [],
        defenseFrequency: 0,
        movementFrequency: 0,
        includeKnees: false,
        includeElbows: false,
        includeClinch: false,
        includeHeadKicks: false,
        selectedComboIds: [],
      }),
    )
    expect((engine as unknown as { pickCombo: () => Combo | null }).pickCombo()).toBeNull()
  })
})

describe('A6 rule-generator difficulty gating', () => {
  it('beginner + includeHeadKicks does not make advanced head kicks rule-eligible or generated', () => {
    const options = baseOptions({
      difficulty: 'beginner',
      categories: ['punch', 'kick', 'teep'],
      includeHeadKicks: true,
      includeKnees: false,
      includeElbows: false,
      includeClinch: false,
      defenseFrequency: 0,
      movementFrequency: 0,
      equipment: 'open-space',
      preferCurated: false,
    })
    const leadHeadKick = lookupTechnique('lead-head-kick')!
    const rearHeadKick = lookupTechnique('rear-head-kick')!
    expect(leadHeadKick.difficulty).toBe('advanced')
    expect(rearHeadKick.difficulty).toBe('advanced')
    expect(isTechniqueEligibleForGenerator(leadHeadKick, options)).toBe(true)
    expect(matchesRuleGeneratorDifficulty(leadHeadKick, 'beginner')).toBe(false)
    expect(ruleAllowed(options).some((t) => t.tags.includes('head-kick'))).toBe(false)
    for (let seed = 0; seed < 40; seed++) {
      const combo = generateRuleBasedCombo(options, mulberry32(seed))
      if (!combo) continue
      expect(techniquesOf(combo).some((t) => t.tags.includes('head-kick'))).toBe(false)
      expect(techniquesOf(combo).every((t) => matchesRuleGeneratorDifficulty(t, 'beginner'))).toBe(true)
      assertComboRespectsOptions(combo, options)
    }
  })

  it('intermediate + includeHeadKicks does not select advanced head kicks', () => {
    const options = baseOptions({
      difficulty: 'intermediate',
      categories: ['punch', 'kick', 'teep'],
      includeHeadKicks: true,
      includeKnees: false,
      includeElbows: false,
      includeClinch: false,
      defenseFrequency: 0,
      movementFrequency: 0,
      equipment: 'open-space',
      preferCurated: false,
    })
    expect(ruleAllowed(options).some((t) => t.tags.includes('head-kick'))).toBe(false)
    for (let seed = 0; seed < 40; seed++) {
      const combo = generateRuleBasedCombo(options, mulberry32(seed))
      if (!combo) continue
      expect(techniquesOf(combo).some((t) => t.tags.includes('head-kick'))).toBe(false)
      expect(techniquesOf(combo).every((t) => matchesRuleGeneratorDifficulty(t, 'intermediate'))).toBe(true)
    }
  })

  it('advanced + includeHeadKicks keeps registry head kicks reachable', () => {
    const options = baseOptions({
      difficulty: 'advanced',
      categories: ['punch', 'kick', 'teep'],
      includeHeadKicks: true,
      defenseFrequency: 0,
      movementFrequency: 0,
      equipment: 'open-space',
      preferCurated: false,
    })
    expect(ruleAllowed(options).some((t) => t.id === 'lead-head-kick' || t.id === 'rear-head-kick')).toBe(true)
    const combo = generateStartingAt(options, (t) => t.tags.includes('head-kick'))
    expect(combo).not.toBeNull()
    expect(techniquesOf(combo!).some((t) => t.tags.includes('head-kick'))).toBe(true)
  })

  it('enabling knees does not make intermediate/advanced knees beginner-eligible', () => {
    const options = baseOptions({
      difficulty: 'beginner',
      categories: ['punch', 'kick', 'teep'],
      includeKnees: true,
      defenseFrequency: 0,
      movementFrequency: 0,
      equipment: 'heavy-bag',
      preferCurated: false,
    })
    const knees = TECHNIQUES.filter((t) => t.category === 'knee')
    expect(knees.length).toBeGreaterThan(0)
    expect(knees.every((t) => t.difficulty !== 'beginner')).toBe(true)
    expect(knees.some((t) => isTechniqueEligibleForGenerator(t, options))).toBe(true)
    expect(ruleAllowed(options).some((t) => t.category === 'knee')).toBe(false)
    for (let seed = 0; seed < 30; seed++) {
      const combo = generateRuleBasedCombo(options, mulberry32(seed))
      if (!combo) continue
      assertNeverCategories(combo, ['knee'])
      expect(techniquesOf(combo).every((t) => matchesRuleGeneratorDifficulty(t, 'beginner'))).toBe(true)
    }
  })

  it('enabling elbows does not make advanced elbows beginner-eligible', () => {
    const options = baseOptions({
      difficulty: 'beginner',
      categories: ['punch', 'kick', 'teep'],
      includeElbows: true,
      defenseFrequency: 0,
      movementFrequency: 0,
      equipment: 'heavy-bag',
      preferCurated: false,
    })
    const elbows = TECHNIQUES.filter((t) => t.category === 'elbow')
    expect(elbows.every((t) => t.difficulty === 'advanced')).toBe(true)
    expect(elbows.some((t) => isTechniqueEligibleForGenerator(t, options))).toBe(true)
    expect(ruleAllowed(options).some((t) => t.category === 'elbow')).toBe(false)
    for (let seed = 0; seed < 30; seed++) {
      const combo = generateRuleBasedCombo(options, mulberry32(seed))
      if (!combo) continue
      assertNeverCategories(combo, ['elbow'])
    }
  })

  it('enabling clinch does not make intermediate/advanced clinch beginner-eligible', () => {
    const options = baseOptions({
      difficulty: 'beginner',
      categories: ['punch', 'kick', 'teep'],
      includeClinch: true,
      defenseFrequency: 0,
      movementFrequency: 0,
      equipment: 'partner',
      preferCurated: false,
    })
    const clinch = TECHNIQUES.filter((t) => t.category === 'clinch')
    expect(clinch.every((t) => t.difficulty !== 'beginner')).toBe(true)
    expect(clinch.some((t) => isTechniqueEligibleForGenerator(t, options))).toBe(true)
    expect(ruleAllowed(options).some((t) => t.category === 'clinch')).toBe(false)
    for (let seed = 0; seed < 30; seed++) {
      const combo = generateRuleBasedCombo(options, mulberry32(seed))
      if (!combo) continue
      assertNeverCategories(combo, ['clinch'])
    }
  })

  it('intermediate does not receive advanced elbows or clinch-entry when those families are enabled', () => {
    const options = baseOptions({
      difficulty: 'intermediate',
      categories: ['punch', 'kick', 'teep'],
      includeElbows: true,
      includeClinch: true,
      includeKnees: true,
      includeHeadKicks: true,
      defenseFrequency: 0,
      movementFrequency: 0,
      equipment: 'partner',
      preferCurated: false,
    })
    expect(ruleAllowed(options).some((t) => t.difficulty === 'advanced')).toBe(false)
    expect(ruleAllowed(options).some((t) => t.category === 'knee' && t.difficulty === 'intermediate')).toBe(true)
    expect(ruleAllowed(options).some((t) => t.id === 'exit-clinch')).toBe(true)
    expect(ruleAllowed(options).some((t) => t.id === 'clinch-entry')).toBe(false)
    for (let seed = 0; seed < 40; seed++) {
      const combo = generateRuleBasedCombo(options, mulberry32(seed))
      if (!combo) continue
      expect(techniquesOf(combo).every((t) => t.difficulty !== 'advanced')).toBe(true)
      expect(techniquesOf(combo).every((t) => matchesRuleGeneratorDifficulty(t, 'intermediate'))).toBe(true)
    }
  })

  it('advanced can still reach registry elbows, switch-knee, and clinch-entry when enabled', () => {
    const options = baseOptions({
      difficulty: 'advanced',
      categories: ['punch', 'kick', 'teep'],
      includeElbows: true,
      includeKnees: true,
      includeClinch: true,
      defenseFrequency: 0,
      movementFrequency: 0,
      equipment: 'partner',
      preferCurated: false,
    })
    expect(ruleAllowed(options).some((t) => t.category === 'elbow')).toBe(true)
    expect(ruleAllowed(options).some((t) => t.id === 'switch-knee')).toBe(true)
    expect(ruleAllowed(options).some((t) => t.id === 'clinch-entry')).toBe(true)
    const elbowCombo = generateStartingAt(options, (t) => t.category === 'elbow')
    expect(elbowCombo).not.toBeNull()
    expect(categoriesOf(elbowCombo!).includes('elbow')).toBe(true)
    const clinchCombo = generateStartingAt(options, (t) => t.id === 'clinch-entry')
    expect(clinchCombo).not.toBeNull()
    expect(techniquesOf(clinchCombo!).some((t) => t.id === 'clinch-entry')).toBe(true)
    const switchKnee = generateStartingAt(options, (t) => t.id === 'switch-knee')
    expect(switchKnee).not.toBeNull()
    expect(techniquesOf(switchKnee!).some((t) => t.id === 'switch-knee')).toBe(true)
  })

  it('rule generation does not broaden to arbitrary difficulty when no at-difficulty technique survives', () => {
    const options = baseOptions({
      difficulty: 'beginner',
      categories: [],
      defenseFrequency: 0,
      movementFrequency: 0,
      includeElbows: true,
      includeKnees: false,
      includeClinch: false,
      includeHeadKicks: false,
      equipment: 'heavy-bag',
      preferCurated: false,
    })
    expect(TECHNIQUES.some((t) => t.category === 'elbow' && isTechniqueEligibleForGenerator(t, options))).toBe(
      true,
    )
    expect(ruleAllowed(options)).toEqual([])
    for (let seed = 0; seed < 20; seed++) {
      expect(generateRuleBasedCombo(options, mulberry32(seed))).toBeNull()
    }
  })

  it('emergency fallback does not use above-policy techniques', () => {
    const options = baseOptions({
      difficulty: 'beginner',
      categories: ['punch', 'kick', 'teep'],
      includeHeadKicks: true,
      includeElbows: true,
      includeKnees: true,
      includeClinch: true,
      defenseFrequency: 0,
      movementFrequency: 0,
      equipment: 'partner',
      preferCurated: false,
    })
    const curatedSpy = vi.spyOn(generatorEligibility, 'selectEligibleCuratedCombos').mockReturnValue([])
    const ruleSpy = vi.spyOn(comboGeneration, 'generateRuleBasedCombo').mockReturnValue(null)
    const combo = nextCombo(options)
    curatedSpy.mockRestore()
    ruleSpy.mockRestore()
    expect(combo).not.toBeNull()
    for (const technique of techniquesOf(combo!)) {
      expect(matchesRuleGeneratorDifficulty(technique, 'beginner')).toBe(true)
      expect(technique.tags.includes('head-kick')).toBe(false)
      expect(['knee', 'elbow', 'clinch']).not.toContain(technique.category)
    }
  })

  it('curated broadened-difficulty fallback still obeys non-difficulty filters', () => {
    const options = baseOptions({
      martialArt: 'boxing',
      difficulty: 'advanced',
      mode: 'reaction',
      categories: ['punch', 'defense', 'counter'],
      defenseFrequency: 0,
      movementFrequency: 0,
      includeKnees: true,
      includeElbows: true,
      includeHeadKicks: true,
      includeClinch: true,
      comboLength: { min: 2, max: 2 },
    })
    const selected = selectEligibleCuratedCombos(options, { broadenDifficulty: true })
    expect(selected.length).toBeGreaterThan(0)
    expect(selected.some((combo) => combo.difficulty !== 'advanced')).toBe(true)
    for (const combo of selected) {
      assertNeverCategories(combo, ['defense', 'counter', 'movement', 'knee', 'elbow', 'clinch', 'kick', 'teep'])
      expect(techniquesOf(combo).some((t) => t.tags.includes('head-kick'))).toBe(false)
      assertComboRespectsOptions(combo, options)
    }
  })
})

describe('A6 TrainPage categories match controls', () => {
  beforeEach(() => {
    localStorage.clear()
    seedCompletedOnboarding()
    vi.spyOn(primeAudio, 'primeTrainingAudio').mockResolvedValue({ ok: true, timedOut: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function startAndReadConfig(user: ReturnType<typeof userEvent.setup>) {
    const { router } = renderApp('/train')
    return { user, router }
  }

  it('Boxing defense 0 and movement 0 omit those families from the routed config', async () => {
    const user = userEvent.setup()
    const { router } = await startAndReadConfig(user)
    await user.click(screen.getByRole('radio', { name: /boxing/i }))
    await user.click(screen.getByRole('button', { name: /advanced training/i }))
    fireEvent.change(screen.getByLabelText('Defense frequency'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('Movement frequency'), { target: { value: '0' } })
    await user.click(screen.getByRole('button', { name: 'Start Workout' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/session')
    })
    const config = (router.state.location.state as { config: WorkoutConfig }).config
    expect(config.martialArt).toBe('boxing')
    expect(config.defenseFrequency).toBe(0)
    expect(config.movementFrequency).toBe(0)
    expect(config.categories).toEqual(['punch'])
    expect(config.includeKnees).toBe(false)
    expect(config.includeElbows).toBe(false)
    expect(config.includeHeadKicks).toBe(false)
    expect(config.includeClinch).toBe(false)
  })

  it('Boxing defense > 0 includes defense and counter', async () => {
    const user = userEvent.setup()
    const { router } = await startAndReadConfig(user)
    await user.click(screen.getByRole('radio', { name: /boxing/i }))
    await user.click(screen.getByRole('button', { name: /advanced training/i }))
    fireEvent.change(screen.getByLabelText('Movement frequency'), { target: { value: '0' } })
    await user.click(screen.getByRole('button', { name: 'Start Workout' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/session')
    })
    const config = (router.state.location.state as { config: WorkoutConfig }).config
    expect(config.defenseFrequency).toBeGreaterThan(0)
    expect(config.categories).toEqual(expect.arrayContaining(['punch', 'defense', 'counter']))
    expect(config.categories).not.toContain('movement')
  })

  it('Muay Thai knees, elbows, and partner clinch appear in categories', async () => {
    const user = userEvent.setup()
    const { router } = await startAndReadConfig(user)
    await user.click(screen.getByRole('button', { name: /advanced training/i }))
    fireEvent.change(screen.getByLabelText('Defense frequency'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('Movement frequency'), { target: { value: '0' } })
    await user.selectOptions(screen.getByLabelText('Equipment'), 'partner')
    const knees = screen.getByLabelText('Include knees')
    if (!(knees as HTMLInputElement).checked) await user.click(knees)
    await user.click(screen.getByLabelText('Include elbows'))
    await user.click(screen.getByLabelText('Include clinch'))
    await user.click(screen.getByRole('button', { name: 'Start Workout' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/session')
    })
    const config = (router.state.location.state as { config: WorkoutConfig }).config
    expect(config.categories).toEqual(expect.arrayContaining(['punch', 'kick', 'teep', 'knee', 'elbow', 'clinch']))
    expect(config.includeKnees).toBe(true)
    expect(config.includeElbows).toBe(true)
    expect(config.includeClinch).toBe(true)
  })

  it('switching Muay Thai to Boxing drops Muay Thai-only families', async () => {
    const user = userEvent.setup()
    const { router } = await startAndReadConfig(user)
    await user.click(screen.getByRole('button', { name: /advanced training/i }))
    await user.selectOptions(screen.getByLabelText('Equipment'), 'partner')
    await user.click(screen.getByLabelText('Include elbows'))
    await user.click(screen.getByLabelText('Include clinch'))
    await user.click(screen.getByRole('radio', { name: /boxing/i }))
    await user.click(screen.getByRole('button', { name: 'Start Workout' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/session')
    })
    const config = (router.state.location.state as { config: WorkoutConfig }).config
    expect(config.martialArt).toBe('boxing')
    expect(config.includeKnees).toBe(false)
    expect(config.includeElbows).toBe(false)
    expect(config.includeHeadKicks).toBe(false)
    expect(config.includeClinch).toBe(false)
    expect(config.categories).not.toEqual(expect.arrayContaining(['knee', 'elbow', 'clinch', 'kick', 'teep']))
  })

  it('shadowboxing does not keep clinch in the final config', async () => {
    const user = userEvent.setup()
    const { router } = await startAndReadConfig(user)
    await user.click(screen.getByRole('button', { name: /advanced training/i }))
    expect(screen.getByLabelText('Include clinch')).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Start Workout' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/session')
    })
    const config = (router.state.location.state as { config: WorkoutConfig }).config
    expect(config.equipment).toBe('shadowboxing')
    expect(config.includeClinch).toBe(false)
    expect(config.categories).not.toContain('clinch')
  })

  it('Reaction Mode retains defense and movement eligibility in the routed config', async () => {
    const user = userEvent.setup()
    const { router } = await startAndReadConfig(user)
    await user.click(screen.getByRole('radio', { name: /reaction mode/i }))
    await user.click(screen.getByRole('button', { name: 'Start Workout' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/session')
    })
    const config = (router.state.location.state as { config: WorkoutConfig }).config
    expect(config.mode).toBe('reaction')
    expect(config.defenseFrequency).toBeGreaterThanOrEqual(0.45)
    expect(config.movementFrequency).toBeGreaterThanOrEqual(0.4)
    expect(config.categories).toEqual(expect.arrayContaining(['defense', 'counter', 'movement']))
  })
})
