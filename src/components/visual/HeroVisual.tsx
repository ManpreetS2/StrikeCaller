import { useId } from 'react'
import { DimensionalIcon, useDimIds, type IconSize } from './DimensionalIcon'

/**
 * Decorative home hero: a clean, premium pair of boxing gloves hanging together
 * by tied laces — one glove slightly in front, one slightly behind. Rose accent,
 * slightly dimensional, and legible in dark and light themes.
 */
export function HeroVisual({ size = 220 }: { size?: IconSize }) {
  return (
    <DimensionalIcon size={size} decorative title="Boxing gloves" className="hero-visual" viewBox="0 0 160 140">
      <HeroMark />
    </DimensionalIcon>
  )
}

function HeroMark() {
  const dim = useDimIds()
  const uid = useId().replace(/:/g, '')
  const face = `heroGlove-${uid}`
  const faceDeep = `heroGloveDeep-${uid}`
  const edge = `heroEdge-${uid}`

  return (
    <g>
      <defs>
        <linearGradient id={face} x1="0" y1="0" x2="0.85" y2="1">
          <stop stopColor="var(--accent-text)" />
          <stop offset="1" stopColor="var(--accent)" />
        </linearGradient>
        <linearGradient id={faceDeep} x1="0" y1="0" x2="0.85" y2="1">
          <stop stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0.68" />
        </linearGradient>
        <linearGradient id={edge} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="var(--border-strong)" />
          <stop offset="1" stopColor="var(--border)" />
        </linearGradient>
      </defs>

      {/* soft grounding shadow beneath the hanging pair */}
      <ellipse cx="81" cy="112" rx="36" ry="4.5" fill="rgba(0,0,0,0.2)" />

      <g className="hero-hang">
        {/* tied laces hanging from a single knot at the top */}
        <g stroke="var(--text-muted)" strokeWidth="2.6" strokeLinecap="round" fill="none" opacity="0.92">
          <path d="M80 15C74 22 69 28 65 34" />
          <path d="M80 15C87 24 92 33 96 41" />
          <path d="M76 20l-4 7M85 21l3 7" strokeWidth="2" opacity="0.55" />
        </g>
        {/* tie knot / hanging loop */}
        <path d="M80 15c-4-3-4-9 0-11 4 2 4 8 0 11Z" fill="var(--text-muted)" opacity="0.9" />

        {/* back glove (slightly behind, deeper tone) */}
        <g transform="translate(62 60) rotate(7)">
          <Glove faceId={faceDeep} edgeId={edge} shadowId={dim.shadow} back />
        </g>

        {/* front glove (slightly in front and lower, mirrored so thumbs meet) */}
        <g transform="translate(99 68) rotate(-7) scale(-1 1)">
          <Glove faceId={face} edgeId={edge} shadowId={dim.shadow} />
        </g>
      </g>
    </g>
  )
}

/**
 * A single hanging glove drawn in a local frame: cuff up, padded fist down,
 * thumb to the right. Callers position/rotate/mirror it.
 */
function Glove({
  faceId,
  edgeId,
  shadowId,
  back = false,
}: {
  faceId: string
  edgeId: string
  shadowId: string
  back?: boolean
}) {
  return (
    <g filter={`url(#${shadowId})`}>
      {/* thumb lobe */}
      <path
        d="M18 -1c9 0 12 9 9 16c-3 6 -12 5 -14 -3Z"
        fill={`url(#${faceId})`}
        stroke={`url(#${edgeId})`}
        strokeWidth="1.4"
      />
      {/* padded main body — mitt shape, fuller knuckle at the bottom */}
      <path
        d="M-12 -12C-21 -10 -22 5 -19 16C-17 27 -9 34 0 34C9 34 17 27 19 16C22 5 21 -10 12 -12Z"
        fill={`url(#${faceId})`}
        stroke={`url(#${edgeId})`}
        strokeWidth="1.6"
      />
      {/* wrist cuff */}
      <rect x="-13" y="-28" width="26" height="17" rx="7" fill={`url(#${faceId})`} stroke={`url(#${edgeId})`} strokeWidth="1.5" />
      {/* hollow wrist opening */}
      <ellipse cx="0" cy="-26" rx="11" ry="3.4" fill="rgba(0,0,0,0.3)" />
      <ellipse cx="0" cy="-26.6" rx="11" ry="3.4" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      {/* lace-up detail + eyelets on the cuff */}
      <path d="M-6 -21l12 6M6 -21l-12 6" stroke="var(--text-muted)" strokeWidth="1.3" strokeLinecap="round" opacity={back ? 0.5 : 0.65} />
      <g fill="var(--text-muted)" opacity={back ? 0.5 : 0.7}>
        <circle cx="-6" cy="-21" r="1.4" />
        <circle cx="6" cy="-21" r="1.4" />
        <circle cx="-6" cy="-14" r="1.4" />
        <circle cx="6" cy="-14" r="1.4" />
      </g>
      {/* knuckle crease */}
      <path d="M-14 17C-6 23 6 23 14 17" stroke="rgba(0,0,0,0.2)" strokeWidth="1.7" fill="none" strokeLinecap="round" />
      {/* thumb seam */}
      <path d="M12 -4C15 2 15 10 11 15" stroke="rgba(0,0,0,0.16)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {/* soft edge highlight */}
      <path d="M-11 -6C-16 2 -16 14 -12 22" stroke="rgba(255,255,255,0.3)" strokeWidth="2.2" fill="none" strokeLinecap="round" />
    </g>
  )
}
