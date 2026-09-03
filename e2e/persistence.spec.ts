import {
  expect,
  expectStatsSessionCount,
  goToNav,
  openApp,
  startShortCoachSession,
  test,
  waitForSessionActive,
  type Page,
} from './helpers/app'
import { legacySession, readIndexedDbSessions, readLegacyHistoryKey, readThemePreference } from './helpers/storage'

async function summaryIdentity(page: Page) {
  const rounds = page.locator('.panel').filter({ has: page.getByText('Rounds', { exact: true }) })
  const combos = page.locator('.panel').filter({ has: page.getByText('Combinations', { exact: true }) })
  return {
    artLine: (await page.locator('header p.capitalize').textContent())?.trim() ?? '',
    rounds: ((await rounds.locator('p').nth(1).textContent()) ?? '').trim(),
    combos: ((await combos.locator('p').nth(1).textContent()) ?? '').trim(),
  }
}

test.describe('completed session persistence', () => {
  test('a finished workout appears in Stats and survives reload', async ({ page }) => {
    test.setTimeout(90_000)
    await startShortCoachSession(page)
    await waitForSessionActive(page)
    await expect(page.getByRole('heading', { name: 'Summary' })).toBeVisible({ timeout: 75_000 })
    await expect(page).toHaveURL(/#\/summary\/[^/?#]+/)

    const summaryUrl = page.url()
    const sessionId = decodeURIComponent(summaryUrl.split('#/summary/')[1] ?? '').replace(/\/$/, '')
    expect(sessionId).toMatch(/^session-\d+$/)
    await expect
      .poll(async () => (await readIndexedDbSessions(page)).map((row) => row.id), { timeout: 15_000 })
      .toEqual([sessionId])
    const committed = await readIndexedDbSessions(page)
    expect(committed).toHaveLength(1)
    expect(committed[0]?.id).toBe(sessionId)

    await expect(page.getByText('Session complete')).toBeVisible()
    const identity = await summaryIdentity(page)
    expect(identity.artLine).toMatch(/Muay Thai · coach/)
    expect(identity.rounds).toMatch(/^\d+$/)
    expect(identity.combos).toMatch(/^\d+$/)

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Summary' })).toBeVisible()
    await expect(page.getByText('Session complete')).toBeVisible()
    await expect(page).toHaveURL(summaryUrl)
    expect(await summaryIdentity(page)).toEqual(identity)

    await goToNav(page, 'Stats')
    await expect(page.getByRole('heading', { name: 'Training Stats' })).toBeVisible()
    await expect(page.getByText('No sessions in this range')).toHaveCount(0)
    await expect(page.getByText('Sessions', { exact: true })).toBeVisible()
    await expectStatsSessionCount(page, 1)

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Training Stats' })).toBeVisible()
    await expect(page.getByText('No sessions in this range')).toHaveCount(0)
    await expectStatsSessionCount(page, 1)
    const stored = await readIndexedDbSessions(page)
    expect(stored).toHaveLength(1)
    expect(stored[0]?.id).toBe(committed[0]?.id)

    await goToNav(page, 'Home')
    await expect(page.getByRole('heading', { name: 'StrikeCaller' })).toBeVisible()
    await page.goto(summaryUrl)
    await expect(page.getByRole('heading', { name: 'Summary' })).toBeVisible()
    await expect(page.getByText('Session complete')).toBeVisible()
    expect(await summaryIdentity(page)).toEqual(identity)
    await expect(page).toHaveURL(/#\/summary\/[^/?#]+/)
    expect(decodeURIComponent(page.url().split('#/summary/')[1] ?? '').replace(/\/$/, '')).toBe(sessionId)
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
    await expectStatsSessionCount(page, 1)
  })
})
