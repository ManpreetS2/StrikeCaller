import type { Combo, CustomCombo, MartialArt } from '../types'
import { lookupTechnique } from '../data/techniques'
import { MAX_COMBO_LENGTH, validateTechniqueSequence } from '../engines/comboValidator'

export const MIN_REPEAT_COUNT = 1
export const MAX_REPEAT_COUNT = 20

export const CUSTOM_COMBO_UNKNOWN_TECHNIQUE_MESSAGE = 'Custom combo contains an unknown technique.'
export const CUSTOM_COMBO_INVALID_SEQUENCE_MESSAGE = 'Custom combo contains an invalid technique sequence.'

export function customComboSportUnavailableMessage(martialArt: MartialArt): string {
  return `Custom combo contains a technique unavailable for ${martialArt === 'boxing' ? 'Boxing' : 'Muay Thai'}.`
}

export type CustomComboSemanticReason =
  | 'empty'
  | 'excessive-length'
  | 'unknown-technique'
  | 'sport-incompatible'
  | 'invalid-sequence'

export type CustomComboSemanticResult =
  | { ok: true }
  | { ok: false; reason: CustomComboSemanticReason; message: string }

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
  const ids = combo.techniqueIds
  if (ids.length < 1) {
    return { ok: false, reason: 'empty', message: 'Custom combo cannot be empty.' }
  }
  if (ids.length > MAX_COMBO_LENGTH) {
    return {
      ok: false,
      reason: 'excessive-length',
      message: `Custom combos must contain 1–${MAX_COMBO_LENGTH} techniques.`,
    }
  }

  for (const id of ids) {
    if (!lookupTechnique(id)) {
      return { ok: false, reason: 'unknown-technique', message: CUSTOM_COMBO_UNKNOWN_TECHNIQUE_MESSAGE }
    }
  }

  const martialArt = normalizedCustomComboArt(combo.martialArt)
  for (const id of ids) {
    const technique = lookupTechnique(id)
    if (!technique?.martialArts.includes(martialArt)) {
      return {
        ok: false,
        reason: 'sport-incompatible',
        message: customComboSportUnavailableMessage(martialArt),
      }
    }
  }

  const sequence = validateTechniqueSequence([...ids])
  if (!sequence.valid) {
    return { ok: false, reason: 'invalid-sequence', message: CUSTOM_COMBO_INVALID_SEQUENCE_MESSAGE }
  }
  return { ok: true }
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
