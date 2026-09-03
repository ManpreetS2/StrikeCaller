import { readFileSync } from 'node:fs'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/**
 * Read pixel width/height from a PNG file's IHDR chunk.
 * Does not decode pixels and does not add an image-processing dependency.
 */
export function readPngDimensions(filePath) {
  const buf = readFileSync(filePath)
  if (buf.length < 24) {
    throw new Error(`${filePath} is too short to be a PNG`)
  }
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`${filePath} is not a PNG`)
  }
  if (buf.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error(`${filePath} is missing an IHDR chunk`)
  }
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    bitDepth: buf[24],
    colorType: buf[25],
    fileSize: buf.length,
  }
}

/** PNG color type 2 is truecolor RGB with no alpha channel. */
export function pngHasAlpha(info) {
  return info.colorType === 4 || info.colorType === 6
}
