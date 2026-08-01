import { Link } from 'react-router-dom'
import { ArrowRight, Play, Sparkles, Wrench, CalendarDays, Lock } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { SafetyNotice } from '../components/SafetyNotice'
import { getComboStats, CURATED_COMBOS, COMBO_MAP } from '../data/combos'

const COMING_SOON = [
  'Boxing',
  'Kickboxing',
  'MMA striking',
  'Karate',
  'Taekwondo',
] as const

export function HomePage() {
  const { preferences, history, favorites } = useApp()
  const stats = getComboStats()
  const recent = history[0]
  const favoriteCombo = favorites[0] ? COMBO_MAP[favorites[0]] : CURATED_COMBOS[5]

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
            Muay Thai available now
          </p>
          <h1 className="display text-6xl sm:text-7xl md:text-8xl">StrikeCaller</h1>
          <p className="mt-4 max-w-xl text-lg text-[var(--text-muted)] sm:text-xl">
            Hear the combo. Set the pace. Build the reaction.
          </p>
          <p className="mt-3 max-w-xl text-sm text-[var(--text-dim)]">
            A browser-based Muay Thai coach that speaks realistic combinations with adaptive timing for
            shadowboxing, bag work, pads, and solo drills.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to={preferences.onboardingComplete ? '/train' : '/onboarding'} className="btn btn-primary">
              <Play size={18} aria-hidden />
              Start Training
            </Link>
            <Link to="/demo" className="btn">
              <Sparkles size={18} aria-hidden />
              Guided Demo
            </Link>
            <Link to="/daily" className="btn btn-ghost">
              <CalendarDays size={18} aria-hidden />
              Daily Drill
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="actions-heading" className="grid gap-4 md:grid-cols-3">
        <h2 id="actions-heading" className="sr-only">
          Quick actions
        </h2>
        <ActionCard
          to="/train"
          title="Start Training"
          body="Choose Learn, Coach, Round, or Reaction mode with your stance and pace."
          icon={<Play size={18} aria-hidden />}
        />
        <ActionCard
          to="/daily"
          title="Daily Drill"
          body="One focused combination: slow, normal, then fight-pace attempt."
          icon={<CalendarDays size={18} aria-hidden />}
        />
        <ActionCard
          to="/builder"
          title="Build Custom Combo"
          body="Tap techniques into a validated sequence and save it locally."
          icon={<Wrench size={18} aria-hidden />}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <h2 className="mb-2 text-xl font-semibold">Recent workout</h2>
          {recent ? (
            <div className="space-y-1 text-sm text-[var(--text-muted)]">
              <p>
                <span className="capitalize text-[var(--text)]">{recent.mode}</span> · {recent.stance} ·{' '}
                {Math.round(recent.totalTrainingMs / 1000)}s work
              </p>
              <p>
                {recent.combinationsCompleted} combos · {recent.techniquesCalled} techniques called
              </p>
              <Link to="/train" className="inline-flex items-center gap-1 text-[var(--accent-text)]">
                Train again <ArrowRight size={14} aria-hidden />
              </Link>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">No sessions yet. Start with a short technical round.</p>
          )}
        </div>
        <div className="panel p-5">
          <h2 className="mb-2 text-xl font-semibold">Favorite combo</h2>
          {favoriteCombo ? (
            <div className="space-y-1 text-sm text-[var(--text-muted)]">
              <p className="text-[var(--text)]">{favoriteCombo.title}</p>
              <p>{favoriteCombo.techniques.map((t) => t.techniqueId.replace(/-/g, ' ')).join(' → ')}</p>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">Star combos during training to pin them here.</p>
          )}
        </div>
      </section>

      <section aria-labelledby="arts-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="arts-heading" className="display text-4xl">
              Martial arts
            </h2>
            <p className="muted text-sm">Muay Thai is live. More martial arts coming soon.</p>
          </div>
          <span className="chip">{stats.total} curated combos</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="panel border-[var(--accent)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-text)]">Available now</p>
            <h3 className="mt-2 text-2xl font-semibold">Muay Thai</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Punches, kicks, teeps, knees, elbows, defense, counters, movement, and clinch options.
            </p>
          </div>
          {COMING_SOON.map((name) => (
            <div
              key={name}
              className="panel flex items-start justify-between gap-3 p-4 opacity-70"
              aria-disabled="true"
            >
              <div>
                <h3 className="text-xl font-semibold">{name}</h3>
                <p className="mt-1 text-sm text-[var(--text-dim)]">Coming soon</p>
              </div>
              <Lock size={16} className="mt-1 text-[var(--text-dim)]" aria-label="Coming soon" />
            </div>
          ))}
        </div>
      </section>

      <SafetyNotice compact />
    </div>
  )
}

function ActionCard({
  to,
  title,
  body,
  icon,
}: {
  to: string
  title: string
  body: string
  icon: React.ReactNode
}) {
  return (
    <Link to={to} className="panel block p-5 transition hover:border-[var(--accent)]">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)]">
        {icon}
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{body}</p>
    </Link>
  )
}
