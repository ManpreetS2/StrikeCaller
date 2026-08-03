import { DimensionalIcon, IconPlate, useDimIds, type IconSize } from './DimensionalIcon'
import type { MartialArt } from '../../types'

export function SportVisual({
  art,
  size = 'md',
  decorative = true,
}: {
  art: MartialArt | 'coming-soon'
  size?: IconSize
  decorative?: boolean
}) {
  const title = art === 'boxing' ? 'Boxing' : art === 'coming-soon' ? 'Coming soon' : 'Muay Thai'
  return (
    <DimensionalIcon size={size} decorative={decorative} title={title}>
      <SportMark art={art} />
    </DimensionalIcon>
  )
}

function SportMark({ art }: { art: MartialArt | 'coming-soon' }) {
  const ids = useDimIds()
  if (art === 'boxing') {
    return (
      <>
        <IconPlate />
        <g transform="translate(0,2)">
          <ellipse cx="24" cy="34" rx="9" ry="11" fill={`url(#${ids.accent})`} stroke={`url(#${ids.edge})`} strokeWidth="1.2" />
          <ellipse cx="40" cy="32" rx="9" ry="11" fill={`url(#${ids.accent})`} stroke={`url(#${ids.edge})`} strokeWidth="1.2" />
          <path d="M24 24c4-6 12-6 16 0" stroke="rgba(255,255,255,0.35)" strokeWidth="1.6" />
          <path d="M44 22l8-6" stroke="var(--accent-text)" strokeWidth="2" strokeLinecap="round" />
          <circle cx="52" cy="16" r="2.2" fill="var(--accent-text)" />
        </g>
      </>
    )
  }
  if (art === 'coming-soon') {
    return (
      <>
        <IconPlate />
        <path d="M22 34h20M32 24v20" stroke="var(--text-dim)" strokeWidth="2.5" strokeLinecap="round" opacity="0.55" />
      </>
    )
  }
  return (
    <>
      <IconPlate />
      <g transform="translate(0,1)">
        <ellipse cx="26" cy="30" rx="8" ry="10" fill={`url(#${ids.accent})`} stroke={`url(#${ids.edge})`} strokeWidth="1.2" />
        <ellipse cx="40" cy="30" rx="8" ry="10" fill={`url(#${ids.accent})`} stroke={`url(#${ids.edge})`} strokeWidth="1.2" />
        <path
          d="M18 44c4-8 10-10 14-4 2 4 8 6 14 2"
          stroke="var(--accent-text)"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <path d="M20 22h8M36 22h8" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" strokeLinecap="round" />
      </g>
    </>
  )
}
