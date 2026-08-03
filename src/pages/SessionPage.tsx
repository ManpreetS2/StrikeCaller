import { useEffect, useMemo, useRef, useState } from 'react'
import { useBlocker, useLocation, useNavigate } from 'react-router-dom'
import {
  Pause,
  Play,
  SkipForward,
  Repeat,
  Square,
  Maximize,
  Minimize,
} from 'lucide-react'
import { SessionEngine, type SessionSnapshot } from '../engines/sessionEngine'
import { createDefaultWorkout } from '../data/defaults'
import { useApp } from '../context/AppContext'
import { ComboDisplay } from '../components/ComboDisplay'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { formatClock } from '../utils/format'
import { localDateKey } from '../utils/localDate'
import { dailyDrillKey } from '../utils/dailyDrill'
import type { SessionSummary, WorkoutConfig } from '../types'

interface LocationState {
  config?: WorkoutConfig
  demo?: boolean
  dailyPhase?: 'slowDone' | 'normalDone' | 'fightDone'
  comboQueue?: import('../types').Combo[]
}

export function SessionPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { preferences, addHistory, toggleFavorite, favorites, getDailyDrill, setDailyDrill } = useApp()
  const state = (location.state as LocationState | null) ?? {}
  const isDemo = Boolean(state.demo) || state.config?.mode === 'demo'
  const config = useMemo(
    () =>
      state.config ??
      createDefaultWorkout({
        martialArt: preferences.martialArt,
        stance: preferences.stance,
        callStyle: preferences.callStyle,
        pace: preferences.pace,
        speech: preferences.speech,
        sound: preferences.sound,
        resumeBehavior: preferences.resumeBehavior,
        mode: isDemo ? 'demo' : 'round',
        roundDurationSec: isDemo ? 60 : 180,
        rounds: 1,
      }),
    [state.config, isDemo, preferences],
  )

  const engineRef = useRef<SessionEngine | null>(null)
  const endedRef = useRef(false)
  const endButtonRef = useRef<HTMLButtonElement>(null)
  const [snap, setSnap] = useState<SessionSnapshot | null>(null)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [minimal, setMinimal] = useState(config.minimalMode)

  const hasMeaningfulProgress = Boolean(
    snap && (snap.techniquesCalled > 0 || snap.combinationsCompleted > 0 || snap.phase === 'work' || snap.phase === 'rest'),
  )

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !endedRef.current &&
      hasMeaningfulProgress &&
      currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    const engine = new SessionEngine(config, { wakeLock: preferences.wakeLock })
    engineRef.current = engine
    let alive = true

    const unsub = engine.subscribe((next) => {
      if (!alive) return
      setSnap(next)
      if (next.phase === 'summary' && !endedRef.current) {
        finalize(false)
      }
    })

    void engine.start({ demo: isDemo, comboQueue: state.comboQueue })

    return () => {
      alive = false
      unsub()
      engine.dispose()
    }
    // intentionally once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (endedRef.current || !hasMeaningfulProgress) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [hasMeaningfulProgress])

  const applyDailyPhase = (summary: SessionSummary, cancelled: boolean) => {
    if (cancelled || !state.dailyPhase) return summary
    const phase = state.dailyPhase
    const art = summary.martialArt
    const key = dailyDrillKey(localDateKey(), art)
    const existing = getDailyDrill(key)
    const base = existing ?? {
      dateKey: key,
      comboId: summary.workoutConfig?.selectedComboIds?.[0] ?? '',
      martialArt: art,
      slowDone: false,
      normalDone: false,
      fightDone: false,
      completed: false,
    }
    const next = { ...base, martialArt: art, dateKey: key, [phase]: true }
    const completed = Boolean(next.slowDone && next.normalDone && next.fightDone)
    setDailyDrill({ ...next, completed })
    return { ...summary, dailyPhase: phase, dailyDrillCompleted: completed }
  }

  const finalize = (cancelled: boolean) => {
    if (endedRef.current) return
    endedRef.current = true
    if (cancelled) engineRef.current?.stop()
    let summary = engineRef.current?.getSummary()
    if (!summary) {
      navigate('/train', { replace: true })
      return
    }
    summary = { ...summary, cancelled }
    summary = applyDailyPhase(summary, cancelled)

    if (!isDemo && !summary.excludeFromStats) {
      addHistory(summary)
    }

    navigate('/summary', { state: { summary }, replace: true })
  }

  const endSession = () => {
    setConfirmEnd(false)
    finalize(true)
  }

  if (!snap) {
    return <p className="p-8 text-[var(--text-muted)]">Preparing session…</p>
  }

  const skipDisabled = !snap.canSkipOrRepeat
  const workActive = snap.phase === 'work' && !snap.paused

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
          {config.speech.captionsEnabled !== false ? snap.caption || '—' : '·'}
        </p>
        {snap.nextTechniqueLabel && workActive && (
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
            onClick={() => void engineRef.current?.resume()}
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
            disabled={snap.phase === 'summary' || snap.phase === 'idle'}
          >
            <Pause size={18} aria-hidden /> Pause
          </button>
        )}
        <button
          type="button"
          className="btn"
          onClick={() => void engineRef.current?.skipCombo()}
          aria-label="Skip combination"
          disabled={skipDisabled}
        >
          <SkipForward size={18} aria-hidden /> Skip combo
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void engineRef.current?.repeatCombo()}
          aria-label="Repeat combination"
          disabled={skipDisabled || !snap.currentCombo}
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
            onClick={() => {
              const id = snap.currentCombo!.id
              const next = !favorites.includes(id)
              toggleFavorite(id)
              if (next) engineRef.current?.markFavorite(id)
              else engineRef.current?.unmarkFavorite(id)
            }}
            aria-pressed={favorites.includes(snap.currentCombo.id)}
          >
            {favorites.includes(snap.currentCombo.id) ? 'Unfavorite' : 'Favorite'}
          </button>
        )}
        <button
          ref={endButtonRef}
          type="button"
          className="btn btn-danger"
          onClick={() => setConfirmEnd(true)}
          aria-label="End session"
        >
          <Square size={18} aria-hidden /> End
        </button>
      </div>

      <p className="text-sm text-[var(--text-muted)]">
        Combos {snap.combinationsCompleted} · Techniques {snap.techniquesCalled} · Defense {snap.defenseActions} ·
        Movement {snap.movementActions}
      </p>

      {confirmEnd && (
        <ConfirmDialog
          title="End this session?"
          confirmLabel="End session"
          cancelLabel="Keep training"
          danger
          onConfirm={endSession}
          onCancel={() => {
            setConfirmEnd(false)
            endButtonRef.current?.focus()
          }}
        >
          Progress for this round will stop and you will see a summary.
        </ConfirmDialog>
      )}

      {blocker.state === 'blocked' && (
        <ConfirmDialog
          title="Leave this workout?"
          confirmLabel="Leave session"
          cancelLabel="Stay"
          danger
          onConfirm={() => {
            // Clear the blocked transition, then end into Summary.
            // Calling proceed() after finalize races the Summary navigation.
            blocker.reset?.()
            finalize(true)
          }}
          onCancel={() => blocker.reset?.()}
        >
          You have an active session with progress. Leaving will end it early.
        </ConfirmDialog>
      )}
    </div>
  )
}
