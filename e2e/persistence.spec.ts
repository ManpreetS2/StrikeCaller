import {
  expect,
  goToNav,
  openApp,
  startShortCoachSession,
  test,
  waitForSessionActive,
} from './helpers/app'
import { legacySession, readIndexedDbSessions, readLegacyHistoryKey, readThemePreference } from './helpers/storage'

test.describe('completed session persistence', () => {
  test('a finished workout appears in Stats and survives reload', async ({ page }) => {
    test.setTimeout(90_000)
    await startShortCoachSession(page)
    await waitForSessionActive(page)
    await expect(page.getByRole('heading', { name: 'Summary' })).toBeVisible({ timeout: 75_000 })
    await expect(page.getByText('Session complete')).toBeVisible()

    await expect
      .poll(async () => (await readIndexedDbSessions(page)).length, { timeout: 15_000 })
      .toBe(1)
    const committed = await readIndexedDbSessions(page)
    expect(committed).toHaveLength(1)
    expect(committed[0]?.id).toBeTruthy()

    await goToNav(page, 'Stats')
    await expect(page.getByRole('heading', { name: 'Training Stats' })).toBeVisible()
    await expect(page.getByText('No sessions in this range')).toHaveCount(0)
    await expect(page.getByText('Sessions', { exact: true })).toBeVisible()
    await expect(page.locator('.metric-card', { hasText: 'Sessions' }).getByText('1', { exact: true })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Training Stats' })).toBeVisible()
    await expect(page.getByText('No sessions in this range')).toHaveCount(0)
    await expect(page.locator('.metric-card', { hasText: 'Sessions' }).getByText('1', { exact: true })).toBeVisible()
    const stored = await readIndexedDbSessions(page)
    expect(stored).toHaveLength(1)
    expect(stored[0]?.id).toBe(committed[0]?.id)
  })
})

test.describe('preference persistence', () => {
  test('theme survives a real browser reload', async ({ page }) => {
    await openApp(page)
    await page.getByRole('button', { name: 'Light theme' }).click()
    await expect(page.getByRole('button', { name: 'Light theme' })).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(async () => readThemePreference(page)).toBe('light')

    await page.reload()
    await expect(page.getByRole('button', { name: 'Light theme' })).toHaveAttribute('aria-pressed', 'true')
    expect(await readThemePreference(page)).toBe('light')
  })
})

test.describe('legacy history migration', () => {
  const seeded = legacySession('legacy-e2e-migrate')
  test.use({ seedOptions: { onboardingComplete: true, legacyHistory: [seeded] } })

  test('migrates localStorage history into IndexedDB once', async ({ page }) => {
    await openApp(page, '/stats')
    await expect(page.getByRole('heading', { name: 'Training Stats' })).toBeVisible()
    await expect(page.getByText('No sessions in this range')).toHaveCount(0)

    await expect
      .poll(async () => (await readIndexedDbSessions(page)).map((row) => row.id), { timeout: 15_000 })
      .toEqual([seeded.id])
    await expect.poll(async () => readLegacyHistoryKey(page)).toBeNull()

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Training Stats' })).toBeVisible()
    await expect(page.getByText('No sessions in this range')).toHaveCount(0)
    const afterReload = await readIndexedDbSessions(page)
    expect(afterReload.map((row) => row.id)).toEqual([seeded.id])
    expect(new Set(afterReload.map((row) => row.id)).size).toBe(1)
    expect(await readLegacyHistoryKey(page)).toBeNull()
    await expect(page.locator('.metric-card', { hasText: 'Sessions' }).getByText('1', { exact: true })).toBeVisible()
  })
})
