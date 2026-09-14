import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { getTechnique } from '../data/techniques'
import { useApp } from '../context/useApp'
import { getSessionById, type SessionByIdResult } from '../storage/historyStore'
import { parseSessionRouteId, validateSessionSummary } from '../storage/sessionValidation'
import { buildTrainAgainPayload } from '../utils/trainAgain'
import type { SessionSummary } from '../types'
import { martialArtLabel } from '../utils/martialArt'

type SummaryView =
  | { kind: 'loading' }
  | { kind: 'found'; summary: SessionSummary }
  | { kind: 'not-found' }
  | { kind: 'unavailable' }

function viewFromLookup(result: SessionByIdResult): SummaryView {
  if (result.status === 'found') return { kind: 'found', summary: result.session }
  if (result.status === 'unavailable') return { kind: 'unavailable' }
  return { kind: 'not-found' }
}

function isDisplayableSummary(raw: unknown): raw is SessionSummary {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  const value = raw as Record<string, unknown>
  if (!parseSessionRouteId(value.id)) return false
  if (typeof value.martialArt !== 'string' || typeof value.mode !== 'string') return false
  if (typeof value.stance !== 'string' || typeof value.pace !== 'string') return false
  if (typeof value.roundsCompleted !== 'number' || typeof value.combinationsCompleted !== 'number') return false
  if (typeof value.totalTrainingMs !== 'number' || typeof value.techniquesCalled !== 'number') return false
  if (typeof value.techniqueCounts !== 'object' || value.techniqueCounts === null) return false
  return true
}

function stateSummary(raw: unknown): SessionSummary | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !('summary' in raw)) return null
  const candidate = (raw as { summary?: unknown }).summary
  return validateSessionSummary(candidate) ?? (isDisplayableSummary(candidate) ? candidate : null)
}

export function SummaryPage() {
  const { sessionId: routeParam } = useParams<{ sessionId?: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { customCombos } = useApp()

  const routeId = routeParam === undefined ? null : parseSessionRouteId(routeParam)
  const fromState = stateSummary(location.state)
  const matchingState =
    routeParam === undefined
      ? fromState
      : routeId != null && fromState?.id === routeId
        ? fromState
        : null
  const matchingStateId = matchingState?.id ?? null

  const [resolved, setResolved] = useState<{ lookupId: string; view: SummaryView } | null>(null)
  const [retryToken, setRetryToken] = useState(0)

  useEffect(() => {
    if (matchingStateId) {
      return
    }
    if (routeParam === undefined || routeId === null) {
      setResolved({ lookupId: routeParam ?? '', view: { kind: 'not-found' } })
      return
    }

    let cancelled = false
    setResolved({ lookupId: routeId, view: { kind: 'loading' } })
    void getSessionById(routeId)
      .then((result) => {
        if (cancelled) return
        setResolved({
          lookupId: routeId,
          view: viewFromLookup(result),
        })
      })
      .catch(() => {
        if (cancelled) return
        setResolved({ lookupId: routeId, view: { kind: 'unavailable' } })
      })
    return () => {
      cancelled = true
    }
  }, [matchingStateId, routeId, routeParam, retryToken])

  const view: SummaryView = matchingState
    ? { kind: 'found', summary: matchingState }
    : routeParam === undefined || routeId === null
      ? { kind: 'not-found' }
      : resolved?.lookupId === routeId
        ? resolved.view
        : { kind: 'loading' }

  if (view.kind === 'loading') {
    return (
      <div className="space-y-4">
        <h1 className="display text-5xl">Summary</h1>
        <p className="text-[var(--text-muted)]" role="status">
          Loading workout summary…
        </p>
      </div>
    )
  }

  if (view.kind === 'not-found') {
    return (
      <div className="space-y-4">
        <h1 className="display text-5xl">Workout summary not found.</h1>
        <p className="text-[var(--text-muted)]">
          This workout is not available. It may not have been saved, or it may have been removed.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link to="/stats" className="btn btn-primary">
            Training Stats
          </Link>
          <Link to="/" className="btn">
            Home
          </Link>
          <Link to="/train" className="btn">
            Start workout
          </Link>
        </div>
      </div>
    )
  }

  if (view.kind === 'unavailable') {
    return (
      <div className="space-y-4">
        <h1 className="display text-5xl">Training history unavailable</h1>
        <p className="text-[var(--text-muted)]">
          StrikeCaller can’t access saved workout history right now. Your workout may still be available when storage access is restored.
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn btn-primary" onClick={() => setRetryToken((n) => n + 1)}>
            Retry
          </button>
          <Link to="/" className="btn">
            Home
          </Link>
          <Link to="/train" className="btn">
            Start workout
          </Link>
        </div>
      </div>
    )
  }

  const summary = view.summary
  const topTechniques = Object.entries(summary.techniqueCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)

  const trainAgain = () => {
    const payload = buildTrainAgainPayload(summary, customCombos)
    navigate('/session', {
      state: {
        config: payload.config,
        comboQueue: payload.comboQueue,
        demo: payload.config.mode === 'demo',
      },
    })
  }

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
        <p className="mt-2 text-sm capitalize text-[var(--text-muted)]">
          {martialArtLabel(summary.martialArt)} · {summary.mode} · {summary.stance} · {summary.pace}
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
            {topTechniques.map(([id, count]) => {
              let name = id
              try {
                name = getTechnique(id).name
              } catch {
                // legacy
              }
              return (
                <li key={id} className="flex items-center justify-between gap-3 text-sm">
                  <span>{name}</span>
                  <span className="mono text-[var(--text-muted)]">{count}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {summary.dailyDrillCompleted && (
        <p className="rounded-lg border border-[var(--success)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] p-3 text-sm">
          Daily drill marked complete for this session.
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn btn-primary" onClick={trainAgain}>
          Train again
        </button>
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
