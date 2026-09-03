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
