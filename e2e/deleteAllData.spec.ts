import { expect, goToNav, openApp, test } from './helpers/app'
import {
  legacySession,
  readIndexedDbSessions,
  readLocalStorageItem,
  readStrikeCallerKeys,
  readThemePreference,
} from './helpers/storage'

test.describe('delete all data', () => {
  test.use({ seedOptions: { seedOnboardingIfMissing: false } })

  test('removes StrikeCaller user data in a real browser and keeps unrelated keys', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Chromium is sufficient for this destructive Settings flow')

    const seeded = legacySession('delete-e2e-session')
    await page.addInitScript(
      ({ session, prefs, favorite, combo, daily }) => {
        if (window.sessionStorage.getItem('e2e-delete-all-seeded')) return
        window.sessionStorage.setItem('e2e-delete-all-seeded', '1')
        window.localStorage.setItem('strikecaller:preferences', JSON.stringify(prefs))
        window.localStorage.setItem('strikecaller:favorites', JSON.stringify([favorite]))
        window.localStorage.setItem('strikecaller:custom-combos', JSON.stringify([combo]))
        window.localStorage.setItem('strikecaller:daily-drill', JSON.stringify(daily))
        window.localStorage.setItem('strikecaller:history', JSON.stringify([session]))
        window.localStorage.setItem('strikecaller:music-compatibility', '{"result":"music-paused"}')
        window.localStorage.setItem('unrelated-app-data', 'keep-me')
      },
      {
        session: seeded,
        prefs: {
          onboardingComplete: true,
          wakeLock: false,
          wakeLockNoticeDismissed: true,
          customComboMigrationNoticeShown: true,
          theme: 'light',
          largeText: true,
        },
        favorite: 'beg-01',
        combo: {
          id: 'custom-e2e-delete',
          title: 'E2E jab cross',
          techniqueIds: ['jab', 'cross'],
          createdAt: 1,
          updatedAt: 1,
          favorite: false,
          repeatCount: 1,
          martialArt: 'muay-thai',
        },
        daily: {
          '2026-09-03:muay-thai': {
            dateKey: '2026-09-03:muay-thai',
            comboId: 'beg-01',
            martialArt: 'muay-thai',
            slowDone: true,
            normalDone: false,
            fightDone: false,
            completed: false,
          },
        },
      },
    )

    await openApp(page, '/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Light theme' })).toHaveAttribute('aria-pressed', 'true')
    await expect
      .poll(async () => (await readIndexedDbSessions(page)).map((row) => row.id), { timeout: 15_000 })
      .toEqual([seeded.id])

    await expect(page.getByRole('heading', { name: 'Delete all local data' })).toBeVisible()
    await page.getByRole('button', { name: 'Delete all data' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete all local data?' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/permanently deletes all StrikeCaller data stored on this device/i)).toBeVisible()
    await dialog.getByRole('button', { name: 'Delete permanently' }).click()
    await expect(page.getByText('All StrikeCaller data on this device was deleted.')).toBeVisible()

    expect(await readStrikeCallerKeys(page)).toEqual([])
    expect(await readLocalStorageItem(page, 'unrelated-app-data')).toBe('keep-me')
    expect(await readIndexedDbSessions(page)).toEqual([])
    await expect(page.getByRole('button', { name: 'Dark theme' })).toHaveAttribute('aria-pressed', 'true')

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    expect(await readLocalStorageItem(page, 'unrelated-app-data')).toBe('keep-me')
    expect(await readThemePreference(page)).toBeNull()
    expect(await readLocalStorageItem(page, 'strikecaller:favorites')).toBeNull()
    expect(await readLocalStorageItem(page, 'strikecaller:history')).toBeNull()
    expect(await readIndexedDbSessions(page)).toEqual([])
    await expect(page.getByRole('button', { name: 'Dark theme' })).toHaveAttribute('aria-pressed', 'true')

    await goToNav(page, 'Stats')
    await expect(page.getByRole('heading', { name: 'Training Stats' })).toBeVisible()
    await expect(page.getByText('No sessions in this range')).toBeVisible()

    await goToNav(page, 'Train')
    await expect(page.getByRole('heading', { name: 'Four quick choices' })).toBeVisible()
  })
})
