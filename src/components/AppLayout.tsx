import { Link, NavLink } from 'react-router-dom'
import { Moon, Sun, Monitor, Settings, Home, Dumbbell, Shield, BarChart3 } from 'lucide-react'
import { useApp } from '../context/AppContext'
import type { ThemePreference } from '../types'
import type { ReactNode } from 'react'
import { APP_VERSION } from '../data/defaults'

const themes: { id: ThemePreference; label: string; icon: typeof Moon }[] = [
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'system', label: 'System', icon: Monitor },
]

export function AppLayout({ children }: { children: ReactNode }) {
  const { preferences, setTheme } = useApp()

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2" aria-label="StrikeCaller home">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent-text)]">
              <Dumbbell aria-hidden size={18} />
            </span>
            <span>
              <span className="display block text-2xl leading-none tracking-[0.08em]">StrikeCaller</span>
              <span className="hidden text-xs text-[var(--text-dim)] sm:block">
                Boxing & Muay Thai · v{APP_VERSION}
              </span>
            </span>
          </Link>

          <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
            <NavItem to="/" label="Home" icon={Home} />
            <NavItem to="/train" label="Train" icon={Dumbbell} />
            <NavItem to="/builder" label="Builder" icon={Shield} />
            <NavItem to="/stats" label="Stats" icon={BarChart3} />
            <NavItem to="/settings" label="Settings" icon={Settings} />
          </nav>

          <div
            className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] p-1"
            role="group"
            aria-label="Theme"
          >
            {themes.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={`btn !min-h-9 !rounded-full !px-2.5 !py-1.5 ${
                  preferences.theme === id ? 'chip-active !border-[var(--accent)]' : 'btn-ghost !border-transparent'
                }`}
                aria-pressed={preferences.theme === id}
                aria-label={`${label} theme`}
                onClick={() => setTheme(id)}
              >
                <Icon size={16} aria-hidden />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-4 py-6 pb-24 md:pb-10">
        {children}
      </main>

      <nav
        aria-label="Mobile"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] backdrop-blur-md md:hidden"
      >
        <div className="mx-auto grid max-w-6xl grid-cols-5 gap-1 px-2 py-2">
          <MobileNav to="/" label="Home" icon={Home} />
          <MobileNav to="/train" label="Train" icon={Dumbbell} />
          <MobileNav to="/builder" label="Builder" icon={Shield} />
          <MobileNav to="/stats" label="Stats" icon={BarChart3} />
          <MobileNav to="/settings" label="Settings" icon={Settings} />
        </div>
      </nav>
    </div>
  )
}

function NavItem({
  to,
  label,
  icon: Icon,
}: {
  to: string
  label: string
  icon: typeof Home
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `btn btn-ghost !rounded-full !px-3 ${isActive ? 'chip-active' : ''}`
      }
    >
      <Icon size={16} aria-hidden />
      {label}
    </NavLink>
  )
}

function MobileNav({
  to,
  label,
  icon: Icon,
}: {
  to: string
  label: string
  icon: typeof Home
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-xs ${
          isActive ? 'text-[var(--accent-text)]' : 'text-[var(--text-muted)]'
        }`
      }
    >
      <Icon size={18} aria-hidden />
      {label}
    </NavLink>
  )
}
