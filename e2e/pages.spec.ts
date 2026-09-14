import { expect, goToNav, openApp, test } from './helpers/app'
import { shouldFailAppRequest } from './helpers/errorPolicy'

test.describe('GitHub Pages base path', () => {
  test('serves /StrikeCaller/ with working hash routes and assets', async ({ page }) => {
    const failed: string[] = []
    page.on('requestfailed', (request) => {
      if (
        shouldFailAppRequest({
          url: request.url(),
          resourceType: request.resourceType(),
          failureText: request.failure()?.errorText,
        })
      ) {
        failed.push(`requestfailed ${request.url()} ${request.failure()?.errorText ?? ''}`)
      }
    })
    page.on('response', (response) => {
      if (
        shouldFailAppRequest({
          url: response.url(),
          resourceType: response.request().resourceType(),
          status: response.status(),
        })
      ) {
        failed.push(`HTTP ${response.status()} ${response.url()}`)
      }
    })

    const home = await page.request.get(new URL('.', test.info().project.use.baseURL ?? '').href)
    expect(home.status(), 'Pages index should be HTTP 200').toBe(200)

    const pagesBase = test.info().project.use.baseURL ?? ''
    const manifest = await page.request.get(new URL('manifest.webmanifest', pagesBase).href)
    expect(manifest.status(), 'manifest.webmanifest should be HTTP 200').toBe(200)
    expect(manifest.headers()['content-type'] ?? '').toMatch(/json|manifest|webmanifest/i)

    const manifestBody = (await manifest.json()) as {
      icons?: { src: string; type?: string }[]
    }
    expect(Array.isArray(manifestBody.icons) && manifestBody.icons.length > 0).toBe(true)

    const iconUrls = (manifestBody.icons ?? []).map((icon) => new URL(icon.src, manifest.url()).href)
    iconUrls.push(new URL('apple-touch-icon.png', pagesBase).href)

    for (const iconUrl of iconUrls) {
      const iconResponse = await page.request.get(iconUrl)
      expect(iconResponse.status(), `${iconUrl} should be HTTP 200`).toBe(200)
      expect(iconResponse.headers()['content-type'] ?? '', `${iconUrl} content-type`).toMatch(/image\/(png|svg\+xml)/i)
    }

    await openApp(page)
    await expect(page).toHaveURL(/\/StrikeCaller\/(?:index\.html)?#\//)
    await expect(page.getByRole('heading', { name: 'StrikeCaller' })).toBeVisible()

    await openApp(page, '/stats')
    await expect(page).toHaveURL(/\/StrikeCaller\/.*#\/stats/)
    await expect(page.getByRole('heading', { name: 'Training Stats' })).toBeVisible()

    await goToNav(page, 'Settings')
    await expect(page).toHaveURL(/#\/settings/)
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

    await openApp(page, '/summary/session-pages-hash-route')
    await expect(page).toHaveURL(/\/StrikeCaller\/(?:index\.html)?#\/summary\/session-pages-hash-route/)
    await expect(page.getByRole('heading', { name: 'Workout summary not found.' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
    await expect(page.locator('#main').getByRole('link', { name: 'Home' })).toBeVisible()

    await openApp(page, '/session')
    await expect(page).toHaveURL(/\/StrikeCaller\/.*#\/session/)
    await expect(page.getByRole('heading', { name: 'Session unavailable' })).toBeVisible()
    await expect(page.getByRole('toolbar', { name: 'Session controls' })).toHaveCount(0)

    expect(failed, `unexpected Pages asset failures:\n${failed.join('\n')}`).toEqual([])
  })

  test('exposes production document metadata and a reachable social image', async ({ page }) => {
    const pagesBase = test.info().project.use.baseURL ?? ''
    await page.goto(new URL('.', pagesBase).href)

    await expect(page).toHaveTitle('StrikeCaller — Boxing, Muay Thai & MMA Striking Coach')
    expect(await page.title()).not.toMatch(/v\d|hotfix|GitHub Pages/i)

    const description = page.locator('meta[name="description"]')
    await expect(description).toHaveCount(1)
    await expect(description).toHaveAttribute('content', /spoken/i)
    await expect(description).toHaveAttribute('content', /Boxing|Muay Thai/i)

    const canonical = page.locator('link[rel="canonical"]')
    await expect(canonical).toHaveCount(1)
    await expect(canonical).toHaveAttribute('href', 'https://manpreets2.github.io/StrikeCaller/')

    await expect(page.locator('meta[property="og:title"]')).toHaveCount(1)
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      'StrikeCaller — Boxing, Muay Thai & MMA Striking Coach',
    )
    await expect(page.locator('meta[property="og:description"]')).toHaveCount(1)
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', /spoken/i)
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'website')
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      'https://manpreets2.github.io/StrikeCaller/og-image.png',
    )

    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image')
    await expect(page.locator('meta[name="twitter:title"]')).toHaveCount(1)
    await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
      'content',
      'https://manpreets2.github.io/StrikeCaller/og-image.png',
    )

    const image = await page.request.get(new URL('og-image.png', pagesBase).href)
    expect(image.status(), 'Pages og-image.png should be HTTP 200').toBe(200)
    expect(image.headers()['content-type'] ?? '').toMatch(/image\/png/i)

    const html = await (await page.request.get(new URL('.', pagesBase).href)).text()
    expect(html).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/)
    expect((html.match(/static\.cloudflareinsights\.com\/beacon\.min\.js/g) ?? []).length).toBe(1)
    expect(html).toContain(
      `<!-- Cloudflare Web Analytics --><script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "1de936f97a9e42d29b745fce4e7cb946"}'></script><!-- End Cloudflare Web Analytics -->`,
    )

    const sw = await page.request.get(new URL('sw.js', pagesBase).href)
    expect(sw.status(), 'Pages sw.js should be HTTP 200').toBe(200)
    const swText = await sw.text()
    expect(swText).toMatch(/precacheAndRoute|precache/)
    expect(swText).not.toMatch(/url:\s*["'][^"']*cloudflareinsights/)
  })
})
