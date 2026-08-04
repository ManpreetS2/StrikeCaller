import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AppProvider } from '../context/AppContext'
import { appRoutes } from '../routes'
import { DEFAULT_PREFERENCES, DEFAULT_SPEECH, createDefaultWorkout, APP_VERSION, APP_RELEASE_TITLE } from '../data/defaults'
import { resolvePagesBase } from '../../scripts/pages-base.mjs'
import indexHtml from '../../index.html?raw'
import manifestRaw from '../../public/manifest.webmanifest?raw'

function seedCompletedOnboarding() {
  localStorage.setItem(
    'strikecaller:preferences',
    JSON.stringify({
      ...DEFAULT_PREFERENCES,
      onboardingComplete: true,
      wakeLock: false,
      wakeLockNoticeDismissed: true,
      customComboMigrationNoticeShown: true,
      speech: {
        ...DEFAULT_SPEECH,
        volume: 0,
        spokenCallsEnabled: false,
        countdownEnabled: false,
        roundCallsEnabled: false,
        coachingCuesEnabled: false,
      },
      sound: { bellsEnabled: false, tonesEnabled: false, vibrationEnabled: false, masterVolume: 0 },
    }),
  )
}

describe('v1.2.2 GitHub Pages availability hotfix', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('reports APP_VERSION 1.2.2 and the hotfix release title', () => {
    expect(APP_VERSION).toBe('1.2.2')
    expect(APP_RELEASE_TITLE).toContain('v1.2.2')
    expect(APP_RELEASE_TITLE).toMatch(/GitHub Pages Availability Hotfix/i)
  })

  it('index.html document title contains the v1.2.2 release', () => {
    expect(indexHtml).toMatch(/<title>[^<]*StrikeCaller v1\.2\.2[^<]*<\/title>/)
  })

  it('manifest start_url and scope resolve under the project base, not the domain root', () => {
    const manifest = JSON.parse(manifestRaw) as {
      start_url: string
      scope: string
      icons: { src: string }[]
    }

    // Relative (no leading slash, no origin) keeps the PWA within the project path.
    expect(manifest.start_url.startsWith('/')).toBe(false)
    expect(manifest.start_url).not.toMatch(/^https?:/)
    expect(manifest.scope.startsWith('/')).toBe(false)
    expect(manifest.scope).not.toMatch(/^https?:/)

    // start_url opens the app's root hash route under the project base.
    const base = 'https://manpreets2.github.io/StrikeCaller/'
    const resolvedStart = new URL(manifest.start_url, base + 'manifest.webmanifest')
    expect(resolvedStart.href).toBe('https://manpreets2.github.io/StrikeCaller/#/')

    const resolvedScope = new URL(manifest.scope, base + 'manifest.webmanifest')
    expect(resolvedScope.href).toBe('https://manpreets2.github.io/StrikeCaller/')

    for (const icon of manifest.icons) {
      expect(icon.src.startsWith('/')).toBe(false)
      expect(icon.src).not.toMatch(/^https?:/)
    }
  })

  it('resolves the canonical case-sensitive Pages base for this repository', () => {
    expect(
      resolvePagesBase({
        isPagesBuild: true,
        pagesBaseUrl: 'https://manpreets2.github.io/StrikeCaller/',
      }),
    ).toBe('/StrikeCaller/')
  })

  it('hash-router application boots at the home route under the computed base', async () => {
    seedCompletedOnboarding()
    const router = createMemoryRouter(appRoutes, { initialEntries: ['/'] })
    render(
      <AppProvider>
        <RouterProvider router={router} />
      </AppProvider>,
    )
    expect(await screen.findByRole('heading', { name: /^strikecaller$/i })).toBeInTheDocument()
  })

  it('session entry still mounts controls (Session regression)', async () => {
    seedCompletedOnboarding()
    const router = createMemoryRouter(appRoutes, {
      initialEntries: [
        {
          pathname: '/session',
          state: {
            audioPrimed: true,
            config: createDefaultWorkout({
              mode: 'coach',
              sessionDurationSec: 40,
              speech: {
                ...DEFAULT_SPEECH,
                volume: 0,
                spokenCallsEnabled: false,
                countdownEnabled: false,
                roundCallsEnabled: false,
                coachingCuesEnabled: false,
              },
              sound: { bellsEnabled: false, tonesEnabled: false, vibrationEnabled: false, masterVolume: 0 },
            }),
          },
        },
      ],
    })
    render(
      <AppProvider>
        <RouterProvider router={router} />
      </AppProvider>,
    )
    await waitFor(
      () => {
        expect(screen.getByRole('toolbar', { name: /session controls/i })).toBeInTheDocument()
      },
      { timeout: 8000 },
    )
  }, 15000)
})
