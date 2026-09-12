import { Link } from 'react-router-dom'
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Lock,
  Settings,
  Shield,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react'
import { SportVisual } from '../components/visual'

const COMING_SOON = ['Kickboxing', 'MMA Striking', 'Karate', 'Taekwondo'] as const

const TOOLS = [
  { to: '/daily', title: 'Daily', body: 'One focused combo, slow to fight pace.', icon: CalendarDays },
  { to: '/builder', title: 'Builder', body: 'Create a custom combination.', icon: Shield },
  { to: '/stats', title: 'Stats', body: 'Sessions, minutes, streaks, and records.', icon: BarChart3 },
  { to: '/train', title: 'Customize Workout', body: 'Full mode, rounds, pace, and filters.', icon: SlidersHorizontal },
  { to: '/learn', title: 'Learn', body: 'Study one combination at a time.', icon: BookOpen },
  { to: '/demo', title: 'Guided Demo', body: 'Hear StrikeCaller call a short workout.', icon: Sparkles },
  { to: '/settings', title: 'Settings', body: 'Theme, speech, storage, and privacy.', icon: Settings },
] as const

export function MorePage() {
  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-2-text)]">Tools</p>
        <h1 className="display mt-1 text-5xl">More</h1>
        <p className="mt-2 max-w-xl text-[var(--text-muted)]">
          Daily, Builder, Stats, and Settings stay here so training stays one tap away.
        </p>
      </header>

      <section aria-label="App tools" className="grid gap-3 sm:grid-cols-2">
        {TOOLS.map(({ to, title, body, icon: Icon }) => (
          <Link key={to} to={to} aria-label={title} className="interactive-card panel block p-4 no-underline">
            <div className="flex items-start gap-3">
              <span className="icon-well !h-11 !w-11 text-[var(--accent-2-text)]" aria-hidden>
                <Icon size={18} />
              </span>
              <span>
                <h2 className="text-lg font-semibold text-[var(--text)]">{title}</h2>
                <p className="mt-1 text-sm text-[var(--text-muted)]">{body}</p>
              </span>
            </div>
          </Link>
        ))}
      </section>

      <section aria-label="Coming soon">
        <h2 className="mb-3 text-2xl font-semibold">Coming soon</h2>
        <div className="coming-soon-grid grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
      </section>
    </div>
  )
}
