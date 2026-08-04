import { describe, expect, it } from 'vitest'
import {
  resolvePagesBase,
  normalizePagesBasePath,
  LOCAL_PAGES_BASE_FALLBACK,
} from '../../scripts/pages-base.mjs'

describe('GitHub Pages base-path normalization', () => {
  it('derives a lowercase project path from PAGES_BASE_URL', () => {
    expect(
      resolvePagesBase({
        isPagesBuild: true,
        pagesBaseUrl: 'https://example.github.io/strikecaller/',
      }),
    ).toBe('/strikecaller/')
  })

  it('preserves capitalized project path casing exactly', () => {
    expect(
      resolvePagesBase({
        isPagesBuild: true,
        pagesBaseUrl: 'https://example.github.io/StrikeCaller/',
      }),
    ).toBe('/StrikeCaller/')
  })

  it('collapses a root-site Pages URL to "/"', () => {
    expect(
      resolvePagesBase({
        isPagesBuild: true,
        pagesBaseUrl: 'https://example.github.io/',
      }),
    ).toBe('/')
  })

  it('adds a trailing slash when the URL path lacks one', () => {
    expect(
      resolvePagesBase({
        isPagesBuild: true,
        pagesBaseUrl: 'https://example.github.io/StrikeCaller',
      }),
    ).toBe('/StrikeCaller/')
  })

  it('uses the documented local fallback when PAGES_BASE_URL is absent', () => {
    expect(resolvePagesBase({ isPagesBuild: true })).toBe(LOCAL_PAGES_BASE_FALLBACK)
    expect(resolvePagesBase({ isPagesBuild: true, pagesBaseUrl: '' })).toBe(
      LOCAL_PAGES_BASE_FALLBACK,
    )
  })

  it('returns "/" for non-Pages builds regardless of PAGES_BASE_URL', () => {
    expect(resolvePagesBase({ isPagesBuild: false })).toBe('/')
    expect(
      resolvePagesBase({
        isPagesBuild: false,
        pagesBaseUrl: 'https://example.github.io/StrikeCaller/',
      }),
    ).toBe('/')
  })

  it('always yields exactly one leading and one trailing slash', () => {
    const cases = [
      'StrikeCaller',
      '/StrikeCaller',
      'StrikeCaller/',
      '//StrikeCaller//',
      'https://example.github.io/StrikeCaller/',
    ]
    for (const value of cases) {
      const base = /^https?:/.test(value)
        ? resolvePagesBase({ isPagesBuild: true, pagesBaseUrl: value })
        : normalizePagesBasePath(value)
      expect(base.startsWith('/')).toBe(true)
      expect(base.endsWith('/')).toBe(true)
      expect(base).not.toMatch(/\/{2,}/)
    }
  })

  it('normalizePagesBasePath collapses empty/root inputs to "/"', () => {
    expect(normalizePagesBasePath('')).toBe('/')
    expect(normalizePagesBasePath('/')).toBe('/')
    expect(normalizePagesBasePath(null)).toBe('/')
    expect(normalizePagesBasePath(undefined)).toBe('/')
  })

  it('documented local fallback matches the canonical repository casing', () => {
    expect(LOCAL_PAGES_BASE_FALLBACK).toBe('/StrikeCaller/')
  })
})
