import { expect, goToNav, openApp, test } from './helpers/app'

test.describe('app load and navigation', () => {
  test('loads StrikeCaller and navigates major routes', async ({ page }) => {
    await openApp(page)
    await expect(page.getByRole('heading', { name: 'StrikeCaller' })).toBeVisible()
    await expect(page.getByRole('button', { name: /start workout/i })).toBeVisible()
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

  test('Home hierarchy keeps Start workout above For you, Progress, and Tools', async ({ page }) => {
    await openApp(page)
    const start = page.getByRole('button', { name: /start workout/i })
    const forYou = page.getByRole('heading', { name: 'For you' })
    const progress = page.getByRole('heading', { name: 'Progress' })
    const tools = page.getByRole('heading', { name: 'Tools' })
    await expect(start).toBeVisible()
    await expect(forYou).toBeVisible()
    await expect(progress).toBeVisible()
    await expect(tools).toBeVisible()

    const startBox = await start.boundingBox()
    const forYouBox = await forYou.boundingBox()
    const progressBox = await progress.boundingBox()
    const toolsBox = await tools.boundingBox()
    expect(startBox?.y ?? 0).toBeLessThan(forYouBox?.y ?? 0)
    expect(forYouBox?.y ?? 0).toBeLessThan(progressBox?.y ?? 0)
    expect(progressBox?.y ?? 0).toBeLessThan(toolsBox?.y ?? 0)
    await expect(page.getByText(/coming soon/i)).toHaveCount(0)
    await expect(page.getByText(/calories|punch speed|strike accuracy/i)).toHaveCount(0)
  })

  test('More hub reaches Daily, Builder, Learn, and Demo', async ({ page }) => {
    await openApp(page, '/more')
    await expect(page.getByRole('heading', { name: 'More' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Daily' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Builder' }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Learn' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Guided Demo' })).toBeVisible()
    await expect(page.getByText(/coming soon|kickboxing|taekwondo/i)).toHaveCount(0)
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
