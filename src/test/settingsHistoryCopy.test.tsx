import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppProvider } from '../context/AppContext'
import { useApp } from '../context/useApp'
import { SettingsPage } from '../pages/SettingsPage'
import { DEFAULT_PREFERENCES } from '../data/defaults'
import { savePreferences } from '../storage/localStore'
import { saveSession } from '../storage/historyStore'
import * as historyStore from '../storage/historyStore'
import type { SessionSummary } from '../types'

function session(id: string): SessionSummary {
  return {
    id,
    martialArt: 'muay-thai',
    mode: 'coach',
    stance: 'orthodox',
    pace: 'technical',
    totalTrainingMs: 60_000,
    roundsCompleted: 1,
    combinationsCompleted: 4,
    techniquesCalled: 8,
    techniqueCounts: { jab: 4 },
    techniqueCategoryCounts: { punch: 8 },
    comboIds: ['beg-01'],
    defenseActions: 0,
    movementActions: 0,
    averagePaceLabel: 'technical',
    dailyDrillCompleted: false,
    cancelled: false,
    favoriteComboIds: [],
    usedCustomCombo: false,
    startedAt: 1_700_000_000_000,
    endedAt: 1_700_000_060_000,
  }
}

function SettingsHarness() {
  const { addHistory } = useApp()
  return (
    <>
      <button type="button" onClick={() => void addHistory(session('tab-only'))}>
        complete-workout
      </button>
      <SettingsPage />
    </>
  )
}

function renderSettings() {
  return render(
    <AppProvider>
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsHarness />
      </MemoryRouter>
    </AppProvider>,
  )
}

describe('Settings session count copy', () => {
  beforeEach(() => {
    localStorage.clear()
    savePreferences({
      ...DEFAULT_PREFERENCES,
      onboardingComplete: true,
      customComboMigrationNoticeShown: true,
      wakeLockNoticeDismissed: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses durable wording when history is healthy', async () => {
    await saveSession(session('existing-session'))
    renderSettings()
    await waitFor(() => {
      expect(screen.getByText('1 saved sessions on this device.')).toBeInTheDocument()
    })
  })

  it('uses tab-only wording after a history write failure', async () => {
    const user = userEvent.setup()
    vi.spyOn(historyStore, 'commitSessionWrite').mockResolvedValue({
      write: { ok: false, reason: 'write-failed', message: 'nope' },
      generation: 1,
    })
    renderSettings()
    await waitFor(() => {
      expect(screen.getByText('0 saved sessions on this device.')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'complete-workout' }))
    await waitFor(() => {
      expect(
        screen.getByText('1 sessions available in this tab. The latest may not be saved to browser storage.'),
      ).toBeInTheDocument()
    })
    expect(screen.queryByText(/saved sessions on this device/i)).not.toBeInTheDocument()
  })
})
