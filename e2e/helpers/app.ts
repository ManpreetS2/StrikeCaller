import { expect, test, type Page } from './fixtures'

export { expect, test }

export function hashUrl(route = '/'): string {
  const baseURL = test.info().project.use.baseURL
  if (!baseURL) throw new Error('Playwright project is missing baseURL')
  const hash =
    route === '/' || route === ''
      ? '#/'
      : route.startsWith('#')
        ? route
        : `#${route.startsWith('/') ? route : `/${route}`}`
  return `${baseURL.replace(/\/$/, '')}/${hash}`
}

export async function openApp(page: Page, route = '/'): Promise<void> {
  await page.goto(hashUrl(route))
}

export async function goToNav(page: Page, name: 'Home' | 'Train' | 'Stats' | 'Settings'): Promise<void> {
  const desktop = page.getByRole('navigation', { name: 'Primary' })
  if (await desktop.isVisible()) {
    await desktop.getByRole('link', { name, exact: true }).click()
    return
  }
  await page.getByRole('navigation', { name: 'Mobile' }).getByRole('link', { name, exact: true }).click()
}

export async function startShortCoachSession(page: Page): Promise<void> {
  await openApp(page, '/train')
  await expect(page.getByRole('heading', { name: 'Customize Workout' })).toBeVisible()
  await page.getByRole('radio', { name: /Coach Mode/ }).click()
  await page.getByLabel('Session duration in seconds').fill('30')
  const start = page.getByRole('button', { name: 'Start Workout' })
  await start.click()
  await expect(page).toHaveURL(/#\/session/)
}

export async function waitForSessionActive(page: Page): Promise<void> {
  await expect(page.getByText('Preparing audio…')).toHaveCount(0)
  await expect(page.getByRole('toolbar', { name: 'Session controls' })).toBeVisible()
  await expect(page.getByText('Current call')).toBeVisible()
}

export async function waitForWorkPhase(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Skip combination' })).toBeEnabled()
}

export function measureOverflow(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement
    return {
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      innerWidth: window.innerWidth,
    }
  })
}

export async function expectInViewport(page: Page, locator: ReturnType<Page['getByRole']>): Promise<void> {
  const box = await locator.boundingBox()
  const viewport = page.viewportSize()
  expect(box, 'control should have a bounding box').toBeTruthy()
  expect(viewport, 'page should have a viewport').toBeTruthy()
  if (!box || !viewport) return
  expect(box.x).toBeGreaterThanOrEqual(-1)
  expect(box.y).toBeGreaterThanOrEqual(-1)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 2)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 2)
}
