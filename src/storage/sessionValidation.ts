/**
 * Untrusted-boundary validators for session history (localStorage, IndexedDB, import).
 *
 * LOAD: salvage valid records; skip malformed ones; missing legacy fields may default.
 * IMPORT: every supplied session must validate; one invalid record fails the whole import.
 *
 * Present-but-invalid values are rejected. Missing values may receive a documented default.
 */
import { DEFAULT_SOUND, DEFAULT_SPEECH } from '../data/defaults'
import { DEFAULT_TIMING_MULTIPLIERS } from '../engines/timingEngine'
import { MAX_COMBO_LENGTH } from '../engines/comboValidator'
import type {
  CallStyle,
  Combo,
  ComboPurpose,
  ComboStep,
  Difficulty,
  Equipment,
  MartialArt,
  PacePreset,
  ResumeBehavior,
  SessionSummary,
  SideTerminology,
  SoundSettings,
  SpeechSettings,
  Stance,
  TechniqueCategory,
  TimingMultipliers,
  TrainingMode,
  WorkoutConfig,
} from '../types'
import { WORKOUT_LIMITS } from '../utils/workoutValidation'
import {
  booleanOr,
  defineOwn,
  finiteInRange,
  hasOwn,
  isForbiddenKey,
  isPlainObject,
  nonEmptyString,
  nonNegativeFinite,
  nonNegativeInt,
  oneOf,
  readBoolean,
  stringValue,
} from './parseUnknown'

export const MARTIAL_ARTS = ['muay-thai', 'boxing'] as const satisfies readonly MartialArt[]
export const TRAINING_MODES = [
  'learn',
  'coach',
  'round',
  'reaction',
  'custom',
  'daily',
  'demo',
] as const satisfies readonly TrainingMode[]
export const STANCES = ['orthodox', 'southpaw'] as const satisfies readonly Stance[]
export const COMBO_STANCES = ['orthodox', 'southpaw', 'both'] as const
export const PACE_PRESETS = [
  'learn',
  'slow',
  'technical',
  'normal',
  'fast',
  'fight',
  'custom',
] as const satisfies readonly PacePreset[]
export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const satisfies readonly Difficulty[]
export const EQUIPMENT = [
  'shadowboxing',
  'heavy-bag',
  'pads',
  'partner',
  'open-space',
  'limited-space',
] as const satisfies readonly Equipment[]
export const CALL_STYLES = ['names', 'numbers', 'hybrid'] as const satisfies readonly CallStyle[]
export const SIDE_TERMINOLOGY = ['lead-rear', 'left-right'] as const satisfies readonly SideTerminology[]
export const RESUME_BEHAVIORS = ['restart-combo', 'next-combo'] as const satisfies readonly ResumeBehavior[]
export const TECHNIQUE_CATEGORIES = [
  'punch',
  'kick',
  'teep',
  'knee',
  'elbow',
  'defense',
  'movement',
  'counter',
  'clinch',
] as const satisfies readonly TechniqueCategory[]
export const COMBO_PURPOSES = [
  'establish-jab',
  'enter-range',
  'pressure',
  'attack-body',
  'set-up-low-kick',
  'set-up-body-kick',
  'create-head-opening',
  'counter-punch',
  'counter-kick',
  'defend-and-return',
  'exit-safely',
  'manage-distance',
  'clinch-entry',
  'conditioning',
] as const satisfies readonly ComboPurpose[]
export const DAILY_PHASES = ['slowDone', 'normalDone', 'fightDone'] as const

const TIMING_CATEGORY_KEYS = [
  'punch',
  'kick',
  'knee',
  'elbow',
  'defense',
  'movement',
  'teep',
  'counter',
  'clinch',
] as const
const TIMING_PAUSE_KEYS = ['pauseBetweenCombosMs', 'pauseBeforeRepeatMs'] as const

/** Settings UI range for category timing multipliers. */
export const TIMING_CATEGORY_RANGE = { min: 0.7, max: 1.8 } as const
/** Pause fields are milliseconds, not UI multipliers. */
export const TIMING_PAUSE_MS_RANGE = { min: 0, max: 60_000 } as const
export const MASTER_VOLUME_RANGE = { min: 0, max: 1 } as const
/** Web Speech API bounds — StrikeCaller has no rate/pitch UI. */
export const SPEECH_RATE_RANGE = { min: 0.1, max: 10 } as const
export const SPEECH_PITCH_RANGE = { min: 0, max: 2 } as const

/**
 * Historical workout configs may exceed current Train-form limits
 * (quick start 600s rounds, learn/daily 45–90s, tests, older builds).
 * Reject only impossible or absurd values — do not invent a tighter product max.
 */
const HISTORICAL_DURATION_SEC = { min: 0, max: 86_400 } as const
const HISTORICAL_ROUNDS = { min: 0, max: 100 } as const
const HISTORICAL_COMBO_LEN = { min: 1, max: 32 } as const

export const MAX_SESSION_ID_LENGTH = 200

/** Route params are untrusted. Reject empty, oversized, or undecodable IDs before IDB. */
export function parseSessionRouteId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  if (raw.length === 0 || raw.length > MAX_SESSION_ID_LENGTH * 3) return null
  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    return null
  }
  return nonEmptyString(decoded, MAX_SESSION_ID_LENGTH) ?? null
}

export const MAX_SESSION_COMBO_IDS = 2000
export const MAX_SESSION_QUEUED_COMBOS = 500
export const MAX_COUNT_MAP_KEYS = 500
export const MAX_SELECTED_COMBO_IDS = 500
export const MAX_FAVORITE_IDS = 2000
export const MAX_STRING_FIELD = 20_000

const WORKOUT_REQUIRED_KEYS = [
  'martialArt',
  'mode',
  'stance',
  'difficulty',
  'equipment',
  'sessionDurationSec',
  'rounds',
  'roundDurationSec',
  'restDurationSec',
  'comboLength',
  'pace',
  'customPaceMultiplier',
  'timingMultipliers',
  'callStyle',
  'categories',
  'defenseFrequency',
  'movementFrequency',
  'repetitionFrequency',
  'coachingCues',
  'sound',
  'speech',
  'includeHeadKicks',
  'includeElbows',
  'includeKnees',
  'includeClinch',
  'showNextTechnique',
  'minimalMode',
  'largeText',
  'sideTerminology',
  'resumeBehavior',
] as const

const DEFAULT_COMBO_LENGTH = { min: 2, max: 5 } as const
const SPEECH_BOOLEAN_KEYS = [
  'coachingCuesEnabled',
  'countdownEnabled',
  'roundCallsEnabled',
  'musicFriendly',
  'captionsEnabled',
  'spokenCallsEnabled',
] as const

function presentInvalidEnum<T extends string>(
  raw: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): boolean {
  if (!hasOwn(raw, key)) return false
  return oneOf(raw[key], allowed) === undefined
}

function copyStringIdList(
  raw: unknown,
  maxItems: number,
  options: { unique?: boolean; skipInvalid?: boolean } = {},
): string[] | null {
  if (raw == null) return []
  if (!Array.isArray(raw) || raw.length > maxItems) return null
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const id = nonEmptyString(item, MAX_SESSION_ID_LENGTH)
    if (!id) {
      if (options.skipInvalid) continue
      return null
    }
    if (options.unique) {
      if (seen.has(id)) continue
      seen.add(id)
    }
    out.push(id)
  }
  return out
}

export function copyCountMap(raw: unknown): Record<string, number> | null {
  if (raw == null) return {}
  if (!isPlainObject(raw)) return null
  const keys = Object.keys(raw)
  if (keys.length > MAX_COUNT_MAP_KEYS) return null
  const out: Record<string, number> = {}
  for (const key of keys) {
    if (isForbiddenKey(key) || key.length === 0 || key.length > MAX_SESSION_ID_LENGTH) continue
    const count = nonNegativeInt(raw[key])
    if (count === undefined) continue
    defineOwn(out, key, count)
  }
  return out
}

function parseSoundSettings(
  raw: unknown,
  fallback: SoundSettings,
  strict: boolean,
): SoundSettings | null {
  if (!isPlainObject(raw)) return strict ? null : { ...fallback }
  for (const key of ['bellsEnabled', 'tonesEnabled', 'vibrationEnabled'] as const) {
    if (hasOwn(raw, key) && readBoolean(raw[key]) === undefined) {
      if (strict) return null
    }
  }
  if (
    hasOwn(raw, 'masterVolume') &&
    finiteInRange(raw.masterVolume, MASTER_VOLUME_RANGE.min, MASTER_VOLUME_RANGE.max) === undefined
  ) {
    if (strict) return null
  }
  return {
    bellsEnabled: booleanOr(raw.bellsEnabled, fallback.bellsEnabled),
    tonesEnabled: booleanOr(raw.tonesEnabled, fallback.tonesEnabled),
    vibrationEnabled: booleanOr(raw.vibrationEnabled, fallback.vibrationEnabled),
    masterVolume:
      finiteInRange(raw.masterVolume, MASTER_VOLUME_RANGE.min, MASTER_VOLUME_RANGE.max) ?? fallback.masterVolume,
  }
}

/** LOAD salvage for preferences: missing/invalid nested fields fall back. */
export function validateSoundSettings(raw: unknown, fallback: SoundSettings = DEFAULT_SOUND): SoundSettings {
  return parseSoundSettings(raw, fallback, false) ?? { ...fallback }
}

function parseTimingMultipliers(
  raw: unknown,
  fallback: TimingMultipliers,
  strict: boolean,
): TimingMultipliers | null {
  if (!isPlainObject(raw)) return strict ? null : { ...fallback }
  const out: TimingMultipliers = { ...fallback }
  for (const key of TIMING_CATEGORY_KEYS) {
    if (!hasOwn(raw, key)) continue
    const n = finiteInRange(raw[key], TIMING_CATEGORY_RANGE.min, TIMING_CATEGORY_RANGE.max)
    if (n === undefined) {
      if (strict) return null
      continue
    }
    out[key] = n
  }
  for (const key of TIMING_PAUSE_KEYS) {
    if (!hasOwn(raw, key)) continue
    const n = finiteInRange(raw[key], TIMING_PAUSE_MS_RANGE.min, TIMING_PAUSE_MS_RANGE.max)
    if (n === undefined) {
      if (strict) return null
      continue
    }
    out[key] = n
  }
  return out
}

export function validateTimingMultipliers(
  raw: unknown,
  fallback: TimingMultipliers = DEFAULT_TIMING_MULTIPLIERS,
): TimingMultipliers {
  return parseTimingMultipliers(raw, fallback, false) ?? { ...fallback }
}

function parseSpeechSettings(
  raw: unknown,
  fallback: SpeechSettings,
  options: { strict: boolean; resetVoiceNumbers: boolean },
): SpeechSettings | null {
  if (!isPlainObject(raw)) return options.strict ? null : { ...fallback }
  if (hasOwn(raw, 'callStyle') && oneOf(raw.callStyle, CALL_STYLES) === undefined) {
    if (options.strict) return null
  }
  for (const key of SPEECH_BOOLEAN_KEYS) {
    if (hasOwn(raw, key) && readBoolean(raw[key]) === undefined) {
      if (options.strict) return null
    }
  }

  let rate = 1
  let pitch = 1
  let volume = 1
  if (!options.resetVoiceNumbers) {
    if (hasOwn(raw, 'rate')) {
      const parsed = finiteInRange(raw.rate, SPEECH_RATE_RANGE.min, SPEECH_RATE_RANGE.max)
      if (parsed === undefined) return null
      rate = parsed
    } else {
      rate = fallback.rate
    }
    if (hasOwn(raw, 'pitch')) {
      const parsed = finiteInRange(raw.pitch, SPEECH_PITCH_RANGE.min, SPEECH_PITCH_RANGE.max)
      if (parsed === undefined) return null
      pitch = parsed
    } else {
      pitch = fallback.pitch
    }
    if (hasOwn(raw, 'volume')) {
      const parsed = finiteInRange(raw.volume, MASTER_VOLUME_RANGE.min, MASTER_VOLUME_RANGE.max)
      if (parsed === undefined) return null
      volume = parsed
    } else {
      volume = fallback.volume
    }
  }

  return {
    voiceURI: null,
    rate,
    pitch,
    volume,
    callStyle: oneOf(raw.callStyle, CALL_STYLES) ?? fallback.callStyle,
    coachingCuesEnabled: booleanOr(raw.coachingCuesEnabled, fallback.coachingCuesEnabled),
    countdownEnabled: booleanOr(raw.countdownEnabled, fallback.countdownEnabled),
    roundCallsEnabled: booleanOr(raw.roundCallsEnabled, fallback.roundCallsEnabled),
    musicFriendly: booleanOr(raw.musicFriendly, fallback.musicFriendly),
    captionsEnabled: booleanOr(raw.captionsEnabled, fallback.captionsEnabled),
    spokenCallsEnabled: booleanOr(raw.spokenCallsEnabled, fallback.spokenCallsEnabled),
  }
}

/**
 * LOAD salvage for preferences. Rate/pitch/volume are a fixed runtime profile
 * (see `RUNTIME_SPEECH`); stored voice numbers are ignored.
 */
export function validateSpeechSettings(raw: unknown, fallback: SpeechSettings = DEFAULT_SPEECH): SpeechSettings {
  return parseSpeechSettings(raw, fallback, { strict: false, resetVoiceNumbers: true }) ?? {
    ...fallback,
    voiceURI: null,
    rate: 1,
    pitch: 1,
    volume: 1,
  }
}

function parseComboLength(raw: unknown): { min: number; max: number } | null {
  if (!isPlainObject(raw)) return null
  if (hasOwn(raw, 'min') && nonNegativeInt(raw.min) === undefined) return null
  if (hasOwn(raw, 'max') && nonNegativeInt(raw.max) === undefined) return null
  const min = nonNegativeInt(raw.min) ?? DEFAULT_COMBO_LENGTH.min
  const max = nonNegativeInt(raw.max) ?? DEFAULT_COMBO_LENGTH.max
  if (min < HISTORICAL_COMBO_LEN.min || max > HISTORICAL_COMBO_LEN.max || max < min) return null
  return { min, max }
}

function parseCategories(raw: unknown): TechniqueCategory[] | null {
  if (!Array.isArray(raw) || raw.length > TECHNIQUE_CATEGORIES.length + 4) return null
  const out: TechniqueCategory[] = []
  for (const item of raw) {
    const cat = oneOf(item, TECHNIQUE_CATEGORIES)
    if (!cat) return null
    if (!out.includes(cat)) out.push(cat)
  }
  return out
}

function validateComboStep(raw: unknown): ComboStep | null {
  if (!isPlainObject(raw)) return null
  const techniqueId = nonEmptyString(raw.techniqueId, MAX_SESSION_ID_LENGTH)
  if (!techniqueId) return null
  if (hasOwn(raw, 'note') && raw.note !== undefined) {
    const note = stringValue(raw.note, MAX_STRING_FIELD)
    if (note === undefined) return null
    return { techniqueId, note }
  }
  return { techniqueId }
}

export function validateCombo(raw: unknown): Combo | null {
  if (!isPlainObject(raw)) return null
  const id = nonEmptyString(raw.id, MAX_SESSION_ID_LENGTH)
  const title = nonEmptyString(raw.title, MAX_STRING_FIELD)
  if (!id || !title) return null
  if (!Array.isArray(raw.techniques) || raw.techniques.length < 1 || raw.techniques.length > MAX_COMBO_LENGTH) {
    return null
  }
  const techniques: ComboStep[] = []
  for (const step of raw.techniques) {
    const parsed = validateComboStep(step)
    if (!parsed) return null
    techniques.push(parsed)
  }

  if (presentInvalidEnum(raw, 'difficulty', DIFFICULTIES)) return null
  if (presentInvalidEnum(raw, 'stance', COMBO_STANCES)) return null
  if (presentInvalidEnum(raw, 'purpose', COMBO_PURPOSES)) return null
  if (presentInvalidEnum(raw, 'recommendedPace', PACE_PRESETS)) return null
  if (presentInvalidEnum(raw, 'martialArt', MARTIAL_ARTS)) return null

  let trainingModes: TrainingMode[] = ['coach']
  if (hasOwn(raw, 'trainingModes')) {
    if (!Array.isArray(raw.trainingModes) || raw.trainingModes.length < 1 || raw.trainingModes.length > TRAINING_MODES.length) {
      return null
    }
    trainingModes = []
    for (const item of raw.trainingModes) {
      const mode = oneOf(item, TRAINING_MODES)
      if (!mode) return null
      if (!trainingModes.includes(mode)) trainingModes.push(mode)
    }
  }

  let tags: string[] = []
  if (hasOwn(raw, 'tags')) {
    if (!Array.isArray(raw.tags) || raw.tags.length > 50) return null
    for (const tag of raw.tags) {
      const value = stringValue(tag, 100)
      if (value === undefined) return null
      tags.push(value)
    }
  }

  let equipment: Equipment[] = ['shadowboxing']
  if (hasOwn(raw, 'equipment')) {
    if (!Array.isArray(raw.equipment) || raw.equipment.length > EQUIPMENT.length) return null
    equipment = []
    for (const item of raw.equipment) {
      const eq = oneOf(item, EQUIPMENT)
      if (!eq) return null
      if (!equipment.includes(eq)) equipment.push(eq)
    }
  }

  if (hasOwn(raw, 'setupExplanation') && stringValue(raw.setupExplanation, MAX_STRING_FIELD) === undefined) return null
  if (hasOwn(raw, 'endingPosition') && stringValue(raw.endingPosition, MAX_STRING_FIELD) === undefined) return null
  if (hasOwn(raw, 'safeExit') && stringValue(raw.safeExit, MAX_STRING_FIELD) === undefined) return null
  if (hasOwn(raw, 'coachingNotes') && stringValue(raw.coachingNotes, MAX_STRING_FIELD) === undefined) return null

  return {
    id,
    title,
    difficulty: oneOf(raw.difficulty, DIFFICULTIES) ?? 'beginner',
    stance: oneOf(raw.stance, COMBO_STANCES) ?? 'both',
    trainingModes,
    purpose: oneOf(raw.purpose, COMBO_PURPOSES) ?? 'conditioning',
    techniques,
    recommendedPace: oneOf(raw.recommendedPace, PACE_PRESETS) ?? 'technical',
    setupExplanation: stringValue(raw.setupExplanation, MAX_STRING_FIELD) ?? 'Saved combination.',
    endingPosition: stringValue(raw.endingPosition, MAX_STRING_FIELD) ?? 'Reset to base',
    safeExit: stringValue(raw.safeExit, MAX_STRING_FIELD) ?? 'Reset stance',
    coachingNotes: stringValue(raw.coachingNotes, MAX_STRING_FIELD) ?? '',
    tags,
    equipment,
    martialArt: oneOf(raw.martialArt, MARTIAL_ARTS) ?? 'muay-thai',
  }
}

function validateComboList(raw: unknown, maxItems: number): Combo[] | null {
  if (raw == null) return null
  if (!Array.isArray(raw) || raw.length > maxItems) return null
  const out: Combo[] = []
  for (const item of raw) {
    const combo = validateCombo(item)
    if (!combo) return null
    out.push(combo)
  }
  return out
}

/**
 * WorkoutConfig defaulting:
 *
 * - Session with no workoutConfig: allowed (pre-v1.1.1 history).
 * - workoutConfig present: every required WorkoutConfig field must exist and be valid.
 *   Missing required fields are NOT filled from createDefaultWorkout().
 * - Nested sound / speech / timingMultipliers / comboLength: object must exist.
 *   Missing nested keys may use documented defaults (those objects grew over time).
 * - Present-but-invalid nested values are rejected, not replaced.
 * Optional only: selectedComboIds, customComboId, repeatCount, finishWhenQueueEmpty.
 */
export function validateWorkoutConfig(raw: unknown): WorkoutConfig | null {
  if (!isPlainObject(raw)) return null
  for (const key of WORKOUT_REQUIRED_KEYS) {
    if (!hasOwn(raw, key)) return null
  }

  const martialArt = oneOf(raw.martialArt, MARTIAL_ARTS)
  const mode = oneOf(raw.mode, TRAINING_MODES)
  const stance = oneOf(raw.stance, STANCES)
  const difficulty = oneOf(raw.difficulty, DIFFICULTIES)
  const equipment = oneOf(raw.equipment, EQUIPMENT)
  const pace = oneOf(raw.pace, PACE_PRESETS)
  const callStyle = oneOf(raw.callStyle, CALL_STYLES)
  const sideTerminology = oneOf(raw.sideTerminology, SIDE_TERMINOLOGY)
  const resumeBehavior = oneOf(raw.resumeBehavior, RESUME_BEHAVIORS)
  if (
    !martialArt ||
    !mode ||
    !stance ||
    !difficulty ||
    !equipment ||
    !pace ||
    !callStyle ||
    !sideTerminology ||
    !resumeBehavior
  ) {
    return null
  }

  const sessionDurationSec = nonNegativeInt(raw.sessionDurationSec)
  const rounds = nonNegativeInt(raw.rounds)
  const roundDurationSec = nonNegativeInt(raw.roundDurationSec)
  const restDurationSec = nonNegativeInt(raw.restDurationSec)
  if (
    sessionDurationSec === undefined ||
    rounds === undefined ||
    roundDurationSec === undefined ||
    restDurationSec === undefined ||
    sessionDurationSec < HISTORICAL_DURATION_SEC.min ||
    sessionDurationSec > HISTORICAL_DURATION_SEC.max ||
    rounds < HISTORICAL_ROUNDS.min ||
    rounds > HISTORICAL_ROUNDS.max ||
    roundDurationSec < HISTORICAL_DURATION_SEC.min ||
    roundDurationSec > HISTORICAL_DURATION_SEC.max ||
    restDurationSec < HISTORICAL_DURATION_SEC.min ||
    restDurationSec > HISTORICAL_DURATION_SEC.max
  ) {
    return null
  }

  const customPaceMultiplier = finiteInRange(
    raw.customPaceMultiplier,
    WORKOUT_LIMITS.customPaceMultiplier.min,
    WORKOUT_LIMITS.customPaceMultiplier.max,
  )
  const defenseFrequency = finiteInRange(raw.defenseFrequency, WORKOUT_LIMITS.frequency.min, WORKOUT_LIMITS.frequency.max)
  const movementFrequency = finiteInRange(
    raw.movementFrequency,
    WORKOUT_LIMITS.frequency.min,
    WORKOUT_LIMITS.frequency.max,
  )
  const repetitionFrequency = finiteInRange(
    raw.repetitionFrequency,
    WORKOUT_LIMITS.frequency.min,
    WORKOUT_LIMITS.frequency.max,
  )
  if (
    customPaceMultiplier === undefined ||
    defenseFrequency === undefined ||
    movementFrequency === undefined ||
    repetitionFrequency === undefined
  ) {
    return null
  }

  const comboLength = parseComboLength(raw.comboLength)
  if (!comboLength) return null
  const categories = parseCategories(raw.categories)
  if (!categories) return null

  const timingMultipliers = parseTimingMultipliers(raw.timingMultipliers, DEFAULT_TIMING_MULTIPLIERS, true)
  if (!timingMultipliers) return null
  const sound = parseSoundSettings(raw.sound, DEFAULT_SOUND, true)
  if (!sound) return null
  const speech = parseSpeechSettings(raw.speech, { ...DEFAULT_SPEECH, callStyle }, {
    strict: true,
    resetVoiceNumbers: false,
  })
  if (!speech) return null

  const coachingCues = readBoolean(raw.coachingCues)
  const includeHeadKicks = readBoolean(raw.includeHeadKicks)
  const includeElbows = readBoolean(raw.includeElbows)
  const includeKnees = readBoolean(raw.includeKnees)
  const includeClinch = readBoolean(raw.includeClinch)
  const showNextTechnique = readBoolean(raw.showNextTechnique)
  const minimalMode = readBoolean(raw.minimalMode)
  const largeText = readBoolean(raw.largeText)
  if (
    coachingCues === undefined ||
    includeHeadKicks === undefined ||
    includeElbows === undefined ||
    includeKnees === undefined ||
    includeClinch === undefined ||
    showNextTechnique === undefined ||
    minimalMode === undefined ||
    largeText === undefined
  ) {
    return null
  }

  let selectedComboIds: string[] | undefined
  if (hasOwn(raw, 'selectedComboIds')) {
    const ids = copyStringIdList(raw.selectedComboIds, MAX_SELECTED_COMBO_IDS, { unique: true })
    if (!ids) return null
    selectedComboIds = ids
  }

  let customComboId: string | undefined
  if (hasOwn(raw, 'customComboId')) {
    if (raw.customComboId == null) {
      customComboId = undefined
    } else {
      const id = nonEmptyString(raw.customComboId, MAX_SESSION_ID_LENGTH)
      if (!id) return null
      customComboId = id
    }
  }

  let repeatCount: number | undefined
  if (hasOwn(raw, 'repeatCount')) {
    const n = nonNegativeInt(raw.repeatCount)
    if (n === undefined || n < 1 || n > 20) return null
    repeatCount = n
  }

  let finishWhenQueueEmpty: boolean | undefined
  if (hasOwn(raw, 'finishWhenQueueEmpty')) {
    const flag = readBoolean(raw.finishWhenQueueEmpty)
    if (flag === undefined) return null
    finishWhenQueueEmpty = flag
  }

  return {
    martialArt,
    mode,
    stance,
    difficulty,
    equipment,
    sessionDurationSec,
    rounds,
    roundDurationSec,
    restDurationSec,
    comboLength,
    pace,
    customPaceMultiplier,
    timingMultipliers,
    callStyle,
    categories,
    defenseFrequency,
    movementFrequency,
    repetitionFrequency,
    coachingCues,
    sound,
    speech,
    includeHeadKicks,
    includeElbows,
    includeKnees,
    includeClinch,
    showNextTechnique,
    minimalMode,
    largeText,
    sideTerminology,
    resumeBehavior,
    ...(selectedComboIds ? { selectedComboIds } : {}),
    ...(customComboId ? { customComboId } : {}),
    ...(repeatCount !== undefined ? { repeatCount } : {}),
    ...(finishWhenQueueEmpty !== undefined ? { finishWhenQueueEmpty } : {}),
  }
}

function requiredCount(raw: Record<string, unknown>, key: string): number | null {
  if (!hasOwn(raw, key)) return 0
  const n = nonNegativeInt(raw[key])
  return n === undefined ? null : n
}

function requiredDuration(raw: Record<string, unknown>, key: string): number | null {
  if (!hasOwn(raw, key)) return 0
  const n = nonNegativeFinite(raw[key])
  return n === undefined ? null : n
}

export function validateSessionSummary(raw: unknown): SessionSummary | null {
  if (!isPlainObject(raw)) return null
  const id = nonEmptyString(raw.id, MAX_SESSION_ID_LENGTH)
  const startedAt = nonNegativeFinite(raw.startedAt)
  if (!id || startedAt === undefined) return null

  if (hasOwn(raw, 'mode') && oneOf(raw.mode, TRAINING_MODES) === undefined) return null
  if (hasOwn(raw, 'pace') && oneOf(raw.pace, PACE_PRESETS) === undefined) return null
  if (hasOwn(raw, 'stance') && oneOf(raw.stance, STANCES) === undefined) return null
  if (hasOwn(raw, 'martialArt') && raw.martialArt != null && oneOf(raw.martialArt, MARTIAL_ARTS) === undefined) {
    return null
  }

  const mode = oneOf(raw.mode, TRAINING_MODES) ?? 'coach'
  const pace = oneOf(raw.pace, PACE_PRESETS) ?? 'technical'
  const martialArtMissing = !hasOwn(raw, 'martialArt') || raw.martialArt == null
  const martialArt = oneOf(raw.martialArt, MARTIAL_ARTS) ?? 'muay-thai'

  let endedAt = startedAt
  if (hasOwn(raw, 'endedAt')) {
    const parsed = nonNegativeFinite(raw.endedAt)
    if (parsed === undefined) return null
    endedAt = parsed
  }
  if (endedAt < startedAt) return null

  const totalTrainingMs = requiredDuration(raw, 'totalTrainingMs')
  const roundsCompleted = requiredCount(raw, 'roundsCompleted')
  const combinationsCompleted = requiredCount(raw, 'combinationsCompleted')
  const techniquesCalled = requiredCount(raw, 'techniquesCalled')
  const defenseActions = requiredCount(raw, 'defenseActions')
  const movementActions = requiredCount(raw, 'movementActions')
  if (
    totalTrainingMs === null ||
    roundsCompleted === null ||
    combinationsCompleted === null ||
    techniquesCalled === null ||
    defenseActions === null ||
    movementActions === null
  ) {
    return null
  }

  const techniqueCounts = copyCountMap(raw.techniqueCounts)
  const techniqueCategoryCounts = copyCountMap(raw.techniqueCategoryCounts)
  if (!techniqueCounts || !techniqueCategoryCounts) return null

  const comboIds = copyStringIdList(raw.comboIds, MAX_SESSION_COMBO_IDS)
  const favoriteComboIds = copyStringIdList(raw.favoriteComboIds, MAX_FAVORITE_IDS, {
    unique: true,
    skipInvalid: true,
  })
  if (!comboIds || !favoriteComboIds) return null

  if (hasOwn(raw, 'dailyDrillCompleted') && readBoolean(raw.dailyDrillCompleted) === undefined) return null
  if (hasOwn(raw, 'cancelled') && readBoolean(raw.cancelled) === undefined) return null
  if (hasOwn(raw, 'usedCustomCombo') && readBoolean(raw.usedCustomCombo) === undefined) return null
  if (hasOwn(raw, 'excludeFromStats') && readBoolean(raw.excludeFromStats) === undefined) return null
  if (hasOwn(raw, 'isDemo') && readBoolean(raw.isDemo) === undefined) return null
  if (hasOwn(raw, 'migrated') && readBoolean(raw.migrated) === undefined) return null

  let workoutConfig: WorkoutConfig | undefined
  if (hasOwn(raw, 'workoutConfig') && raw.workoutConfig != null) {
    const parsed = validateWorkoutConfig(raw.workoutConfig)
    if (!parsed) return null
    workoutConfig = parsed
  }

  let queuedCombos: Combo[] | undefined
  if (hasOwn(raw, 'queuedCombos') && raw.queuedCombos != null) {
    const parsed = validateComboList(raw.queuedCombos, MAX_SESSION_QUEUED_COMBOS)
    if (!parsed) return null
    queuedCombos = parsed
  }

  let comboSnapshots: Combo[] | undefined
  if (hasOwn(raw, 'comboSnapshots') && raw.comboSnapshots != null) {
    const parsed = validateComboList(raw.comboSnapshots, MAX_SESSION_QUEUED_COMBOS)
    if (!parsed) return null
    comboSnapshots = parsed
  }

  let customPaceMultiplier: number | undefined
  if (hasOwn(raw, 'customPaceMultiplier') && raw.customPaceMultiplier != null) {
    const parsed = finiteInRange(
      raw.customPaceMultiplier,
      WORKOUT_LIMITS.customPaceMultiplier.min,
      WORKOUT_LIMITS.customPaceMultiplier.max,
    )
    if (parsed === undefined) return null
    customPaceMultiplier = parsed
  }

  let dailyPhase: SessionSummary['dailyPhase']
  if (hasOwn(raw, 'dailyPhase') && raw.dailyPhase != null) {
    const parsed = oneOf(raw.dailyPhase, DAILY_PHASES)
    if (!parsed) return null
    dailyPhase = parsed
  }

  const isDemo = booleanOr(raw.isDemo, false) || mode === 'demo'

  let averagePaceLabel: PacePreset
  if (!hasOwn(raw, 'averagePaceLabel') || raw.averagePaceLabel == null) {
    averagePaceLabel = pace
  } else {
    const parsed = oneOf(raw.averagePaceLabel, PACE_PRESETS)
    if (!parsed) return null
    averagePaceLabel = parsed
  }

  let migrated: boolean | undefined
  if (martialArtMissing) migrated = true
  else if (hasOwn(raw, 'migrated')) migrated = booleanOr(raw.migrated, false)

  return {
    id,
    startedAt,
    endedAt,
    martialArt,
    mode,
    stance: oneOf(raw.stance, STANCES) ?? 'orthodox',
    pace,
    totalTrainingMs,
    roundsCompleted,
    combinationsCompleted,
    techniquesCalled,
    techniqueCounts,
    techniqueCategoryCounts,
    comboIds,
    defenseActions,
    movementActions,
    averagePaceLabel,
    dailyDrillCompleted: booleanOr(raw.dailyDrillCompleted, false),
    cancelled: booleanOr(raw.cancelled, false),
    favoriteComboIds,
    usedCustomCombo: booleanOr(raw.usedCustomCombo, false),
    ...(customPaceMultiplier !== undefined ? { customPaceMultiplier } : {}),
    ...(workoutConfig ? { workoutConfig } : {}),
    ...(queuedCombos ? { queuedCombos } : {}),
    ...(comboSnapshots ? { comboSnapshots } : {}),
    excludeFromStats: booleanOr(raw.excludeFromStats, false) || isDemo,
    isDemo,
    ...(dailyPhase ? { dailyPhase } : {}),
    ...(migrated !== undefined ? { migrated } : {}),
  }
}

export function isPersistableSession(summary: SessionSummary): boolean {
  return !summary.excludeFromStats && !summary.isDemo && summary.mode !== 'demo'
}
