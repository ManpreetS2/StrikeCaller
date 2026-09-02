import { describe, expect, it } from 'vitest'
import {
  extractUrls,
  isGoogleFontUrl,
  isIgnorableConsoleError,
  isStrikeCallerOwnedUrl,
  shouldFailAppRequest,
} from '../../e2e/helpers/errorPolicy'

describe('E2E console / request failure policy', () => {
  it('allows Google Fonts console noise, including exhaustion tokens on that host', () => {
    const fontUrl = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans'
    expect(isGoogleFontUrl(fontUrl)).toBe(true)
    expect(
      isIgnorableConsoleError({
        text: `Failed to load resource: net::ERR_NO_BUFFER_SPACE`,
        urls: [fontUrl],
      }),
    ).toBe(true)
    expect(
      isIgnorableConsoleError({
        text: `GET ${fontUrl} net::ERR_FAILED`,
        urls: extractUrls(`GET ${fontUrl} net::ERR_FAILED`),
      }),
    ).toBe(true)
  })

  it('does not allow the same Chromium exhaustion token on a StrikeCaller JS chunk', () => {
    const appJs = 'http://127.0.0.1:4173/assets/index-C__6zYoy.js'
    expect(isStrikeCallerOwnedUrl(appJs)).toBe(true)
    expect(
      isIgnorableConsoleError({
        text: 'Failed to load resource: net::ERR_NO_BUFFER_SPACE',
        urls: [appJs],
      }),
    ).toBe(false)
    expect(
      isIgnorableConsoleError({
        text: `Failed to load resource: net::ERR_INSUFFICIENT_RESOURCES ${appJs}`,
        urls: extractUrls(`Failed to load resource: net::ERR_INSUFFICIENT_RESOURCES ${appJs}`),
      }),
    ).toBe(false)
    expect(
      shouldFailAppRequest({
        url: appJs,
        resourceType: 'script',
        failureText: 'net::ERR_NO_BUFFER_SPACE',
      }),
    ).toBe(true)
  })

  it('does not allow Pages-base StrikeCaller CSS or manifest failures', () => {
    const css = 'http://127.0.0.1:4174/StrikeCaller/assets/index-C__6zYoy.css'
    const manifest = 'http://127.0.0.1:4174/StrikeCaller/manifest.webmanifest'
    expect(
      shouldFailAppRequest({ url: css, resourceType: 'stylesheet', status: 404 }),
    ).toBe(true)
    expect(
      shouldFailAppRequest({ url: manifest, resourceType: 'manifest', status: 404 }),
    ).toBe(true)
    expect(
      isIgnorableConsoleError({
        text: `Failed to load resource: net::ERR_INSUFFICIENT_RESOURCES`,
        urls: [css],
      }),
    ).toBe(false)
  })

  it('does not treat an exhaustion token with no URL as proven-external', () => {
    expect(
      isIgnorableConsoleError({
        text: 'net::ERR_NO_BUFFER_SPACE',
        urls: [],
      }),
    ).toBe(false)
  })

  it('defers URL-less Chromium "Failed to load resource" lines to requestfailed', () => {
    expect(
      isIgnorableConsoleError({
        text: 'Failed to load resource: net::ERR_NO_BUFFER_SPACE',
        urls: [],
      }),
    ).toBe(true)
  })

  it('does not fail intentionally aborted requests or third-party fonts', () => {
    expect(
      shouldFailAppRequest({
        url: 'http://127.0.0.1:4173/assets/index-C__6zYoy.js',
        resourceType: 'script',
        failureText: 'net::ERR_ABORTED',
      }),
    ).toBe(false)
    expect(
      shouldFailAppRequest({
        url: 'https://fonts.gstatic.com/s/ibmplexsans/v1.woff2',
        resourceType: 'font',
        failureText: 'net::ERR_NO_BUFFER_SPACE',
      }),
    ).toBe(false)
  })
})
