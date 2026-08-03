export const WORKOUT_LIMITS = {
  rounds: { min: 1, max: 12 },
  roundDurationSec: { min: 30, max: 300 },
  restDurationSec: { min: 15, max: 180 },
  sessionDurationSec: { min: 30, max: 900 },
  comboMin: { min: 2, max: 6 },
  comboMax: { min: 2, max: 8 },
  customPaceMultiplier: { min: 0.55, max: 2.5 },
  frequency: { min: 0, max: 1 },
} as const

export function parseIntegerInput(raw: string | number): number | null {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null
    return Math.round(raw)
  }
  const trimmed = raw.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return null
  return Math.round(n)
}

export function parseNumberInput(raw: string | number): number | null {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null
    return raw
  }
  const trimmed = raw.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return null
  return n
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export interface WorkoutFieldValues {
  rounds: number
  roundDurationSec: number
  restDurationSec: number
  sessionDurationSec: number
  comboMin: number
  comboMax: number
  customPaceMultiplier: number
  defenseFrequency: number
  movementFrequency: number
  repetitionFrequency: number
}

export function validateWorkoutFields(values: WorkoutFieldValues): string[] {
  const errors: string[] = []
  const checkInt = (label: string, value: number, min: number, max: number) => {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < min || value > max) {
      errors.push(`${label} must be an integer between ${min} and ${max}.`)
    }
  }
  const checkNum = (label: string, value: number, min: number, max: number) => {
    if (!Number.isFinite(value) || value < min || value > max) {
      errors.push(`${label} must be between ${min} and ${max}.`)
    }
  }

  checkInt('Rounds', values.rounds, WORKOUT_LIMITS.rounds.min, WORKOUT_LIMITS.rounds.max)
  checkInt(
    'Round duration',
    values.roundDurationSec,
    WORKOUT_LIMITS.roundDurationSec.min,
    WORKOUT_LIMITS.roundDurationSec.max,
  )
  checkInt(
    'Rest duration',
    values.restDurationSec,
    WORKOUT_LIMITS.restDurationSec.min,
    WORKOUT_LIMITS.restDurationSec.max,
  )
  checkInt(
    'Session duration',
    values.sessionDurationSec,
    WORKOUT_LIMITS.sessionDurationSec.min,
    WORKOUT_LIMITS.sessionDurationSec.max,
  )
  checkInt('Combo minimum', values.comboMin, WORKOUT_LIMITS.comboMin.min, WORKOUT_LIMITS.comboMin.max)
  checkInt('Combo maximum', values.comboMax, WORKOUT_LIMITS.comboMax.min, WORKOUT_LIMITS.comboMax.max)
  if (
    Number.isFinite(values.comboMin) &&
    Number.isFinite(values.comboMax) &&
    values.comboMax < values.comboMin
  ) {
    errors.push('Combo maximum must be greater than or equal to combo minimum.')
  }
  checkNum(
    'Custom pace multiplier',
    values.customPaceMultiplier,
    WORKOUT_LIMITS.customPaceMultiplier.min,
    WORKOUT_LIMITS.customPaceMultiplier.max,
  )
  checkNum(
    'Defense frequency',
    values.defenseFrequency,
    WORKOUT_LIMITS.frequency.min,
    WORKOUT_LIMITS.frequency.max,
  )
  checkNum(
    'Movement frequency',
    values.movementFrequency,
    WORKOUT_LIMITS.frequency.min,
    WORKOUT_LIMITS.frequency.max,
  )
  checkNum(
    'Repetition frequency',
    values.repetitionFrequency,
    WORKOUT_LIMITS.frequency.min,
    WORKOUT_LIMITS.frequency.max,
  )
  return errors
}
