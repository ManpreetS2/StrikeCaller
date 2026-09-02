import { expect, goToNav, openApp, test } from './helpers/app'

test.describe('app load and navigation', () => {
  test('loads StrikeCaller and navigates major routes', async ({ page }) => {
    await openApp(page)
    await expect(page.getByRole('heading', { name: 'StrikeCaller' })).toBeVisible()
    await expect(
      page.getByRole('navigation', { name: 'Primary' }).or(page.getByRole('navigation', { name: 'Mobile' })),
    ).toBeVisible()

    await goToNav(page, 'Train')
    await expect(page).toHaveURL(/#\/train/)
    await expect(page.getByRole('heading', { name: 'Customize Workout' })).toBeVisible()

    await goToNav(page, 'Stats')
    await expect(page).toHaveURL(/#\/stats/)
    await expect(page.getByRole('heading', { name: 'Training Stats' })).toBeVisible()

    await goToNav(page, 'Settings')
    await expect(page).toHaveURL(/#\/settings/)
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

    await goToNav(page, 'Home')
    await expect(page).toHaveURL(/#\/?$/)
    await expect(page.getByRole('heading', { name: 'StrikeCaller' })).toBeVisible()
  })

  test('HashRouter refresh keeps Stats and Settings', async ({ page }) => {
    await openApp(page, '/stats')
    await expect(page.getByRole('heading', { name: 'Training Stats' })).toBeVisible()
    await page.reload()
    await expect(page).toHaveURL(/#\/stats/)
    await expect(page.getByRole('heading', { name: 'Training Stats' })).toBeVisible()

    await openApp(page, '/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await page.reload()
    await expect(page).toHaveURL(/#\/settings/)
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  })
})
