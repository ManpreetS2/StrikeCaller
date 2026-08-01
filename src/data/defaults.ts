import { DEFAULT_TIMING_MULTIPLIERS } from '../engines/timingEngine'
import type { SpeechSettings, SoundSettings, UserPreferences, WorkoutConfig } from '../types'

export const DEFAULT_SPEECH: SpeechSettings = {
  voiceURI: null,
  rate: 1,
  pitch: 1,
  volume: 1,
  callStyle: 'hybrid',
  coachingCuesEnabled: true,
  countdownEnabled: true,
  roundCallsEnabled: true,
}

export const DEFAULT_SOUND: SoundSettings = {
  bellsEnabled: true,
  tonesEnabled: true,
  vibrationEnabled: true,
  masterVolume: 0.75,
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'dark',
  stance: 'orthodox',
  experience: 'beginner',
  callStyle: 'hybrid',
  equipment: 'shadowboxing',
  pace: 'technical',
  includeDefense: true,
  includeMovement: true,
  sideTerminology: 'lead-rear',
  largeText: false,
  onboardingComplete: false,
  speech: DEFAULT_SPEECH,
  sound: DEFAULT_SOUND,
  timingMultipliers: DEFAULT_TIMING_MULTIPLIERS,
  customPaceMultiplier: 1,
  wakeLock: true,
}

export function createDefaultWorkout(partial?: Partial<WorkoutConfig>): WorkoutConfig {
  return {
    mode: 'round',
    stance: 'orthodox',
    difficulty: 'beginner',
    equipment: 'shadowboxing',
    sessionDurationSec: 180,
    rounds: 3,
    roundDurationSec: 180,
    restDurationSec: 60,
    comboLength: { min: 2, max: 5 },
    pace: 'technical',
    customPaceMultiplier: 1,
    timingMultipliers: { ...DEFAULT_TIMING_MULTIPLIERS },
    callStyle: 'hybrid',
    categories: ['punch', 'kick', 'teep', 'defense', 'movement'],
    defenseFrequency: 0.35,
    movementFrequency: 0.4,
    repetitionFrequency: 0.25,
    coachingCues: true,
    sound: { ...DEFAULT_SOUND },
    speech: { ...DEFAULT_SPEECH },
    includeHeadKicks: false,
    includeElbows: false,
    includeKnees: true,
    includeClinch: false,
    showNextTechnique: true,
    minimalMode: false,
    largeText: false,
    sideTerminology: 'lead-rear',
    ...partial,
  }
}
