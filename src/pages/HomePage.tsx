import { resolveCombo } from '../utils/resolveCombo'
import { buildTrainAgainPayload } from '../utils/trainAgain'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Play, Sparkles, Lock, Check, SlidersHorizontal } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { SafetyNotice } from '../components/SafetyNotice'
import { InteractiveCard } from '../components/InteractiveCard'
import { getComboStats } from '../data/combos'
import { getQuickStartPresets, type QuickStartId } from '../data/quickStart'
import { computeStatsPreview } from '../engines/statsEngine'
import { APP_VERSION } from '../data/defaults'
import { HeroVisual, SportVisual, PresetVisual, ModeVisual, MetricVisual } from '../components/visual'
import { primeTrainingAudio } from '../utils/primeAudio'
import { useOnceAction } from '../hooks/useOnceAction'
import type { MartialArt } from '../types'

const COMING_SOON = ['Kickboxing', 'MMA Striking', 'Karate', 'Taekwondo'] as const

export function HomePage() {
  const navigate = useNavigate()
  const { preferences, updatePreferences, history, favorites, customCombos } = useApp()
  const stats = getComboStats()
  const preview = computeStatsPreview(history)
  const recent = history.find(
    (h) => !h.excludeFromStats && !h.isDemo && h.mode !== 'demo' && !h.cancelled,
  )
  const favoriteCombo = favorites[0]
    ? resolveCombo(favorites[0], { customCombos, history })
    : null
  const presets = getQuickStartPresets(preferences.martialArt)

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
    await primeTrainingAudio({ musicFriendly: preferences.speech.musicFriendly })
    const built = preset.build(preferences)
    navigate('/session', {
      state: {
        config: { ...built, minimalMode: preferences.preferMinimalMode || built.minimalMode },
        audioPrimed: true,
      },
    })
  })

  const trainAgain = useOnceAction(async () => {
    if (recent) {
      const payload = buildTrainAgainPayload(recent, customCombos)
      await primeTrainingAudio({ musicFriendly: preferences.speech.musicFriendly })
      navigate('/session', {
        state: { config: payload.config, comboQueue: payload.comboQueue, audioPrimed: true },
      })
      return
    }
    await startQuick(preferences.martialArt === 'boxing' ? 'quick-boxing' : 'quick-train')
  })

  return (
    <div className="space-y-8 sm:space-y-10">
      <section className="relative overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--bg-panel)] px-5 py-7 sm:px-10 sm:py-14">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              'linear-gradient(135deg, transparent 40%, rgba(225,29,72,0.18) 100%), repeating-linear-gradient(-12deg, transparent, transparent 18px, rgba(255,255,255,0.02) 18px, rgba(255,255,255,0.02) 19px)',
          }}
          aria-hidden
        />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 lg:gap-6">
          <div className="relative z-10 max-w-2xl order-1">
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-text)]">
              v{APP_VERSION} · Muay Thai & Boxing
            </p>
            <h1 className="display text-5xl sm:text-7xl md:text-8xl">StrikeCaller</h1>
            <p className="mt-3 max-w-xl text-base text-[var(--text-muted)] sm:text-xl">
              225+ realistic combinations across Muay Thai and Boxing.
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                className="btn btn-primary !min-h-12"
                onClick={() =>
                  void startQuick(preferences.martialArt === 'boxing' ? 'quick-boxing' : 'quick-train')
                }
              >
                <Play size={18} aria-hidden />
                {preferences.martialArt === 'boxing' ? 'Quick Boxing' : 'Quick Train'}
              </button>
              <Link to="/demo" className="btn !min-h-12">
                <Sparkles size={18} aria-hidden />
                Guided Demo
              </Link>
              <Link
                to="/train"
                className="btn !min-h-12"
                onClick={(e) => {
                  if (!preferences.onboardingComplete) {
                    e.preventDefault()
                    navigate('/onboarding', { state: { after: 'train' } })
                  }
                }}
              >
                <SlidersHorizontal size={18} aria-hidden />
                Customize Workout
              </Link>
            </div>
            <p className="mt-3 max-w-xl text-sm text-[var(--text-dim)] hidden sm:block">
              Spoken combinations, adaptive pacing, timed rounds, and local training stats. Free. No account. No
              download.
            </p>
          </div>
          <div className="hero-visual-layer order-2 hidden sm:block lg:order-2" aria-hidden>
            <HeroVisual size={180} />
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Stats preview">
        <PreviewStat label="Sessions this week" value={String(preview.sessionsThisWeek)} kind="sessions" />
        <PreviewStat label="Minutes trained" value={String(preview.minutesThisWeek)} kind="minutes" />
        <PreviewStat label="Current streak" value={`${preview.currentStreak}d`} kind="streak" />
      </section>

      <section aria-label="Martial arts">
        <h2 className="mb-3 text-2xl font-semibold">Martial arts</h2>
        <p className="mb-4 text-sm text-[var(--text-muted)]">Select a sport to load matching Quick Starts.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <InteractiveCard
            selected={preferences.martialArt === 'muay-thai'}
            title="Muay Thai"
            body="125 curated combos"
            visual={<SportVisual art="muay-thai" size="md" />}
            badge={
              preferences.martialArt === 'muay-thai' ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-text)]">
                  <Check size={14} aria-hidden /> Selected
                </span>
              ) : (
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--success)]">Available</span>
              )
            }
            onClick={() => setSport('muay-thai')}
          />
          <InteractiveCard
            selected={preferences.martialArt === 'boxing'}
            title="Boxing"
            body="100+ curated combos"
            visual={<SportVisual art="boxing" size="md" />}
            badge={
              preferences.martialArt === 'boxing' ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-text)]">
                  <Check size={14} aria-hidden /> Selected
                </span>
              ) : (
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-text)]">New in v1.1</span>
              )
            }
            onClick={() => setSport('boxing')}
          />
        </div>
        <div className="coming-soon-grid mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {COMING_SOON.map((name) => (
            <div key={name} className="panel p-4 opacity-55" aria-disabled="true">
              <div className="flex items-start gap-3">
                <div className="icon-well" aria-hidden>
                  <SportVisual art="coming-soon" size="md" />
                </div>
                <div>
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-dim)]">
                    <Lock size={12} aria-hidden /> Coming soon
                  </p>
                  <h3 className="mt-1 text-xl font-semibold">{name}</h3>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-[var(--text-dim)]">
          {stats.total} built-in combinations · StrikeCaller tracks training activity, not technique quality or
          accuracy.
        </p>
      </section>

      <section aria-label="Quick Start">
        <h2 className="mb-2 text-2xl font-semibold">Quick Start</h2>
        <p className="mb-4 text-sm text-[var(--text-muted)]">
          One press. Uses your saved sport, stance, experience, calls, and pace.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {presets.map((preset) => (
            <InteractiveCard
              key={preset.id}
              title={preset.title}
              body={preset.body}
              visual={<PresetVisual id={preset.id} size="md" />}
              onClick={() => void startQuick(preset.id)}
            />
          ))}
          <Link to="/train" className="interactive-card panel block text-left no-underline">
            <div className="flex items-start gap-3">
              <div className="icon-well" aria-hidden>
                <ModeVisual mode="advanced" size="md" />
              </div>
              <div>
                <h3 className="font-semibold text-[var(--text)]">Customize Workout</h3>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Full mode, rounds, pace, and technique filters.</p>
              </div>
            </div>
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Link to="/builder" className="interactive-card panel block p-5 no-underline">
          <div className="flex items-start gap-3">
            <div className="icon-well" aria-hidden>
              <ModeVisual mode="builder" size="md" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[var(--text)]">Build Custom Combo</h3>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Up to eight validated techniques.</p>
            </div>
          </div>
        </Link>
        <Link to="/stats" className="interactive-card panel block p-5 no-underline">
          <div className="flex items-start gap-3">
            <div className="icon-well" aria-hidden>
              <ModeVisual mode="stats" size="md" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[var(--text)]">Training Stats</h3>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Local streaks, records, and milestones.</p>
            </div>
          </div>
        </Link>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <h2 className="mb-2 text-xl font-semibold">Recent workout</h2>
          {recent ? (
            <div className="space-y-1 text-sm text-[var(--text-muted)]">
              <p>
                <span className="capitalize text-[var(--text)]">{recent.martialArt}</span> · {recent.mode} ·{' '}
                {Math.round(recent.totalTrainingMs / 1000)}s work
              </p>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[var(--accent-text)]"
                onClick={trainAgain}
              >
                Train again <ArrowRight size={14} aria-hidden />
              </button>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <div className="icon-well" aria-hidden>
                <MetricVisual kind="empty" size="md" />
              </div>
              <div>
                <p className="text-sm text-[var(--text-muted)]">No sessions yet.</p>
                <button
                  type="button"
                  className="mt-2 btn btn-primary"
                  onClick={() =>
                    void startQuick(preferences.martialArt === 'boxing' ? 'quick-boxing' : 'quick-train')
                  }
                >
                  <Play size={16} aria-hidden /> Quick Train
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="panel p-5">
          <h2 className="mb-2 text-xl font-semibold">Favorite combo</h2>
          {favoriteCombo ? (
            <p className="text-sm text-[var(--text)]">{favoriteCombo.title}</p>
          ) : (
            <div className="flex items-start gap-3">
              <div className="icon-well" aria-hidden>
                <MetricVisual kind="favorite" size="md" />
              </div>
              <div>
                <p className="text-sm text-[var(--text-muted)]">Star combos during training to pin them here.</p>
                <Link to="/train" className="mt-2 inline-flex btn">
                  Start a workout
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>

      <SafetyNotice compact />
    </div>
  )
}

function PreviewStat({
  label,
  value,
  kind,
}: {
  label: string
  value: string
  kind: 'sessions' | 'minutes' | 'streak'
}) {
  return (
    <div className="metric-card panel flex items-center gap-3 px-4 py-3">
      <div className="icon-well !h-10 !w-10" aria-hidden>
        <MetricVisual kind={kind} size="sm" />
      </div>
      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-dim)]">{label}</p>
        <p className="mt-1 text-xl font-semibold">{value}</p>
      </div>
    </div>
  )
}
