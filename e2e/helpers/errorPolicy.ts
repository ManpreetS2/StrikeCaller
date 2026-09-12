/**
 * Pure E2E failure-policy helpers (no Playwright imports).
 *
 * Resource-exhaustion tokens are never sufficient on their own. A StrikeCaller-owned
 * URL in the same event always fails the test.
 */

export const E2E_APP_ORIGINS = [
  'http://127.0.0.1:4173',
  'http://127.0.0.1:4174',
  'http://localhost:4173',
  'http://localhost:4174',
] as const

const GOOGLE_FONT_HOST = /(^|\.)((fonts\.googleapis\.com)|(fonts\.gstatic\.com))$/i
const GOOGLE_FONT_IN_TEXT = /fonts\.googleapis\.com|fonts\.gstatic\.com/i
const CLOUDFLARE_INSIGHTS_HOST = /(^|\.)cloudflareinsights\.com$/i
const CLOUDFLARE_INSIGHTS_IN_TEXT = /cloudflareinsights\.com/i
const EXHAUSTION_TOKEN = /net::ERR_NO_BUFFER_SPACE|net::ERR_INSUFFICIENT_RESOURCES/i
const FAILED_RESOURCE_PREFIX = /^Failed to load resource:\s*net::ERR_/i
const APP_ASSET_IN_TEXT = /\/StrikeCaller\/|\/assets\/index-|manifest\.webmanifest/i
const REQUIRED_PATH = /\.(js|mjs|css|webmanifest|html|svg|ico|png)(\?|$)/i
const ABORTED = /ERR_ABORTED|NS_BINDING_ABORTED|NS_BINDING_CANCELLED/i

export function extractUrls(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^\s)'"<>]+/gi)].map((match) => match[0].replace(/[.,;:]+$/, ''))
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

export function isGoogleFontUrl(url: string): boolean {
  const host = hostnameOf(url)
  if (host && GOOGLE_FONT_HOST.test(host)) return true
  return GOOGLE_FONT_IN_TEXT.test(url)
}

export function isCloudflareInsightsUrl(url: string): boolean {
  const host = hostnameOf(url)
  if (host && CLOUDFLARE_INSIGHTS_HOST.test(host)) return true
  return CLOUDFLARE_INSIGHTS_IN_TEXT.test(url)
}

export function isStrikeCallerOwnedUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    const origin = `${parsed.protocol}//${parsed.host}`
    return (E2E_APP_ORIGINS as readonly string[]).includes(origin)
  } catch {
    return false
  }
}

export function isLikelyAssetUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname
    return REQUIRED_PATH.test(path) || /\/assets\//i.test(path)
  } catch {
    return false
  }
}

export function looksLikeStrikeCallerAssetInText(text: string): boolean {
  return APP_ASSET_IN_TEXT.test(text)
}

/** True for `http://127.0.0.1:4173` with no asset path (CORS messages include the page origin). */
export function isAppOriginOnlyUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return isStrikeCallerOwnedUrl(url) && (parsed.pathname === '' || parsed.pathname === '/') && parsed.search === ''
  } catch {
    return false
  }
}

const REQUIRED_RESOURCE_TYPES = new Set(['document', 'script', 'stylesheet', 'manifest'])

export function isRequiredAppRequest(url: string, resourceType: string): boolean {
  if (!isStrikeCallerOwnedUrl(url)) return false
  if (REQUIRED_RESOURCE_TYPES.has(resourceType)) return true
  return isLikelyAssetUrl(url)
}

export function isIgnorableAbortedRequest(errorText: string | undefined): boolean {
  return Boolean(errorText && ABORTED.test(errorText))
}

export function isIgnorablePageError(text: string): boolean {
  return CLOUDFLARE_INSIGHTS_IN_TEXT.test(text)
}

/**
 * WebKit often reports Cloudflare RUM CORS as
 * `Origin http://127.0.0.1:4173 is not allowed by Access-Control-Allow-Origin`
 * with no Insights URL in the message. Only ignorable when Insights was requested
 * and no StrikeCaller asset URL is present.
 */
export function isOriginOnlyCorsConsoleError(input: ConsoleErrorInput): boolean {
  if (!/Access-Control-Allow-Origin|access control checks/i.test(input.text)) return false
  if (looksLikeStrikeCallerAssetInText(input.text)) return false
  const urls = input.urls.filter(Boolean)
  if (urls.some((url) => isStrikeCallerOwnedUrl(url) && !isAppOriginOnlyUrl(url))) return false
  return true
}

export type ConsoleErrorInput = {
  text: string
  urls: string[]
  /** True after this page requested Cloudflare Insights (beacon or RUM). */
  cloudflareInsightsSeen?: boolean
}

/**
 * Return true only for proven third-party / deferred-network console noise.
 *
 * Same-origin StrikeCaller asset URLs are never ignorable, even when the Chromium
 * token is ERR_NO_BUFFER_SPACE or ERR_INSUFFICIENT_RESOURCES. Bare page origins
 * in CORS messages (for example `http://127.0.0.1:4173`) are not treated as assets.
 *
 * A `Failed to load resource: net::ERR_*` line with no URL is deferred to the
 * `requestfailed` / HTTP-status watcher, which does have the URL.
 */
export function isIgnorableConsoleError(input: ConsoleErrorInput): boolean {
  const urls = input.urls.filter(Boolean)
  if (
    urls.some((url) => isStrikeCallerOwnedUrl(url) && !isAppOriginOnlyUrl(url)) ||
    looksLikeStrikeCallerAssetInText(input.text)
  ) {
    return false
  }

  if (urls.some(isGoogleFontUrl) || GOOGLE_FONT_IN_TEXT.test(input.text)) {
    return true
  }

  if (urls.some(isCloudflareInsightsUrl) || CLOUDFLARE_INSIGHTS_IN_TEXT.test(input.text)) {
    return true
  }

  if (input.cloudflareInsightsSeen && isOriginOnlyCorsConsoleError(input)) {
    return true
  }

  const exhaustion = EXHAUSTION_TOKEN.test(input.text)
  if (exhaustion && urls.length > 0 && urls.every((url) => !isStrikeCallerOwnedUrl(url))) {
    return true
  }

  if (FAILED_RESOURCE_PREFIX.test(input.text.trim()) && urls.length === 0) {
    return true
  }

  return false
}

export type AppRequestFailureInput = {
  url: string
  resourceType: string
  failureText?: string
  status?: number
}

/** True when a required same-origin StrikeCaller asset failed to load. */
export function shouldFailAppRequest(input: AppRequestFailureInput): boolean {
  if (!isRequiredAppRequest(input.url, input.resourceType)) return false
  if (input.failureText && isIgnorableAbortedRequest(input.failureText)) return false
  if (input.failureText) return true
  if (input.status != null && input.status >= 400) return true
  return false
}
