import { BEGINNER_COMBOS } from './beginner'
import { INTERMEDIATE_COMBOS } from './intermediate'
import { ADVANCED_COMBOS } from './advanced'
import { DEFENSIVE_COMBOS } from './defensive'
import { MOVEMENT_COMBOS, CONDITIONING_COMBOS } from './movement'
import { BOXING_COMBOS, getBoxingComboStats } from '../boxing'
import type { Combo, Difficulty, Equipment, MartialArt, TrainingMode } from '../../types'

export const MUAY_THAI_COMBOS: Combo[] = [
  ...BEGINNER_COMBOS,
  ...INTERMEDIATE_COMBOS,
  ...ADVANCED_COMBOS,
  ...DEFENSIVE_COMBOS,
  ...MOVEMENT_COMBOS,
  ...CONDITIONING_COMBOS,
]

/** All built-in combinations across sports. */
export const CURATED_COMBOS: Combo[] = [...MUAY_THAI_COMBOS, ...BOXING_COMBOS]

export const COMBO_MAP: Record<string, Combo> = Object.fromEntries(
  CURATED_COMBOS.map((c) => [c.id, c]),
)

export function getCombo(id: string): Combo {
  const combo = COMBO_MAP[id]
  if (!combo) throw new Error(`Unknown combo: ${id}`)
  return combo
}

export function getCombosByDifficulty(difficulty: Difficulty): Combo[] {
  return CURATED_COMBOS.filter((c) => c.difficulty === difficulty)
}

export function filterCombos(options: {
  martialArt?: MartialArt
  difficulty?: Difficulty | Difficulty[]
  mode?: TrainingMode
  equipment?: Equipment
  includeDefense?: boolean
  includeMovement?: boolean
  includeHeadKicks?: boolean
  includeElbows?: boolean
  includeKnees?: boolean
  includeClinch?: boolean
  tags?: string[]
  maxLength?: number
}): Combo[] {
  const difficulties = options.difficulty
    ? Array.isArray(options.difficulty)
      ? options.difficulty
      : [options.difficulty]
    : null

  return CURATED_COMBOS.filter((combo) => {
    if (options.martialArt && combo.martialArt !== options.martialArt) return false
    if (difficulties && !difficulties.includes(combo.difficulty)) return false
    if (options.mode && !combo.trainingModes.includes(options.mode)) return false
    if (options.equipment && !combo.equipment.includes(options.equipment)) {
      if (
        (options.equipment === 'shadowboxing' ||
          options.equipment === 'limited-space' ||
          options.equipment === 'open-space') &&
        combo.equipment.some((e) => e === 'partner')
      ) {
        return false
      }
      if (!combo.equipment.includes('shadowboxing') && !combo.equipment.includes(options.equipment)) {
        return false
      }
    }
    if (options.maxLength && combo.techniques.length > options.maxLength) return false

    const ids = combo.techniques.map((t) => t.techniqueId)
    const hasDefense = ids.some(
      (id) =>
        id.includes('check') ||
        id.includes('parry') ||
        id.includes('slip') ||
        id.includes('block') ||
        id.includes('catch') ||
        id.includes('pull') ||
        id.includes('frame') ||
        id.includes('shell') ||
        id.includes('guard') ||
        id.includes('roll') ||
        id.includes('shoulder'),
    )
    const hasMovement = ids.some(
      (id) =>
        id.startsWith('step-') ||
        id.startsWith('pivot-') ||
        id.startsWith('angle-') ||
        id.startsWith('circle') ||
        id === 'lateral-step' ||
        id === 'reset-stance' ||
        id === 'exit-clinch',
    )
    const hasHeadKick = ids.some((id) => id.includes('head-kick'))
    const hasElbow = ids.some((id) => id.includes('elbow'))
    const hasKnee = ids.some((id) => id.includes('knee'))
    const hasClinch = ids.some(
      (id) => id.includes('clinch') || id === 'posture-control' || id === 'curved-knee',
    )

    if (options.includeDefense === false && hasDefense) return false
    if (options.includeMovement === false && hasMovement) return false
    if (options.includeHeadKicks === false && hasHeadKick) return false
    if (options.includeElbows === false && hasElbow) return false
    if (options.includeKnees === false && hasKnee) return false
    if (options.includeClinch === false && hasClinch) return false

    if (options.tags?.length) {
      if (!options.tags.some((tag) => combo.tags.includes(tag) || combo.purpose.includes(tag))) {
        return false
      }
    }

    return true
  })
}

export function getComboStats(martialArt?: MartialArt) {
  const boxing = getBoxingComboStats()
  if (martialArt === 'boxing') {
    return { ...boxing, muayThai: 0, boxing: boxing.total }
  }
  if (martialArt === 'muay-thai') {
    return {
      total: MUAY_THAI_COMBOS.length,
      beginner: BEGINNER_COMBOS.length,
      intermediate: INTERMEDIATE_COMBOS.length,
      advanced: ADVANCED_COMBOS.length,
      defensive: DEFENSIVE_COMBOS.length,
      movement: MOVEMENT_COMBOS.length,
      conditioning: CONDITIONING_COMBOS.length,
      muayThai: MUAY_THAI_COMBOS.length,
      boxing: 0,
    }
  }
  return {
    total: CURATED_COMBOS.length,
    beginner: BEGINNER_COMBOS.length + boxing.beginner,
    intermediate: INTERMEDIATE_COMBOS.length + boxing.intermediate,
    advanced: ADVANCED_COMBOS.length + boxing.advanced,
    defensive: DEFENSIVE_COMBOS.length + boxing.defensive,
    movement: MOVEMENT_COMBOS.length + boxing.movement,
    conditioning: CONDITIONING_COMBOS.length + boxing.conditioning,
    muayThai: MUAY_THAI_COMBOS.length,
    boxing: boxing.total,
  }
}

export {
  BEGINNER_COMBOS,
  INTERMEDIATE_COMBOS,
  ADVANCED_COMBOS,
  DEFENSIVE_COMBOS,
  MOVEMENT_COMBOS,
  CONDITIONING_COMBOS,
  BOXING_COMBOS,
}
