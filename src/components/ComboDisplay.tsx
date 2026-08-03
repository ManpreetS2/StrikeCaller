import { getTechnique } from '../data/techniques'
import type { CallStyle, Combo, SideTerminology, Stance } from '../types'
import { formatTechniqueCall } from '../engines/speechEngine'

export function ComboDisplay({
  combo,
  activeIndex = -1,
  callStyle = 'names',
  stance = 'orthodox',
  terminology = 'lead-rear',
  showMeta = true,
}: {
  combo: Combo
  activeIndex?: number
  callStyle?: CallStyle
  stance?: Stance
  terminology?: SideTerminology
  showMeta?: boolean
}) {
  const labels = combo.techniques.map((step) =>
    formatTechniqueCall(getTechnique(step.techniqueId), callStyle, { stance, terminology }),
  )

  return (
    <article className="panel p-4" aria-label={`Combination: ${combo.title}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">{combo.title}</h3>
          <p className="text-sm text-[var(--text-muted)]">{combo.setupExplanation}</p>
        </div>
        {showMeta && (
          <div className="flex flex-wrap gap-2">
            <span className="chip capitalize">{combo.difficulty}</span>
            <span className="chip">{combo.purpose.replace(/-/g, ' ')}</span>
          </div>
        )}
      </div>

      <ol className="flex flex-wrap items-center gap-2" aria-label="Technique sequence">
        {labels.map((label, index) => {
          const isActive = index === activeIndex
          const isDone = activeIndex >= 0 && index < activeIndex
          return (
            <li key={`${combo.id}-${index}`} className="flex items-center gap-2">
              <span
                className={[
                  'technique-step rounded-lg border px-3 py-2 text-sm font-medium',
                  isActive
                    ? 'technique-step-active technique-active border-[var(--accent)] bg-[var(--accent-soft)]'
                    : isDone
                      ? 'technique-step-done border-[var(--border-strong)] bg-[var(--bg-elevated)]'
                      : 'border-[var(--border)] bg-[var(--bg-elevated)] opacity-85',
                ].join(' ')}
                aria-current={isActive ? 'step' : undefined}
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

      {showMeta && (
        <dl className="mt-4 grid gap-2 text-sm text-[var(--text-muted)] sm:grid-cols-2">
          <div>
            <dt className="dim">Safe exit</dt>
            <dd>{combo.safeExit}</dd>
          </div>
          <div>
            <dt className="dim">Coaching</dt>
            <dd>{combo.coachingNotes}</dd>
          </div>
        </dl>
      )}
    </article>
  )
}
