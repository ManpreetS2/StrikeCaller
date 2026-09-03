import { memo } from 'react'
import { formatClock } from '../utils/format'
import { type TimerVisualState } from './sessionTimerState'

const LABELS: Record<TimerVisualState, string> = {
  countdown: 'Countdown',
  work: 'Work',
  'warn-30': 'Final 30 seconds',
  'warn-10': 'Final 10 seconds',
  rest: 'Rest',
  paused: 'Paused',
}

export const SessionTimer = memo(function SessionTimer({
  timeRemainingMs,
  state,
  announce = false,
}: {
  timeRemainingMs: number
  state: TimerVisualState
  /** Only announce phase labels, not every tick. */
  announce?: boolean
}) {
  return (
    <div className={`session-timer session-timer-${state}`} data-state={state}>
      <p className="session-timer-label" aria-live={announce ? 'polite' : undefined} aria-atomic="true">
        {LABELS[state]}
      </p>
      <p className="session-timer-clock mono tabular-nums" aria-hidden>
        {formatClock(timeRemainingMs)}
      </p>
      <span className="sr-only">
        {LABELS[state]} {formatClock(timeRemainingMs)} remaining
      </span>
    </div>
  )
})
