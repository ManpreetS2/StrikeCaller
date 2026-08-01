import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Pause,
  Play,
  SkipForward,
  Repeat,
  Square,
  Volume2,
  Maximize,
  Minimize,
} from 'lucide-react'
import { SessionEngine, type SessionSnapshot } from '../engines/sessionEngine'
import { createDefaultWorkout } from '../data/defaults'
import { useApp } from '../context/AppContext'
import { ComboDisplay } from '../components/ComboDisplay'
import { formatClock } from '../utils/format'
import type { WorkoutConfig } from '../types'

interface LocationState {
  config?: WorkoutConfig
  demo?: boolean
}

export function SessionPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { preferences, addHistory, toggleFavorite, favorites } = useApp()
  const state = (location.state as LocationState | null) ?? {}
  const config = useMemo(
    () =>
      state.config ??
      createDefaultWorkout({
        stance: preferences.stance,
        callStyle: preferences.callStyle,
        pace: preferences.pace,
        speech: preferences.speech,
        sound: preferences.sound,
        mode: state.demo ? 'demo' : 'round',
        roundDurationSec: state.demo ? 60 : 180,
        rounds: 1,
      }),
    [state.config, state.demo, preferences],
  )

  const engineRef = useRef<SessionEngine | null>(null)
  const endedRef = useRef(false)
  const [snap, setSnap] = useState<SessionSnapshot | null>(null)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [minimal, setMinimal] = useState(config.minimalMode)
  const [volume, setVolume] = useState(config.sound.masterVolume)

  useEffect(() => {
    const engine = new SessionEngine(config)
    engineRef.current = engine
    let alive = true

    const unsub = engine.subscribe((next) => {
      if (!alive) return
      setSnap(next)
      if (next.phase === 'summary' && !endedRef.current) {
        endedRef.current = true
        const summary = engine.getSummary()
        addHistory({ ...summary, cancelled: false })
        navigate('/summary', { state: { summary }, replace: true })
      }
    })

    void engine.start({ demo: Boolean(state.demo) || config.mode === 'demo' })

    return () => {
      alive = false
      unsub()
      engine.dispose()
    }
    // intentionally once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const endSession = () => {
    if (endedRef.current) return
    endedRef.current = true
    engineRef.current?.stop()
    const summary = engineRef.current?.getSummary()
    if (summary) {
      addHistory({ ...summary, cancelled: true })
      navigate('/summary', { state: { summary: { ...summary, cancelled: true } }, replace: true })
    } else {
      navigate('/train')
    }
  }

  if (!snap) {
    return <p className="p-8 text-[var(--text-muted)]">Preparing session…</p>
  }

  return (
    <div className={`${minimal ? 'fixed inset-0 z-50 overflow-auto bg-[var(--bg)] p-4' : 'space-y-4'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-dim)]">
            {config.mode} · {config.stance} · {config.pace}
          </p>
          <h1 className="display text-4xl">
            {snap.phase === 'rest'
              ? 'Rest'
              : snap.phase === 'countdown'
                ? 'Get ready'
                : snap.phase === 'paused'
                  ? 'Paused'
                  : `Round ${snap.round}`}
          </h1>
        </div>
        <div className="text-right">
          <p className="mono text-4xl tabular-nums" aria-live="polite" aria-atomic="true">
            {formatClock(snap.timeRemainingMs)}
          </p>
          <p className="text-sm text-[var(--text-muted)]">Time remaining</p>
        </div>
      </div>

      <div
        className="panel flex min-h-[220px] flex-col items-center justify-center gap-3 p-6 text-center"
        aria-live="assertive"
        aria-atomic="true"
      >
        <p className="text-sm uppercase tracking-[0.18em] text-[var(--text-dim)]">Current call</p>
        <p
          className={`technique-active pulse-soft font-semibold ${
            preferences.largeText || config.largeText ? 'text-5xl sm:text-6xl' : 'text-4xl sm:text-5xl'
          }`}
        >
          {snap.caption || '—'}
        </p>
        {snap.nextTechniqueLabel && snap.phase === 'work' && (
          <p className="text-sm text-[var(--text-muted)]">Next: {snap.nextTechniqueLabel}</p>
        )}
        {!snap.speechSupported && (
          <p className="mt-2 max-w-md text-sm text-[var(--warning)]" role="status">
            Speech synthesis is unavailable in this browser. Follow the on-screen captions and audio tones.
          </p>
        )}
      </div>

      {snap.currentCombo && !minimal && (
        <ComboDisplay
          combo={snap.currentCombo}
          activeIndex={snap.currentStepIndex}
          callStyle={config.callStyle}
          stance={config.stance}
          terminology={config.sideTerminology}
          showMeta={false}
        />
      )}

      <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Session controls">
        {snap.paused || snap.phase === 'paused' ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => engineRef.current?.resume()}
            aria-label="Resume session"
          >
            <Play size={18} aria-hidden /> Resume
          </button>
        ) : (
          <button
            type="button"
            className="btn"
            onClick={() => engineRef.current?.pause()}
            aria-label="Pause session"
          >
            <Pause size={18} aria-hidden /> Pause
          </button>
        )}
        <button
          type="button"
          className="btn"
          onClick={() => void engineRef.current?.skipCombo()}
          aria-label="Skip combination"
        >
          <SkipForward size={18} aria-hidden /> Skip combo
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void engineRef.current?.repeatCombo()}
          aria-label="Repeat combination"
        >
          <Repeat size={18} aria-hidden /> Repeat
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => setMinimal((v) => !v)}
          aria-pressed={minimal}
          aria-label={minimal ? 'Exit minimal mode' : 'Enter minimal mode'}
        >
          {minimal ? <Minimize size={18} aria-hidden /> : <Maximize size={18} aria-hidden />}
          {minimal ? 'Exit minimal' : 'Minimal'}
        </button>
        {snap.currentCombo && (
          <button
            type="button"
            className="btn"
            onClick={() => toggleFavorite(snap.currentCombo!.id)}
            aria-pressed={favorites.includes(snap.currentCombo.id)}
          >
            {favorites.includes(snap.currentCombo.id) ? 'Unfavorite' : 'Favorite'}
          </button>
        )}
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => setConfirmEnd(true)}
          aria-label="End session"
        >
          <Square size={18} aria-hidden /> End
        </button>
      </div>

      <div className="field max-w-sm">
        <label htmlFor="session-volume" className="flex items-center gap-2">
          <Volume2 size={16} aria-hidden /> Volume
        </label>
        <input
          id="session-volume"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          aria-label="Session volume"
          onChange={(e) => {
            const v = Number(e.target.value)
            setVolume(v)
            // volume applied via speech settings on next utterance through config mutation is limited;
            // engine reads config.speech at speak time — update local engine config sound
          }}
        />
      </div>

      <p className="text-sm text-[var(--text-muted)]">
        Combos {snap.combinationsCompleted} · Techniques {snap.techniquesCalled} · Defense {snap.defenseActions} ·
        Movement {snap.movementActions}
      </p>

      {confirmEnd && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="end-title"
        >
          <div className="panel max-w-md space-y-4 p-5">
            <h2 id="end-title" className="text-xl font-semibold">
              End this session?
            </h2>
            <p className="text-sm text-[var(--text-muted)]">
              Progress for this round will stop and you will see a summary.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-danger" onClick={endSession}>
                End session
              </button>
              <button type="button" className="btn" onClick={() => setConfirmEnd(false)}>
                Keep training
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
