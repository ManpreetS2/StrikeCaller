import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import {
  computeTrainingStats,
  formatDuration,
  MILESTONES,
} from '../engines/statsEngine'
import { MetricVisual, type MetricVisualId } from '../components/visual'
import { useCountUp } from '../hooks/useCountUp'
import type { MartialArt, StatsRange } from '../types'

export function StatsPage() {
  const { history, favorites, customCombos } = useApp()
  const [range, setRange] = useState<StatsRange>('30d')
  const [sport, setSport] = useState<MartialArt | 'all'>('all')
  const seenMilestones = useRef<Set<string>>(new Set())
  const milestonesPrimed = useRef(false)
  const [freshUnlocks, setFreshUnlocks] = useState<Set<string>>(new Set())

  const stats = useMemo(
    () => computeTrainingStats(history, { range, martialArt: sport }),
    [history, range, sport],
  )

  useEffect(() => {
    if (!milestonesPrimed.current) {
      for (const m of stats.milestones) seenMilestones.current.add(m.id)
      milestonesPrimed.current = true
      return
    }
    const next = new Set<string>()
    for (const m of stats.milestones) {
      if (!seenMilestones.current.has(m.id)) {
        next.add(m.id)
        seenMilestones.current.add(m.id)
      }
    }
    if (next.size) setFreshUnlocks(next)
  }, [stats.milestones])

  const empty = stats.totalSessions === 0

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-[var(--accent-text)]">Local only</p>
        <h1 className="display mt-2 text-5xl">Training Stats</h1>
        <p className="mt-2 max-w-2xl text-[var(--text-muted)]">
          StrikeCaller tracks training activity, not technique quality or accuracy. No accounts, no cloud sync.
        </p>
      </header>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Stats filters">
        {(
          [
            ['7d', 'Last 7 days'],
            ['30d', 'Last 30 days'],
            ['all', 'All time'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`chip ${range === id ? 'chip-active' : ''}`}
            aria-pressed={range === id}
            onClick={() => setRange(id)}
          >
            {label}
          </button>
        ))}
        {(
          [
            ['all', 'All martial arts'],
            ['muay-thai', 'Muay Thai'],
            ['boxing', 'Boxing'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`chip ${sport === id ? 'chip-active' : ''}`}
            aria-pressed={sport === id}
            onClick={() => setSport(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {empty ? (
        <div className="panel flex flex-col items-center gap-3 p-8 text-center">
          <div className="icon-well" aria-hidden>
            <MetricVisual kind="empty" size="lg" />
          </div>
          <h2 className="text-2xl font-semibold">No sessions in this range</h2>
          <p className="mt-2 text-[var(--text-muted)]">
            Complete a Quick Start or Customize Workout session to populate stats.
          </p>
        </div>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Summary">
            <StatCard label="Sessions" value={stats.totalSessions} kind="sessions" />
            <StatCard label="Training time" valueLabel={formatDuration(stats.totalTrainingMs)} kind="minutes" />
            <StatCard label="Rounds" value={stats.roundsCompleted} kind="rounds" />
            <StatCard label="Combinations" value={stats.combinationsCompleted} kind="combos" />
            <StatCard label="Techniques called" value={stats.techniquesCalled} kind="techniques" />
            <StatCard label="Unique combos" value={stats.uniqueCombinations} kind="combos" />
            <StatCard
              label="Current streak (filtered)"
              value={stats.currentStreak}
              suffix={` day${stats.currentStreak === 1 ? '' : 's'}`}
              kind="streak"
            />
            <StatCard
              label="Longest streak (filtered)"
              value={stats.longestStreak}
              suffix={` day${stats.longestStreak === 1 ? '' : 's'}`}
              kind="longest-streak"
            />
            <StatCard label="Avg session" valueLabel={formatDuration(stats.averageSessionMs)} kind="minutes" />
            <StatCard label="Custom combos saved" value={customCombos.length} kind="custom" />
          </section>

          <section className="grid gap-4 lg:grid-cols-2" aria-labelledby="activity-heading">
            <div className="panel p-5">
              <h2 id="activity-heading" className="text-xl font-semibold">
                Weekly activity
              </h2>
              <p className="sr-only">
                Minutes trained per day:{' '}
                {stats.weeklyMinutes.map((d) => `${d.dayLabel} ${d.minutes} minutes, ${d.sessions} sessions`).join('; ')}
              </p>
              <BarChart
                items={stats.weeklyMinutes.map((d) => ({
                  label: d.dayLabel,
                  value: d.minutes,
                  secondary: `${d.sessions} sess`,
                }))}
                unit="min"
              />
            </div>
            <div className="panel p-5">
              <h2 className="text-xl font-semibold">Training breakdown</h2>
              <p className="sr-only">
                {stats.sportBreakdownMs
                  .map((s) => `${s.martialArt} ${formatDuration(s.ms)}`)
                  .join('; ')}
              </p>
              <BarChart
                items={stats.sportBreakdownMs.map((s) => ({
                  label: s.martialArt === 'boxing' ? 'Boxing' : 'Muay Thai',
                  value: Math.round(s.ms / 60000),
                  pattern: s.martialArt === 'boxing' ? 'stripe' : 'solid',
                }))}
                unit="min"
              />
              <h3 className="mt-6 text-lg font-semibold">Mode breakdown</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {stats.modeBreakdown.map((m) => (
                  <li key={m.mode} className="flex justify-between gap-3">
                    <span className="capitalize">{m.mode}</span>
                    <span>{m.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="panel p-5">
              <h2 className="text-xl font-semibold">Technique activity</h2>
              <p className="mt-1 text-sm text-[var(--text-dim)]">Activity tracking only — not quality scoring.</p>
              <p className="mt-3 text-sm">
                Most called: <strong>{stats.mostCalledTechniqueName ?? '—'}</strong>
              </p>
              <p className="text-sm">
                Least-trained category: <strong>{stats.leastTrainedCategory ?? '—'}</strong>
              </p>
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
                {stats.topTechniques.map((t) => (
                  <li key={t.id}>
                    {t.name} · {t.count}
                  </li>
                ))}
              </ol>
              <BarChart
                items={stats.categoryDistribution.slice(0, 8).map((c) => ({
                  label: c.category,
                  value: c.count,
                }))}
                unit="calls"
              />
            </div>
            <div className="panel p-5">
              <h2 className="text-xl font-semibold">Combo activity</h2>
              <p className="mt-3 text-sm">Muay Thai combos completed: {stats.muayThaiCombos}</p>
              <p className="text-sm">Boxing combos completed: {stats.boxingCombos}</p>
              <p className="text-sm">Custom combos completed: {stats.customCombosCompleted}</p>
              <p className="text-sm">Favorites saved: {favorites.length}</p>
              <h3 className="mt-4 font-semibold">Most practiced</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {stats.mostPracticedCombos.map((c) => (
                  <li key={c.id}>
                    {c.title} · {c.count}
                  </li>
                ))}
                {!stats.mostPracticedCombos.length && <li className="text-[var(--text-dim)]">No combo IDs recorded yet.</li>}
              </ul>
              <h3 className="mt-4 font-semibold">Recently practiced</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {stats.recentCombos.map((c) => (
                  <li key={c.id}>{c.title}</li>
                ))}
              </ul>
            </div>
          </section>

          <section className="panel p-5">
            <h2 className="text-xl font-semibold">Personal records</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 text-sm">
              <li className="flex items-start gap-2">
                <span aria-hidden>
                  <MetricVisual kind="record" size="sm" />
                </span>
                Longest session: {formatDuration(stats.personalRecords.longestSessionMs)}
              </li>
              <li>Most rounds in one workout: {stats.personalRecords.mostRounds}</li>
              <li>Most combos in one session: {stats.personalRecords.mostCombos}</li>
              <li>Longest streak: {stats.personalRecords.longestStreak} days</li>
              <li>Most active week: {stats.personalRecords.mostActiveWeekMinutes} min</li>
              <li>
                Fastest selected pace:{' '}
                {stats.personalRecords.fastestPace === 'custom' &&
                stats.personalRecords.fastestPaceMultiplier != null
                  ? `Custom (${stats.personalRecords.fastestPaceMultiplier.toFixed(2)}x)`
                  : (stats.personalRecords.fastestPace ?? '—')}
              </li>
              <li>Highest unique-combo count: {stats.personalRecords.mostUniqueCombosInSession}</li>
            </ul>
          </section>

          <section className="panel p-5">
            <h2 className="text-xl font-semibold">Milestones</h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {MILESTONES.map((m) => {
                const unlocked = stats.milestones.find((u) => u.id === m.id)
                const fresh = Boolean(unlocked && freshUnlocks.has(m.id))
                return (
                  <li
                    key={m.id}
                    className={`rounded-lg border p-3 ${unlocked ? 'border-[var(--accent)]' : 'border-[var(--border)] opacity-70'} ${
                      fresh ? 'milestone-unlock' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span aria-hidden>
                        <MetricVisual kind="milestone" size="sm" />
                      </span>
                      <div>
                        <p className="font-semibold">
                          {unlocked ? (
                            <span className="mr-1 inline-flex rounded border border-[var(--accent)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--accent-text)]">
                              Unlocked
                            </span>
                          ) : (
                            'Locked · '
                          )}
                          {m.title}
                        </p>
                        <p className="text-sm text-[var(--text-muted)]">{m.description}</p>
                        {unlocked && (
                          <p className="mt-1 text-xs text-[var(--text-dim)]">
                            {new Date(unlocked.unlockedAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  valueLabel,
  suffix = '',
  kind,
}: {
  label: string
  value?: number
  valueLabel?: string
  suffix?: string
  kind: MetricVisualId
}) {
  const animated = useCountUp(value ?? 0)
  const display = valueLabel ?? `${animated}${suffix}`
  const finalForSr = valueLabel ?? `${value ?? 0}${suffix}`
  return (
    <div className="metric-card panel flex items-start gap-3 p-4">
      <div className="icon-well !h-11 !w-11" aria-hidden>
        <MetricVisual kind={kind} size="sm" />
      </div>
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-dim)]">{label}</p>
        <p className="mt-2 text-2xl font-semibold" aria-hidden={value != null}>
          {display}
        </p>
        {value != null ? <span className="sr-only">{finalForSr}</span> : null}
      </div>
    </div>
  )
}

function BarChart({
  items,
  unit,
}: {
  items: { label: string; value: number; secondary?: string; pattern?: 'solid' | 'stripe' }[]
  unit: string
}) {
  const max = Math.max(1, ...items.map((i) => i.value))
  if (!items.length) {
    return <p className="mt-4 text-sm text-[var(--text-muted)]">No chart data yet.</p>
  }
  return (
    <div className="mt-4 space-y-2" role="img" aria-label={`Bar chart in ${unit}`}>
      {items.map((item) => (
        <div key={item.label} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 text-sm">
          <span>{item.label}</span>
          <div
            className="h-3 overflow-hidden rounded bg-[var(--bg-elevated)]"
            title={`${item.value} ${unit}${item.secondary ? ` · ${item.secondary}` : ''}`}
          >
            <div
              className="h-full rounded bg-[var(--accent)]"
              style={{
                width: `${(item.value / max) * 100}%`,
                backgroundImage:
                  item.pattern === 'stripe'
                    ? 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.25) 4px, rgba(0,0,0,0.25) 8px)'
                    : undefined,
              }}
            />
          </div>
          <span className="tabular-nums text-[var(--text-muted)]">
            {item.value}
            {item.secondary ? ` · ${item.secondary}` : ''}
          </span>
        </div>
      ))}
    </div>
  )
}
