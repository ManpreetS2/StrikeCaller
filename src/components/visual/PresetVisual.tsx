import { DimensionalIcon, IconPlate, useDimIds, type IconSize } from './DimensionalIcon'

/** Quick-start / preset identity illustrations. */
export function PresetVisual({
  id,
  size = 'md',
  decorative = true,
}: {
  id: string
  size?: IconSize
  decorative?: boolean
}) {
  const kind = normalize(id)
  return (
    <DimensionalIcon size={size} decorative={decorative} title={kind}>
      <PresetMark kind={kind} />
    </DimensionalIcon>
  )
}

function PresetMark({ kind }: { kind: string }) {
  const ids = useDimIds()
  return (
    <>
      <IconPlate />
      {kind === 'timer' && (
        <g>
          <circle cx="32" cy="34" r="11" stroke={`url(#${ids.edge})`} strokeWidth="2" />
          <path d="M32 26v8l5 3" stroke="var(--accent-text)" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      )}
      {kind === 'bag' && (
        <g>
          <path d="M32 18v6" stroke="var(--accent-text)" strokeWidth="2" />
          <ellipse cx="32" cy="38" rx="10" ry="14" fill={`url(#${ids.accent})`} stroke={`url(#${ids.edge})`} />
        </g>
      )}
      {kind === 'shadow' && (
        <path
          d="M20 40c6-2 8-10 12-10s6 8 12 10"
          stroke="var(--accent-text)"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
      )}
      {kind === 'conditioning' && (
        <path
          d="M30 44c-2-8 2-12 4-18 6 4 8 10 4 18-2 0-4 0-8 0Z"
          fill={`url(#${ids.accent})`}
          stroke={`url(#${ids.edge})`}
        />
      )}
      {kind === 'defense' && (
        <path
          d="M32 22l12 5v7c0 6-5 11-12 13-7-2-12-7-12-13v-7l12-5Z"
          fill="var(--bg-elevated)"
          stroke="var(--accent-text)"
          strokeWidth="1.8"
        />
      )}
      {kind === 'daily' && (
        <g>
          <rect x="20" y="24" width="24" height="22" rx="3" fill="var(--bg-elevated)" stroke={`url(#${ids.edge})`} />
          <path d="M20 30h24" stroke={`url(#${ids.edge})`} />
          <circle cx="36" cy="40" r="3.5" fill={`url(#${ids.accent})`} />
        </g>
      )}
      {kind === 'spark' && (
        <path d="M28 22l16 12-16 12V22Z" fill={`url(#${ids.accent})`} stroke={`url(#${ids.edge})`} />
      )}
    </>
  )
}

function normalize(id: string): string {
  if (id.includes('bag')) return 'bag'
  if (id.includes('shadow')) return 'shadow'
  if (id.includes('condition')) return 'conditioning'
  if (id.includes('defense')) return 'defense'
  if (id.includes('daily')) return 'daily'
  if (id.includes('demo') || id.includes('spark')) return 'spark'
  return 'timer'
}
