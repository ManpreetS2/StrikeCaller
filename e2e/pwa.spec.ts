import { expect, goToNav, openApp, test } from './helpers/app'

test.describe('production service worker', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'service-worker lifecycle is asserted on Chromium')
  })

  test('registers sw.js after the first production load', async ({ page }) => {
    await openApp(page)
    await expect(page.getByRole('heading', { name: 'StrikeCaller' })).toBeVisible()
    await expect
      .poll(async () =>
        page.evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration()
          return Boolean(registration?.scope)
        }),
      )
      .toBe(true)
  })

  test('keeps the app shell usable after a controlled reload goes offline', async ({ page, context }) => {
    await openApp(page)
    await expect
      .poll(async () =>
        page.evaluate(async () => Boolean(await navigator.serviceWorker.getRegistration())),
      )
      .toBe(true)

    await page.reload()
    await page.evaluate(() => navigator.serviceWorker.ready)
    await context.setOffline(true)

    await page.reload()
    await expect(page.getByRole('heading', { name: 'StrikeCaller' })).toBeVisible()
    await expect(page.getByRole('button', { name: /start workout/i })).toBeVisible()

    await goToNav(page, 'Train')
    await expect(page.getByRole('heading', { name: 'Customize Workout' })).toBeVisible()

    await goToNav(page, 'Stats')
    await expect(page.getByRole('heading', { name: 'Training Stats' })).toBeVisible()

    await goToNav(page, 'Settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await expect(page.getByText(/training data never leaves this browser/i)).toBeVisible()
  })
})

test.describe('optional Cloudflare Insights', () => {
  test('still boots when the Insights script is blocked', async ({ page }) => {
    await page.route('https://static.cloudflareinsights.com/**', (route) => route.abort())
    await openApp(page)
    await expect(page.getByRole('heading', { name: 'StrikeCaller' })).toBeVisible()
    await expect(page.getByRole('button', { name: /start workout/i })).toBeVisible()
  })
})
