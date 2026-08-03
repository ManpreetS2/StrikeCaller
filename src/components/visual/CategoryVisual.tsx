import { DimensionalIcon, IconPlate, useDimIds, type IconSize } from './DimensionalIcon'
import type { TechniqueCategory } from '../../types'

export function CategoryVisual({
  category,
  size = 'sm',
  decorative = true,
}: {
  category: TechniqueCategory | 'strike'
  size?: IconSize
  decorative?: boolean
}) {
  const label = category === 'strike' ? 'Strike' : category
  return (
    <DimensionalIcon size={size} decorative={decorative} title={label}>
      <CategoryMark category={category} />
    </DimensionalIcon>
  )
}

function CategoryMark({ category }: { category: TechniqueCategory | 'strike' }) {
  const ids = useDimIds()
  return (
    <>
      <IconPlate />
      {category === 'punch' || category === 'strike' ? (
        <g>
          <ellipse cx="34" cy="32" rx="10" ry="12" fill={`url(#${ids.accent})`} stroke={`url(#${ids.edge})`} />
          <path d="M44 24l8-5" stroke="var(--accent-text)" strokeWidth="2" strokeLinecap="round" />
        </g>
      ) : null}
      {category === 'kick' && (
        <path
          d="M20 40c6-12 12-16 18-8 4 6 10 8 14 4"
          stroke="var(--accent-text)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      )}
      {category === 'teep' && (
        <g>
          <path d="M22 40h20" stroke={`url(#${ids.edge})`} strokeWidth="2" />
          <path d="M32 40V24l10 4" stroke="var(--accent-text)" strokeWidth="2.6" strokeLinecap="round" />
        </g>
      )}
      {category === 'knee' && (
        <path d="M24 42c2-10 8-14 14-6l6 8" stroke="var(--accent-text)" strokeWidth="3" strokeLinecap="round" />
      )}
      {category === 'elbow' && (
        <path
          d="M22 38l10-14 10 14"
          stroke="var(--accent-text)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {category === 'defense' && (
        <path
          d="M32 22l12 5v7c0 6-5 11-12 13-7-2-12-7-12-13v-7l12-5Z"
          fill="var(--bg-elevated)"
          stroke="var(--accent-text)"
          strokeWidth="1.8"
        />
      )}
      {category === 'counter' && (
        <g>
          <path d="M22 34h14" stroke={`url(#${ids.edge})`} strokeWidth="2" />
          <path d="M34 28l8 6-8 6" fill={`url(#${ids.accent})`} stroke={`url(#${ids.edge})`} />
        </g>
      )}
      {category === 'movement' && (
        <path
          d="M20 38c6-2 8-8 12-8s6 6 12 8"
          stroke="var(--accent-text)"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
      )}
      {category === 'clinch' && (
        <g>
          <circle cx="26" cy="32" r="7" stroke="var(--accent-text)" strokeWidth="2" />
          <circle cx="38" cy="32" r="7" stroke="var(--accent-text)" strokeWidth="2" />
        </g>
      )}
    </>
  )
}
