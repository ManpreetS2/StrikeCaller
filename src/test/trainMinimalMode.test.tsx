import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AppProvider } from '../context/AppContext'
import { appRoutes } from '../routes'
import { DEFAULT_PREFERENCES, DEFAULT_SPEECH } from '../data/defaults'
import { loadPreferences, savePreferences } from '../storage/localStore'
import * as primeAudio from '../utils/primeAudio'
import type { WorkoutConfig } from '../types'

function seedPrefs(preferMinimalMode: boolean) {
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
  })
}

function renderTrain() {
  const router = createMemoryRouter(appRoutes, { initialEntries: ['/train'] })
  const view = render(
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>,
  )
  return { ...view, router }
}

function openDisplaySettings() {
  fireEvent.click(screen.getByRole('button', { name: /display settings/i }))
  expect(screen.getByRole('checkbox', { name: /minimal mode/i })).toBeInTheDocument()
}

function setMinimalMode(checked: boolean) {
  openDisplaySettings()
  const box = screen.getByRole('checkbox', { name: /minimal mode/i })
  if ((box as HTMLInputElement).checked !== checked) {
    fireEvent.click(box)
  }
  expect(box).toHaveProperty('checked', checked)
}

describe('L2 Train Minimal Mode uses the current control', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.spyOn(primeAudio, 'primeTrainingAudio').mockResolvedValue({ ok: true, timedOut: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('saved true → explicit OFF → immediate Round workout is not minimal', async () => {
    seedPrefs(true)
    const { router } = renderTrain()
    expect(screen.queryByRole('checkbox', { name: /minimal mode/i })).not.toBeInTheDocument()
    setMinimalMode(false)
    fireEvent.click(screen.getByRole('button', { name: /start workout/i }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/session'))
    const state = router.state.location.state as { config: WorkoutConfig }
    expect(state.config.minimalMode).toBe(false)
    expect(state.config.showNextTechnique).toBe(true)
    await waitFor(() => expect(loadPreferences().preferMinimalMode).toBe(false))
  })

  it('saved false → explicit ON → immediate Round workout is minimal', async () => {
    seedPrefs(false)
    const { router } = renderTrain()
    setMinimalMode(true)
    fireEvent.click(screen.getByRole('button', { name: /start workout/i }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/session'))
    const state = router.state.location.state as { config: WorkoutConfig }
    expect(state.config.minimalMode).toBe(true)
    expect(state.config.showNextTechnique).toBe(false)
    await waitFor(() => expect(loadPreferences().preferMinimalMode).toBe(true))
  })

  it('saved true → explicit OFF → Coach session config is not minimal', async () => {
    seedPrefs(true)
    const { router } = renderTrain()
    fireEvent.click(screen.getByRole('radio', { name: /coach mode/i }))
    setMinimalMode(false)
    fireEvent.click(screen.getByRole('button', { name: /start workout/i }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/session'))
    const state = router.state.location.state as { config: WorkoutConfig }
    expect(state.config.mode).toBe('coach')
    expect(state.config.minimalMode).toBe(false)
    expect(state.config.showNextTechnique).toBe(true)
  })

  it('saved true → explicit OFF → Learn seed is not minimal', async () => {
    seedPrefs(true)
    const { router } = renderTrain()
    setMinimalMode(false)
    fireEvent.click(screen.getByRole('radio', { name: /learn mode/i }))
    fireEvent.click(screen.getByRole('button', { name: /open learn mode/i }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/learn'))
    const state = router.state.location.state as { workoutSeed: WorkoutConfig }
    expect(state.workoutSeed.mode).toBe('learn')
    expect(state.workoutSeed.minimalMode).toBe(false)
    expect(state.workoutSeed.showNextTechnique).toBe(true)
  })

  it('saved true → explicit OFF → Daily seed is not minimal', async () => {
    seedPrefs(true)
    const { router } = renderTrain()
    setMinimalMode(false)
    fireEvent.click(screen.getByRole('radio', { name: /daily drill/i }))
    fireEvent.click(screen.getByRole('button', { name: /open daily drill/i }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/daily'))
    const state = router.state.location.state as { workoutSeed: WorkoutConfig }
    expect(state.workoutSeed.mode).toBe('daily')
    expect(state.workoutSeed.minimalMode).toBe(false)
    expect(state.workoutSeed.showNextTechnique).toBe(true)
  })
})
