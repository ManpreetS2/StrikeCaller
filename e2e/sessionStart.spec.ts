import {
  expect,
  openApp,
  startShortCoachSession,
  test,
  waitForSessionActive,
  waitForWorkPhase,
} from './helpers/app'

async function startDistinctiveRoundSession(page: import('./helpers/app').Page): Promise<void> {
  await openApp(page, '/train')
  await expect(page.getByRole('heading', { name: 'Customize Workout' })).toBeVisible()
  await page.getByRole('radio', { name: /Boxing/ }).click()
  await page.getByLabel('Stance').selectOption('southpaw')
  await page.getByLabel('Pace').selectOption('technical')
  await page.getByLabel('Number of rounds').fill('2')
  await page.getByLabel('Round duration in seconds').fill('120')
  await page.getByRole('button', { name: 'Start Workout' }).click()
  await expect(page).toHaveURL(/#\/session/)
}

test.describe('session start payload', () => {
  test('fresh direct #/session is unavailable and Back to Train works', async ({ page }) => {
    await openApp(page, '/session')
    await expect(page).toHaveURL(/#\/session/)
    await expect(page.getByRole('heading', { name: 'Session unavailable' })).toBeVisible()
    await expect(page.getByRole('toolbar', { name: 'Session controls' })).toHaveCount(0)
    await expect(page.getByText('Preparing audio…')).toHaveCount(0)
    await page.getByRole('link', { name: 'Back to Train' }).click()
    await expect(page).toHaveURL(/#\/train/)
    await expect(page.getByRole('heading', { name: 'Customize Workout' })).toBeVisible()
  })

  test('hash navigation to #/session without state is unavailable', async ({ page }) => {
    await openApp(page, '/')
    await expect(page.getByRole('heading', { name: 'StrikeCaller' })).toBeVisible()
    await page.evaluate(() => {
      window.location.hash = '#/session'
    })
    await expect(page).toHaveURL(/#\/session/)
    await expect(page.getByRole('heading', { name: 'Session unavailable' })).toBeVisible()
    await expect(page.getByRole('toolbar', { name: 'Session controls' })).toHaveCount(0)
  })

  test('normal Train start reaches Session with the supplied config', async ({ page }) => {
    await startDistinctiveRoundSession(page)
    await waitForSessionActive(page)
    await expect(page.locator('.session-meta')).toContainText(/round · southpaw · technical/i)
    await waitForWorkPhase(page)
    await expect(page.locator('.session-timer-clock')).toHaveText(/^2:/)
  })

  test('reload after a routed start never fabricates a default workout', async ({ page }, testInfo) => {
    await startDistinctiveRoundSession(page)
    await waitForSessionActive(page)
    await expect(page.locator('.session-meta')).toContainText(/round · southpaw · technical/i)
    await waitForWorkPhase(page)
    await expect(page.locator('.session-timer-clock')).toHaveText(/^2:/)

    await page.reload()
    await expect(page).toHaveURL(/#\/session/)

    const unavailable = page.getByRole('heading', { name: 'Session unavailable' })
    const toolbar = page.getByRole('toolbar', { name: 'Session controls' })
    await expect(unavailable.or(toolbar)).toBeVisible()

    if (await unavailable.isVisible()) {
      console.log(`A5_RELOAD_OUTCOME ${testInfo.project.name} unavailable`)
      await expect(page.getByRole('toolbar', { name: 'Session controls' })).toHaveCount(0)
      await expect(page.getByText('Preparing audio…')).toHaveCount(0)
      return
    }

    console.log(`A5_RELOAD_OUTCOME ${testInfo.project.name} preserved`)
    await waitForSessionActive(page)
    await expect(page.locator('.session-meta')).toContainText(/round · southpaw · technical/i)
    await waitForWorkPhase(page)
    await expect(page.locator('.session-timer-clock')).toHaveText(/^2:/)
  })

  test('existing short coach session still starts', async ({ page }) => {
    await startShortCoachSession(page)
    await waitForSessionActive(page)
    await expect(page.getByRole('toolbar', { name: 'Session controls' })).toBeVisible()
  })
})
