import type { SessionSummary } from '../types'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateSessionSummary(raw: unknown): SessionSummary | null {
  if (!isObject(raw) || typeof raw.id !== 'string') return null
  if (typeof raw.startedAt !== 'number') return null
  const mode = typeof raw.mode === 'string' ? raw.mode : 'coach'
  const martialArt = raw.martialArt === 'boxing' ? 'boxing' : 'muay-thai'
  const migrated = raw.martialArt == null
  return {
    id: raw.id,
    startedAt: raw.startedAt,
    endedAt: typeof raw.endedAt === 'number' ? raw.endedAt : raw.startedAt,
    martialArt,
    mode: mode as SessionSummary['mode'],
    stance: raw.stance === 'southpaw' ? 'southpaw' : 'orthodox',
    pace: (typeof raw.pace === 'string' ? raw.pace : 'technical') as SessionSummary['pace'],
    totalTrainingMs: typeof raw.totalTrainingMs === 'number' ? raw.totalTrainingMs : 0,
    roundsCompleted: typeof raw.roundsCompleted === 'number' ? raw.roundsCompleted : 0,
    combinationsCompleted: typeof raw.combinationsCompleted === 'number' ? raw.combinationsCompleted : 0,
    techniquesCalled: typeof raw.techniquesCalled === 'number' ? raw.techniquesCalled : 0,
    techniqueCounts: isObject(raw.techniqueCounts) ? (raw.techniqueCounts as Record<string, number>) : {},
    techniqueCategoryCounts: isObject(raw.techniqueCategoryCounts)
      ? (raw.techniqueCategoryCounts as Record<string, number>)
      : {},
    comboIds: Array.isArray(raw.comboIds) ? raw.comboIds.filter((id) => typeof id === 'string') : [],
    defenseActions: typeof raw.defenseActions === 'number' ? raw.defenseActions : 0,
    movementActions: typeof raw.movementActions === 'number' ? raw.movementActions : 0,
    averagePaceLabel: typeof raw.averagePaceLabel === 'string' ? raw.averagePaceLabel : 'technical',
    dailyDrillCompleted: Boolean(raw.dailyDrillCompleted),
    cancelled: Boolean(raw.cancelled),
    favoriteComboIds: Array.isArray(raw.favoriteComboIds)
      ? raw.favoriteComboIds.filter((id) => typeof id === 'string')
      : [],
    usedCustomCombo: Boolean(raw.usedCustomCombo),
    workoutConfig: isObject(raw.workoutConfig)
      ? (raw.workoutConfig as unknown as SessionSummary['workoutConfig'])
      : undefined,
    queuedCombos: Array.isArray(raw.queuedCombos)
      ? (raw.queuedCombos as SessionSummary['queuedCombos'])
      : undefined,
    comboSnapshots: Array.isArray(raw.comboSnapshots)
      ? (raw.comboSnapshots as SessionSummary['comboSnapshots'])
      : undefined,
    customPaceMultiplier:
      typeof raw.customPaceMultiplier === 'number' && Number.isFinite(raw.customPaceMultiplier)
        ? raw.customPaceMultiplier
        : undefined,
    excludeFromStats: Boolean(raw.excludeFromStats) || mode === 'demo' || Boolean(raw.isDemo),
    isDemo: Boolean(raw.isDemo) || mode === 'demo',
    dailyPhase:
      raw.dailyPhase === 'slowDone' || raw.dailyPhase === 'normalDone' || raw.dailyPhase === 'fightDone'
        ? raw.dailyPhase
        : undefined,
    migrated: migrated || Boolean(raw.migrated),
  }
}

export function isPersistableSession(summary: SessionSummary): boolean {
  return !summary.excludeFromStats && !summary.isDemo && summary.mode !== 'demo'
}
