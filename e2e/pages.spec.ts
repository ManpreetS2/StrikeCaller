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

    const manifest = await page.request.get(
      new URL('manifest.webmanifest', test.info().project.use.baseURL ?? '').href,
    )
    expect(manifest.status(), 'manifest.webmanifest should be HTTP 200').toBe(200)

    await openApp(page)
    await expect(page).toHaveURL(/\/StrikeCaller\/(?:index\.html)?#\//)
    await expect(page.getByRole('heading', { name: 'StrikeCaller' })).toBeVisible()

    await openApp(page, '/stats')
    await expect(page).toHaveURL(/\/StrikeCaller\/.*#\/stats/)
    await expect(page.getByRole('heading', { name: 'Training Stats' })).toBeVisible()

    await goToNav(page, 'Settings')
    await expect(page).toHaveURL(/#\/settings/)
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

    expect(failed, `unexpected Pages asset failures:\n${failed.join('\n')}`).toEqual([])
  })
})
