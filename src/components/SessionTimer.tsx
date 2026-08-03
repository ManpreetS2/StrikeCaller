import { memo } from 'react'
import { formatClock } from '../utils/format'
import type { SessionPhase } from '../types'

export type TimerVisualState =
  | 'countdown'
  | 'work'
  | 'warn-30'
  | 'warn-10'
  | 'rest'
  | 'paused'

export function resolveTimerState(
  phase: SessionPhase,
  paused: boolean,
  timeRemainingMs: number,
): TimerVisualState {
  if (paused || phase === 'paused') return 'paused'
  if (phase === 'countdown') return 'countdown'
  if (phase === 'rest') return 'rest'
  if (phase === 'work') {
    const sec = Math.ceil(timeRemainingMs / 1000)
    if (sec <= 10) return 'warn-10'
    if (sec <= 30) return 'warn-30'
    return 'work'
  }
  return 'work'
}

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
