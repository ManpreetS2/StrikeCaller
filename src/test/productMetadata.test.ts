/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import indexHtml from '../../index.html?raw'
import manifestRaw from '../../public/manifest.webmanifest?raw'
import { documentTitle, metaContents, uniqueLink, uniqueMeta } from '../../scripts/htmlMetadata.mjs'
import { pngHasAlpha, readPngDimensions } from '../../scripts/pngDimensions.mjs'

const PRODUCTION_SITE_URL = 'https://manpreets2.github.io/StrikeCaller/'
const PRODUCTION_OG_IMAGE_URL = `${PRODUCTION_SITE_URL}og-image.png`
const DOCUMENT_TITLE = 'StrikeCaller — Boxing & Muay Thai Combo Coach'

describe('production product metadata', () => {
  const title = documentTitle(indexHtml)
  const description = uniqueMeta(indexHtml, 'name', 'description')
  const canonical = uniqueLink(indexHtml, 'canonical')
  const manifest = JSON.parse(manifestRaw) as { name: string; short_name: string; description: string }

  it('uses a clean production title without version or hotfix wording', () => {
    expect(title).toBe(DOCUMENT_TITLE)
    expect(title).toContain('StrikeCaller')
    expect(title).not.toMatch(/v\d/)
    expect(title).not.toMatch(/hotfix/i)
    expect(title).not.toMatch(/GitHub Pages/i)
    expect(title).not.toMatch(/dev|test/i)
  })

  it('includes a concise product description', () => {
    expect(description.ok).toBe(true)
    expect(description.content).toMatch(/spoken/i)
    expect(description.content).toMatch(/boxing/i)
    expect(description.content).toMatch(/Muay Thai/i)
    expect(description.content).toMatch(/pacing/i)
    expect(description.content).toMatch(/drill|workout/i)
    expect(description.content).not.toMatch(/#1|AI-powered|professional fight trainer/i)
  })

  it('uses the exact case-sensitive GitHub Pages canonical URL', () => {
    expect(canonical.ok).toBe(true)
    expect(canonical.href).toBe(PRODUCTION_SITE_URL)
    expect(canonical.href).not.toMatch(/localhost|127\.0\.0\.1/i)
    expect(canonical.href).not.toContain('/strikecaller/')
    expect(canonical.href).not.toContain('#')
  })

  it('does not load fonts from Google at runtime', () => {
    expect(indexHtml).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/)
  })

  it('declares required Open Graph tags once', () => {
    expect(uniqueMeta(indexHtml, 'property', 'og:title')).toEqual(
      expect.objectContaining({ ok: true, content: DOCUMENT_TITLE }),
    )
    expect(uniqueMeta(indexHtml, 'property', 'og:description').ok).toBe(true)
    expect(uniqueMeta(indexHtml, 'property', 'og:description').content).toBe(description.content)
    expect(uniqueMeta(indexHtml, 'property', 'og:type')).toEqual(
      expect.objectContaining({ ok: true, content: 'website' }),
    )
    expect(uniqueMeta(indexHtml, 'property', 'og:site_name')).toEqual(
      expect.objectContaining({ ok: true, content: 'StrikeCaller' }),
    )
    expect(uniqueMeta(indexHtml, 'property', 'og:image')).toEqual(
      expect.objectContaining({ ok: true, content: PRODUCTION_OG_IMAGE_URL }),
    )
  })

  it('declares required Twitter large-image tags once', () => {
    expect(uniqueMeta(indexHtml, 'name', 'twitter:card')).toEqual(
      expect.objectContaining({ ok: true, content: 'summary_large_image' }),
    )
    expect(uniqueMeta(indexHtml, 'name', 'twitter:title')).toEqual(
      expect.objectContaining({ ok: true, content: DOCUMENT_TITLE }),
    )
    expect(uniqueMeta(indexHtml, 'name', 'twitter:description')).toEqual(
      expect.objectContaining({ ok: true, content: description.content }),
    )
    expect(uniqueMeta(indexHtml, 'name', 'twitter:image')).toEqual(
      expect.objectContaining({ ok: true, content: PRODUCTION_OG_IMAGE_URL }),
    )
    expect(metaContents(indexHtml, 'name', 'twitter:site')).toEqual([])
  })

  it('does not duplicate conflicting metadata tags', () => {
    for (const [key, value] of [
      ['name', 'description'],
      ['property', 'og:title'],
      ['property', 'og:description'],
      ['property', 'og:type'],
      ['property', 'og:site_name'],
      ['property', 'og:image'],
      ['name', 'twitter:card'],
      ['name', 'twitter:title'],
      ['name', 'twitter:description'],
      ['name', 'twitter:image'],
    ] as const) {
      expect(metaContents(indexHtml, key, value), `${key}=${value}`).toHaveLength(1)
    }
    expect(canonical.count).toBe(1)
    expect([...indexHtml.matchAll(/<title>/gi)]).toHaveLength(1)
  })

  it('keeps social image metadata on the production Pages host, not a root-relative path', () => {
    const image = uniqueMeta(indexHtml, 'property', 'og:image').content
    expect(image).toBe(PRODUCTION_OG_IMAGE_URL)
    expect(image).toMatch(/^https:\/\//)
    expect(image).not.toBe('/og-image.png')
    expect(image).not.toMatch(/\/strikecaller\//)
    expect(image).not.toMatch(/localhost|127\.0\.0\.1/i)
  })

  it('commits an opaque 1200×630 RGB social image', () => {
    const info = readPngDimensions('public/og-image.png')
    expect(info.width).toBe(1200)
    expect(info.height).toBe(630)
    expect(info.fileSize).toBeGreaterThan(0)
    expect(info.bitDepth).toBe(8)
    expect(info.colorType).toBe(2)
    expect(pngHasAlpha(info)).toBe(false)
  })

  it('keeps installed-app identity as StrikeCaller', () => {
    expect(manifest.name).toBe('StrikeCaller')
    expect(manifest.short_name).toBe('StrikeCaller')
    expect(manifest.description).toMatch(/StrikeCaller|combo coach|Muay Thai/i)
    expect(manifest.name).not.toMatch(/hotfix|v1\.2/i)
  })

  it('does not put session, history, or stats into global meta tags', () => {
    const blob = [
      title,
      description.content,
      uniqueMeta(indexHtml, 'property', 'og:title').content,
      uniqueMeta(indexHtml, 'property', 'og:description').content,
      uniqueMeta(indexHtml, 'name', 'twitter:title').content,
      uniqueMeta(indexHtml, 'name', 'twitter:description').content,
    ].join('\n')
    expect(blob).not.toMatch(/session-\d+/i)
    expect(blob).not.toMatch(/workout duration|combinationsCompleted|history/i)
  })

  it('does not keep verify-live dependent on the old StrikeCaller v marker', () => {
    const workflow = readFileSync('.github/workflows/ci.yml', 'utf8')
    expect(workflow).not.toMatch(/grep -qi "StrikeCaller v"/)
    expect(workflow).toMatch(/<title>/)
    expect(workflow).toMatch(/StrikeCaller/)
    expect(workflow).toMatch(/id="root"/)
    expect(workflow).toMatch(/There isn't a GitHub Pages site here/)
  })
})
