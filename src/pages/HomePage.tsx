import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Play,
  Sparkles,
  Wrench,
  CalendarDays,
  Lock,
  Timer,
  Dumbbell,
  Wind,
  Flame,
  SlidersHorizontal,
  Shield,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { SafetyNotice } from '../components/SafetyNotice'
import { getComboStats, CURATED_COMBOS, COMBO_MAP } from '../data/combos'
import { getQuickStartPresets, type QuickStartId } from '../data/quickStart'
import { computeStatsPreview } from '../engines/statsEngine'
import { APP_VERSION } from '../data/defaults'
import type { MartialArt } from '../types'

const COMING_SOON = ['Kickboxing', 'MMA Striking', 'Karate', 'Taekwondo'] as const

const PRESET_ICONS: Record<string, typeof Play> = {
  'quick-train': Timer,
  'heavy-bag': Dumbbell,
  shadowboxing: Wind,
  conditioning: Flame,
  'daily-drill': CalendarDays,
  'quick-boxing': Timer,
  'boxing-bag': Dumbbell,
  'boxing-shadow': Wind,
  'boxing-defense': Shield,
  'boxing-conditioning': Flame,
  'boxing-daily': CalendarDays,
}

export function HomePage() {
  const navigate = useNavigate()
  const { preferences, updatePreferences, history, favorites } = useApp()
  const stats = getComboStats()
  const preview = computeStatsPreview(history)
  const recent = history[0]
  const favoriteCombo = favorites[0] ? COMBO_MAP[favorites[0]] : CURATED_COMBOS[5]
  const presets = getQuickStartPresets(preferences.martialArt)

  const setSport = (art: MartialArt) => {
    updatePreferences({ martialArt: art })
  }

  const startQuick = (id: QuickStartId) => {
    if (!preferences.onboardingComplete) {
      navigate('/onboarding', { state: { after: 'quick', quickId: id } })
      return
    }
    const preset = presets.find((p) => p.id === id) ?? getQuickStartPresets('muay-thai')[0]!
    if (preset.routeToDaily) {
      navigate('/daily')
      return
    }
    navigate('/session', { state: { config: preset.build(preferences) } })
  }

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--bg-panel)] px-6 py-10 sm:px-10 sm:py-14">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              'linear-gradient(135deg, transparent 40%, rgba(225,29,72,0.18) 100%), repeating-linear-gradient(-12deg, transparent, transparent 18px, rgba(255,255,255,0.02) 18px, rgba(255,255,255,0.02) 19px)',
          }}
          aria-hidden
        />
        <div className="relative max-w-2xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-text)]">
            v{APP_VERSION} · Muay Thai & Boxing
          </p>
          <h1 className="display text-6xl sm:text-7xl md:text-8xl">StrikeCaller</h1>
          <p className="mt-4 max-w-xl text-lg text-[var(--text-muted)] sm:text-xl">
            225+ realistic combinations across Muay Thai and Boxing.
          </p>
          <p className="mt-3 max-w-xl text-sm text-[var(--text-dim)]">
            Spoken combinations, adaptive pacing, timed rounds, and local training stats. Free. No account. No
            download.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                startQuick(preferences.martialArt === 'boxing' ? 'quick-boxing' : 'quick-train')
              }
            >
              <Play size={18} aria-hidden />
              {preferences.martialArt === 'boxing' ? 'Quick Boxing' : 'Quick Train'}
            </button>
            <Link to="/demo" className="btn">
              <Sparkles size={18} aria-hidden />
              Guided Demo
            </Link>
            <Link to="/train" className="btn btn-ghost">
              <SlidersHorizontal size={18} aria-hidden />
              Customize Workout
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Stats preview">
        <PreviewStat label="Sessions this week" value={String(preview.sessionsThisWeek)} />
        <PreviewStat label="Minutes trained" value={String(preview.minutesThisWeek)} />
        <PreviewStat label="Current streak" value={`${preview.currentStreak}d`} />
      </section>

      <section aria-labelledby="sports-heading">
        <h2 id="sports-heading" className="display text-4xl">
          Martial arts
        </h2>
        <p className="muted mt-1 text-sm">Select a sport to load matching Quick Starts.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <button
            type="button"
            className={`panel p-4 text-left ${preferences.martialArt === 'muay-thai' ? 'border-[var(--accent)]' : ''}`}
            aria-pressed={preferences.martialArt === 'muay-thai'}
            onClick={() => setSport('muay-thai')}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-text)]">Available</p>
            <h3 className="mt-2 text-2xl font-semibold">Muay Thai</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">125 curated combos</p>
            {preferences.martialArt === 'muay-thai' && (
              <p className="mt-2 text-xs font-semibold text-[var(--accent-text)]">Selected</p>
            )}
          </button>
          <button
            type="button"
            className={`panel p-4 text-left ${preferences.martialArt === 'boxing' ? 'border-[var(--accent)]' : ''}`}
            aria-pressed={preferences.martialArt === 'boxing'}
            onClick={() => setSport('boxing')}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-text)]">New in v1.1</p>
            <h3 className="mt-2 text-2xl font-semibold">Boxing</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">100+ curated combos</p>
            {preferences.martialArt === 'boxing' && (
              <p className="mt-2 text-xs font-semibold text-[var(--accent-text)]">Selected</p>
            )}
          </button>
          {COMING_SOON.map((name) => (
            <div key={name} className="panel flex items-start justify-between gap-3 p-4 opacity-70" aria-disabled="true">
              <div>
                <h3 className="text-xl font-semibold">{name}</h3>
                <p className="mt-1 text-sm text-[var(--text-dim)]">Coming soon</p>
              </div>
              <Lock size={16} className="mt-1 text-[var(--text-dim)]" aria-label="Coming soon" />
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-[var(--text-dim)]">
          {stats.total} built-in combinations · StrikeCaller tracks training activity, not technique quality or
          accuracy.
        </p>
      </section>

      <section aria-labelledby="quick-start-heading">
        <h2 id="quick-start-heading" className="display text-4xl">
          Quick Start
        </h2>
        <p className="muted text-sm">
          One press. Uses your saved sport, stance, experience, calls, and pace.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {presets.map((preset) => {
            const Icon = PRESET_ICONS[preset.id] ?? Play
            return (
              <button
                key={preset.id}
                type="button"
                className="panel block p-5 text-left transition hover:border-[var(--accent)]"
                onClick={() => startQuick(preset.id)}
              >
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)]">
                  <Icon size={20} aria-hidden />
                </div>
                <h3 className="text-xl font-semibold">{preset.title}</h3>
                <p className="mt-1 text-sm text-[var(--text-muted)]">{preset.body}</p>
              </button>
            )
          })}
          <Link to="/train" className="panel block p-5 transition hover:border-[var(--accent)]">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-[var(--text-muted)]">
              <SlidersHorizontal size={20} aria-hidden />
            </div>
            <h3 className="text-xl font-semibold">Customize Workout</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Full mode, rounds, pace, and technique filters.</p>
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Link to="/builder" className="panel block p-5 transition hover:border-[var(--accent)]">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)]">
            <Wrench size={18} aria-hidden />
          </div>
          <h3 className="text-lg font-semibold">Build Custom Combo</h3>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Up to eight validated techniques.</p>
        </Link>
        <Link to="/stats" className="panel block p-5 transition hover:border-[var(--accent)]">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)]">
            <Sparkles size={18} aria-hidden />
          </div>
          <h3 className="text-lg font-semibold">Training Stats</h3>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Local streaks, records, and milestones.</p>
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
                onClick={() =>
                  startQuick(preferences.martialArt === 'boxing' ? 'quick-boxing' : 'quick-train')
                }
              >
                Train again <ArrowRight size={14} aria-hidden />
              </button>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">No sessions yet. Tap Quick Train to begin.</p>
          )}
        </div>
        <div className="panel p-5">
          <h2 className="mb-2 text-xl font-semibold">Favorite combo</h2>
          {favoriteCombo ? (
            <p className="text-sm text-[var(--text)]">{favoriteCombo.title}</p>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">Star combos during training to pin them here.</p>
          )}
        </div>
      </section>

      <SafetyNotice compact />
    </div>
  )
}

function PreviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel px-4 py-3">
      <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-dim)]">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  )
}
