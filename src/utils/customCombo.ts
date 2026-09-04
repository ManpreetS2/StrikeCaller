import type { Combo, CustomCombo, MartialArt } from '../types'
import { MAX_COMBO_LENGTH } from '../engines/comboValidator'
import {
  validateTechniqueIdsForArt,
  type ComboSemanticReason,
  type ComboSemanticResult,
} from './comboSemantics'

export {
  CUSTOM_COMBO_INVALID_SEQUENCE_MESSAGE,
  CUSTOM_COMBO_UNKNOWN_TECHNIQUE_MESSAGE,
  customComboSportUnavailableMessage,
  isRuntimeComboSemanticallyValid,
  validateRuntimeComboSemantics,
  validateTechniqueIdsForArt,
} from './comboSemantics'

export const MIN_REPEAT_COUNT = 1
export const MAX_REPEAT_COUNT = 20

export type CustomComboSemanticReason = ComboSemanticReason
export type CustomComboSemanticResult = ComboSemanticResult

function normalizedCustomComboArt(martialArt: MartialArt | undefined): MartialArt {
  return martialArt === 'boxing' ? 'boxing' : 'muay-thai'
}

/**
 * Semantic checks for a custom combo: every ID exists, every technique
 * supports the combo martial art, and sequence errors fail (warnings do not).
 */
export function validateCustomComboSemantics(combo: {
  techniqueIds: readonly string[]
  martialArt?: MartialArt
}): CustomComboSemanticResult {
  return validateTechniqueIdsForArt(combo.techniqueIds, normalizedCustomComboArt(combo.martialArt))
}

export function isCustomComboSemanticallyValid(combo: {
  techniqueIds: readonly string[]
  martialArt?: MartialArt
}): boolean {
  return validateCustomComboSemantics(combo).ok
}

export function clampRepeatCount(value: number): number {
  if (!Number.isFinite(value)) return MIN_REPEAT_COUNT
  return Math.min(MAX_REPEAT_COUNT, Math.max(MIN_REPEAT_COUNT, Math.round(value)))
}

export function clampTechniqueIds(ids: string[]): string[] {
  return ids.filter((id) => typeof id === 'string' && id.length > 0).slice(0, MAX_COMBO_LENGTH)
}

function toRuntimeCombo(combo: CustomCombo): Combo {
  const techniqueIds = clampTechniqueIds(combo.techniqueIds)
  const martialArt: MartialArt = combo.martialArt === 'boxing' ? 'boxing' : 'muay-thai'
  return {
    id: combo.id,
    title: combo.title,
    difficulty: 'beginner',
    stance: 'both',
    trainingModes: ['custom', 'coach', 'round', 'learn', 'daily', 'reaction'],
    purpose: 'conditioning',
    techniques: techniqueIds.map((techniqueId) => ({ techniqueId })),
    recommendedPace: 'technical',
    setupExplanation: 'Saved custom combination.',
    endingPosition: 'Reset to base',
    safeExit: 'Reset stance',
    coachingNotes: 'Custom combination — validate transitions in the builder.',
    tags: ['custom'],
    equipment: ['shadowboxing', 'heavy-bag', 'pads', 'open-space', 'partner', 'limited-space'],
    martialArt,
  }
}

/** Convert a saved custom combo into a runtime Combo used by SessionEngine. */
export function customComboToRuntime(combo: CustomCombo): Combo {
  return toRuntimeCombo(combo)
}

/** Returns null when the custom combo is semantically invalid. */
export function tryCustomComboToRuntime(combo: CustomCombo): Combo | null {
  if (!validateCustomComboSemantics(combo).ok) return null
  return toRuntimeCombo(combo)
}
