import { DimensionalIcon, IconPlate, useDimIds, type IconSize } from './DimensionalIcon'

export type MetricVisualId =
  | 'sessions'
  | 'minutes'
  | 'rounds'
  | 'combos'
  | 'techniques'
  | 'streak'
  | 'longest-streak'
  | 'custom'
  | 'record'
  | 'milestone'
  | 'favorite'
  | 'empty'

export function MetricVisual({
  kind,
  size = 'md',
  decorative = true,
}: {
  kind: MetricVisualId
  size?: IconSize
  decorative?: boolean
}) {
  const title =
    kind === 'sessions'
      ? 'Sessions'
      : kind === 'minutes'
        ? 'Minutes'
        : kind === 'rounds'
          ? 'Rounds'
          : kind === 'combos'
            ? 'Combinations'
            : kind === 'techniques'
              ? 'Techniques'
              : kind === 'streak'
                ? 'Current streak'
                : kind === 'longest-streak'
                  ? 'Longest streak'
                  : kind === 'custom'
                    ? 'Custom combos'
                    : kind === 'record'
                      ? 'Personal record'
                      : kind === 'milestone'
                        ? 'Milestone'
                        : kind === 'favorite'
                          ? 'Favorite'
                          : 'Empty'

  return (
    <DimensionalIcon size={size} decorative={decorative} title={title}>
      <MetricMark kind={kind} />
    </DimensionalIcon>
  )
}

function MetricMark({ kind }: { kind: MetricVisualId }) {
  const ids = useDimIds()
  return (
    <>
      <IconPlate accent={kind === 'milestone' || kind === 'streak'} />
      {kind === 'sessions' && (
        <g>
          <rect x="22" y="24" width="20" height="22" rx="3" fill="var(--bg-elevated)" stroke={`url(#${ids.edge})`} />
          <path d="M26 30h12M26 36h8" stroke="var(--accent-text)" strokeWidth="1.8" strokeLinecap="round" />
        </g>
      )}
      {kind === 'minutes' && (
        <g>
          <circle cx="32" cy="34" r="11" stroke={`url(#${ids.edge})`} strokeWidth="2" />
          <path d="M32 26v8l6 3" stroke="var(--accent-text)" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      )}
      {kind === 'rounds' && <circle cx="32" cy="34" r="10" stroke="var(--accent-text)" strokeWidth="3" />}
      {kind === 'combos' && (
        <g>
          <circle cx="24" cy="34" r="4" fill={`url(#${ids.accent})`} />
          <circle cx="32" cy="28" r="4" fill={`url(#${ids.accent})`} />
          <circle cx="40" cy="34" r="4" fill={`url(#${ids.accent})`} />
          <path d="M27 33l3-3M35 30l3 3" stroke={`url(#${ids.edge})`} strokeWidth="1.5" />
        </g>
      )}
      {kind === 'techniques' && (
        <path d="M22 40l10-18 10 18" stroke="var(--accent-text)" strokeWidth="2.6" strokeLinejoin="round" />
      )}
      {(kind === 'streak' || kind === 'longest-streak') && (
        <path
          d="M28 42c0-8 4-12 8-16 2 4 6 6 6 12-4 0-8 2-14 4Z"
          fill={`url(#${ids.accent})`}
          stroke={`url(#${ids.edge})`}
        />
      )}
      {kind === 'custom' && (
        <g>
          <path d="M22 40l20-12" stroke="var(--accent-text)" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="42" cy="28" r="4" fill={`url(#${ids.accent})`} />
        </g>
      )}
      {kind === 'record' && (
        <path
          d="M24 40V28h4l4 8 4-8h4v12"
          stroke="var(--accent-text)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {kind === 'milestone' && (
        <path
          d="M32 22l4 8 9 1-7 6 2 9-8-4-8 4 2-9-7-6 9-1 4-8Z"
          fill={`url(#${ids.accent})`}
          stroke={`url(#${ids.edge})`}
        />
      )}
      {kind === 'favorite' && (
        <path d="M32 24l3 7h7l-5 5 2 8-7-4-7 4 2-8-5-5h7l3-7Z" fill={`url(#${ids.accent})`} stroke={`url(#${ids.edge})`} />
      )}
      {kind === 'empty' && (
        <path d="M22 34h20" stroke="var(--text-dim)" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
      )}
    </>
  )
}
