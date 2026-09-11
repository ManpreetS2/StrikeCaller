/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import packageJsonRaw from '../../package.json?raw'
import packageLockRaw from '../../package-lock.json?raw'
import indexHtml from '../../index.html?raw'
import manifestRaw from '../../public/manifest.webmanifest?raw'
import readme from '../../README.md?raw'
import { APP_VERSION } from '../data/defaults'
import { documentTitle } from '../../scripts/htmlMetadata.mjs'

describe('release version consistency', () => {
  const pkg = JSON.parse(packageJsonRaw) as { version: string }
  const lock = JSON.parse(packageLockRaw) as {
    version: string
    packages: { '': { version: string } }
  }
  const manifest = JSON.parse(manifestRaw) as { name: string; short_name: string }
  const title = documentTitle(indexHtml)

  it('keeps package, lockfile, and APP_VERSION on 1.3.3', () => {
    expect(pkg.version).toBe('1.3.3')
    expect(lock.version).toBe('1.3.3')
    expect(lock.packages[''].version).toBe('1.3.3')
    expect(APP_VERSION).toBe('1.3.3')
  })

  it('keeps the README current release aligned with package version', () => {
    expect(readme).toContain(`Current release: **${pkg.version}**`)
  })

  it('keeps the production document title free of version numbers', () => {
    expect(title).toBe('StrikeCaller — Boxing & Muay Thai Combo Coach')
    expect(title).not.toMatch(/v?\d+\.\d+/)
  })

  it('keeps the web manifest name as StrikeCaller', () => {
    expect(manifest.name).toBe('StrikeCaller')
    expect(manifest.short_name).toBe('StrikeCaller')
    expect(manifest.name).not.toMatch(/v?\d+\.\d+/)
  })
})
