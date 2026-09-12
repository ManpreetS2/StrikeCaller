import { resolveCombo } from '../utils/resolveCombo'
import { buildTrainAgainPayload } from '../utils/trainAgain'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Play, Sparkles, SlidersHorizontal, CalendarDays } from 'lucide-react'
import { useApp } from '../context/useApp'
import { SafetyNotice } from '../components/SafetyNotice'
import { getComboStats } from '../data/combos'
import { getQuickStartPresets, type QuickStartId } from '../data/quickStart'
import { computeStatsPreview, computeTrainingStats, isUserFacingHistoryEntry } from '../engines/statsEngine'
import { APP_VERSION } from '../data/defaults'
import { HeroVisual, PresetVisual, MetricVisual } from '../components/visual'
import { primeTrainingAudio } from '../utils/primeAudio'
import { useOnceAction } from '../hooks/useOnceAction'
import { MARTIAL_ART_ORDER, martialArtLabel } from '../utils/martialArt'
import type { MartialArt } from '../types'

export function HomePage() {
  const navigate = useNavigate()
  const { preferences, updatePreferences, history, historyReady, favorites, customCombos } = useApp()
  const stats = getComboStats()
  const now = Date.now()
  const preview = computeStatsPreview(history, now)
  const weekStats = computeTrainingStats(history, { range: '7d' }, now)
  const allStats = computeTrainingStats(history, { range: 'all' }, now)
  const recent = history.find((h) => isUserFacingHistoryEntry(h, now))
  const favoriteCombo = favorites[0]
    ? resolveCombo(favorites[0], { customCombos, history })
    : null
  const presets = getQuickStartPresets(preferences.martialArt)
  const featured = presets[0]!
  const forYou = presets.slice(1)
  const sportLabel = martialArtLabel(preferences.martialArt)
  const topTechnique = weekStats.mostCalledTechniqueName ?? allStats.mostCalledTechniqueName
  const sportSplit = allStats.sportBreakdownMs.filter((row) => row.ms > 0)

  const setSport = (art: MartialArt) => {
    updatePreferences({ martialArt: art })
  }

  const startQuick = useOnceAction(async (id: QuickStartId) => {
    if (!preferences.onboardingComplete) {
      navigate('/onboarding', { state: { after: 'quick', quickId: id } })
      return
    }
    const preset = presets.find((p) => p.id === id) ?? getQuickStartPresets('muay-thai')[0]!
    if (preset.routeToDaily) {
      navigate('/daily')
      return
    }
    const primed = await primeTrainingAudio({ musicFriendly: preferences.speech.musicFriendly })
    const built = preset.build(preferences)
    const minimalMode = preferences.preferMinimalMode || built.minimalMode
    navigate('/session', {
      state: {
        config: { ...built, minimalMode, showNextTechnique: !minimalMode },
        audioPrimed: primed.ok,
      },
    })
  })

  const trainAgain = useOnceAction(async () => {
    if (recent) {
      const payload = buildTrainAgainPayload(recent, customCombos)
      const primed = await primeTrainingAudio({ musicFriendly: preferences.speech.musicFriendly })
      navigate('/session', {
        state: { config: payload.config, comboQueue: payload.comboQueue, audioPrimed: primed.ok },
      })
      return
    }
    await startQuick(featured.id)
  })

  return (
    <div className="space-y-5 sm:space-y-10">
      <section aria-label="Brand">
        <p className="hidden text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-2-text)] min-[361px]:block">
          Ready to train · v{APP_VERSION}
        </p>
        <h1 className="display mt-1 text-3xl sm:text-5xl lg:text-7xl">StrikeCaller</h1>
        <p className="mt-2 max-w-xl text-[var(--text-muted)]">
          Spoken {sportLabel} combinations. Local stats only.
        </p>
        <p className="mt-1 text-sm text-[var(--text-dim)]">
          {stats.total} built-in combos ({stats.muayThai} Muay Thai, {stats.boxing} Boxing,{' '}
          {stats.mmaStriking} MMA Striking).
        </p>
        <div className="mt-2 flex flex-nowrap gap-1.5 overflow-x-auto pb-0.5 sm:mt-3" role="group" aria-label="Martial art">
          {MARTIAL_ART_ORDER.map((art) => (
            <button
              key={art}
              type="button"
              className={`btn !min-h-9 !shrink-0 !px-3 !text-sm sm:!min-h-10 sm:!px-4 sm:!text-base ${
                preferences.martialArt === art ? 'chip-active' : 'btn-ghost'
              }`}
              aria-label={martialArtLabel(art)}
              aria-pressed={preferences.martialArt === art}
              onClick={() => setSport(art)}
            >
              {art === 'mma-striking' ? (
                <>
                  <span className="sm:hidden">MMA</span>
                  <span className="hidden sm:inline">MMA Striking</span>
                </>
              ) : (
                martialArtLabel(art)
              )}
            </button>
          ))}
        </div>
        {historyReady && recent ? (
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--text-muted)]">
            <span>
              Last session:{' '}
              <span className="text-[var(--text)]">{martialArtLabel(recent.martialArt)}</span>
              {' · '}
              {Math.round(recent.totalTrainingMs / 60000) > 0
                ? `${Math.round(recent.totalTrainingMs / 60000)} min`
                : `${Math.round(recent.totalTrainingMs / 1000)}s`}
            </span>
            <button
              type="button"
              className="btn btn-ghost !min-h-9 !px-2.5 !py-1"
              onClick={trainAgain}
            >
              Train again <ArrowRight size={14} aria-hidden />
            </button>
          </p>
        ) : null}
      </section>

      <section className="home-hero px-4 py-4 sm:px-8 sm:py-8 lg:px-10" aria-label="Featured workout">
          <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between sm:gap-6">
            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-2-text)]">
                Featured workout
              </p>
              <h2 className="display mt-1 text-3xl sm:mt-2 sm:text-6xl lg:text-7xl">{featured.title}</h2>
              <p className="mt-1 text-[var(--text-muted)] sm:mt-2">{featured.body}</p>
              <p className="mt-1 hidden text-sm text-[var(--text-dim)] sm:block">
                Uses your saved stance, experience, calls, and pace.
              </p>
              <button
                type="button"
                className="btn btn-primary home-hero-cta mt-3 sm:mt-5"
                aria-label={`Start workout: ${featured.title}`}
                onClick={() => void startQuick(featured.id)}
              >
                <Play size={18} aria-hidden />
                Start workout
              </button>
            </div>
            <div className="pointer-events-none hidden self-center sm:block lg:self-end" aria-hidden>
              <HeroVisual size={200} />
            </div>
          </div>
        </section>

      <section aria-label="For you">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">For you</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Quick starts for {sportLabel}.</p>
          </div>
          <Link to="/train" className="hidden text-sm text-[var(--accent-2-text)] sm:inline">
            Customize
          </Link>
        </div>
        <div className="workout-rail">
          {forYou.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="workout-card interactive-card panel"
              onClick={() => void startQuick(preset.id)}
            >
              <div className="icon-well !h-11 !w-11" aria-hidden>
                <PresetVisual id={preset.id} size="sm" />
              </div>
              <h3 className="mt-3 font-semibold">{preset.title}</h3>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{preset.body}</p>
            </button>
          ))}
        </div>
      </section>

      <section aria-label="Progress summary">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 className="text-2xl font-semibold">Progress</h2>
          <Link to="/stats" className="text-sm text-[var(--accent-2-text)]">
            Full stats
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy={!historyReady}>
          <ProgressMetric
            label="Sessions this week"
            value={historyReady ? String(preview.sessionsThisWeek) : '—'}
            kind="sessions"
          />
          <ProgressMetric
            label="Minutes trained"
            value={historyReady ? String(preview.minutesThisWeek) : '—'}
            kind="minutes"
          />
          <ProgressMetric
            label="Current streak"
            value={historyReady ? `${preview.currentStreak}d` : '—'}
            kind="streak"
          />
          <ProgressMetric
            label="Rounds this week"
            value={historyReady ? String(weekStats.roundsCompleted) : '—'}
            kind="rounds"
          />
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <div className="progress-card panel">
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-dim)]">Combinations this week</p>
            <p className="mt-1 text-xl font-semibold">
              {historyReady ? weekStats.combinationsCompleted : '—'}
            </p>
          </div>
          <div className="progress-card panel">
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-dim)]">Frequent technique</p>
            <p className="mt-1 truncate text-xl font-semibold" title={topTechnique ?? undefined}>
              {historyReady ? (topTechnique ?? '—') : '—'}
            </p>
          </div>
          <div className="progress-card panel">
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-dim)]">Sport breakdown</p>
            {historyReady && sportSplit.length > 0 ? (
              <p className="mt-1 text-sm text-[var(--text)]">
                {sportSplit
                  .map((row) => `${martialArtLabel(row.martialArt)} ${Math.round(row.ms / 60000)}m`)
                  .join(' · ')}
              </p>
            ) : (
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                {historyReady ? 'No sessions yet.' : '—'}
              </p>
            )}
          </div>
        </div>
        {favoriteCombo ? (
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            Favorite combo: <span className="text-[var(--text)]">{favoriteCombo.title}</span>
          </p>
        ) : null}
      </section>

      <section aria-label="Secondary tools">
        <h2 className="mb-3 text-2xl font-semibold">Tools</h2>
        <div className="flex flex-wrap gap-2">
          <Link to="/train" className="btn tool-chip">
            <SlidersHorizontal size={16} aria-hidden />
            Customize Workout
          </Link>
          <Link to="/daily" className="btn tool-chip">
            <CalendarDays size={16} aria-hidden />
            Daily
          </Link>
          <Link to="/demo" className="btn tool-chip">
            <Sparkles size={16} aria-hidden />
            Guided Demo
          </Link>
          <Link to="/builder" className="btn tool-chip">
            Builder
          </Link>
        </div>
      </section>

      <SafetyNotice compact />
    </div>
  )
}

function ProgressMetric({
  label,
  value,
  kind,
}: {
  label: string
  value: string
  kind: 'sessions' | 'minutes' | 'streak' | 'rounds'
}) {
  return (
    <div className="progress-card metric-card panel flex items-center gap-3">
      <div className="icon-well !h-10 !w-10" aria-hidden>
        <MetricVisual kind={kind} size="sm" />
      </div>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-dim)]">{label}</p>
        <p className="mt-1 text-xl font-semibold">{value}</p>
      </div>
    </div>
  )
}
