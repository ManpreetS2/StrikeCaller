import { filterCombos, CURATED_COMBOS } from '../data/combos'
import { getTechnique, TECHNIQUES } from '../data/techniques'
import { validateTechniqueSequence, mirrorTechniqueIds } from './comboValidator'
import type {
  Combo,
  Difficulty,
  Equipment,
  Stance,
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

export function selectCuratedCombos(options: GeneratorOptions): Combo[] {
  const pool = filterCombos({
    martialArt: options.martialArt,
    difficulty: options.difficulty,
    mode: options.mode,
    equipment: options.equipment,
    includeDefense: options.defenseFrequency > 0,
    includeMovement: options.movementFrequency > 0,
    includeHeadKicks: options.includeHeadKicks,
    includeElbows: options.includeElbows,
    includeKnees: options.includeKnees,
    includeClinch: options.includeClinch,
    maxLength: options.comboLength.max,
  })

  // Also allow adjacent difficulties for variety
  if (pool.length < 5) {
    return filterCombos({
      martialArt: options.martialArt,
      mode: options.mode,
      equipment: options.equipment,
      includeHeadKicks: options.includeHeadKicks,
      includeElbows: options.includeElbows,
      includeKnees: options.includeKnees,
      includeClinch: options.includeClinch,
      maxLength: options.comboLength.max,
    })
  }
  return pool
}

export function generateRuleBasedCombo(options: GeneratorOptions, rand = Math.random): Combo | null {
  const length =
    options.comboLength.min +
    Math.floor(rand() * Math.max(1, options.comboLength.max - options.comboLength.min + 1))

  const allowed = TECHNIQUES.filter((t) => {
    if (options.martialArt && !t.martialArts.includes(options.martialArt)) return false
    const categoryAllowed =
      options.categories.includes(t.category) ||
      t.category === 'punch' ||
      (options.defenseFrequency > 0 && (t.category === 'defense' || t.category === 'counter')) ||
      (options.movementFrequency > 0 && t.category === 'movement')

    if (!categoryAllowed) return false

    if (t.tags.includes('head-kick') && !options.includeHeadKicks) return false
    if (t.category === 'elbow' && !options.includeElbows) return false
    if (t.category === 'knee' && !options.includeKnees) return false
    if (t.category === 'clinch' && !options.includeClinch) return false
    if (
      options.equipment === 'shadowboxing' &&
      t.requiresEquipment.includes('partner') &&
      t.category === 'clinch'
    ) {
      return false
    }
    if (options.equipment === 'limited-space' && (t.id === 'circle' || t.id.startsWith('angle-out'))) {
      return false
    }
    return t.difficulty === options.difficulty || t.difficulty === 'beginner'
  })

  const starters = allowed.filter((t) => t.category === 'punch' || t.category === 'teep' || t.category === 'defense')
  const sequence: string[] = []
  let current = pick(starters.length ? starters : allowed, rand)
  if (!current) return null
  sequence.push(current.id)

  while (sequence.length < length) {
    const last = getTechnique(sequence[sequence.length - 1]!)
    let candidates = allowed.filter((t) => {
      if (last.incompatibleFollowUps.includes(t.id)) return false
      if (last.recommendedFollowUps.includes(t.id)) return true
      // allow repetition based on frequency
      if (t.id === last.id) return rand() < options.repetitionFrequency
      return last.recommendedFollowUps.length === 0
    })

    if (rand() < options.defenseFrequency) {
      const defense = candidates.filter((t) => t.category === 'defense' || t.category === 'counter')
      if (defense.length) candidates = defense
    } else if (rand() < options.movementFrequency && sequence.length >= length - 1) {
      const movement = candidates.filter((t) => t.category === 'movement')
      if (movement.length) candidates = movement
    }

    if (!candidates.length) {
      candidates = allowed.filter((t) => !last.incompatibleFollowUps.includes(t.id))
    }

    const next = pick(candidates, rand)
    if (!next) break
    sequence.push(next.id)

    const validation = validateTechniqueSequence(sequence)
    if (!validation.valid) {
      sequence.pop()
      // try a safe exit instead
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

  // Ensure ending movement sometimes without exceeding max length
  if (rand() < options.movementFrequency && sequence.length < options.comboLength.max) {
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
      if (trial.length <= options.comboLength.max && validateTechniqueSequence(trial).valid) {
        sequence.push(exit.id)
      }
    }
  }

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

export function nextCombo(
  options: GeneratorOptions,
  recentIds: string[] = [],
): Combo {
  const rand = options.seed != null ? mulberry32(options.seed + recentIds.length) : Math.random
  const preferCurated = options.preferCurated !== false
  const curated = selectCuratedCombos(options).filter((c) => !recentIds.includes(c.id))

  if (preferCurated && curated.length) {
    const chosen = pick(curated, rand) ?? curated[0]!
    const ids = mirrorTechniqueIds(
      chosen.techniques.map((t) => t.techniqueId),
      options.stance,
    )
    return {
      ...chosen,
      techniques: ids.map((techniqueId) => ({ techniqueId })),
      stance: options.stance,
    }
  }

  const generated = generateRuleBasedCombo(options, rand)
  if (generated) return generated

  const art = options.martialArt ?? 'muay-thai'
  const fallback =
    CURATED_COMBOS.find((c) => c.martialArt === art && c.difficulty === 'beginner') ??
    CURATED_COMBOS.find((c) => c.martialArt === art) ??
    CURATED_COMBOS[0]!
  return {
    ...fallback,
    martialArt: art,
    techniques: mirrorTechniqueIds(
      fallback.techniques.map((t) => t.techniqueId),
      options.stance,
    ).map((techniqueId) => ({ techniqueId })),
    stance: options.stance,
  }
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

export function getDemoCombos(
  stance: Stance = 'orthodox',
  martialArt: import('../types').MartialArt = 'muay-thai',
): Combo[] {
  const ids = martialArt === 'boxing' ? BOXING_DEMO_COMBO_IDS : DEMO_COMBO_IDS
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
