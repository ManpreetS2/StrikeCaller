import { Link, useLocation } from 'react-router-dom'
import { getTechnique } from '../data/techniques'
import type { SessionSummary } from '../types'

export function SummaryPage() {
  const location = useLocation()
  const summary = (location.state as { summary?: SessionSummary } | null)?.summary

  if (!summary) {
    return (
      <div className="space-y-4">
        <h1 className="display text-5xl">Session summary</h1>
        <p className="text-[var(--text-muted)]">No summary available.</p>
        <Link to="/train" className="btn btn-primary">
          Train again
        </Link>
      </div>
    )
  }

  const topTechniques = Object.entries(summary.techniqueCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-[var(--accent-text)]">
          {summary.cancelled ? 'Session ended early' : 'Session complete'}
        </p>
        <h1 className="display mt-2 text-5xl">Summary</h1>
        <p className="mt-2 text-[var(--text-muted)]">
          StrikeCaller tracks what was called — not technique quality, power, speed, accuracy, or calories.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Work time" value={`${Math.round(summary.totalTrainingMs / 1000)}s`} />
        <Stat label="Rounds" value={String(summary.roundsCompleted)} />
        <Stat label="Combinations" value={String(summary.combinationsCompleted)} />
        <Stat label="Techniques called" value={String(summary.techniquesCalled)} />
        <Stat label="Defense actions" value={String(summary.defenseActions)} />
        <Stat label="Movement actions" value={String(summary.movementActions)} />
        <Stat label="Pace" value={summary.averagePaceLabel} />
        <Stat label="Stance" value={summary.stance} />
      </div>

      <section className="panel p-5">
        <h2 className="mb-3 text-xl font-semibold">Most frequent techniques</h2>
        {topTechniques.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No techniques recorded.</p>
        ) : (
          <ul className="space-y-2">
            {topTechniques.map(([id, count]) => (
              <li key={id} className="flex items-center justify-between gap-3 text-sm">
                <span>{getTechnique(id).name}</span>
                <span className="mono text-[var(--text-muted)]">{count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {summary.dailyDrillCompleted && (
        <p className="rounded-lg border border-[var(--success)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] p-3 text-sm">
          Daily drill marked complete for this session.
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Link to="/train" className="btn btn-primary">
          Train again
        </Link>
        <Link to="/" className="btn">
          Home
        </Link>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-dim)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold capitalize">{value}</p>
    </div>
  )
}
