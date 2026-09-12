import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AppProvider } from '../context/AppContext'
import { HomePage } from '../pages/HomePage'
import { appRoutes } from '../routes'
import { DEFAULT_PREFERENCES, DEFAULT_SPEECH } from '../data/defaults'
import indexHtml from '../../index.html?raw'
import viteConfig from '../../vite.config.ts?raw'
import mainTsx from '../main.tsx?raw'
import { serviceWorkerRegistrationUrls } from '../registerPwa'

function seedHome() {
  localStorage.setItem(
    'strikecaller:preferences',
    JSON.stringify({
      ...DEFAULT_PREFERENCES,
      onboardingComplete: true,
      martialArt: 'boxing',
      speech: { ...DEFAULT_SPEECH, spokenCallsEnabled: false, volume: 0 },
      sound: { bellsEnabled: false, tonesEnabled: false, vibrationEnabled: false, masterVolume: 0 },
    }),
  )
}

describe('v1.4 home hierarchy and product integrity', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  it('keeps Start workout as the primary home action above For you, Progress, and Tools', () => {
    seedHome()
    render(
      <MemoryRouter>
        <AppProvider>
          <HomePage />
        </AppProvider>
      </MemoryRouter>,
    )

    const start = screen.getByRole('button', { name: /start workout:/i })
    const forYou = screen.getByRole('heading', { name: 'For you' })
    const progress = screen.getByRole('heading', { name: 'Progress' })
    const tools = screen.getByRole('heading', { name: 'Tools' })

    expect(start.compareDocumentPosition(forYou) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(forYou.compareDocumentPosition(progress) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(progress.compareDocumentPosition(tools) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Customize Workout' })).toBeInTheDocument()
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/loading sessions/i)).not.toBeInTheDocument()
  })

  it('does not display fabricated sensor metrics on Home or Stats', () => {
    seedHome()
    const router = createMemoryRouter(appRoutes, { initialEntries: ['/'] })
    render(
      <AppProvider>
        <RouterProvider router={router} />
      </AppProvider>,
    )
    const main = screen.getByRole('main')
    expect(within(main).queryByText(/calories/i)).not.toBeInTheDocument()
    expect(within(main).queryByText(/punch speed/i)).not.toBeInTheDocument()
    expect(within(main).queryByText(/strike accuracy/i)).not.toBeInTheDocument()
    expect(within(main).queryByText(/punch power/i)).not.toBeInTheDocument()
    expect(screen.getByText(/sessions this week/i)).toBeInTheDocument()
    expect(screen.getByText(/minutes trained/i)).toBeInTheDocument()
    expect(screen.getByText(/current streak/i)).toBeInTheDocument()
  })

  it('marks mobile More as the current page on tool routes', () => {
    seedHome()
    const router = createMemoryRouter(appRoutes, { initialEntries: ['/daily'] })
    render(
      <AppProvider>
        <RouterProvider router={router} />
      </AppProvider>,
    )
    const mobile = screen.getByRole('navigation', { name: 'Mobile' })
    expect(within(mobile).getByRole('link', { name: 'More' })).toHaveAttribute('aria-current', 'page')
    expect(within(mobile).getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
  })
})

describe('v1.4 PWA registration contract', () => {
  it('registers sw.js under the Vite base, including GitHub Pages scope', () => {
    expect(serviceWorkerRegistrationUrls('/')).toEqual({ scriptUrl: '/sw.js', scope: '/' })
    expect(serviceWorkerRegistrationUrls('/StrikeCaller/')).toEqual({
      scriptUrl: '/StrikeCaller/sw.js',
      scope: '/StrikeCaller/',
    })
  })

  it('keeps the Workbox lifecycle conservative in Vite config', () => {
    expect(viteConfig).toMatch(/injectRegister:\s*false/)
    expect(viteConfig).toMatch(/skipWaiting:\s*false/)
    expect(viteConfig).toMatch(/clientsClaim:\s*false/)
    expect(viteConfig).toMatch(/filename:\s*'sw.js'/)
    expect(viteConfig).toMatch(/navigateFallback:\s*'index.html'/)
  })

  it('loads fonts from bundled Fontsource CSS instead of Google Fonts', () => {
    expect(indexHtml).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/)
    expect(mainTsx).toMatch(/@fontsource\/bebas-neue/)
    expect(mainTsx).toMatch(/@fontsource\/ibm-plex-sans\/latin-400/)
    expect(mainTsx).toMatch(/@fontsource\/ibm-plex-mono\/latin-500/)
    expect(mainTsx).toMatch(/registerPwa/)
  })
})
