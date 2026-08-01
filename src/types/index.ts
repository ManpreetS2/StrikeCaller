export type MartialArt = 'muay-thai' | 'boxing'

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

export type ResumeBehavior = 'restart-combo' | 'next-combo'

export type MusicCompatibilityResult =
  | 'music-lowered'
  | 'music-continued'
  | 'music-paused'
  | 'music-stopped'
  | 'voice-not-heard'

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

export type ComingSoonArt = 'kickboxing' | 'mma-striking' | 'karate' | 'taekwondo'

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
  martialArts: MartialArt[]
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
  martialArt: MartialArt
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
  /** Legacy field — ignored at runtime; browser default English voice is used. */
  voiceURI: string | null
  rate: number
  pitch: number
  volume: number
  callStyle: CallStyle
  coachingCuesEnabled: boolean
  countdownEnabled: boolean
  roundCallsEnabled: boolean
  musicFriendly: boolean
  captionsEnabled: boolean
  spokenCallsEnabled: boolean
}

export interface MusicCompatibilityRecord {
  result: MusicCompatibilityResult
  testedAt: number
  userAgent: string
  audioSessionSupported: boolean
}

export interface SoundSettings {
  bellsEnabled: boolean
  tonesEnabled: boolean
  vibrationEnabled: boolean
  masterVolume: number
}

export interface WorkoutConfig {
  martialArt: MartialArt
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
  resumeBehavior: ResumeBehavior
  selectedComboIds?: string[]
  customComboId?: string
  repeatCount?: number
}

export interface UserPreferences {
  theme: ThemePreference
  martialArt: MartialArt
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
  resumeBehavior: ResumeBehavior
  musicCompatibility: MusicCompatibilityRecord | null
  customComboMigrationNoticeShown: boolean
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
  martialArt: MartialArt
  mode: TrainingMode
  stance: Stance
  pace: PacePreset
  totalTrainingMs: number
  roundsCompleted: number
  combinationsCompleted: number
  techniquesCalled: number
  techniqueCounts: Record<string, number>
  techniqueCategoryCounts: Record<string, number>
  comboIds: string[]
  defenseActions: number
  movementActions: number
  averagePaceLabel: string
  dailyDrillCompleted: boolean
  cancelled: boolean
  favoriteComboIds: string[]
  usedCustomCombo: boolean
  /** Internal: older records assigned defaults */
  migrated?: boolean
}

export interface CustomCombo {
  id: string
  title: string
  techniqueIds: string[]
  createdAt: number
  updatedAt: number
  favorite: boolean
  repeatCount: number
  martialArt?: MartialArt
  migrated?: boolean
}

export interface DailyDrillState {
  dateKey: string
  comboId: string
  martialArt?: MartialArt
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

export type StatsRange = '7d' | '30d' | 'all'

export interface MilestoneDefinition {
  id: string
  title: string
  description: string
}

export interface UnlockedMilestone {
  id: string
  unlockedAt: number
}
