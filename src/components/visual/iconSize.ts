export type IconSize = 'sm' | 'md' | 'lg' | number

const SIZE_MAP = { sm: 24, md: 40, lg: 72 } as const

export function resolveIconSize(size: IconSize = 'md'): number {
  return typeof size === 'number' ? size : SIZE_MAP[size]
}
