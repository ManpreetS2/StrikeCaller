import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AppProvider } from '../context/AppContext'
import { appRoutes } from '../routes'
import { DEFAULT_PREFERENCES, DEFAULT_SPEECH } from '../data/defaults'
import { getQuickStartPreset } from '../data/quickStart'
import { savePreferences, loadPreferences } from '../storage/localStore'
import * as primeAudio from '../utils/primeAudio'
import type { UserPreferences, WorkoutConfig } from '../types'

function seedPrefs(preferMinimalMode: boolean, extra: Partial<UserPreferences> = {}) {
  savePreferences({
    ...DEFAULT_PREFERENCES,
    onboardingComplete: true,
    preferMinimalMode,
    customComboMigrationNoticeShown: true,
    wakeLockNoticeDismissed: true,
    speech: {
      ...DEFAULT_SPEECH,
      volume: 0,
      spokenCallsEnabled: false,
      captionsEnabled: true,
    },
    sound: { bellsEnabled: false, tonesEnabled: false, vibrationEnabled: false, masterVolume: 0 },
    ...extra,
  })
}

function renderApp(initialEntry: string | { pathname: string; state?: unknown } = '/') {
  const router = createMemoryRouter(appRoutes, {
    initialEntries: [typeof initialEntry === 'string' ? initialEntry : initialEntry],
  })
  const view = render(
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>,
  )
  return { ...view, router }
}

function sessionConfig(router: ReturnType<typeof createMemoryRouter>): WorkoutConfig {
  return (router.state.location.state as { config: WorkoutConfig }).config
}

function setTrainMinimalMode(checked: boolean) {
  fireEvent.click(screen.getByRole('button', { name: /display settings/i }))
  const box = screen.getByRole('checkbox', { name: /minimal mode/i })
  if ((box as HTMLInputElement).checked !== checked) {
    fireEvent.click(box)
  }
  expect(box).toHaveProperty('checked', checked)
}

describe('workout display preference propagation', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.spyOn(primeAudio, 'primeTrainingAudio').mockResolvedValue({ ok: true, timedOut: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('Home Daily saved OFF → Slow phase config is not minimal', async () => {
    seedPrefs(false)
    const { router } = renderApp('/')
    fireEvent.click(screen.getByRole('button', { name: /daily drill/i }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/daily'))
    expect(router.state.location.state).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: /^slow practice/i })[0]!)
    await waitFor(() => expect(router.state.location.pathname).toBe('/session'))
    expect(sessionConfig(router).minimalMode).toBe(false)
    expect(sessionConfig(router).showNextTechnique).toBe(true)
  })

  it('Home Daily saved ON → Slow phase config is minimal', async () => {
    seedPrefs(true)
    const { router } = renderApp('/')
    fireEvent.click(screen.getByRole('button', { name: /daily drill/i }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/daily'))
    expect(router.state.location.state).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: /^slow practice/i })[0]!)
    await waitFor(() => expect(router.state.location.pathname).toBe('/session'))
    expect(sessionConfig(router).minimalMode).toBe(true)
    expect(sessionConfig(router).showNextTechnique).toBe(false)
  })

  it('Train saved true → explicit OFF → Daily seed false → phase session false', async () => {
    seedPrefs(true)
    const { router } = renderApp('/train')
    setTrainMinimalMode(false)
    fireEvent.click(screen.getByRole('radio', { name: /daily drill/i }))
    fireEvent.click(screen.getByRole('button', { name: /open daily drill/i }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/daily'))
    const seed = (router.state.location.state as { workoutSeed: WorkoutConfig }).workoutSeed
    expect(seed.minimalMode).toBe(false)
    expect(seed.showNextTechnique).toBe(true)
    expect(loadPreferences().preferMinimalMode).toBe(false)
    fireEvent.click(screen.getAllByRole('button', { name: /^slow practice/i })[0]!)
    await waitFor(() => expect(router.state.location.pathname).toBe('/session'))
    expect(sessionConfig(router).minimalMode).toBe(false)
    expect(sessionConfig(router).showNextTechnique).toBe(true)
  })

  it('direct /daily saved ON → Slow phase config is minimal', async () => {
    seedPrefs(true)
    const { router } = renderApp('/daily')
    fireEvent.click(screen.getAllByRole('button', { name: /^slow practice/i })[0]!)
    await waitFor(() => expect(router.state.location.pathname).toBe('/session'))
    expect(sessionConfig(router).minimalMode).toBe(true)
    expect(sessionConfig(router).showNextTechnique).toBe(false)
  })

  it('Train saved true → explicit OFF → Learn practice is not minimal', async () => {
    seedPrefs(true)
    const { router } = renderApp('/train')
    setTrainMinimalMode(false)
    fireEvent.click(screen.getByRole('radio', { name: /learn mode/i }))
    fireEvent.click(screen.getByRole('button', { name: /open learn mode/i }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/learn'))
    const seed = (router.state.location.state as { workoutSeed: WorkoutConfig }).workoutSeed
    expect(seed.minimalMode).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: /practice with coach calls/i }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/session'))
    expect(sessionConfig(router).mode).toBe('learn')
    expect(sessionConfig(router).minimalMode).toBe(false)
    expect(sessionConfig(router).showNextTechnique).toBe(true)
  })

  it('direct /learn saved ON → practice config is minimal', async () => {
    seedPrefs(true)
    const { router } = renderApp('/learn')
    fireEvent.click(screen.getByRole('button', { name: /practice with coach calls/i }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/session'))
    expect(sessionConfig(router).mode).toBe('learn')
    expect(sessionConfig(router).minimalMode).toBe(true)
    expect(sessionConfig(router).showNextTechnique).toBe(false)
  })

  it('Home Quick Train saved ON → session is minimal', async () => {
    seedPrefs(true)
    const { router } = renderApp('/')
    fireEvent.click(screen.getByRole('button', { name: /start workout/i }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/session'))
    expect(sessionConfig(router).minimalMode).toBe(true)
    expect(sessionConfig(router).showNextTechnique).toBe(false)
  })

  it('Home Quick Train saved OFF → session is not minimal', async () => {
    seedPrefs(false)
    const { router } = renderApp('/')
    fireEvent.click(screen.getByRole('button', { name: /start workout/i }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/session'))
    expect(sessionConfig(router).minimalMode).toBe(false)
    expect(sessionConfig(router).showNextTechnique).toBe(true)
  })

  it('Builder Train Combo saved ON → custom session is minimal', async () => {
    seedPrefs(true)
    localStorage.setItem(
      'strikecaller:custom-combos',
      JSON.stringify([
        {
          id: 'custom-display-prefs',
          title: 'Jab cross',
          techniqueIds: ['jab', 'cross'],
          createdAt: 1,
          updatedAt: 1,
          favorite: false,
          repeatCount: 1,
          martialArt: 'muay-thai',
        },
      ]),
    )
    const { router } = renderApp('/builder')
    fireEvent.click(screen.getByRole('button', { name: /train combo/i }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/session'))
    expect(sessionConfig(router).mode).toBe('custom')
    expect(sessionConfig(router).minimalMode).toBe(true)
    expect(sessionConfig(router).showNextTechnique).toBe(false)
  })

  it('Guided Demo saved ON → session is minimal', async () => {
    seedPrefs(true)
    const { router } = renderApp('/demo')
    fireEvent.click(screen.getByRole('button', { name: /start guided demo/i }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/session'))
    expect(sessionConfig(router).mode).toBe('demo')
    expect(sessionConfig(router).minimalMode).toBe(true)
    expect(sessionConfig(router).showNextTechnique).toBe(false)
  })

  it('Train saved true → explicit OFF → Round workout stays false', async () => {
    seedPrefs(true)
    const { router } = renderApp('/train')
    setTrainMinimalMode(false)
    fireEvent.click(screen.getByRole('button', { name: /start workout/i }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/session'))
    expect(sessionConfig(router).minimalMode).toBe(false)
    expect(sessionConfig(router).showNextTechnique).toBe(true)
  })

  it('Quick Start presets inherit saved Minimal Mode without a Train seed', () => {
    const on = getQuickStartPreset('quick-train').build({
      ...DEFAULT_PREFERENCES,
      preferMinimalMode: true,
    })
    expect(on.minimalMode).toBe(true)
    expect(on.showNextTechnique).toBe(false)
    const off = getQuickStartPreset('quick-train').build({
      ...DEFAULT_PREFERENCES,
      preferMinimalMode: false,
    })
    expect(off.minimalMode).toBe(false)
    expect(off.showNextTechnique).toBe(true)
    const daily = getQuickStartPreset('daily-drill').build({
      ...DEFAULT_PREFERENCES,
      preferMinimalMode: true,
    })
    expect(daily.minimalMode).toBe(true)
    expect(daily.showNextTechnique).toBe(false)
  })
})
