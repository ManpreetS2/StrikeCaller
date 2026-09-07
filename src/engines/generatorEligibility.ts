import { filterCombos } from '../data/combos'
import { lookupTechnique } from '../data/techniques'
import type {
  Combo,
  Difficulty,
  Equipment,
  MartialArt,
  Technique,
  TechniqueCategory,
  TrainingMode,
} from '../types'

export interface GeneratorEligibilityOptions {
  martialArt?: MartialArt
  difficulty: Difficulty
  mode: TrainingMode
  equipment: Equipment
  categories: TechniqueCategory[]
  defenseFrequency: number
  movementFrequency: number
  includeHeadKicks: boolean
  includeElbows: boolean
  includeKnees: boolean
  includeClinch: boolean
  comboLength: { min: number; max: number }
}

function techniqueFitsEquipment(technique: Technique, equipment: Equipment): boolean {
  if (equipment === 'shadowboxing' && technique.requiresEquipment.includes('partner')) {
    return false
  }
  if (equipment === 'limited-space') {
    if (technique.requiresEquipment.includes('open-space')) return false
    if (technique.id === 'circle' || technique.id.startsWith('angle-out')) return false
  }
  return true
}

function comboFitsEquipment(combo: Combo, equipment: Equipment): boolean {
  if (combo.equipment.includes(equipment)) return true
  if (
    (equipment === 'shadowboxing' || equipment === 'limited-space' || equipment === 'open-space') &&
    combo.equipment.some((item) => item === 'partner')
  ) {
    return false
  }
  return combo.equipment.includes('shadowboxing')
}

/**
 * Hard generator eligibility for a single registry technique.
 * Frequency 0 and include* false are exclusions; stale `categories` cannot override them.
 * Enabled knees/elbows/clinch/defense/movement ignore a stale omitted category.
 */
export function isTechniqueEligibleForGenerator(
  technique: Technique,
  options: GeneratorEligibilityOptions,
): boolean {
  if (options.martialArt && !technique.martialArts.includes(options.martialArt)) return false
  if (!technique.allowedModes.includes(options.mode)) return false
  if (!techniqueFitsEquipment(technique, options.equipment)) return false

  const category = technique.category

  if (category === 'defense' || category === 'counter') {
    return options.defenseFrequency > 0
  }
  if (category === 'movement') {
    return options.movementFrequency > 0
  }
  if (category === 'knee') {
    return options.includeKnees
  }
  if (category === 'elbow') {
    return options.includeElbows
  }
  if (category === 'clinch') {
    return options.includeClinch
  }

  if (technique.tags.includes('head-kick')) {
    if (!options.includeHeadKicks) return false
    return options.categories.includes('kick')
  }

  return options.categories.includes(category)
}

export function isComboEligibleForGenerator(combo: Combo, options: GeneratorEligibilityOptions): boolean {
  if (options.martialArt && combo.martialArt !== options.martialArt) return false
  if (!combo.trainingModes.includes(options.mode)) return false
  if (!comboFitsEquipment(combo, options.equipment)) return false
  if (combo.techniques.length > options.comboLength.max) return false

  for (const step of combo.techniques) {
    const technique = lookupTechnique(step.techniqueId)
    if (!technique) return false
    if (!isTechniqueEligibleForGenerator(technique, options)) return false
  }
  return true
}

export function selectEligibleCuratedCombos(
  options: GeneratorEligibilityOptions,
  scope: { broadenDifficulty: boolean },
): Combo[] {
  const pool = filterCombos({
    martialArt: options.martialArt,
    difficulty: scope.broadenDifficulty ? undefined : options.difficulty,
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
  return pool.filter((combo) => isComboEligibleForGenerator(combo, options))
}
