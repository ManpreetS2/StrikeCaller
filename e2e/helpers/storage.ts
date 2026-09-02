import type { Page } from '@playwright/test'

export type LegacySessionSeed = {
  id: string
  startedAt: number
  endedAt: number
  martialArt: 'muay-thai' | 'boxing'
  mode: string
  stance: 'orthodox' | 'southpaw'
  pace: string
  totalTrainingMs: number
  roundsCompleted: number
  combinationsCompleted: number
  techniquesCalled: number
  techniqueCounts: Record<string, number>
  techniqueCategoryCounts: Record<string, number>
  comboIds: string[]
  defenseActions: number
  movementActions: number
  averagePaceLabel: string
  dailyDrillCompleted: boolean
  cancelled: boolean
  favoriteComboIds: string[]
  usedCustomCombo: boolean
}

export type SeedOptions = {
  /**
   * Convenience for gated routes (Train/Session). Default true.
   *
   * Writes a valid completed-onboarding `strikecaller:preferences` object **only
   * when that key is missing**. Never overwrites prefs a test (or the app)
   * already wrote — that is what made theme reload work, and it also means a
   * test can install its own prefs via `addInitScript` *after* this helper
   * (later scripts run later) or by setting this false.
   *
   * This is not a persistence/migration simulation. IndexedDB is not seeded.
   */
  seedOnboardingIfMissing?: boolean
  onboardingComplete?: boolean
  /** Seeded only when `strikecaller:history` is missing, independent of prefs. */
  legacyHistory?: LegacySessionSeed[]
}

export function legacySession(id = 'legacy-e2e-1'): LegacySessionSeed {
  const startedAt = Date.now() - 60_000
  return {
    id,
    startedAt,
    endedAt: startedAt + 60_000,
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
  }
}

const READY_PREFERENCES = {
  onboardingComplete: true,
  wakeLock: false,
  wakeLockNoticeDismissed: true,
  customComboMigrationNoticeShown: true,
  theme: 'dark',
}

/**
 * Seed localStorage before the first document load when keys are absent.
 *
 * Named `seedOnboardingIfMissing` because the default path only fills an empty
 * origin so HashRouter tests can reach /train. It will not clobber existing
 * preferences, wipe IndexedDB, or hide a corrupted-prefs migration — missing
 * keys are the only writes.
 */
export async function seedOnboardingIfMissing(page: Page, options: SeedOptions = {}): Promise<void> {
  const writeOnboarding = options.seedOnboardingIfMissing !== false
  const onboardingComplete = options.onboardingComplete !== false
  const legacyHistory = options.legacyHistory ?? []

  await page.addInitScript(
    ({ prefs, history, writePrefs }) => {
      try {
        if (writePrefs && !window.localStorage.getItem('strikecaller:preferences')) {
          window.localStorage.setItem('strikecaller:preferences', JSON.stringify(prefs))
        }
        if (history.length > 0 && !window.localStorage.getItem('strikecaller:history')) {
          window.localStorage.setItem('strikecaller:history', JSON.stringify(history))
        }
      } catch {
        // Storage may be unavailable in exotic browser settings.
      }
    },
    {
      prefs: { ...READY_PREFERENCES, onboardingComplete },
      history: legacyHistory,
      writePrefs: writeOnboarding,
    },
  )
}

export async function clearOriginStorage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    try {
      window.localStorage.clear()
      window.sessionStorage.clear()
    } catch {
      // ignore
    }

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('strikecaller')
      request.onsuccess = () => resolve()
      request.onerror = () =>
        reject(request.error ?? new Error('Failed to delete IndexedDB database strikecaller'))
      request.onblocked = () => {
        // onsuccess still fires after existing connections close.
      }
    })

    for (const part of document.cookie.split(';')) {
      const name = part.split('=')[0]?.trim()
      if (name) document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
    }
  })
}

export async function readIndexedDbSessions(page: Page): Promise<{ id: string }[]> {
  return page.evaluate(async () => {
    const listed = indexedDB.databases ? await indexedDB.databases() : null
    if (listed && !listed.some((db) => db.name === 'strikecaller')) return []

    return new Promise<{ id: string }[]>((resolve, reject) => {
      const request = indexedDB.open('strikecaller')
      request.onupgradeneeded = () => {
        request.transaction?.abort()
      }
      request.onerror = () => resolve([])
      request.onsuccess = () => {
        const db = request.result
        try {
          if (!db.objectStoreNames.contains('sessions')) {
            db.close()
            resolve([])
            return
          }
          const tx = db.transaction('sessions', 'readonly')
          const getAll = tx.objectStore('sessions').getAll()
          getAll.onsuccess = () => {
            const rows = (getAll.result as { id?: string }[])
              .map((row) => (typeof row.id === 'string' ? { id: row.id } : null))
              .filter((row): row is { id: string } => row != null)
            db.close()
            resolve(rows)
          }
          getAll.onerror = () => {
            db.close()
            reject(getAll.error ?? new Error('Failed to read sessions store'))
          }
        } catch (error) {
          db.close()
          reject(error)
        }
      }
    })
  })
}

export async function readLegacyHistoryKey(page: Page): Promise<string | null> {
  return page.evaluate(() => window.localStorage.getItem('strikecaller:history'))
}

export async function readThemePreference(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    try {
      const raw = window.localStorage.getItem('strikecaller:preferences')
      if (!raw) return null
      const parsed = JSON.parse(raw) as { theme?: string }
      return parsed.theme ?? null
    } catch {
      return null
    }
  })
}
