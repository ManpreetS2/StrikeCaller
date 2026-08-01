export type Stance = 'orthodox' | 'southpaw'

export type Difficulty = 'beginner' | 'intermediate' | 'advanced'

export type TechniqueCategory =
  | 'punch'
  | 'kick'
  | 'teep'
  | 'knee'
  | 'elbow'
  | 'defense'
  | 'movement'
  | 'counter'
  | 'clinch'

export type TechniqueSide = 'lead' | 'rear' | 'both' | 'neutral'

export type Range = 'long' | 'mid' | 'close' | 'clinch'

export type TrainingMode =
  | 'learn'
  | 'coach'
  | 'round'
  | 'reaction'
  | 'custom'
  | 'daily'
  | 'demo'

export type Equipment =
  | 'shadowboxing'
  | 'heavy-bag'
  | 'pads'
  | 'partner'
  | 'open-space'
  | 'limited-space'

export type CallStyle = 'names' | 'numbers' | 'hybrid'

export type PacePreset =
  | 'learn'
  | 'slow'
  | 'technical'
  | 'normal'
  | 'fast'
  | 'fight'
  | 'custom'

export type ThemePreference = 'dark' | 'light' | 'system'

export type SideTerminology = 'lead-rear' | 'left-right'

export type ComboPurpose =
  | 'establish-jab'
  | 'enter-range'
  | 'pressure'
  | 'attack-body'
  | 'set-up-low-kick'
  | 'set-up-body-kick'
  | 'create-head-opening'
  | 'counter-punch'
  | 'counter-kick'
  | 'defend-and-return'
  | 'exit-safely'
  | 'manage-distance'
  | 'clinch-entry'
  | 'conditioning'

export interface Technique {
  id: string
  name: string
  shortCall: string
  numberCall?: number
  category: TechniqueCategory
  side: TechniqueSide
  stanceAgnostic: boolean
  range: Range
  difficulty: Difficulty
  baseExecutionMs: number
  recoveryMs: number
  transitionMs: number
  requiresEquipment: Equipment[]
  allowedModes: TrainingMode[]
  recommendedFollowUps: string[]
  incompatibleFollowUps: string[]
  tags: string[]
  coachingCue: string
  safetyNote?: string
  weightCommit: 'light' | 'medium' | 'heavy'
  leavesGuardOpen: boolean
}

export interface ComboStep {
  techniqueId: string
  note?: string
}

export interface Combo {
  id: string
  title: string
  difficulty: Difficulty
  stance: Stance | 'both'
  trainingModes: TrainingMode[]
  purpose: ComboPurpose
  techniques: ComboStep[]
  recommendedPace: PacePreset
  setupExplanation: string
  endingPosition: string
  safeExit: string
  coachingNotes: string
  tags: string[]
  equipment: Equipment[]
}

export interface TimingMultipliers {
  punch: number
  kick: number
  knee: number
  elbow: number
  defense: number
  movement: number
  teep: number
  counter: number
  clinch: number
  pauseBetweenCombosMs: number
  pauseBeforeRepeatMs: number
}

export interface SpeechSettings {
  voiceURI: string | null
  rate: number
  pitch: number
  volume: number
  callStyle: CallStyle
  coachingCuesEnabled: boolean
  countdownEnabled: boolean
  roundCallsEnabled: boolean
}

export interface SoundSettings {
  bellsEnabled: boolean
  tonesEnabled: boolean
  vibrationEnabled: boolean
  masterVolume: number
}

export interface WorkoutConfig {
  mode: TrainingMode
  stance: Stance
  difficulty: Difficulty
  equipment: Equipment
  sessionDurationSec: number
  rounds: number
  roundDurationSec: number
  restDurationSec: number
  comboLength: { min: number; max: number }
  pace: PacePreset
  customPaceMultiplier: number
  timingMultipliers: TimingMultipliers
  callStyle: CallStyle
  categories: TechniqueCategory[]
  defenseFrequency: number
  movementFrequency: number
  repetitionFrequency: number
  coachingCues: boolean
  sound: SoundSettings
  speech: SpeechSettings
  includeHeadKicks: boolean
  includeElbows: boolean
  includeKnees: boolean
  includeClinch: boolean
  showNextTechnique: boolean
  minimalMode: boolean
  largeText: boolean
  sideTerminology: SideTerminology
  selectedComboIds?: string[]
  customComboId?: string
  repeatCount?: number
}

export interface UserPreferences {
  theme: ThemePreference
  stance: Stance
  experience: Difficulty
  callStyle: CallStyle
  equipment: Equipment
  pace: PacePreset
  includeDefense: boolean
  includeMovement: boolean
  sideTerminology: SideTerminology
  largeText: boolean
  onboardingComplete: boolean
  speech: SpeechSettings
  sound: SoundSettings
  timingMultipliers: TimingMultipliers
  customPaceMultiplier: number
  wakeLock: boolean
}

export interface SessionTechniqueEvent {
  techniqueId: string
  calledAt: number
  spokenAs: string
}

export interface SessionSummary {
  id: string
  startedAt: number
  endedAt: number
  mode: TrainingMode
  stance: Stance
  pace: PacePreset
  totalTrainingMs: number
  roundsCompleted: number
  combinationsCompleted: number
  techniquesCalled: number
  techniqueCounts: Record<string, number>
  defenseActions: number
  movementActions: number
  averagePaceLabel: string
  dailyDrillCompleted: boolean
  cancelled: boolean
  favoriteComboIds: string[]
}

export interface CustomCombo {
  id: string
  title: string
  techniqueIds: string[]
  createdAt: number
  updatedAt: number
  favorite: boolean
  repeatCount: number
}

export interface DailyDrillState {
  dateKey: string
  comboId: string
  slowDone: boolean
  normalDone: boolean
  fightDone: boolean
  completed: boolean
}

export interface ValidationIssue {
  code: string
  message: string
  severity: 'error' | 'warning'
  index?: number
}

export interface ValidationResult {
  valid: boolean
  issues: ValidationIssue[]
}

export type SessionPhase =
  | 'idle'
  | 'countdown'
  | 'work'
  | 'rest'
  | 'paused'
  | 'summary'

export interface ActiveTechniqueState {
  combo: Combo
  comboIndex: number
  stepIndex: number
  technique: Technique
  spokenLabel: string
  durationMs: number
  startedAt: number
}
