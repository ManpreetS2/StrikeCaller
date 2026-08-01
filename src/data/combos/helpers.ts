import type { Combo, ComboPurpose, Difficulty, Equipment, PacePreset, Stance, TrainingMode } from '../../types'

const ALL_MODES: TrainingMode[] = ['learn', 'coach', 'round', 'reaction', 'custom', 'daily', 'demo']

export function combo(opts: {
  id: string
  title: string
  difficulty: Difficulty
  purpose: ComboPurpose
  techniques: string[]
  setup: string
  ending?: string
  exit?: string
  notes?: string
  tags?: string[]
  stance?: Stance | 'both'
  pace?: PacePreset
  modes?: TrainingMode[]
  equipment?: Equipment[]
}): Combo {
  return {
    id: opts.id,
    title: opts.title,
    difficulty: opts.difficulty,
    stance: opts.stance ?? 'both',
    trainingModes: opts.modes ?? ALL_MODES,
    purpose: opts.purpose,
    techniques: opts.techniques.map((techniqueId) => ({ techniqueId })),
    recommendedPace: opts.pace ?? (opts.difficulty === 'beginner' ? 'technical' : opts.difficulty === 'advanced' ? 'normal' : 'technical'),
    setupExplanation: opts.setup,
    endingPosition: opts.ending ?? 'Orthodox/southpaw base with hands high',
    safeExit: opts.exit ?? 'Reset stance and re-establish the jab',
    coachingNotes: opts.notes ?? 'Prioritize balance and guard over speed.',
    tags: opts.tags ?? [],
    equipment: opts.equipment ?? ['shadowboxing', 'heavy-bag', 'pads', 'open-space'],
  }
}
