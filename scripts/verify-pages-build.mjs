// Verifies the generated GitHub Pages artifact (dist/) before it is uploaded.
//
// This guards against the class of bug that took the public site down: an
// index.html whose local asset URLs point at the wrong (mis-cased) Pages base,
// leaving the deployed site as a blank page. It also checks that all referenced
// local assets actually exist in the artifact and that the release title is
// present.
//
// Run locally with `npm run verify:pages` (uses the documented base fallback)
// or in CI with PAGES_BASE_URL set to GitHub's canonical Pages URL.

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { resolvePagesBase } from './pages-base.mjs'
import { readPngDimensions } from './pngDimensions.mjs'

const EXPECTED_TITLE_FRAGMENT = 'StrikeCaller v1.2.2'

const distDir = path.resolve(process.cwd(), 'dist')
const indexPath = path.join(distDir, 'index.html')

const errors = []
const fail = (message) => errors.push(message)

const expectedBase = resolvePagesBase({
  isPagesBuild: true,
  pagesBaseUrl: process.env.PAGES_BASE_URL,
})

console.log(`Verifying Pages artifact in ${distDir}`)
console.log(`Expected Pages base: ${expectedBase}`)
if (process.env.PAGES_BASE_URL) {
  console.log(`PAGES_BASE_URL: ${process.env.PAGES_BASE_URL}`)
} else {
  console.log('PAGES_BASE_URL not set — using documented local fallback')
}

if (!existsSync(indexPath)) {
  console.error(`::error::dist/index.html not found — did the Pages build run?`)
  process.exit(1)
}

const html = readFileSync(indexPath, 'utf8')

if (html.trim().length === 0) {
  fail('dist/index.html is empty')
}

if (!html.includes(EXPECTED_TITLE_FRAGMENT)) {
  fail(`index.html title does not contain "${EXPECTED_TITLE_FRAGMENT}"`)
}

// Collect every src/href reference in the document.
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1])

// Local (non-remote) asset references we must be able to resolve inside dist.
const localRefs = refs.filter(
  (ref) => !/^https?:\/\//i.test(ref) && !ref.startsWith('data:') && !ref.startsWith('#'),
)

/** Resolve a referenced URL to a path inside dist/, or null if it is remote. */
function resolveToDist(ref) {
  if (ref.startsWith(expectedBase)) {
    return path.join(distDir, ref.slice(expectedBase.length))
  }
  if (ref.startsWith('./')) {
    return path.join(distDir, ref.slice(2))
  }
  if (ref.startsWith('/')) {
    // Absolute path that does not start with the expected base — casing/base bug.
    return path.join(distDir, ref.replace(/^\/+/, ''))
  }
  return path.join(distDir, ref)
}

for (const ref of localRefs) {
  const withoutQuery = ref.split(/[?#]/)[0]
  if (withoutQuery === '') continue

  // No asset may point at the un-bundled source tree.
  if (withoutQuery.includes('/src/')) {
    fail(`asset references source tree (should be bundled): ${ref}`)
    continue
  }

  const isAbsolute = withoutQuery.startsWith('/')
  if (isAbsolute && !withoutQuery.startsWith(expectedBase)) {
    fail(
      `absolute asset path "${ref}" does not use expected Pages base "${expectedBase}" ` +
        `(likely wrong repository-path casing)`,
    )
  }

  const target = resolveToDist(withoutQuery)
  if (!existsSync(target)) {
    fail(`referenced local asset does not exist in dist: ${ref} -> ${target}`)
  }
}

// The primary JS/CSS bundles must use the exact expected base (absolute paths
// emitted by Vite). Confirm at least one JS and one CSS bundle is present and
// correctly prefixed.
const jsRefs = localRefs.filter((r) => r.split(/[?#]/)[0].endsWith('.js'))
const cssRefs = localRefs.filter((r) => r.split(/[?#]/)[0].endsWith('.css'))

if (jsRefs.length === 0) fail('no local JavaScript bundle referenced in index.html')
if (cssRefs.length === 0) fail('no local CSS bundle referenced in index.html')

for (const ref of [...jsRefs, ...cssRefs]) {
  if (!ref.startsWith(expectedBase)) {
    fail(`bundle "${ref}" is not prefixed with expected base "${expectedBase}"`)
  }
}

// Required PWA / icon files must be present in the artifact.
const requiredFiles = [
  'index.html',
  'favicon.svg',
  'favicon-32.png',
  'manifest.webmanifest',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
]
for (const file of requiredFiles) {
  if (!existsSync(path.join(distDir, file))) {
    fail(`required file missing from dist: ${file}`)
  }
}

if (!html.includes('apple-touch-icon.png')) {
  fail('index.html does not reference apple-touch-icon.png')
}
if (html.includes('apple-touch-icon.svg')) {
  fail('index.html still references the SVG apple-touch-icon (use PNG)')
}

const manifestPath = path.join(distDir, 'manifest.webmanifest')
if (existsSync(manifestPath)) {
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    fail(`manifest.webmanifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
    manifest = null
  }

  if (manifest && typeof manifest === 'object') {
    for (const field of ['name', 'short_name', 'start_url', 'scope', 'display', 'background_color', 'theme_color', 'icons']) {
      if (manifest[field] == null || manifest[field] === '') {
        fail(`manifest is missing required field: ${field}`)
      }
    }

    if (typeof manifest.start_url === 'string' && manifest.start_url.startsWith('/')) {
      fail(`manifest start_url "${manifest.start_url}" is root-absolute (must stay relative for Pages)`)
    }
    if (typeof manifest.scope === 'string' && manifest.scope.startsWith('/')) {
      fail(`manifest scope "${manifest.scope}" is root-absolute (must stay relative for Pages)`)
    }

    const icons = Array.isArray(manifest.icons) ? manifest.icons : []
    if (icons.length === 0) {
      fail('manifest has no icons')
    }

    const pngIcons = []
    for (const icon of icons) {
      if (!icon || typeof icon.src !== 'string') {
        fail('manifest icon is missing src')
        continue
      }
      if (icon.src.startsWith('/') || /^https?:/i.test(icon.src)) {
        fail(`manifest icon src "${icon.src}" must be a relative path`)
      }
      if (/\.svg(\?|$)/i.test(icon.src)) {
        fail(`manifest still lists an SVG icon (${icon.src}); install icons must be PNG`)
      }

      const iconFile = path.join(distDir, icon.src.replace(/^\.\//, ''))
      if (!existsSync(iconFile)) {
        fail(`manifest icon does not exist in dist: ${icon.src}`)
        continue
      }

      if (icon.type === 'image/png' || /\.png(\?|$)/i.test(icon.src)) {
        try {
          const { width, height } = readPngDimensions(iconFile)
          pngIcons.push({ ...icon, width, height, file: iconFile })
          if (typeof icon.sizes === 'string' && /^\d+x\d+$/.test(icon.sizes)) {
            const [declaredW, declaredH] = icon.sizes.split('x').map(Number)
            if (width !== declaredW || height !== declaredH) {
              fail(
                `manifest icon ${icon.src} declares ${icon.sizes} but PNG is ${width}×${height}`,
              )
            }
          }
        } catch (error) {
          fail(`could not read PNG dimensions for ${icon.src}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    }

    const has192 = pngIcons.some((icon) => icon.sizes === '192x192' && icon.width === 192 && icon.height === 192)
    const has512 = pngIcons.some(
      (icon) =>
        icon.sizes === '512x512' &&
        icon.width === 512 &&
        icon.height === 512 &&
        String(icon.purpose ?? 'any').split(/\s+/).includes('any'),
    )
    const hasMaskable = pngIcons.some(
      (icon) =>
        icon.sizes === '512x512' &&
        icon.width === 512 &&
        icon.height === 512 &&
        String(icon.purpose ?? '').split(/\s+/).includes('maskable'),
    )
    if (!has192) fail('manifest is missing a 192×192 PNG icon')
    if (!has512) fail('manifest is missing a 512×512 PNG icon with purpose "any"')
    if (!hasMaskable) fail('manifest is missing a 512×512 maskable PNG icon')
  }
}

const appleTouchPath = path.join(distDir, 'apple-touch-icon.png')
if (existsSync(appleTouchPath)) {
  try {
    const { width, height } = readPngDimensions(appleTouchPath)
    if (width !== 180 || height !== 180) {
      fail(`apple-touch-icon.png is ${width}×${height}, expected 180×180`)
    }
  } catch (error) {
    fail(`could not read apple-touch-icon.png: ${error instanceof Error ? error.message : String(error)}`)
  }
}

if (errors.length > 0) {
  console.error('\nPages artifact verification FAILED:')
  for (const err of errors) {
    console.error(`::error::${err}`)
  }
  process.exit(1)
}

console.log('\nPages artifact verification passed:')
console.log(`  - index.html present and non-empty`)
console.log(`  - title contains "${EXPECTED_TITLE_FRAGMENT}"`)
console.log(`  - ${jsRefs.length} JS and ${cssRefs.length} CSS bundle(s) prefixed with ${expectedBase}`)
console.log(`  - all local asset references exist in dist`)
console.log(`  - favicon, manifest, PNG install icons, and apple-touch-icon present`)
console.log(`  - manifest JSON parsed; 192/512/maskable PNG dimensions match`)
