import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface InteractiveCardProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean
  title: string
  body?: string
  visual?: ReactNode
  badge?: ReactNode
  asDiv?: boolean
}

/** Selectable / pressable card with dimensional well and selected elevation. */
export function InteractiveCard({
  selected = false,
  title,
  body,
  visual,
  badge,
  className = '',
  type = 'button',
  asDiv,
  children,
  role,
  ...rest
}: InteractiveCardProps & { children?: ReactNode }) {
  const classes = [
    'interactive-card panel text-left',
    selected ? 'interactive-card-selected' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {visual ? (
            <div className="icon-well" aria-hidden>
              {visual}
            </div>
          ) : null}
          <div>
            <h3 className="font-semibold">{title}</h3>
            {body ? <p className="mt-1 text-sm text-[var(--text-muted)]">{body}</p> : null}
            {children}
          </div>
        </div>
        {badge}
      </div>
    </>
  )

  if (asDiv) {
    return (
      <div className={classes} data-selected={selected || undefined}>
        {content}
      </div>
    )
  }

  const isRadio = role === 'radio'
  return (
    <button
      type={type}
      role={role}
      className={classes}
      aria-pressed={isRadio ? undefined : selected}
      data-selected={selected || undefined}
      {...rest}
    >
      {content}
    </button>
  )
}
