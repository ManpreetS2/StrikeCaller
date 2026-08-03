import { DimensionalIcon, useDimIds, type IconSize } from './DimensionalIcon'

/** Decorative home hero: glove impact + waveform + timer ring. */
export function HeroVisual({ size = 220 }: { size?: IconSize }) {
  return (
    <DimensionalIcon size={size} decorative title="Training instrument" className="hero-visual" viewBox="0 0 160 140">
      <HeroMark />
    </DimensionalIcon>
  )
}

function HeroMark() {
  const ids = useDimIds()
  return (
    <g>
      <ellipse cx="80" cy="128" rx="48" ry="6" fill="rgba(0,0,0,0.28)" />
      <circle
        cx="80"
        cy="72"
        r="46"
        fill="var(--bg-elevated)"
        stroke={`url(#${ids.edge})`}
        strokeWidth="2"
        opacity="0.95"
      />
      <circle cx="80" cy="72" r="34" stroke={`url(#${ids.accent})`} strokeWidth="2.5" strokeDasharray="6 8" opacity="0.85" />
      <path d="M80 44v28l16 10" stroke="var(--accent-text)" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="54" cy="78" rx="16" ry="20" fill={`url(#${ids.accent})`} stroke={`url(#${ids.edge})`} />
      <path d="M42 68c6-8 18-8 24 0" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
      <path
        d="M96 58c2-4 8-6 14-2 4 4 8 14 4 22"
        stroke="var(--accent-text)"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.9"
      />
      <path
        d="M108 92v-8M114 96v-16M120 90v-6M126 98v-20M132 92v-10"
        stroke={`url(#${ids.accent})`}
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.85"
      />
    </g>
  )
}
