#!/usr/bin/env node
/**
 * Rasterize StrikeCaller PWA icons from the brand mark geometry.
 *
 * ImageMagick SVG stroke support is unreliable, so this draws the same
 * chevron + dot as scripts/pwa-icons/icon-source.svg using primitives.
 * Maskable output scales that mark to ~72% (see icon-maskable-source.svg).
 * Requires `magick` on PATH. Generated PNGs are committed so CI does not
 * need this tool.
 *
 * Usage: node scripts/generate-pwa-icons.mjs
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')

function magick(args) {
  const result = spawnSync('magick', args, { stdio: 'inherit' })
  if (result.status !== 0) {
    console.error('ImageMagick `magick` is required to regenerate PWA icons.')
    process.exit(result.status ?? 1)
  }
}

const master = path.join(publicDir, 'icon-512.png')
const maskable = path.join(publicDir, 'icon-maskable-512.png')

magick([
  '-size',
  '512x512',
  'xc:#0a0a0b',
  '-fill',
  'none',
  '-stroke',
  '#e11d48',
  '-strokewidth',
  '32',
  '-draw',
  'stroke-linecap round stroke-linejoin round polyline 144,336 256,112 368,336',
  '-fill',
  '#e11d48',
  '-stroke',
  'none',
  '-draw',
  'circle 256,368 280,368',
  '-strip',
  `PNG32:${master}`,
])
console.log('wrote icon-512.png (512×512)')

magick([master, '-resize', '192x192', '-strip', `PNG32:${path.join(publicDir, 'icon-192.png')}`])
console.log('wrote icon-192.png (192×192)')

magick([master, '-resize', '180x180', '-strip', `PNG32:${path.join(publicDir, 'apple-touch-icon.png')}`])
console.log('wrote apple-touch-icon.png (180×180)')

magick([master, '-resize', '32x32', '-strip', `PNG32:${path.join(publicDir, 'favicon-32.png')}`])
console.log('wrote favicon-32.png (32×32)')

// Scale the mark to ~72% so Android circle/squircle masks keep it in the safe zone.
magick([
  master,
  '-resize',
  '72%',
  '-gravity',
  'center',
  '-background',
  '#0a0a0b',
  '-extent',
  '512x512',
  '-strip',
  `PNG32:${maskable}`,
])
console.log('wrote icon-maskable-512.png (512×512)')
