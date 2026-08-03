import { createContext, useContext, useId, type ReactNode, type SVGProps } from 'react'

export type IconSize = 'sm' | 'md' | 'lg' | number

const SIZE_MAP = { sm: 24, md: 40, lg: 72 } as const

export function resolveIconSize(size: IconSize = 'md'): number {
  return typeof size === 'number' ? size : SIZE_MAP[size]
}

interface DimIds {
  face: string
  accent: string
  edge: string
  shadow: string
}

const DimIdContext = createContext<DimIds>({
  face: 'dimFace',
  accent: 'dimAccent',
  edge: 'dimEdge',
  shadow: 'dimShadow',
})

export function useDimIds(): DimIds {
  return useContext(DimIdContext)
}

export interface DimensionalIconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: IconSize
  title?: string
  decorative?: boolean
  children: ReactNode
  viewBox?: string
}

/** Shared SVG shell for layered dimensional icons. */
export function DimensionalIcon({
  size = 'md',
  title,
  decorative = true,
  children,
  viewBox = '0 0 64 64',
  className = '',
  ...rest
}: DimensionalIconProps) {
  const uid = useId().replace(/:/g, '')
  const ids: DimIds = {
    face: `dimFace-${uid}`,
    accent: `dimAccent-${uid}`,
    edge: `dimEdge-${uid}`,
    shadow: `dimShadow-${uid}`,
  }
  const px = resolveIconSize(size)
  const labelled = Boolean(title) && !decorative
  return (
    <svg
      width={px}
      height={px}
      viewBox={viewBox}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`dim-icon ${className}`.trim()}
      aria-hidden={decorative || !labelled ? true : undefined}
      role={labelled ? 'img' : undefined}
      aria-label={labelled ? title : undefined}
      {...rest}
    >
      {labelled && title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={ids.face} x1="12" y1="8" x2="52" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--bg-elevated)" />
          <stop offset="1" stopColor="var(--bg-panel)" />
        </linearGradient>
        <linearGradient id={ids.accent} x1="10" y1="10" x2="54" y2="54" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--accent-text)" />
          <stop offset="1" stopColor="var(--accent)" />
        </linearGradient>
        <linearGradient id={ids.edge} x1="8" y1="56" x2="56" y2="8" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--border-strong)" />
          <stop offset="1" stopColor="var(--border)" />
        </linearGradient>
        <filter id={ids.shadow} x="-20%" y="-10%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="1.4" floodColor="rgba(0,0,0,0.35)" />
        </filter>
      </defs>
      <DimIdContext.Provider value={ids}>{children}</DimIdContext.Provider>
    </svg>
  )
}

/** Shared layered plate used by most illustrations. */
export function IconPlate({ accent = false }: { accent?: boolean }) {
  const ids = useDimIds()
  return (
    <g filter={`url(#${ids.shadow})`}>
      <ellipse cx="32" cy="54" rx="18" ry="3.5" fill="rgba(0,0,0,0.22)" />
      <path
        d="M14 18c0-4 4-8 18-8s18 4 18 8v22c0 5-5 10-18 10S14 45 14 40V18Z"
        fill={accent ? `url(#${ids.accent})` : `url(#${ids.face})`}
        stroke={`url(#${ids.edge})`}
        strokeWidth="1.5"
      />
      <path
        d="M18 20c1-3 5-6 14-6s13 3 14 6"
        stroke="rgba(255,255,255,0.28)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </g>
  )
}
