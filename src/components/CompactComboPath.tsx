import { memo } from 'react'
import { getTechnique } from '../data/techniques'
import { formatTechniqueCall } from '../engines/speechEngine'
import type { CallStyle, Combo, SideTerminology, Stance } from '../types'

/** Compact phone-friendly progression: previous · current · next (+ overflow count). */
export const CompactComboPath = memo(function CompactComboPath({
  combo,
  activeIndex = -1,
  callStyle = 'names',
  stance = 'orthodox',
  terminology = 'lead-rear',
}: {
  combo: Combo
  activeIndex?: number
  callStyle?: CallStyle
  stance?: Stance
  terminology?: SideTerminology
}) {
  const labels = combo.techniques.map((step) =>
    formatTechniqueCall(getTechnique(step.techniqueId), callStyle, { stance, terminology }),
  )
  const total = labels.length
  if (total === 0) return null

  const prev = activeIndex > 0 ? labels[activeIndex - 1] : null
  const current = activeIndex >= 0 && activeIndex < total ? labels[activeIndex] : null
  const next = activeIndex >= 0 && activeIndex + 1 < total ? labels[activeIndex + 1] : null
  const remainingAfter = Math.max(0, total - (activeIndex + 2))

  return (
    <div className="combo-path panel" aria-label={`Combination: ${combo.title}`}>
      <p className="combo-path-title">
        {combo.title}
        <span className="text-[var(--text-dim)]">
          {' '}
          · {Math.min(total, Math.max(0, activeIndex + 1))}/{total}
        </span>
      </p>
      <ol className="combo-path-steps" aria-label="Technique sequence">
        {prev && (
          <li className="combo-path-item combo-path-prev">
            <span className="sr-only">Previous: </span>
            {prev}
          </li>
        )}
        {current && (
          <li className="combo-path-item combo-path-current" aria-current="step">
            <span className="sr-only">Current: </span>
            {current}
          </li>
        )}
        {next && (
          <li className="combo-path-item combo-path-next">
            <span className="sr-only">Next: </span>
            {next}
          </li>
        )}
        {remainingAfter > 0 && (
          <li className="combo-path-item combo-path-more" aria-hidden>
            +{remainingAfter}
          </li>
        )}
      </ol>
      {/* Full wrap list for longer review without horizontal scroll */}
      <ol className="combo-path-wrap" aria-hidden>
        {labels.map((label, index) => {
          const isActive = index === activeIndex
          const isDone = activeIndex >= 0 && index < activeIndex
          return (
            <li key={`${combo.id}-${index}`} className="inline-flex items-center gap-1">
              <span
                className={[
                  'technique-step rounded-md border px-2 py-1 text-xs font-medium',
                  isActive
                    ? 'technique-step-active border-[var(--accent)] bg-[var(--accent-soft)]'
                    : isDone
                      ? 'technique-step-done border-[var(--border)]'
                      : 'border-[var(--border)] opacity-70',
                ].join(' ')}
              >
                {label}
              </span>
              {index < labels.length - 1 && (
                <span className="text-[var(--text-dim)]" aria-hidden>
                  →
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
})
