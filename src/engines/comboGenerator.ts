import { CURATED_COMBOS } from '../data/combos'
import { getTechnique, TECHNIQUES } from '../data/techniques'
import { validateTechniqueSequence, mirrorTechniqueIds } from './comboValidator'
import {
  isTechniqueEligibleForGenerator,
  selectEligibleCuratedCombos,
} from './generatorEligibility'
import type {
  Combo,
  Difficulty,
  Equipment,
  Stance,
  Technique,
  TechniqueCategory,
  TrainingMode,
  WorkoutConfig,
} from '../types'
import { combo as buildCombo } from '../data/combos/helpers'

export interface GeneratorOptions {
  martialArt?: import('../types').MartialArt
  difficulty: Difficulty
  stance: Stance
  mode: TrainingMode
  equipment: Equipment
  categories: TechniqueCategory[]
  defenseFrequency: number
  movementFrequency: number
  repetitionFrequency: number
  comboLength: { min: number; max: number }
  includeHeadKicks: boolean
  includeElbows: boolean
  includeKnees: boolean
  includeClinch: boolean
  preferCurated?: boolean
  seed?: number
}

function mulberry32(seed: number) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(list: T[], rand: () => number): T | undefined {
  if (list.length === 0) return undefined
  return list[Math.floor(rand() * list.length)]
}

/** Pre-A6 rule-generator difficulty: requested level plus beginner. Never includes intermediate on beginner, or advanced on beginner/intermediate. */
export function matchesRuleGeneratorDifficulty(technique: Technique, difficulty: Difficulty): boolean {
  return technique.difficulty === difficulty || technique.difficulty === 'beginner'
}

function allowedTechniques(options: GeneratorOptions): Technique[] {
  return TECHNIQUES.filter(
    (t) =>
      isTechniqueEligibleForGenerator(t, options) &&
      matchesRuleGeneratorDifficulty(t, options.difficulty),
  )
}

/** Enabled special-family techniques already in the difficulty-gated pool may appear as follow-ups. */
function isReachableSpecialFamily(technique: Technique): boolean {
  return (
    technique.category === 'knee' ||
    technique.category === 'elbow' ||
    technique.category === 'clinch' ||
    technique.tags.includes('head-kick')
  )
}

function applyStance(combo: Combo, stance: Stance): Combo {
  return {
    ...combo,
    stance,
    techniques: mirrorTechniqueIds(
      combo.techniques.map((t) => t.techniqueId),
      stance,
    ).map((techniqueId) => ({ techniqueId })),
  }
}

export function selectCuratedCombos(options: GeneratorOptions): Combo[] {
  const strict = selectEligibleCuratedCombos(options, { broadenDifficulty: false })
  if (strict.length >= 5) return strict
  return selectEligibleCuratedCombos(options, { broadenDifficulty: true })
}

function isCommittedKick(technique: Technique): boolean {
  return technique.category === 'kick' || technique.category === 'teep'
}

export function generateRuleBasedCombo(options: GeneratorOptions, rand = Math.random): Combo | null {
  const mma = options.martialArt === 'mma-striking'
  const maxLen = mma ? Math.min(options.comboLength.max, 5) : options.comboLength.max
  const minLen = mma ? Math.min(Math.max(options.comboLength.min, 2), maxLen) : options.comboLength.min
  const length = minLen + Math.floor(rand() * Math.max(1, maxLen - minLen + 1))

  const allowed = allowedTechniques(options)
  const starters = allowed.filter(
    (t) =>
      t.category === 'punch' ||
      t.category === 'teep' ||
      t.category === 'defense' ||
      t.category === 'kick' ||
      t.category === 'knee' ||
      t.category === 'elbow' ||
      t.category === 'clinch' ||
      t.category === 'counter',
  )
  const mmaStarters = mma
    ? starters.filter((t) => t.category === 'punch' || t.category === 'defense' || t.category === 'counter')
    : []
  const startPool = mma && mmaStarters.length ? mmaStarters : starters.length ? starters : allowed
  const sequence: string[] = []
  let current = pick(startPool, rand)
  if (!current) return null
  sequence.push(current.id)

  while (sequence.length < length) {
    const last = getTechnique(sequence[sequence.length - 1]!)
    const usedKick = sequence.some((id) => isCommittedKick(getTechnique(id)))
    let candidates = allowed.filter((t) => {
      if (last.incompatibleFollowUps.includes(t.id)) return false
      if (mma && usedKick && isCommittedKick(t)) return false
      if (last.recommendedFollowUps.includes(t.id)) return true
      if (isReachableSpecialFamily(t)) return true
      if (t.id === last.id) return rand() < options.repetitionFrequency
      return last.recommendedFollowUps.length === 0
    })

    if (mma && isCommittedKick(last)) {
      // MMA kicks need a stable exit before another committed attack.
      const exits = candidates.filter(
        (t) => t.category === 'movement' || t.category === 'defense' || t.id === 'jab' || t.id === 'reset-stance',
      )
      if (exits.length) candidates = exits
    } else if (rand() < options.defenseFrequency) {
      const defense = candidates.filter((t) => t.category === 'defense' || t.category === 'counter')
      if (defense.length) candidates = defense
    } else if (options.movementFrequency > 0 && rand() < options.movementFrequency && sequence.length >= length - 1) {
      const movement = candidates.filter((t) => t.category === 'movement')
      if (movement.length) candidates = movement
    }

    if (!candidates.length) {
      candidates = allowed.filter((t) => !last.incompatibleFollowUps.includes(t.id))
      if (mma && usedKick) {
        candidates = candidates.filter((t) => !isCommittedKick(t))
      }
    }

    const next = pick(candidates, rand)
    if (!next) break
    sequence.push(next.id)

    const validation = validateTechniqueSequence(sequence)
    if (!validation.valid) {
      sequence.pop()
      const exit = pick(
        allowed.filter((t) => t.category === 'movement' || t.id === 'jab'),
        rand,
      )
      if (exit) {
        sequence.push(exit.id)
        if (!validateTechniqueSequence(sequence).valid) sequence.pop()
      }
      break
    }
  }

  if (options.movementFrequency > 0 && rand() < options.movementFrequency && sequence.length < maxLen) {
    const exits = ['reset-stance', 'pivot-left', 'angle-out-left', 'step-back']
    const exit = pick(
      exits
        .map((id) => {
          try {
            return getTechnique(id)
          } catch {
            return null
          }
        })
        .filter((t): t is ReturnType<typeof getTechnique> => t != null && allowed.some((a) => a.id === t.id)),
      rand,
    )
    if (exit) {
      const trial = [...sequence, exit.id]
      if (trial.length <= maxLen && validateTechniqueSequence(trial).valid) {
        sequence.push(exit.id)
      }
    }
  }

  if (!sequence.length) return null
  const mirrored = mirrorTechniqueIds(sequence, options.stance)
  const validation = validateTechniqueSequence(mirrored)
  if (!validation.valid) return null

  return buildCombo({
    id: `gen-${Date.now()}-${Math.floor(rand() * 10000)}`,
    title: 'Generated combination',
    difficulty: options.difficulty,
    purpose: 'pressure',
    techniques: mirrored,
    setup: 'Rule-based combination built from technique compatibility.',
    notes: 'Generated from validated follow-up rules — not a random string of strikes.',
    tags: ['generated'],
    stance: options.stance,
    martialArt: options.martialArt ?? 'muay-thai',
  })
}

function emergencyCompliantCombo(options: GeneratorOptions): Combo | null {
  const allowedIds = new Set(allowedTechniques(options).map((t) => t.id))
  const min = options.comboLength.min
  const max = options.comboLength.max
  const candidates: string[][] = []
  if (allowedIds.has('jab') && allowedIds.has('cross')) {
    candidates.push(['jab', 'cross'])
    if (max >= 3) candidates.push(['jab', 'cross', 'jab'])
  }
  if (allowedIds.has('jab')) {
    candidates.push(['jab', 'jab'])
    candidates.push(['jab'])
  }
  for (const sequence of candidates) {
    if (sequence.length < min || sequence.length > max) continue
    if (!sequence.every((id) => allowedIds.has(id))) continue
    if (!validateTechniqueSequence(sequence).valid) continue
    return buildCombo({
      id: `gen-emergency-${sequence.join('-')}`,
      title: 'Generated combination',
      difficulty: options.difficulty,
      purpose: 'pressure',
      techniques: mirrorTechniqueIds(sequence, options.stance),
      setup: 'Compliant fallback built from the allowed technique pool.',
      notes: 'Generated from validated follow-up rules — not a random string of strikes.',
      tags: ['generated'],
      stance: options.stance,
      martialArt: options.martialArt ?? 'muay-thai',
    })
  }
  return null
}

/** Test seam so last-resort coverage can stub rule generation without rewriting SessionEngine. */
export const comboGeneration = {
  selectCuratedCombos,
  generateRuleBasedCombo,
}

export function nextCombo(
  options: GeneratorOptions,
  recentIds: string[] = [],
): Combo | null {
  const rand = options.seed != null ? mulberry32(options.seed + recentIds.length) : Math.random
  const preferCurated = options.preferCurated !== false
  const curated = comboGeneration.selectCuratedCombos(options).filter((c) => !recentIds.includes(c.id))

  if (preferCurated && curated.length) {
    const chosen = pick(curated, rand) ?? curated[0]!
    return applyStance(chosen, options.stance)
  }

  const generated = comboGeneration.generateRuleBasedCombo(options, rand)
  if (generated) return generated

  const lastResort = selectEligibleCuratedCombos(options, { broadenDifficulty: true }).filter(
    (c) => !recentIds.includes(c.id),
  )
  if (lastResort.length) {
    const chosen = pick(lastResort, rand) ?? lastResort[0]!
    return applyStance(chosen, options.stance)
  }

  return emergencyCompliantCombo(options)
}

export function optionsFromWorkout(config: WorkoutConfig): GeneratorOptions {
  return {
    martialArt: config.martialArt,
    difficulty: config.difficulty,
    stance: config.stance,
    mode: config.mode,
    equipment: config.equipment,
    categories: config.categories,
    defenseFrequency: config.defenseFrequency,
    movementFrequency: config.movementFrequency,
    repetitionFrequency: config.repetitionFrequency,
    comboLength: config.comboLength,
    includeHeadKicks: config.includeHeadKicks,
    includeElbows: config.includeElbows,
    includeKnees: config.includeKnees,
    includeClinch: config.includeClinch,
    preferCurated: true,
  }
}

export const DEMO_COMBO_IDS = ['beg-02', 'beg-06', 'int-04', 'mov-01', 'int-03'] as const
export const BOXING_DEMO_COMBO_IDS = ['bx-b01', 'bx-b03', 'bx-d03', 'bx-m02', 'bx-i06'] as const
export const MMA_DEMO_COMBO_IDS = ['mma-b01', 'mma-b05', 'mma-d01', 'mma-m01', 'mma-i03'] as const

export function getDemoCombos(
  stance: Stance = 'orthodox',
  martialArt: import('../types').MartialArt = 'muay-thai',
): Combo[] {
  const ids =
    martialArt === 'boxing'
      ? BOXING_DEMO_COMBO_IDS
      : martialArt === 'mma-striking'
        ? MMA_DEMO_COMBO_IDS
        : DEMO_COMBO_IDS
  return ids.map((id) => {
    const base = CURATED_COMBOS.find((c) => c.id === id)!
    return {
      ...base,
      stance,
      techniques: mirrorTechniqueIds(
        base.techniques.map((t) => t.techniqueId),
        stance,
      ).map((techniqueId) => ({ techniqueId })),
    }
  })
}
