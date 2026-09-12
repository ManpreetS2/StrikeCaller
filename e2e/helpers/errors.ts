import type { ConsoleMessage, Page, Request, Response } from '@playwright/test'
import {
  extractUrls,
  isCloudflareInsightsUrl,
  isGoogleFontUrl,
  isIgnorableConsoleError,
  isIgnorablePageError,
  isLikelyAssetUrl,
  shouldFailAppRequest,
} from './errorPolicy'

export type ErrorWatch = {
  pageErrors: string[]
  consoleErrors: string[]
  assetFailures: string[]
  assertClean: () => void
}

function urlsFromConsole(message: ConsoleMessage): string[] {
  const urls = new Set<string>(extractUrls(message.text()))
  const locationUrl = message.location().url
  if (locationUrl && (isLikelyAssetUrl(locationUrl) || isGoogleFontUrl(locationUrl) || isCloudflareInsightsUrl(locationUrl))) {
    urls.add(locationUrl)
  }
  return [...urls]
}

/**
 * Fail on pageerror, unexpected console.error, and required same-origin asset load
 * failures. Google Fonts and Cloudflare Web Analytics hosts may be ignored. Resource-exhaustion tokens are not
 * a global pass — see `isIgnorableConsoleError` / `shouldFailAppRequest`.
 */
export function attachErrorWatch(page: Page): ErrorWatch {
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  const assetFailures: string[] = []
  let cloudflareInsightsSeen = false

  page.on('request', (request: Request) => {
    if (isCloudflareInsightsUrl(request.url())) cloudflareInsightsSeen = true
  })

  page.on('pageerror', (error) => {
    if (isIgnorablePageError(error.message)) return
    pageErrors.push(error.message)
  })

  page.on('console', (message: ConsoleMessage) => {
    if (message.type() !== 'error') return
    const text = message.text()
    const urls = urlsFromConsole(message)
    if (isIgnorableConsoleError({ text, urls, cloudflareInsightsSeen })) return
    consoleErrors.push(text)
  })

  page.on('requestfailed', (request: Request) => {
    const failureText = request.failure()?.errorText
    if (
      shouldFailAppRequest({
        url: request.url(),
        resourceType: request.resourceType(),
        failureText,
      })
    ) {
      assetFailures.push(`requestfailed ${request.resourceType()} ${failureText ?? 'unknown'} ${request.url()}`)
    }
  })

  page.on('response', (response: Response) => {
    const request = response.request()
    if (
      shouldFailAppRequest({
        url: response.url(),
        resourceType: request.resourceType(),
        status: response.status(),
      })
    ) {
      assetFailures.push(`HTTP ${response.status()} ${request.resourceType()} ${response.url()}`)
    }
  })

  return {
    pageErrors,
    consoleErrors,
    assetFailures,
    assertClean() {
      if (pageErrors.length || consoleErrors.length || assetFailures.length) {
        const details = [
          ...pageErrors.map((line) => `pageerror: ${line}`),
          ...consoleErrors.map((line) => `console.error: ${line}`),
          ...assetFailures.map((line) => `asset: ${line}`),
        ].join('\n')
        throw new Error(`Unexpected browser errors:\n${details}`)
      }
    },
  }
}
