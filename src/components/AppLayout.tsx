import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Moon,
  Sun,
  Monitor,
  Settings,
  Home,
  Dumbbell,
  Shield,
  BarChart3,
  MoreHorizontal,
  AlertTriangle,
  X,
} from 'lucide-react'
import { useApp } from '../context/useApp'
import type { ThemePreference } from '../types'
import { APP_VERSION } from '../data/defaults'

const themes: { id: ThemePreference; label: string; icon: typeof Moon }[] = [
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'system', label: 'System', icon: Monitor },
]

const MORE_ROUTES = ['/more', '/daily', '/builder', '/settings', '/learn', '/demo', '/onboarding'] as const

function isMoreRoute(pathname: string): boolean {
  return MORE_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))
}

export function AppLayout() {
  const { preferences, setTheme, storageIssue, storageWarningVisible, dismissStorageIssue } = useApp()
  const location = useLocation()
  const sessionActive = location.pathname === '/session'
  const moreActive = isMoreRoute(location.pathname)

  return (
    <div className={`app-shell ${sessionActive ? 'session-active' : ''}`}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="app-header sticky top-0 z-40 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
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

          <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
            <NavItem to="/" label="Home" icon={Home} end />
            <NavItem to="/train" label="Train" icon={Dumbbell} />
            <NavItem to="/stats" label="Progress" icon={BarChart3} />
            <NavItem to="/builder" label="Builder" icon={Shield} />
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

      <main id="main" className="app-main mx-auto max-w-6xl px-4 py-6 pb-24 md:pb-10">
        {!sessionActive && storageWarningVisible && storageIssue ? (
          <div
            role="alert"
            className="storage-warning mb-4 flex max-w-full items-start gap-3 rounded-lg border border-[color-mix(in_srgb,var(--warning)_55%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_12%,var(--bg-elevated))] p-3 text-sm text-[var(--text)]"
          >
            <AlertTriangle className="mt-0.5 shrink-0 text-[var(--warning)]" size={18} aria-hidden />
            <div className="min-w-0 flex-1 space-y-1 overflow-hidden">
              <p className="break-words [overflow-wrap:anywhere]">{storageIssue.message}</p>
              <p className="text-[var(--text-muted)]">
                <Link to="/settings" className="underline underline-offset-2">
                  Open Settings
                </Link>{' '}
                to export a backup before reloading or closing this tab.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost !min-h-9 shrink-0 !px-2 !py-1"
              onClick={dismissStorageIssue}
              aria-label="Dismiss storage warning"
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        ) : null}
        <Outlet />
      </main>

      <nav
        aria-label="Mobile"
        className="mobile-nav fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] backdrop-blur-md lg:hidden"
      >
        <div className="mx-auto grid max-w-6xl grid-cols-4 gap-1 px-2 py-2">
          <MobileNav to="/" label="Home" icon={Home} end />
          <MobileNav to="/train" label="Train" icon={Dumbbell} />
          <MobileNav to="/stats" label="Progress" icon={BarChart3} />
          <Link
            to="/more"
            aria-current={moreActive ? 'page' : undefined}
            className={`mobile-nav-link flex flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs ${
              moreActive ? '' : 'text-[var(--text-muted)]'
            }`}
          >
            <MoreHorizontal size={18} aria-hidden />
            More
          </Link>
        </div>
      </nav>
    </div>
  )
}

function NavItem({
  to,
  label,
  icon: Icon,
  end,
}: {
  to: string
  label: string
  icon: typeof Home
  end?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `btn btn-ghost !rounded-full !px-3 ${isActive ? 'nav-active' : ''}`}
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
  end,
}: {
  to: string
  label: string
  icon: typeof Home
  end?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `mobile-nav-link flex flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs ${
          isActive ? '' : 'text-[var(--text-muted)]'
        }`
      }
    >
      <Icon size={18} aria-hidden />
      {label}
    </NavLink>
  )
}
