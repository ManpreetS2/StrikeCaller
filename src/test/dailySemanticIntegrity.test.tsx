import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AppProvider } from '../context/AppContext'
import { appRoutes } from '../routes'
import { DEFAULT_PREFERENCES, DEFAULT_SPEECH } from '../data/defaults'
import { getCombo } from '../data/combos'
import { importUserData } from '../storage/userData'
import { loadDailyDrillMap, loadPreferences, savePreferences, STORAGE_KEYS } from '../storage/localStore'
import {
  migrateDailyDrillMap,
  parseDailyDrillKey,
  pickDailyComboId,
  resolveDailyDrillCombo,
} from '../utils/dailyDrill'
import * as primeAudio from '../utils/primeAudio'
import type { DailyDrillState, MartialArt, WorkoutConfig } from '../types'

function seedCompletedOnboarding(martialArt: MartialArt = 'muay-thai') {
  localStorage.setItem(
    STORAGE_KEYS.preferences,
    JSON.stringify({
      ...DEFAULT_PREFERENCES,
      martialArt,
      onboardingComplete: true,
      wakeLock: false,
      preferMinimalMode: false,
      wakeLockNoticeDismissed: true,
      speech: {
        ...DEFAULT_SPEECH,
        volume: 0,
        countdownEnabled: false,
        roundCallsEnabled: false,
        coachingCuesEnabled: false,
        spokenCallsEnabled: false,
        captionsEnabled: true,
      },
      sound: {
        bellsEnabled: false,
        tonesEnabled: false,
        vibrationEnabled: false,
        masterVolume: 0,
      },
      customComboMigrationNoticeShown: true,
    }),
  )
}

function drill(
  civil: string,
  art: MartialArt,
  comboId: string,
  extra: Partial<DailyDrillState> = {},
): DailyDrillState {
  return {
    dateKey: `${civil}:${art}`,
    comboId,
    martialArt: art,
    slowDone: false,
    normalDone: false,
    fightDone: false,
    completed: false,
    ...extra,
  }
}

function renderApp(initialEntry: string) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [initialEntry] })
  const view = render(
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>,
  )
  return { ...view, router }
}

describe('strict Daily import semantics', () => {
  beforeEach(() => {
    localStorage.clear()
    savePreferences({ ...DEFAULT_PREFERENCES, stance: 'southpaw' })
  })

  it('rejects a Boxing combo inside a Muay Thai Daily record and writes nothing', async () => {
    const result = await importUserData(
      JSON.stringify({
        version: 3,
        preferences: { ...DEFAULT_PREFERENCES, stance: 'orthodox' },
        dailyDrills: {
          '2026-09-08:muay-thai': {
            dateKey: '2026-09-08:muay-thai',
            comboId: 'bx-b01',
            martialArt: 'muay-thai',
            slowDone: false,
            normalDone: false,
            fightDone: false,
            completed: false,
          },
        },
      }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message.toLowerCase()).toMatch(/daily|combo|martial/)
    expect(loadPreferences().stance).toBe('southpaw')
    expect(loadDailyDrillMap()).toEqual({})
  })

  it('rejects a Muay Thai combo inside a Boxing Daily record', async () => {
    const result = await importUserData(
      JSON.stringify({
        version: 3,
        dailyDrills: {
          '2026-09-08:boxing': {
            dateKey: '2026-09-08:boxing',
            comboId: 'beg-01',
            martialArt: 'boxing',
            slowDone: false,
            normalDone: false,
            fightDone: false,
            completed: false,
          },
        },
      }),
    )
    expect(result.ok).toBe(false)
    expect(loadDailyDrillMap()).toEqual({})
  })

  it('rejects an explicit dateKey / martialArt mismatch', async () => {
    const result = await importUserData(
      JSON.stringify({
        version: 3,
        dailyDrills: {
          '2026-09-08:boxing': {
            dateKey: '2026-09-08:boxing',
            comboId: 'beg-01',
            martialArt: 'muay-thai',
            slowDone: false,
            normalDone: false,
            fightDone: false,
            completed: false,
          },
        },
      }),
    )
    expect(result.ok).toBe(false)
    expect(loadDailyDrillMap()).toEqual({})
  })

  it('rejects an unknown Daily combo ID', async () => {
    const result = await importUserData(
      JSON.stringify({
        version: 3,
        dailyDrills: {
          '2026-09-08:muay-thai': {
            dateKey: '2026-09-08:muay-thai',
            comboId: 'definitely-not-a-combo',
            martialArt: 'muay-thai',
            slowDone: false,
            normalDone: false,
            fightDone: false,
            completed: false,
          },
        },
      }),
    )
    expect(result.ok).toBe(false)
    expect(loadDailyDrillMap()).toEqual({})
  })

  it('rejects outer map keys that disagree with the embedded dateKey', async () => {
    const result = await importUserData(
      JSON.stringify({
        version: 3,
        dailyDrills: {
          '2026-09-01:muay-thai': {
            dateKey: '2026-09-08:muay-thai',
            comboId: 'beg-01',
            martialArt: 'muay-thai',
            slowDone: true,
            normalDone: false,
            fightDone: false,
            completed: false,
          },
        },
      }),
    )
    expect(result.ok).toBe(false)
    expect(loadDailyDrillMap()).toEqual({})
  })

  it('rejects two Daily entries that canonicalize onto the same key', async () => {
    const result = await importUserData(
      JSON.stringify({
        version: 3,
        dailyDrills: {
          '2026-09-08:muay-thai': drill('2026-09-08', 'muay-thai', 'beg-01', { slowDone: true }),
          also: drill('2026-09-08', 'muay-thai', 'beg-02'),
        },
      }),
    )
    expect(result.ok).toBe(false)
    expect(loadDailyDrillMap()).toEqual({})
  })

  it('still imports a valid Daily backup, including missing optional martialArt', async () => {
    const result = await importUserData(
      JSON.stringify({
        version: 3,
        dailyDrills: {
          '2026-09-08:muay-thai': {
            dateKey: '2026-09-08:muay-thai',
            comboId: 'beg-01',
            slowDone: true,
            normalDone: false,
            fightDone: false,
            completed: false,
          },
        },
      }),
    )
    expect(result).toEqual({ ok: true, message: 'Import successful.' })
    expect(loadDailyDrillMap()['2026-09-08:muay-thai']).toEqual(
      expect.objectContaining({
        comboId: 'beg-01',
        martialArt: 'muay-thai',
        slowDone: true,
      }),
    )
  })
})

describe('Daily load salvage and display/session agreement', () => {
  beforeEach(() => {
    localStorage.clear()
    seedCompletedOnboarding('muay-thai')
    vi.spyOn(primeAudio, 'primeTrainingAudio').mockResolvedValue({ ok: true, timedOut: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('never returns a known combo from the wrong martial art', () => {
    const recovered = resolveDailyDrillCombo('bx-b01', 'muay-thai', '2026-09-08:muay-thai')
    expect(recovered.martialArt).toBe('muay-thai')
    expect(recovered.id).toBe(pickDailyComboId('2026-09-08:muay-thai', 'muay-thai'))
    expect(recovered.id).not.toBe('bx-b01')

    const boxing = resolveDailyDrillCombo('beg-01', 'boxing', '2026-09-08:boxing')
    expect(boxing.martialArt).toBe('boxing')
    expect(boxing.id).toBe(pickDailyComboId('2026-09-08:boxing', 'boxing'))
  })

  it('salvages a locally stored wrong-art combo while preserving phase progress', () => {
    localStorage.setItem(
      STORAGE_KEYS.daily,
      JSON.stringify({
        '2026-09-08:muay-thai': drill('2026-09-08', 'muay-thai', 'bx-b01', {
          slowDone: true,
          normalDone: true,
        }),
      }),
    )
    const loaded = loadDailyDrillMap()
    const recovered = loaded['2026-09-08:muay-thai']
    expect(recovered?.martialArt).toBe('muay-thai')
    expect(recovered?.comboId).toBe(pickDailyComboId('2026-09-08:muay-thai', 'muay-thai'))
    expect(recovered?.slowDone).toBe(true)
    expect(recovered?.normalDone).toBe(true)
    expect(getCombo(recovered!.comboId).martialArt).toBe('muay-thai')
  })

  it('salvages a locally stored unknown combo ID', () => {
    localStorage.setItem(
      STORAGE_KEYS.daily,
      JSON.stringify({
        '2026-09-08:boxing': drill('2026-09-08', 'boxing', 'definitely-not-a-combo', { slowDone: true }),
      }),
    )
    const recovered = loadDailyDrillMap()['2026-09-08:boxing']
    expect(recovered?.comboId).toBe(pickDailyComboId('2026-09-08:boxing', 'boxing'))
    expect(recovered?.slowDone).toBe(true)
    expect(getCombo(recovered!.comboId).martialArt).toBe('boxing')
  })

  it('preserves a valid stored Daily combo', () => {
    localStorage.setItem(
      STORAGE_KEYS.daily,
      JSON.stringify({
        '2026-09-08:muay-thai': drill('2026-09-08', 'muay-thai', 'beg-01', { fightDone: true }),
      }),
    )
    expect(loadDailyDrillMap()['2026-09-08:muay-thai']?.comboId).toBe('beg-01')
    expect(loadDailyDrillMap()['2026-09-08:muay-thai']?.fightDone).toBe(true)
  })

  it('displays and starts the same recovered combo after a wrong-sport local record', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 8, 12, 0, 0))
    const key = '2026-09-08:muay-thai'
    const recoveredId = pickDailyComboId(key, 'muay-thai')
    localStorage.setItem(
      STORAGE_KEYS.daily,
      JSON.stringify({
        [key]: drill('2026-09-08', 'muay-thai', 'bx-b01', { slowDone: true }),
      }),
    )
    const { router } = renderApp('/daily')
    await screen.findByRole('heading', { name: /daily drill/i })
    const recovered = getCombo(recoveredId)
    expect(screen.getByRole('article', { name: `Combination: ${recovered.title}` })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: `Combination: ${getCombo('bx-b01').title}` })).not.toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: /^normal practice/i })[0]!)
    expect(router.state.location.pathname).toBe('/session')
    const state = router.state.location.state as { config: WorkoutConfig; dailyDrillKey: string }
    expect(state.dailyDrillKey).toBe(key)
    expect(state.config.selectedComboIds).toEqual([recoveredId])
    expect(state.config.martialArt).toBe('muay-thai')
    expect(loadDailyDrillMap()[key]?.comboId).toBe(recoveredId)
    expect(loadDailyDrillMap()[key]?.slowDone).toBe(true)
  })

  it('keeps migrateDailyDrillMap salvage-oriented rather than import-strict', () => {
    const map = migrateDailyDrillMap({
      '2026-09-08:muay-thai': drill('2026-09-08', 'muay-thai', 'bx-b01', { slowDone: true }),
      garbage: { nope: true },
    })
    expect(map['2026-09-08:muay-thai']?.comboId).toBe(pickDailyComboId('2026-09-08:muay-thai', 'muay-thai'))
    expect(map['2026-09-08:muay-thai']?.slowDone).toBe(true)
    expect(parseDailyDrillKey('2026-09-08:muay-thai').ok).toBe(true)
  })

  it('repeats semantic salvage 10 times without flaking', () => {
    for (let i = 0; i < 10; i++) {
      const civil = `2026-09-${String(8 + (i % 2)).padStart(2, '0')}`
      const key = `${civil}:muay-thai`
      localStorage.setItem(
        STORAGE_KEYS.daily,
        JSON.stringify({ [key]: drill(civil, 'muay-thai', i % 2 === 0 ? 'bx-b01' : 'definitely-not-a-combo') }),
      )
      const recovered = loadDailyDrillMap()[key]
      expect(recovered?.comboId).toBe(pickDailyComboId(key, 'muay-thai'))
      expect(getCombo(recovered!.comboId).martialArt).toBe('muay-thai')
    }
  })
})
