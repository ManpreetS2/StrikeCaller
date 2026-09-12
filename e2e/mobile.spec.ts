import {
  expect,
  expectInViewport,
  measureOverflow,
  openApp,
  startShortCoachSession,
  test,
  waitForSessionActive,
  waitForWorkPhase,
} from './helpers/app'

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
] as const

test.describe('iPhone portrait session', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'phone session geometry is a mobile WebKit check')
  })

  test('active session fits the viewport and keeps controls reachable', async ({ page }) => {
    await startShortCoachSession(page)
    await waitForSessionActive(page)
    await waitForWorkPhase(page)

    await expect(page.getByRole('navigation', { name: 'Mobile' })).toBeHidden()
    await expect(page.getByText('Current call')).toBeVisible()

    const overflow = await measureOverflow(page)
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth + 2)

    const pause = page.getByRole('button', { name: 'Pause session' })
    const skip = page.getByRole('button', { name: 'Skip combination' })
    const end = page.getByRole('button', { name: 'End session' })
    await expectInViewport(page, pause)
    await expectInViewport(page, skip)
    await expectInViewport(page, end)
  })
})

test.describe('iPhone landscape session', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'phone landscape is a mobile WebKit check')
  })
  test.use({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
  })

  test('session controls and combo stay usable in landscape', async ({ page }) => {
    await startShortCoachSession(page)
    await waitForSessionActive(page)
    await waitForWorkPhase(page)

    await expect(page.getByText('Current call')).toBeVisible()
    await expect(page.locator('[aria-label^="Combination:"]').locator('visible=true')).toBeVisible()
    await expect(page.getByRole('toolbar', { name: 'Session controls' })).toBeVisible()

    const overflow = await measureOverflow(page)
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth + 8)

    await expectInViewport(page, page.getByRole('button', { name: 'Pause session' }))
    await expectInViewport(page, page.getByRole('button', { name: 'End session' }))
  })
})

test.describe('layout smoke', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'viewport smoke runs once on Chromium')
  })

  for (const viewport of VIEWPORTS) {
    test(`${viewport.width}×${viewport.height} loads major UI without horizontal overflow`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await openApp(page)
      await expect(page.getByRole('heading', { name: 'StrikeCaller' })).toBeVisible()
      const home = await measureOverflow(page)
      expect(home.scrollWidth).toBeLessThanOrEqual(home.innerWidth + 2)

      if (viewport.width <= 390) {
        const start = page.getByRole('button', { name: /start workout/i })
        await expect(start).toBeVisible()
        const startBox = await start.boundingBox()
        const nav = page.getByRole('navigation', { name: 'Mobile' })
        const navBox = await nav.boundingBox()
        expect(startBox, 'Start workout should have a box').toBeTruthy()
        expect(navBox, 'Mobile nav should have a box').toBeTruthy()
        if (startBox && navBox) {
          expect(startBox.y + startBox.height).toBeLessThanOrEqual(navBox.y + 2)
        }
      }

      await openApp(page, '/stats')
      await expect(page.getByRole('heading', { name: 'Training Stats' })).toBeVisible()
      const stats = await measureOverflow(page)
      expect(stats.scrollWidth).toBeLessThanOrEqual(stats.innerWidth + 2)

      await openApp(page, '/settings')
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
      const settings = await measureOverflow(page)
      expect(settings.scrollWidth).toBeLessThanOrEqual(settings.innerWidth + 2)
    })
  }
})
