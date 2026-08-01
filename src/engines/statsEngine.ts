import type {
  MartialArt,
  MilestoneDefinition,
  PacePreset,
  SessionSummary,
  StatsRange,
  TrainingMode,
  UnlockedMilestone,
} from '../types'
import { addLocalDays, startOfLocalDay } from '../utils/localDate'
import { getPaceMultiplier } from './timingEngine'

export const MILESTONES: MilestoneDefinition[] = [
  { id: 'first-session', title: 'First session', description: 'Completed your first training session.' },
  { id: 'first-muay-thai', title: 'First Muay Thai session', description: 'Trained Muay Thai for the first time.' },
  { id: 'first-boxing', title: 'First Boxing session', description: 'Trained Boxing for the first time.' },
  { id: 'both-sports', title: 'Trained both sports', description: 'Logged sessions in Muay Thai and Boxing.' },
  { id: 'rounds-10', title: '10 rounds completed', description: 'Completed 10 rounds across all sessions.' },
  { id: 'rounds-25', title: '25 rounds completed', description: 'Completed 25 rounds across all sessions.' },
  { id: 'combos-100', title: '100 combos completed', description: 'Completed 100 combinations.' },
  { id: 'combos-500', title: '500 combos completed', description: 'Completed 500 combinations.' },
  { id: 'minutes-60', title: '60 minutes trained', description: 'Logged 60 minutes of training time.' },
  { id: 'minutes-300', title: '300 minutes trained', description: 'Logged 300 minutes of training time.' },
  { id: 'unique-25', title: '25 unique combos', description: 'Trained 25 different combinations.' },
  { id: 'streak-7', title: 'Seven-day streak', description: 'Trained on seven consecutive days.' },
]

function isGenuineSession(summary: SessionSummary): boolean {
  if (summary.cancelled) return false
  if (summary.excludeFromStats || summary.isDemo || summary.mode === 'demo') return false
  return true
}

function inRange(summary: SessionSummary, range: StatsRange, now = Date.now()): boolean {
  if (range === 'all') return true
  const start = startOfLocalDay(now)
  const days = range === '7d' ? 7 : 30
  const cutoff = addLocalDays(start, -(days - 1))
  return summary.startedAt >= cutoff
}

export function filterHistory(
  history: SessionSummary[],
  options: { range?: StatsRange; martialArt?: MartialArt | 'all'; mode?: TrainingMode | 'all' } = {},
): SessionSummary[] {
  const range = options.range ?? 'all'
  return history.filter((h) => {
    if (!isGenuineSession(h)) return false
    if (!inRange(h, range)) return false
    if (options.martialArt && options.martialArt !== 'all' && h.martialArt !== options.martialArt) return false
    if (options.mode && options.mode !== 'all' && h.mode !== options.mode) return false
    return true
  })
}

export function computeStreaks(history: SessionSummary[], now = Date.now()): { current: number; longest: number } {
  const days = new Set(
    history.filter(isGenuineSession).map((h) => startOfLocalDay(h.startedAt)),
  )
  if (days.size === 0) return { current: 0, longest: 0 }

  const sorted = [...days].sort((a, b) => a - b)
  let longest = 1
  let run = 1
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === addLocalDays(sorted[i - 1]!, 1)) {
      run += 1
      longest = Math.max(longest, run)
    } else {
      run = 1
    }
  }

  let current = 0
  let cursor = startOfLocalDay(now)
  if (!days.has(cursor)) {
    cursor = addLocalDays(cursor, -1)
  }
  while (days.has(cursor)) {
    current += 1
    cursor = addLocalDays(cursor, -1)
  }

  return { current, longest: Math.max(longest, current) }
}

export function computeStatsPreview(history: SessionSummary[], now = Date.now()) {
  const week = filterHistory(history, { range: '7d' })
  const streaks = computeStreaks(history, now)
  return {
    sessionsThisWeek: week.length,
    minutesThisWeek: Math.round(week.reduce((s, h) => s + h.totalTrainingMs, 0) / 60000),
    currentStreak: streaks.current,
  }
}

export interface TrainingStats {
  totalSessions: number
  totalTrainingMs: number
  roundsCompleted: number
  combinationsCompleted: number
  techniquesCalled: number
  uniqueCombinations: number
  currentStreak: number
  longestStreak: number
  averageSessionMs: number
  weeklyMinutes: { dayLabel: string; minutes: number; sessions: number }[]
  sportBreakdownMs: { martialArt: MartialArt; ms: number }[]
  modeBreakdown: { mode: string; count: number }[]
  topTechniques: { id: string; count: number }[]
  mostCalledTechnique: string | null
  leastTrainedCategory: string | null
  categoryDistribution: { category: string; count: number }[]
  mostPracticedCombos: { id: string; count: number }[]
  recentCombos: string[]
  muayThaiCombos: number
  boxingCombos: number
  customCombosCompleted: number
  personalRecords: {
    longestSessionMs: number
    mostRounds: number
    mostCombos: number
    longestStreak: number
    mostActiveWeekMinutes: number
    fastestPace: PacePreset | null
    mostUniqueCombosInSession: number
  }
  milestones: UnlockedMilestone[]
}

function dayLabels(now: number) {
  const labels: { start: number; label: string }[] = []
  for (let i = 6; i >= 0; i--) {
    const start = addLocalDays(startOfLocalDay(now), -i)
    const d = new Date(start)
    labels.push({
      start,
      label: d.toLocaleDateString(undefined, { weekday: 'short' }),
    })
  }
  return labels
}

function paceSpeed(summary: SessionSummary): number {
  // Lower multiplier = faster calls
  return getPaceMultiplier(summary.pace, summary.customPaceMultiplier ?? 1)
}

export function computeTrainingStats(
  history: SessionSummary[],
  options: { range?: StatsRange; martialArt?: MartialArt | 'all' } = {},
  now = Date.now(),
): TrainingStats {
  const filtered = filterHistory(history, options)
  const streaks = computeStreaks(history, now)
  const techniqueCounts: Record<string, number> = {}
  const categoryCounts: Record<string, number> = {}
  const comboCounts: Record<string, number> = {}
  const modeCounts: Record<string, number> = {}
  let muayThaiCombos = 0
  let boxingCombos = 0
  let customCombosCompleted = 0
  let sportMt = 0
  let sportBx = 0

  for (const h of filtered) {
    modeCounts[h.mode] = (modeCounts[h.mode] ?? 0) + 1
    if (h.martialArt === 'boxing') sportBx += h.totalTrainingMs
    else sportMt += h.totalTrainingMs
    for (const [id, count] of Object.entries(h.techniqueCounts ?? {})) {
      techniqueCounts[id] = (techniqueCounts[id] ?? 0) + count
    }
    for (const [cat, count] of Object.entries(h.techniqueCategoryCounts ?? {})) {
      categoryCounts[cat] = (categoryCounts[cat] ?? 0) + count
    }
    for (const id of h.comboIds ?? []) {
      comboCounts[id] = (comboCounts[id] ?? 0) + 1
      if (id.startsWith('bx-') || id.startsWith('custom-')) {
        /* counted below */
      }
      if (id.startsWith('bx-')) boxingCombos += 1
      else if (!id.startsWith('custom-')) muayThaiCombos += 1
    }
    if (h.usedCustomCombo) customCombosCompleted += h.combinationsCompleted
    if (h.martialArt === 'boxing') {
      boxingCombos += Math.max(0, h.combinationsCompleted - (h.comboIds?.filter((id) => id.startsWith('bx-')).length ?? 0))
    } else {
      muayThaiCombos += Math.max(
        0,
        h.combinationsCompleted - (h.comboIds?.filter((id) => !id.startsWith('bx-') && !id.startsWith('custom-')).length ?? 0),
      )
    }
  }

  // Prefer combo id tallies when present; fall back to combinationsCompleted by sport
  if (Object.keys(comboCounts).length === 0) {
    muayThaiCombos = filtered.filter((h) => h.martialArt !== 'boxing').reduce((s, h) => s + h.combinationsCompleted, 0)
    boxingCombos = filtered.filter((h) => h.martialArt === 'boxing').reduce((s, h) => s + h.combinationsCompleted, 0)
  } else {
    muayThaiCombos = Object.entries(comboCounts)
      .filter(([id]) => !id.startsWith('bx-') && !id.startsWith('custom-'))
      .reduce((s, [, c]) => s + c, 0)
    boxingCombos = Object.entries(comboCounts)
      .filter(([id]) => id.startsWith('bx-'))
      .reduce((s, [, c]) => s + c, 0)
    customCombosCompleted = Object.entries(comboCounts)
      .filter(([id]) => id.startsWith('custom-'))
      .reduce((s, [, c]) => s + c, 0)
  }

  const topTechniques = Object.entries(techniqueCounts)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  const categoryDistribution = Object.entries(categoryCounts)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)

  const mostPracticedCombos = Object.entries(comboCounts)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  const recentCombos = filtered
    .flatMap((h) => [...(h.comboIds ?? [])].reverse())
    .filter((id, i, arr) => arr.indexOf(id) === i)
    .slice(0, 8)

  const weekly = dayLabels(now).map(({ start, label }) => {
    const daySessions = filtered.filter((h) => startOfLocalDay(h.startedAt) === start)
    return {
      dayLabel: label,
      minutes: Math.round(daySessions.reduce((s, h) => s + h.totalTrainingMs, 0) / 60000),
      sessions: daySessions.length,
    }
  })

  // Most active week (rolling 7 local-day windows)
  let mostActiveWeekMinutes = 0
  const allDays = [...new Set(filtered.map((h) => startOfLocalDay(h.startedAt)))].sort((a, b) => a - b)
  for (const day of allDays) {
    const windowEnd = addLocalDays(day, 7)
    const windowMs = filtered
      .filter((h) => h.startedAt >= day && h.startedAt < windowEnd)
      .reduce((s, h) => s + h.totalTrainingMs, 0)
    mostActiveWeekMinutes = Math.max(mostActiveWeekMinutes, Math.round(windowMs / 60000))
  }

  let fastestPace: PacePreset | null = null
  let fastestSpeed = Number.POSITIVE_INFINITY
  for (const h of filtered) {
    const speed = paceSpeed(h)
    if (speed < fastestSpeed) {
      fastestSpeed = speed
      fastestPace = h.pace
    }
  }

  const totalSessions = filtered.length
  const totalTrainingMs = filtered.reduce((s, h) => s + h.totalTrainingMs, 0)
  const uniqueCombinations = new Set(filtered.flatMap((h) => h.comboIds ?? [])).size

  const milestones = unlockMilestones(history, now)

  return {
    totalSessions,
    totalTrainingMs,
    roundsCompleted: filtered.reduce((s, h) => s + h.roundsCompleted, 0),
    combinationsCompleted: filtered.reduce((s, h) => s + h.combinationsCompleted, 0),
    techniquesCalled: filtered.reduce((s, h) => s + h.techniquesCalled, 0),
    uniqueCombinations,
    currentStreak: streaks.current,
    longestStreak: streaks.longest,
    averageSessionMs: totalSessions ? totalTrainingMs / totalSessions : 0,
    weeklyMinutes: weekly,
    sportBreakdownMs: [
      { martialArt: 'muay-thai', ms: sportMt },
      { martialArt: 'boxing', ms: sportBx },
    ],
    modeBreakdown: Object.entries(modeCounts).map(([mode, count]) => ({ mode, count })),
    topTechniques,
    mostCalledTechnique: topTechniques[0]?.id ?? null,
    leastTrainedCategory: categoryDistribution.length
      ? categoryDistribution[categoryDistribution.length - 1]!.category
      : null,
    categoryDistribution,
    mostPracticedCombos,
    recentCombos,
    muayThaiCombos,
    boxingCombos,
    customCombosCompleted,
    personalRecords: {
      longestSessionMs: filtered.reduce((m, h) => Math.max(m, h.totalTrainingMs), 0),
      mostRounds: filtered.reduce((m, h) => Math.max(m, h.roundsCompleted), 0),
      mostCombos: filtered.reduce((m, h) => Math.max(m, h.combinationsCompleted), 0),
      longestStreak: streaks.longest,
      mostActiveWeekMinutes,
      fastestPace,
      mostUniqueCombosInSession: filtered.reduce(
        (m, h) => Math.max(m, new Set(h.comboIds ?? []).size),
        0,
      ),
    },
    milestones,
  }
}

export function unlockMilestones(history: SessionSummary[], now = Date.now()): UnlockedMilestone[] {
  const active = history.filter(isGenuineSession).sort((a, b) => a.startedAt - b.startedAt)
  if (!active.length) return []

  const unlocked: UnlockedMilestone[] = []
  const mark = (id: string, at: number) => {
    if (!unlocked.some((u) => u.id === id)) unlocked.push({ id, unlockedAt: at })
  }

  mark('first-session', active[0]!.endedAt || active[0]!.startedAt)

  const firstMt = active.find((h) => h.martialArt === 'muay-thai')
  if (firstMt) mark('first-muay-thai', firstMt.endedAt || firstMt.startedAt)
  const firstBx = active.find((h) => h.martialArt === 'boxing')
  if (firstBx) mark('first-boxing', firstBx.endedAt || firstBx.startedAt)
  if (firstMt && firstBx) mark('both-sports', Math.max(firstMt.endedAt, firstBx.endedAt))

  let rounds = 0
  let combos = 0
  let ms = 0
  const unique = new Set<string>()
  for (const h of active) {
    rounds += h.roundsCompleted
    combos += h.combinationsCompleted
    ms += h.totalTrainingMs
    for (const id of h.comboIds ?? []) unique.add(id)
    const at = h.endedAt || h.startedAt
    if (rounds >= 10) mark('rounds-10', at)
    if (rounds >= 25) mark('rounds-25', at)
    if (combos >= 100) mark('combos-100', at)
    if (combos >= 500) mark('combos-500', at)
    if (ms >= 60 * 60000) mark('minutes-60', at)
    if (ms >= 300 * 60000) mark('minutes-300', at)
    if (unique.size >= 25) mark('unique-25', at)
  }

  const { longest, current } = computeStreaks(active, now)
  if (longest >= 7 || current >= 7) {
    mark('streak-7', active[active.length - 1]!.endedAt || now)
  }

  return unlocked
}

export function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000)
  if (totalMin < 60) return `${totalMin} min`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m ? `${h}h ${m}m` : `${h}h`
}
