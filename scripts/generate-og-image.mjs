#!/usr/bin/env node
/**
 * Rasterize the StrikeCaller Open Graph image from brand-mark geometry
 * and a committed vector stroke alphabet (no system fonts, no downloads).
 *
 * Also writes scripts/pwa-icons/og-source.svg so the PNG can be regenerated
 * from the same paths. Output is RGB (no alpha), 1200×630.
 *
 * Usage: node scripts/generate-og-image.mjs
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WIDTH = 1200
const HEIGHT = 630
const SCALE = 2
const BG = [10, 10, 11]
const ACCENT = [225, 29, 72]
const TITLE = [244, 244, 245]
const SUBTITLE = [168, 168, 176]

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pngPath = path.join(rootDir, 'public', 'og-image.png')
const svgPath = path.join(rootDir, 'scripts', 'pwa-icons', 'og-source.svg')

/**
 * Single-stroke glyphs. y=0 cap top, y=7 baseline, y=9 descender.
 * Units are ems; advance includes right side bearing.
 */
const GLYPHS = {
  ' ': { adv: 3.2, strokes: [] },
  '&': {
    adv: 6.2,
    strokes: [
      [
        [4.8, 1.2],
        [2.2, 1.2],
        [1.2, 2.2],
        [1.2, 3.4],
        [4.6, 6.2],
        [4.6, 7.4],
        [3.2, 8.4],
        [1.4, 7.6],
      ],
      [
        [1.6, 6.8],
        [5.0, 1.6],
      ],
    ],
  },
  S: {
    adv: 6.4,
    strokes: [
      [
        [5.2, 1.4],
        [3.8, 0.6],
        [2.0, 0.6],
        [0.8, 1.6],
        [0.8, 2.8],
        [2.0, 3.6],
        [4.2, 4.2],
        [5.4, 5.2],
        [5.4, 6.2],
        [4.2, 7.2],
        [2.2, 7.4],
        [0.8, 6.6],
      ],
    ],
  },
  C: {
    adv: 6.6,
    strokes: [
      [
        [5.4, 1.6],
        [4.0, 0.6],
        [2.2, 0.6],
        [0.8, 1.8],
        [0.8, 5.8],
        [2.2, 7.2],
        [4.0, 7.4],
        [5.4, 6.4],
      ],
    ],
  },
  B: {
    adv: 6.4,
    strokes: [
      [
        [1.0, 0.6],
        [1.0, 7.4],
      ],
      [
        [1.0, 0.6],
        [4.0, 0.6],
        [5.2, 1.4],
        [5.2, 2.8],
        [4.0, 3.6],
        [1.0, 3.6],
      ],
      [
        [1.0, 3.6],
        [4.2, 3.6],
        [5.4, 4.6],
        [5.4, 6.4],
        [4.0, 7.4],
        [1.0, 7.4],
      ],
    ],
  },
  M: {
    adv: 7.4,
    strokes: [
      [
        [0.8, 7.4],
        [0.8, 0.6],
        [3.6, 5.0],
        [6.4, 0.6],
        [6.4, 7.4],
      ],
    ],
  },
  T: {
    adv: 6.4,
    strokes: [
      [
        [0.6, 0.6],
        [5.6, 0.6],
      ],
      [
        [3.1, 0.6],
        [3.1, 7.4],
      ],
    ],
  },
  a: {
    adv: 5.8,
    strokes: [
      [
        [4.6, 2.6],
        [4.6, 7.4],
      ],
      [
        [4.6, 4.0],
        [3.4, 2.8],
        [1.8, 2.6],
        [0.8, 3.6],
        [0.8, 6.2],
        [1.8, 7.4],
        [3.4, 7.4],
        [4.6, 6.2],
      ],
    ],
  },
  b: {
    adv: 5.8,
    strokes: [
      [
        [1.0, 0.4],
        [1.0, 7.4],
      ],
      [
        [1.0, 3.2],
        [2.6, 2.6],
        [4.0, 3.2],
        [4.8, 4.6],
        [4.8, 6.2],
        [3.8, 7.4],
        [2.2, 7.4],
        [1.0, 6.4],
      ],
    ],
  },
  c: {
    adv: 5.6,
    strokes: [
      [
        [4.6, 3.2],
        [3.4, 2.6],
        [1.8, 2.6],
        [0.8, 3.6],
        [0.8, 6.4],
        [1.8, 7.4],
        [3.4, 7.4],
        [4.6, 6.6],
      ],
    ],
  },
  e: {
    adv: 5.8,
    strokes: [
      [
        [0.8, 5.0],
        [4.8, 5.0],
        [4.8, 3.6],
        [3.6, 2.6],
        [1.8, 2.6],
        [0.8, 3.6],
        [0.8, 6.4],
        [1.8, 7.4],
        [3.6, 7.4],
        [4.6, 6.6],
      ],
    ],
  },
  g: {
    adv: 5.8,
    strokes: [
      [
        [4.6, 2.8],
        [3.4, 2.6],
        [1.8, 2.6],
        [0.8, 3.6],
        [0.8, 5.8],
        [1.8, 6.8],
        [3.4, 6.8],
        [4.6, 5.8],
        [4.6, 2.8],
        [4.6, 8.2],
        [3.4, 9.2],
        [1.6, 9.0],
      ],
    ],
  },
  h: {
    adv: 5.8,
    strokes: [
      [
        [1.0, 0.4],
        [1.0, 7.4],
      ],
      [
        [1.0, 3.4],
        [2.6, 2.6],
        [4.2, 3.2],
        [4.8, 4.4],
        [4.8, 7.4],
      ],
    ],
  },
  i: {
    adv: 2.8,
    strokes: [
      [
        [1.3, 2.6],
        [1.3, 7.4],
      ],
      [
        [1.3, 0.8],
        [1.3, 1.4],
      ],
    ],
  },
  k: {
    adv: 5.8,
    strokes: [
      [
        [1.0, 0.4],
        [1.0, 7.4],
      ],
      [
        [1.0, 5.0],
        [4.6, 2.6],
      ],
      [
        [2.2, 4.4],
        [4.8, 7.4],
      ],
    ],
  },
  l: {
    adv: 2.8,
    strokes: [
      [
        [1.3, 0.4],
        [1.3, 7.4],
      ],
    ],
  },
  m: {
    adv: 8.2,
    strokes: [
      [
        [1.0, 7.4],
        [1.0, 2.6],
      ],
      [
        [1.0, 3.4],
        [2.4, 2.6],
        [3.6, 3.4],
        [3.6, 7.4],
      ],
      [
        [3.6, 3.4],
        [5.0, 2.6],
        [6.4, 3.4],
        [6.4, 7.4],
      ],
    ],
  },
  n: {
    adv: 5.8,
    strokes: [
      [
        [1.0, 7.4],
        [1.0, 2.6],
      ],
      [
        [1.0, 3.4],
        [2.6, 2.6],
        [4.2, 3.2],
        [4.8, 4.4],
        [4.8, 7.4],
      ],
    ],
  },
  o: {
    adv: 6.0,
    strokes: [
      [
        [3.0, 2.6],
        [1.6, 2.8],
        [0.8, 4.0],
        [0.8, 6.0],
        [1.6, 7.2],
        [3.0, 7.4],
        [4.4, 7.2],
        [5.2, 6.0],
        [5.2, 4.0],
        [4.4, 2.8],
        [3.0, 2.6],
      ],
    ],
  },
  r: {
    adv: 4.6,
    strokes: [
      [
        [1.0, 7.4],
        [1.0, 2.6],
      ],
      [
        [1.0, 3.4],
        [2.4, 2.6],
        [3.8, 2.8],
      ],
    ],
  },
  t: {
    adv: 4.4,
    strokes: [
      [
        [2.0, 0.4],
        [2.0, 7.0],
        [2.6, 7.4],
        [3.6, 7.2],
      ],
      [
        [0.6, 2.2],
        [3.6, 2.2],
      ],
    ],
  },
  u: {
    adv: 5.8,
    strokes: [
      [
        [1.0, 2.6],
        [1.0, 6.0],
        [1.8, 7.2],
        [3.4, 7.4],
        [4.8, 6.4],
        [4.8, 2.6],
      ],
    ],
  },
  x: {
    adv: 5.6,
    strokes: [
      [
        [0.8, 2.6],
        [4.8, 7.4],
      ],
      [
        [4.8, 2.6],
        [0.8, 7.4],
      ],
    ],
  },
  y: {
    adv: 5.8,
    strokes: [
      [
        [0.8, 2.6],
        [0.8, 6.0],
        [1.8, 7.2],
        [3.4, 7.4],
        [4.8, 6.4],
        [4.8, 2.6],
      ],
      [
        [4.8, 7.4],
        [4.8, 8.4],
        [3.6, 9.2],
        [1.8, 9.0],
      ],
    ],
  },
}

function crc32(data) {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    c ^= data[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crcInput = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(crcInput))
  return Buffer.concat([len, typeBuf, data, crc])
}

function encodePng(width, height, rgb) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const stride = width * 3
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    const dest = y * (stride + 1)
    raw[dest] = 0
    rgb.copy(raw, dest + 1, y * stride, (y + 1) * stride)
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function fillBackground(rgb, width, height, color) {
  for (let i = 0; i < width * height; i++) {
    rgb[i * 3] = color[0]
    rgb[i * 3 + 1] = color[1]
    rgb[i * 3 + 2] = color[2]
  }
}

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(px - ax, py - ay)
  let t = ((px - ax) * dx + (py - ay) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function stampCoverage(rgb, width, height, x0, y0, x1, y1, coverageAt) {
  const minX = Math.max(0, Math.floor(x0))
  const minY = Math.max(0, Math.floor(y0))
  const maxX = Math.min(width - 1, Math.ceil(x1))
  const maxY = Math.min(height - 1, Math.ceil(y1))
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const cover = coverageAt(x + 0.5, y + 0.5)
      if (cover <= 0) continue
      const a = cover > 1 ? 1 : cover
      const i = (y * width + x) * 3
      rgb[i] = Math.round(rgb[i] * (1 - a) + coverageAt.color[0] * a)
      rgb[i + 1] = Math.round(rgb[i + 1] * (1 - a) + coverageAt.color[1] * a)
      rgb[i + 2] = Math.round(rgb[i + 2] * (1 - a) + coverageAt.color[2] * a)
    }
  }
}

function strokePolyline(rgb, width, height, points, strokeWidth, color) {
  if (points.length === 0) return
  const half = strokeWidth / 2
  const pad = half + 1.5
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of points) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  const coverageAt = (px, py) => {
    let d = Infinity
    for (let i = 0; i < points.length - 1; i++) {
      d = Math.min(d, distToSeg(px, py, points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]))
    }
    if (points.length === 1) d = Math.hypot(px - points[0][0], py - points[0][1])
    return Math.max(0, Math.min(1, half + 0.65 - d))
  }
  coverageAt.color = color
  stampCoverage(rgb, width, height, minX - pad, minY - pad, maxX + pad, maxY + pad, coverageAt)
}

function fillCircle(rgb, width, height, cx, cy, radius, color) {
  const pad = radius + 1.5
  const coverageAt = (px, py) => {
    const d = Math.hypot(px - cx, py - cy)
    return Math.max(0, Math.min(1, radius + 0.65 - d))
  }
  coverageAt.color = color
  stampCoverage(rgb, width, height, cx - pad, cy - pad, cx + pad, cy + pad, coverageAt)
}

function mapPoints(points, tx) {
  return points.map(([x, y]) => tx(x, y))
}

function drawText(rgb, width, height, text, originX, originY, em, stroke, color) {
  let x = originX
  const missing = []
  for (const ch of text) {
    const glyph = GLYPHS[ch]
    if (!glyph) {
      missing.push(ch)
      continue
    }
    for (const strokePath of glyph.strokes) {
      strokePolyline(
        rgb,
        width,
        height,
        mapPoints(strokePath, (gx, gy) => [x + gx * (em / 7), originY + gy * (em / 7)]),
        stroke,
        color,
      )
    }
    x += glyph.adv * (em / 7)
  }
  if (missing.length) {
    throw new Error(`Missing glyphs: ${[...new Set(missing)].join(' ')}`)
  }
  return x
}

function textWidth(text, em) {
  let w = 0
  for (const ch of text) {
    const glyph = GLYPHS[ch]
    if (!glyph) throw new Error(`Missing glyph for width: ${ch}`)
    w += glyph.adv * (em / 7)
  }
  return w
}

function polylineToSvg(points) {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')
}

function buildSvg(title, subtitle) {
  const markScale = 280 / 512
  const markX = 88
  const markY = (HEIGHT - 280) / 2
  const titleEm = 72
  const subEm = 26
  const textX = 88 + 280 + 48
  const blockH = titleEm + 22 + subEm
  const textY = (HEIGHT - blockH) / 2

  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">`,
    `  <rect width="${WIDTH}" height="${HEIGHT}" fill="#0a0a0b"/>`,
    `  <g transform="translate(${markX.toFixed(2)} ${markY.toFixed(2)}) scale(${markScale})">`,
    `    <path d="M144 336 L256 112 L368 336" fill="none" stroke="#e11d48" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"/>`,
    `    <circle cx="256" cy="368" r="24" fill="#e11d48"/>`,
    `  </g>`,
  ]

  const emitText = (text, originX, originY, em, stroke, color) => {
    let x = originX
    for (const ch of text) {
      const glyph = GLYPHS[ch]
      for (const strokePath of glyph.strokes) {
        const d = polylineToSvg(strokePath.map(([gx, gy]) => [x + gx * (em / 7), originY + gy * (em / 7)]))
        parts.push(
          `  <path d="${d}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>`,
        )
      }
      x += glyph.adv * (em / 7)
    }
  }

  emitText(title, textX, textY, titleEm, 7.2, '#f4f4f5')
  emitText(subtitle, textX, textY + titleEm + 18, subEm, 3.1, '#a8a8b0')
  parts.push('</svg>', '')
  return parts.join('\n')
}

function downsample(src, sw, sh, dw, dh) {
  const dest = Buffer.alloc(dw * dh * 3)
  const fx = sw / dw
  const fy = sh / dh
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      let r = 0
      let g = 0
      let b = 0
      let n = 0
      const x0 = Math.floor(x * fx)
      const y0 = Math.floor(y * fy)
      const x1 = Math.floor((x + 1) * fx)
      const y1 = Math.floor((y + 1) * fy)
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * sw + sx) * 3
          r += src[i]
          g += src[i + 1]
          b += src[i + 2]
          n++
        }
      }
      const di = (y * dw + x) * 3
      dest[di] = Math.round(r / n)
      dest[di + 1] = Math.round(g / n)
      dest[di + 2] = Math.round(b / n)
    }
  }
  return dest
}

const title = 'StrikeCaller'
const subtitle = 'Boxing & Muay Thai combo coach'

const hiW = WIDTH * SCALE
const hiH = HEIGHT * SCALE
const hi = Buffer.alloc(hiW * hiH * 3)
fillBackground(hi, hiW, hiH, BG)

const markScale = (280 / 512) * SCALE
const markX = 88 * SCALE
const markY = ((HEIGHT - 280) / 2) * SCALE
const mapMark = (x, y) => [markX + x * markScale, markY + y * markScale]
strokePolyline(hi, hiW, hiH, [mapMark(144, 336), mapMark(256, 112), mapMark(368, 336)], 32 * markScale, ACCENT)
fillCircle(hi, hiW, hiH, ...mapMark(256, 368), 24 * markScale, ACCENT)

const titleEm = 72 * SCALE
const subEm = 26 * SCALE
const textX = (88 + 280 + 48) * SCALE
const blockH = 72 + 22 + 26
const textY = ((HEIGHT - blockH) / 2) * SCALE
drawText(hi, hiW, hiH, title, textX, textY, titleEm, 7.2 * SCALE, TITLE)
drawText(hi, hiW, hiH, subtitle, textX, textY + (72 + 18) * SCALE, subEm, 3.1 * SCALE, SUBTITLE)

if (textWidth(title, 72) + 88 + 280 + 48 > WIDTH - 48) {
  throw new Error('OG title overflows the 1200px canvas')
}

const rgb = downsample(hi, hiW, hiH, WIDTH, HEIGHT)
mkdirSync(path.dirname(pngPath), { recursive: true })
mkdirSync(path.dirname(svgPath), { recursive: true })
writeFileSync(pngPath, encodePng(WIDTH, HEIGHT, rgb))
writeFileSync(svgPath, buildSvg(title, subtitle))
console.log(`wrote ${path.relative(rootDir, pngPath)} (${WIDTH}×${HEIGHT} RGB)`)
console.log(`wrote ${path.relative(rootDir, svgPath)}`)
