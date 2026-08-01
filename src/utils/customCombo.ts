import type { Combo, CustomCombo, MartialArt } from '../types'
import { MAX_COMBO_LENGTH } from '../engines/comboValidator'

export const MIN_REPEAT_COUNT = 1
export const MAX_REPEAT_COUNT = 20

export function clampRepeatCount(value: number): number {
  if (!Number.isFinite(value)) return MIN_REPEAT_COUNT
  return Math.min(MAX_REPEAT_COUNT, Math.max(MIN_REPEAT_COUNT, Math.round(value)))
}

export function clampTechniqueIds(ids: string[]): string[] {
  return ids.filter((id) => typeof id === 'string' && id.length > 0).slice(0, MAX_COMBO_LENGTH)
}

/** Convert a saved custom combo into a runtime Combo used by SessionEngine. */
export function customComboToRuntime(combo: CustomCombo): Combo {
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
