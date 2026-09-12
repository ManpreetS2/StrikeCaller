import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AppProvider } from '../context/AppContext'
import { appRoutes } from '../routes'
import { DEFAULT_PREFERENCES, DEFAULT_SPEECH, createDefaultWorkout } from '../data/defaults'
import { DEFAULT_TIMING_MULTIPLIERS } from '../engines/timingEngine'
import { getQuickStartPreset } from '../data/quickStart'
import { savePreferences } from '../storage/localStore'
import * as primeAudio from '../utils/primeAudio'
import type { UserPreferences, WorkoutConfig } from '../types'

const SAVED_TIMING = { ...DEFAULT_TIMING_MULTIPLIERS, punch: 1.8 }

function seedPrefs(extra: Partial<UserPreferences> = {}) {
  savePreferences({
    ...DEFAULT_PREFERENCES,
    onboardingComplete: true,
    customComboMigrationNoticeShown: true,
    wakeLockNoticeDismissed: true,
    timingMultipliers: SAVED_TIMING,
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

function seedCustomCombo() {
  localStorage.setItem(
    'strikecaller:custom-combos',
    JSON.stringify([
      {
        id: 'custom-timing',
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
}

describe('saved timing multipliers across workout entry points', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.spyOn(primeAudio, 'primeTrainingAudio').mockResolvedValue({ ok: true, timedOut: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('Train copies the saved punch multiplier into the session config', async () => {
    seedPrefs()
    const { router } = renderApp('/train')
    fireEvent.click(screen.getByRole('button', { name: /start workout/i }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/session'))
    expect(sessionConfig(router).timingMultipliers.punch).toBe(1.8)
  })

  it('Quick Start copies the saved punch multiplier', async () => {
    seedPrefs()
    const { router } = renderApp('/')
    fireEvent.click(screen.getByRole('button', { name: /start workout: quick train/i }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/session'))
    expect(sessionConfig(router).timingMultipliers.punch).toBe(1.8)
    expect(getQuickStartPreset('quick-train').build({ ...DEFAULT_PREFERENCES, timingMultipliers: SAVED_TIMING }).timingMultipliers.punch).toBe(1.8)
  })

  it('direct Daily uses the saved punch multiplier', async () => {
    seedPrefs()
    const { router } = renderApp('/daily')
    fireEvent.click(screen.getAllByRole('button', { name: /^slow practice/i })[0]!)
    await waitFor(() => expect(router.state.location.pathname).toBe('/session'))
    expect(sessionConfig(router).timingMultipliers.punch).toBe(1.8)
    expect(sessionConfig(router).pace).toBe('slow')
  })

  it('Train → Daily uses the seed punch multiplier instead of a later preference', async () => {
    seedPrefs()
    const seed = createDefaultWorkout({
      mode: 'daily',
      timingMultipliers: { ...DEFAULT_TIMING_MULTIPLIERS, punch: 0.7 },
    })
    const { router } = renderApp({ pathname: '/daily', state: { workoutSeed: seed } })
    fireEvent.click(screen.getAllByRole('button', { name: /^slow practice/i })[0]!)
    await waitFor(() => expect(router.state.location.pathname).toBe('/session'))
    expect(sessionConfig(router).timingMultipliers.punch).toBe(0.7)
    expect(sessionConfig(router).pace).toBe('slow')
  })

  it('direct Learn uses the saved punch multiplier', async () => {
    seedPrefs()
    const { router } = renderApp('/learn')
    fireEvent.click(screen.getByRole('button', { name: /practice with coach calls/i }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/session'))
    expect(sessionConfig(router).timingMultipliers.punch).toBe(1.8)
  })

  it('Train → Learn uses the seed punch multiplier instead of a later preference', async () => {
    seedPrefs()
    const seed = createDefaultWorkout({
      mode: 'learn',
      timingMultipliers: { ...DEFAULT_TIMING_MULTIPLIERS, punch: 0.7 },
    })
    const { router } = renderApp({ pathname: '/learn', state: { workoutSeed: seed } })
    fireEvent.click(screen.getByRole('button', { name: /practice with coach calls/i }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/session'))
    expect(sessionConfig(router).timingMultipliers.punch).toBe(0.7)
  })

  it('Builder Train Combo uses the saved punch multiplier', async () => {
    seedPrefs()
    seedCustomCombo()
    const { router } = renderApp('/builder')
    fireEvent.click(screen.getByRole('button', { name: /train combo/i }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/session'))
    expect(sessionConfig(router).timingMultipliers.punch).toBe(1.8)
  })
})

describe('Builder custom pace multiplier', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.spyOn(primeAudio, 'primeTrainingAudio').mockResolvedValue({ ok: true, timedOut: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    { customPaceMultiplier: 0.7, label: 'below 1' },
    { customPaceMultiplier: 1, label: 'default 1' },
    { customPaceMultiplier: 1.75, label: 'above 1' },
  ])('copies custom pace $label ($customPaceMultiplier)', async ({ customPaceMultiplier }) => {
    seedPrefs({ pace: 'custom', customPaceMultiplier })
    seedCustomCombo()
    const { router } = renderApp('/builder')
    fireEvent.click(screen.getByRole('button', { name: /train combo/i }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/session'))
    expect(sessionConfig(router).pace).toBe('custom')
    expect(sessionConfig(router).customPaceMultiplier).toBe(customPaceMultiplier)
  })
})
