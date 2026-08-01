import { getTechnique } from '../data/techniques'
import type { Stance, Technique, ValidationIssue, ValidationResult } from '../types'

const MAX_COMBO_LENGTH = 8
const MAX_HEAVY_IN_A_ROW = 2

const RANGE_ORDER: Record<Technique['range'], number> = {
  long: 0,
  mid: 1,
  close: 2,
  clinch: 3,
}

function isHeavy(t: Technique): boolean {
  return t.weightCommit === 'heavy' || t.category === 'kick' || t.category === 'knee'
}

function isMovement(t: Technique): boolean {
  return t.category === 'movement' || t.id === 'exit-clinch'
}

function isDefense(t: Technique): boolean {
  return t.category === 'defense' || t.category === 'counter'
}

export function mirrorMovementId(techniqueId: string, stance: Stance): string {
  if (stance === 'orthodox') return techniqueId
  const map: Record<string, string> = {
    'slip-left': 'slip-right',
    'slip-right': 'slip-left',
    'step-left': 'step-right',
    'step-right': 'step-left',
    'pivot-left': 'pivot-right',
    'pivot-right': 'pivot-left',
    'angle-out-left': 'angle-out-right',
    'angle-out-right': 'angle-out-left',
  }
  return map[techniqueId] ?? techniqueId
}

export function mirrorTechniqueIds(ids: string[], stance: Stance): string[] {
  return ids.map((id) => mirrorMovementId(id, stance))
}

export function validateTechniqueSequence(
  techniqueIds: string[],
  options: { stance?: Stance; maxLength?: number } = {},
): ValidationResult {
  const issues: ValidationIssue[] = []
  const maxLength = options.maxLength ?? MAX_COMBO_LENGTH

  if (techniqueIds.length === 0) {
    issues.push({ code: 'empty', message: 'Combo cannot be empty.', severity: 'error' })
    return { valid: false, issues }
  }

  if (techniqueIds.length > maxLength) {
    issues.push({
      code: 'excessive-length',
      message: `Combo exceeds maximum length of ${maxLength} techniques.`,
      severity: 'error',
    })
  }

  let techniques: Technique[]
  try {
    techniques = techniqueIds.map((id) => getTechnique(id))
  } catch (error) {
    issues.push({
      code: 'unknown-technique',
      message: error instanceof Error ? error.message : 'Unknown technique',
      severity: 'error',
    })
    return { valid: false, issues }
  }

  let heavyStreak = 0
  let previous: Technique | null = null

  for (let i = 0; i < techniques.length; i++) {
    const current = techniques[i]!

    if (previous) {
      if (previous.incompatibleFollowUps.includes(current.id)) {
        issues.push({
          code: 'incompatible-follow-up',
          message: `${previous.name} should not be followed by ${current.name}.`,
          severity: 'error',
          index: i,
        })
      }

      // Same-side rear power punches without reset are awkward (cross then rear hook)
      if (
        previous.category === 'punch' &&
        current.category === 'punch' &&
        previous.side === 'rear' &&
        current.side === 'rear' &&
        previous.weightCommit !== 'light' &&
        current.weightCommit !== 'light' &&
        previous.id !== current.id
      ) {
        issues.push({
          code: 'side-consistency',
          message: `Back-to-back rear power punches (${previous.name} → ${current.name}) break weight transfer.`,
          severity: 'error',
          index: i,
        })
      }

      // Impossible range jump: long teep straight into clinch without entry
      const rangeDelta = Math.abs(RANGE_ORDER[current.range] - RANGE_ORDER[previous.range])
      if (
        rangeDelta >= 3 &&
        previous.category !== 'movement' &&
        current.category !== 'movement' &&
        current.category !== 'clinch' &&
        previous.category !== 'clinch'
      ) {
        issues.push({
          code: 'impossible-range',
          message: `Range jump from ${previous.range} (${previous.name}) to ${current.range} (${current.name}) is unrealistic.`,
          severity: 'error',
          index: i,
        })
      }

      if (previous.range === 'long' && current.range === 'clinch' && current.id !== 'clinch-entry') {
        issues.push({
          code: 'impossible-range',
          message: 'Cannot enter clinch range directly from a long-range strike without an entry.',
          severity: 'error',
          index: i,
        })
      }

      // After heavy kick/knee, avoid another heavy committed strike without recovery/movement
      if (isHeavy(previous) && isHeavy(current) && !isMovement(current) && !isDefense(current)) {
        heavyStreak += 1
        if (heavyStreak >= MAX_HEAVY_IN_A_ROW) {
          issues.push({
            code: 'recovery-needed',
            message: `Insufficient recovery after ${previous.name} before ${current.name}.`,
            severity: 'error',
            index: i,
          })
        }
      } else if (!isHeavy(current)) {
        heavyStreak = 0
      }

      // Stance-sensitive slip direction conflicts already covered by incompatible list
      if (
        (previous.id === 'slip-left' && current.id === 'slip-right') ||
        (previous.id === 'slip-right' && current.id === 'slip-left')
      ) {
        issues.push({
          code: 'invalid-stance-transition',
          message: 'Opposite slips in sequence are not a realistic single reaction.',
          severity: 'error',
          index: i,
        })
      }

      // Leaving guard wide open into another committed attack without defense/movement warning
      if (previous.leavesGuardOpen && isHeavy(current) && current.category !== 'kick') {
        issues.push({
          code: 'defensive-responsibility',
          message: `After ${previous.name}, prefer recovery, defense, or a balanced follow-up before another committed strike.`,
          severity: 'warning',
          index: i,
        })
      }
    } else {
      heavyStreak = isHeavy(current) ? 1 : 0
    }

    previous = current
  }

  // Encourage a valid ending: last technique ideally movement, reset, light punch, or finishing kick
  const last = techniques[techniques.length - 1]!
  if (last.category === 'clinch' && last.id !== 'exit-clinch') {
    issues.push({
      code: 'invalid-exit',
      message: 'Clinch sequences should end with an exit or reset.',
      severity: 'warning',
    })
  }

  const hasError = issues.some((issue) => issue.severity === 'error')
  return { valid: !hasError, issues }
}

export function estimateComboDurationMs(techniqueIds: string[], multiplier = 1): number {
  return techniqueIds.reduce((total, id) => {
    const t = getTechnique(id)
    return total + (t.baseExecutionMs + t.recoveryMs + t.transitionMs) * multiplier
  }, 0)
}
