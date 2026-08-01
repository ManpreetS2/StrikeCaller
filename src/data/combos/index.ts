import { BEGINNER_COMBOS } from './beginner'
import { INTERMEDIATE_COMBOS } from './intermediate'
import { ADVANCED_COMBOS } from './advanced'
import { DEFENSIVE_COMBOS } from './defensive'
import { MOVEMENT_COMBOS, CONDITIONING_COMBOS } from './movement'
import type { Combo, Difficulty, Equipment, TrainingMode } from '../../types'

export const CURATED_COMBOS: Combo[] = [
  ...BEGINNER_COMBOS,
  ...INTERMEDIATE_COMBOS,
  ...ADVANCED_COMBOS,
  ...DEFENSIVE_COMBOS,
  ...MOVEMENT_COMBOS,
  ...CONDITIONING_COMBOS,
]

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
    if (difficulties && !difficulties.includes(combo.difficulty)) return false
    if (options.mode && !combo.trainingModes.includes(options.mode)) return false
    if (options.equipment && !combo.equipment.includes(options.equipment)) {
      // shadowboxing / limited-space: allow if combo doesn't require partner-only gear
      if (
        (options.equipment === 'shadowboxing' || options.equipment === 'limited-space' || options.equipment === 'open-space') &&
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
    const hasDefense = ids.some((id) =>
      ['high-guard', 'long-guard', 'parry', 'catch', 'slip-left', 'slip-right', 'pull', 'lean-back', 'check-lead', 'check-rear', 'block-body-kick', 'catch-teep', 'frame', 'shell'].includes(id) ||
      id.includes('check') ||
      id.includes('parry') ||
      id.includes('slip') ||
      id.includes('block') ||
      id.includes('catch') ||
      id.includes('pull') ||
      id.includes('frame') ||
      id.includes('shell'),
    )
    const hasMovement = ids.some((id) =>
      id.startsWith('step-') ||
      id.startsWith('pivot-') ||
      id.startsWith('angle-') ||
      id === 'circle' ||
      id === 'reset-stance' ||
      id === 'exit-clinch',
    )
    const hasHeadKick = ids.some((id) => id.includes('head-kick'))
    const hasElbow = ids.some((id) => id.includes('elbow'))
    const hasKnee = ids.some((id) => id.includes('knee'))
    const hasClinch = ids.some((id) => id.includes('clinch') || id === 'posture-control' || id === 'curved-knee')

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

export function getComboStats() {
  return {
    total: CURATED_COMBOS.length,
    beginner: BEGINNER_COMBOS.length,
    intermediate: INTERMEDIATE_COMBOS.length,
    advanced: ADVANCED_COMBOS.length,
    defensive: DEFENSIVE_COMBOS.length,
    movement: MOVEMENT_COMBOS.length,
    conditioning: CONDITIONING_COMBOS.length,
  }
}

export {
  BEGINNER_COMBOS,
  INTERMEDIATE_COMBOS,
  ADVANCED_COMBOS,
  DEFENSIVE_COMBOS,
  MOVEMENT_COMBOS,
  CONDITIONING_COMBOS,
}
