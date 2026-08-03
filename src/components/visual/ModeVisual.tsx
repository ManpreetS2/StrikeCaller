import { DimensionalIcon, IconPlate, useDimIds, type IconSize } from './DimensionalIcon'
import type { TrainingMode } from '../../types'

type ModeVisualId = TrainingMode | 'demo' | 'builder' | 'stats' | 'settings' | 'audio' | 'display' | 'advanced'

export function ModeVisual({
  mode,
  size = 'md',
  decorative = true,
}: {
  mode: ModeVisualId
  size?: IconSize
  decorative?: boolean
}) {
  const title =
    mode === 'learn'
      ? 'Learn'
      : mode === 'coach'
        ? 'Coach'
        : mode === 'round'
          ? 'Round'
          : mode === 'reaction'
            ? 'Reaction'
            : mode === 'daily'
              ? 'Daily Drill'
              : mode === 'demo'
                ? 'Guided Demo'
                : mode === 'builder'
                  ? 'Custom Combo Builder'
                  : mode === 'stats'
                    ? 'Training Stats'
                    : mode === 'settings'
                      ? 'Settings'
                      : mode === 'audio'
                        ? 'Audio'
                        : mode === 'display'
                          ? 'Display'
                          : mode === 'advanced'
                            ? 'Advanced Training'
                            : 'Training'

  return (
    <DimensionalIcon size={size} decorative={decorative} title={title}>
      <ModeMark mode={mode} />
    </DimensionalIcon>
  )
}

function ModeMark({ mode }: { mode: ModeVisualId }) {
  const ids = useDimIds()
  return (
    <>
      <IconPlate accent={mode === 'demo' || mode === 'coach'} />
      {mode === 'learn' && (
        <g>
          <rect x="22" y="22" width="20" height="24" rx="3" fill="var(--bg-elevated)" stroke={`url(#${ids.edge})`} />
          <path d="M26 28h12M26 34h10M26 40h8" stroke="var(--accent-text)" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="42" cy="24" r="4" fill={`url(#${ids.accent})`} />
        </g>
      )}
      {mode === 'coach' && (
        <g>
          <path
            d="M20 36c2-8 6-12 12-12s10 4 12 12"
            stroke="var(--accent-text)"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path d="M24 36v4M32 34v8M40 36v4" stroke={`url(#${ids.accent})`} strokeWidth="2.4" strokeLinecap="round" />
        </g>
      )}
      {mode === 'round' && (
        <g>
          <circle cx="32" cy="34" r="12" stroke={`url(#${ids.edge})`} strokeWidth="2" fill="var(--bg-elevated)" />
          <path d="M32 26v8l5 3" stroke="var(--accent-text)" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="32" cy="34" r="2" fill="var(--accent)" />
        </g>
      )}
      {mode === 'reaction' && (
        <g>
          <path
            d="M32 22l12 6v8c0 7-5 12-12 14-7-2-12-7-12-14v-8l12-6Z"
            fill="var(--bg-elevated)"
            stroke={`url(#${ids.edge})`}
            strokeWidth="1.5"
          />
          <path d="M26 34l4 4 8-10" stroke="var(--accent-text)" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      )}
      {mode === 'daily' && (
        <g>
          <rect x="20" y="24" width="24" height="22" rx="3" fill="var(--bg-elevated)" stroke={`url(#${ids.edge})`} />
          <path d="M20 30h24" stroke={`url(#${ids.edge})`} strokeWidth="1.5" />
          <path d="M26 22v6M38 22v6" stroke="var(--accent-text)" strokeWidth="2" strokeLinecap="round" />
          <circle cx="36" cy="40" r="3.5" fill={`url(#${ids.accent})`} />
        </g>
      )}
      {mode === 'demo' && (
        <g>
          <path d="M28 22l16 12-16 12V22Z" fill={`url(#${ids.accent})`} stroke={`url(#${ids.edge})`} strokeWidth="1.2" />
          <circle cx="24" cy="34" r="3" fill="var(--accent-text)" opacity="0.7" />
        </g>
      )}
      {mode === 'builder' && (
        <g>
          <path
            d="M22 40l8-16h4l8 16"
            stroke="var(--accent-text)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="26" cy="40" r="3" fill={`url(#${ids.accent})`} />
          <circle cx="38" cy="40" r="3" fill={`url(#${ids.accent})`} />
          <circle cx="32" cy="28" r="3" fill={`url(#${ids.accent})`} />
        </g>
      )}
      {mode === 'stats' && (
        <g>
          <path d="M22 42V30M30 42V24M38 42V34" stroke="var(--accent-text)" strokeWidth="3" strokeLinecap="round" />
          <path d="M20 44h24" stroke={`url(#${ids.edge})`} strokeWidth="1.5" />
        </g>
      )}
      {mode === 'settings' && (
        <g>
          <circle cx="32" cy="34" r="7" stroke="var(--accent-text)" strokeWidth="2.2" />
          <path
            d="M32 22v4M32 42v4M22 34h4M38 34h4M25 27l3 3M39 41l-3-3M39 27l-3 3M25 41l3-3"
            stroke={`url(#${ids.accent})`}
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>
      )}
      {mode === 'audio' && (
        <g>
          <path
            d="M24 30v8M28 26v16M32 28v12M36 24v20M40 30v8"
            stroke="var(--accent-text)"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </g>
      )}
      {mode === 'display' && (
        <g>
          <rect x="20" y="24" width="24" height="18" rx="3" fill="var(--bg-elevated)" stroke={`url(#${ids.edge})`} />
          <path d="M26 48h12" stroke="var(--accent-text)" strokeWidth="2" strokeLinecap="round" />
        </g>
      )}
      {mode === 'advanced' && (
        <g>
          <path d="M22 40h20l-4-12h-12l-4 12Z" fill="var(--bg-elevated)" stroke={`url(#${ids.edge})`} />
          <path d="M28 28V22M36 28V22" stroke="var(--accent-text)" strokeWidth="2" strokeLinecap="round" />
          <circle cx="32" cy="36" r="2.5" fill={`url(#${ids.accent})`} />
        </g>
      )}
    </>
  )
}

export type { ModeVisualId }
