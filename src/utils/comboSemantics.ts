import type { Combo, MartialArt } from '../types'
import { lookupTechnique } from '../data/techniques'
import { MAX_COMBO_LENGTH, validateTechniqueSequence } from '../engines/comboValidator'
import { isMartialArt, martialArtLabel } from './martialArt'

export const CUSTOM_COMBO_UNKNOWN_TECHNIQUE_MESSAGE = 'Custom combo contains an unknown technique.'
export const CUSTOM_COMBO_INVALID_SEQUENCE_MESSAGE = 'Custom combo contains an invalid technique sequence.'

export function customComboSportUnavailableMessage(martialArt: MartialArt): string {
  return `Custom combo contains a technique unavailable for ${martialArtLabel(martialArt)}.`
}

export type ComboSemanticReason =
  | 'empty'
  | 'excessive-length'
  | 'unknown-technique'
  | 'sport-incompatible'
  | 'invalid-sequence'

export type ComboSemanticResult =
  | { ok: true }
  | { ok: false; reason: ComboSemanticReason; message: string }

/**
 * Shared ID-level checks: existence, martial-art support, sequence errors.
 * Warnings from {@link validateTechniqueSequence} do not invalidate.
 */
export function validateTechniqueIdsForArt(
  ids: readonly string[],
  martialArt: MartialArt,
): ComboSemanticResult {
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

/**
 * Semantic checks for a runtime Combo used by SessionEngine / Train Again / resolve.
 * When `expectedMartialArt` is set, the combo's declared art must match the session.
 */
export function validateRuntimeComboSemantics(
  combo: Combo,
  expectedMartialArt?: MartialArt,
): ComboSemanticResult {
  const ids = combo.techniques.map((step) => step.techniqueId)
  const declared = isMartialArt(combo.martialArt) ? combo.martialArt : 'muay-thai'
  const idsResult = validateTechniqueIdsForArt(ids, declared)
  if (!idsResult.ok) return idsResult
  if (expectedMartialArt && declared !== expectedMartialArt) {
    return {
      ok: false,
      reason: 'sport-incompatible',
      message: customComboSportUnavailableMessage(expectedMartialArt),
    }
  }
  return { ok: true }
}

export function isRuntimeComboSemanticallyValid(combo: Combo, expectedMartialArt?: MartialArt): boolean {
  return validateRuntimeComboSemantics(combo, expectedMartialArt).ok
}
