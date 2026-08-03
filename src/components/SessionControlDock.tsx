import { memo, type RefObject } from 'react'
import { Pause, Play, SkipForward, Repeat, Square } from 'lucide-react'

export interface SessionDockProps {
  paused: boolean
  skipDisabled: boolean
  repeatDisabled: boolean
  pauseDisabled: boolean
  minimal: boolean
  onPause: () => void
  onResume: () => void
  onSkip: () => void
  onRepeat: () => void
  onEnd: () => void
  endButtonRef?: RefObject<HTMLButtonElement | null>
}

/** Thumb-zone session controls for phone; larger targets, safe-area aware. */
export const SessionControlDock = memo(function SessionControlDock({
  paused,
  skipDisabled,
  repeatDisabled,
  pauseDisabled,
  minimal,
  onPause,
  onResume,
  onSkip,
  onRepeat,
  onEnd,
  endButtonRef,
}: SessionDockProps) {
  return (
    <div className="session-dock" role="toolbar" aria-label="Session controls">
      <div className="session-dock-inner">
        {paused ? (
          <button
            type="button"
            className="btn btn-primary session-dock-primary"
            onClick={onResume}
            aria-label="Resume session"
          >
            <Play size={22} aria-hidden /> Resume
          </button>
        ) : (
          <button
            type="button"
            className="btn session-dock-primary"
            onClick={onPause}
            aria-label="Pause session"
            disabled={pauseDisabled}
          >
            <Pause size={22} aria-hidden /> Pause
          </button>
        )}

        {!minimal && (
          <>
            <button
              type="button"
              className="btn session-dock-btn"
              onClick={onRepeat}
              aria-label="Repeat combination"
              disabled={repeatDisabled}
            >
              <Repeat size={20} aria-hidden />
              <span>Repeat</span>
            </button>
            <button
              type="button"
              className="btn session-dock-btn"
              onClick={onSkip}
              aria-label="Skip combination"
              disabled={skipDisabled}
            >
              <SkipForward size={20} aria-hidden />
              <span>Skip</span>
            </button>
          </>
        )}

        <button
          ref={endButtonRef}
          type="button"
          className="btn btn-danger session-dock-end"
          onClick={onEnd}
          aria-label="End session"
        >
          <Square size={18} aria-hidden /> End
        </button>
      </div>
    </div>
  )
})
