/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import manifestRaw from '../../public/manifest.webmanifest?raw'
import indexHtml from '../../index.html?raw'

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const

function readPngDimensions(relativePath: string): { width: number; height: number } {
  const buf = readFileSync(relativePath)
  if (buf.length < 24) {
    throw new Error(`${relativePath} is too short to be a PNG`)
  }
  for (const [index, byte] of PNG_SIGNATURE.entries()) {
    if (buf[index] !== byte) {
      throw new Error(`${relativePath} is not a PNG`)
    }
  }
  if (buf.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error(`${relativePath} is missing an IHDR chunk`)
  }
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  }
}

describe('PWA install assets', () => {
  const manifest = JSON.parse(manifestRaw) as {
    name: string
    short_name: string
    description: string
    start_url: string
    scope: string
    display: string
    background_color: string
    theme_color: string
    icons: { src: string; sizes?: string; type?: string; purpose?: string }[]
  }

  it('parses and includes required install fields', () => {
    expect(manifest.name).toBe('StrikeCaller')
    expect(manifest.short_name).toBe('StrikeCaller')
    expect(manifest.description).toMatch(/Muay Thai/i)
    expect(manifest.display).toBe('standalone')
    expect(manifest.background_color).toBe('#0a0a0b')
    expect(manifest.theme_color).toBe('#0a0a0b')
    expect(manifest.start_url).toBe('./#/')
    expect(manifest.scope).toBe('./')
  })

  it('keeps start_url, scope, and icon src relative to the project base', () => {
    expect(manifest.start_url.startsWith('/')).toBe(false)
    expect(manifest.scope.startsWith('/')).toBe(false)
    expect(manifest.start_url).not.toMatch(/^https?:/)
    expect(manifest.scope).not.toMatch(/^https?:/)

    const pagesBase = 'https://manpreets2.github.io/StrikeCaller/'
    const rootBase = 'https://example.test/'
    const manifestName = 'manifest.webmanifest'

    expect(new URL(manifest.start_url, pagesBase + manifestName).href).toBe(`${pagesBase}#/`)
    expect(new URL(manifest.scope, pagesBase + manifestName).href).toBe(pagesBase)
    expect(new URL(manifest.start_url, rootBase + manifestName).href).toBe(`${rootBase}#/`)
    expect(new URL(manifest.scope, rootBase + manifestName).href).toBe(rootBase)

    for (const icon of manifest.icons) {
      expect(icon.src.startsWith('/')).toBe(false)
      expect(icon.src).not.toMatch(/^https?:/)
      expect(icon.src).not.toMatch(/\.svg(\?|$)/i)
    }
  })

  it('declares 192, 512, and maskable PNG icons with correct types', () => {
    expect(Array.isArray(manifest.icons)).toBe(true)

    const icon192 = manifest.icons.find((icon) => icon.sizes === '192x192')
    const icon512 = manifest.icons.find(
      (icon) => icon.sizes === '512x512' && (icon.purpose ?? 'any').split(/\s+/).includes('any'),
    )
    const maskable = manifest.icons.find((icon) => (icon.purpose ?? '').split(/\s+/).includes('maskable'))

    expect(icon192?.src).toMatch(/icon-192\.png$/)
    expect(icon192?.type).toBe('image/png')
    expect(icon512?.src).toMatch(/icon-512\.png$/)
    expect(icon512?.type).toBe('image/png')
    expect(maskable?.src).toMatch(/icon-maskable-512\.png$/)
    expect(maskable?.sizes).toBe('512x512')
    expect(maskable?.type).toBe('image/png')
  })

  it('commits PNG files whose IHDR dimensions match the manifest', () => {
    const expected = [
      { file: 'public/icon-192.png', width: 192, height: 192 },
      { file: 'public/icon-512.png', width: 512, height: 512 },
      { file: 'public/icon-maskable-512.png', width: 512, height: 512 },
      { file: 'public/apple-touch-icon.png', width: 180, height: 180 },
      { file: 'public/favicon-32.png', width: 32, height: 32 },
    ]

    for (const asset of expected) {
      expect(readPngDimensions(asset.file)).toEqual({ width: asset.width, height: asset.height })
    }

    for (const icon of manifest.icons) {
      const { width, height } = readPngDimensions(`public/${icon.src.replace(/^\.\//, '')}`)
      const [declaredW, declaredH] = (icon.sizes ?? '').split('x').map(Number)
      expect(width).toBe(declaredW)
      expect(height).toBe(declaredH)
    }
  })

  it('points the document at SVG + PNG favicons and a PNG apple-touch-icon', () => {
    expect(indexHtml).toMatch(/rel="icon"[^>]*href="\.\/favicon\.svg"/)
    expect(indexHtml).toMatch(/rel="icon"[^>]*href="\.\/favicon-32\.png"/)
    expect(indexHtml).toMatch(/rel="apple-touch-icon"[^>]*href="\.\/apple-touch-icon\.png"/)
    expect(indexHtml).not.toMatch(/apple-touch-icon\.svg/)
  })
})
