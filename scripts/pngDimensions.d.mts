export function readPngDimensions(filePath: string): {
  width: number
  height: number
  bitDepth: number
  colorType: number
  fileSize: number
}

export function pngHasAlpha(info: {
  width: number
  height: number
  bitDepth: number
  colorType: number
  fileSize: number
}): boolean
