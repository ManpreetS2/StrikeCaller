import { useEffect, useMemo, useRef, useState, useCallback, memo } from 'react'
import { useBlocker, useLocation, useNavigate } from 'react-router-dom'
import { Maximize, Minimize } from 'lucide-react'
import { SessionEngine, type SessionSnapshot } from '../engines/sessionEngine'
import { createDefaultWorkout } from '../data/defaults'
import { useApp } from '../context/AppContext'
import { ComboDisplay } from '../components/ComboDisplay'
import { CompactComboPath } from '../components/CompactComboPath'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { SessionControlDock } from '../components/SessionControlDock'
import { SessionTimer, resolveTimerState } from '../components/SessionTimer'
import { primeTrainingAudio } from '../utils/primeAudio'
import { localDateKey } from '../utils/localDate'
import { dailyDrillKey } from '../utils/dailyDrill'
import type { SessionSummary, WorkoutConfig } from '../types'

interface LocationState {
  config?: WorkoutConfig
  demo?: boolean
  dailyPhase?: 'slowDone' | 'normalDone' | 'fightDone'
  comboQueue?: import('../types').Combo[]
  audioPrimed?: boolean
}

type SessionUi = Omit<SessionSnapshot, 'timeRemainingMs'>

function uiKey(s: SessionSnapshot): string {
  return [
    s.phase,
    s.round,
    s.paused,
    s.interrupted,
    s.caption,
    s.currentStepIndex,
    s.currentCombo?.id ?? '',
    s.nextTechniqueLabel ?? '',
    s.combinationsCompleted,
    s.techniquesCalled,
    s.canSkipOrRepeat,
    s.wakeLockActive,
    s.speechSupported,
  ].join('|')
}

const CallPanel = memo(function CallPanel({
  caption,
  flash,
  largeText,
  captionsEnabled,
  nextLabel,
  showNext,
  speechSupported,
}: {
  caption: string
  flash: boolean
  largeText: boolean
  captionsEnabled: boolean
  nextLabel: string | null
  showNext: boolean
  speechSupported: boolean
}) {
  return (
    <div
      className={`session-call panel relative ${flash ? 'call-impact-flash' : ''}`}
      aria-live="assertive"
      aria-atomic="true"
    >
      <div className={`call-impact ${flash ? 'call-impact-flash' : ''}`} aria-hidden />
      <p className="session-call-eyebrow">Current call</p>
      <p className={`session-call-text ${largeText ? 'session-call-text-lg' : ''}`}>
        {captionsEnabled !== false ? caption || '—' : '·'}
      </p>
      {showNext && nextLabel ? <p className="session-call-next">Next: {nextLabel}</p> : null}
      {!speechSupported && (
        <p className="mt-2 max-w-md text-sm text-[var(--warning)]" role="status">
          Speech synthesis is unavailable in this browser. Follow the on-screen captions and audio tones.
        </p>
      )}
    </div>
  )
})

export function SessionPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { preferences, updatePreferences, addHistory, toggleFavorite, favorites, getDailyDrill, setDailyDrill } =
    useApp()
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
        minimalMode: preferences.preferMinimalMode,
      }),
    [state.config, isDemo, preferences],
  )

  const engineRef = useRef<SessionEngine | null>(null)
  const endedRef = useRef(false)
  const endButtonRef = useRef<HTMLButtonElement>(null)
  const lastUiKey = useRef('')
  const lastCaptionRef = useRef<string | null>(null)
  const lastTimerAnnounce = useRef('')

  const [preparing, setPreparing] = useState(true)
  const [timerMs, setTimerMs] = useState(0)
  const [ui, setUi] = useState<SessionUi | null>(null)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [minimal, setMinimal] = useState(config.minimalMode || preferences.preferMinimalMode)
  const [callFlash, setCallFlash] = useState(false)
  const [showWakeTip, setShowWakeTip] = useState(false)
  const [timerAnnounce, setTimerAnnounce] = useState(false)

  const hasMeaningfulProgress = Boolean(
    ui &&
      (ui.techniquesCalled > 0 ||
        ui.combinationsCompleted > 0 ||
        ui.phase === 'work' ||
        ui.phase === 'rest'),
  )

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !endedRef.current &&
      hasMeaningfulProgress &&
      currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    let alive = true
    const engine = new SessionEngine(config, { wakeLock: preferences.wakeLock })
    engineRef.current = engine

    const unsub = engine.subscribe((next) => {
      if (!alive) return
      setTimerMs(next.timeRemainingMs)
      const key = uiKey(next)
      if (key !== lastUiKey.current) {
        lastUiKey.current = key
        const { timeRemainingMs: _t, ...rest } = next
        void _t
        setUi(rest)
      }
      if (next.phase === 'summary' && !endedRef.current) {
        finalize(false)
      }
    })

    ;(async () => {
      if (!state.audioPrimed) {
        setPreparing(true)
        await primeTrainingAudio({ musicFriendly: config.speech.musicFriendly })
      }
      if (!alive) return
      setPreparing(false)
      await engine.start({ demo: isDemo, comboQueue: state.comboQueue })
    })()

    return () => {
      alive = false
      unsub()
      engine.dispose()
    }
    // intentionally once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!ui) return
    const key = `${ui.currentCombo?.id ?? ''}:${ui.currentStepIndex}:${ui.caption}`
    if (lastCaptionRef.current === null) {
      lastCaptionRef.current = key
      return
    }
    if (lastCaptionRef.current === key) return
    lastCaptionRef.current = key
    setCallFlash(true)
    const t = window.setTimeout(() => setCallFlash(false), 420)
    return () => window.clearTimeout(t)
  }, [ui?.caption, ui?.currentStepIndex, ui?.currentCombo?.id])

  useEffect(() => {
    if (!ui) return
    const stateLabel = resolveTimerState(ui.phase, ui.paused, timerMs)
    if (stateLabel === lastTimerAnnounce.current) return
    lastTimerAnnounce.current = stateLabel
    setTimerAnnounce(true)
    const t = window.setTimeout(() => setTimerAnnounce(false), 80)
    return () => window.clearTimeout(t)
  }, [ui, timerMs])

  useEffect(() => {
    if (!ui || preferences.wakeLockNoticeDismissed) return
    if (preferences.wakeLock && !ui.wakeLockActive && ui.phase !== 'idle' && ui.phase !== 'countdown') {
      setShowWakeTip(true)
    }
  }, [ui?.wakeLockActive, ui?.phase, preferences.wakeLock, preferences.wakeLockNoticeDismissed])

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

  const endSession = useCallback(() => {
    setConfirmEnd(false)
    finalize(true)
  }, [])

  const toggleMinimal = useCallback(() => {
    setMinimal((v) => {
      const next = !v
      updatePreferences({ preferMinimalMode: next })
      return next
    })
  }, [updatePreferences])

  if (preparing || !ui) {
    return (
      <div className="session-shell session-preparing" role="status">
        <p className="text-lg text-[var(--text-muted)]">Preparing audio…</p>
      </div>
    )
  }

  const skipDisabled = !ui.canSkipOrRepeat
  const workActive = ui.phase === 'work' && !ui.paused
  const timerState = resolveTimerState(ui.phase, ui.paused, timerMs)
  const phaseTitle =
    ui.phase === 'rest'
      ? 'Rest'
      : ui.phase === 'countdown'
        ? 'Get ready'
        : ui.paused || ui.phase === 'paused'
          ? ui.interrupted
            ? 'Interrupted'
            : 'Paused'
          : `Round ${ui.round}`

  return (
    <div className={`session-shell ${minimal ? 'session-minimal' : ''}`}>
      <header className="session-top">
        <div>
          <p className="session-meta">
            {config.mode} · {config.stance} · {config.pace}
          </p>
          <h1 className="session-phase">{phaseTitle}</h1>
          {ui.interrupted && (
            <p className="session-interrupt" role="status">
              Training paused after an interruption. Stale audio was cleared. Tap Resume when ready.
            </p>
          )}
        </div>
        <SessionTimer timeRemainingMs={timerMs} state={timerState} announce={timerAnnounce} />
      </header>

      <CallPanel
        caption={ui.caption}
        flash={callFlash}
        largeText={preferences.largeText || config.largeText}
        captionsEnabled={config.speech.captionsEnabled !== false}
        nextLabel={ui.nextTechniqueLabel}
        showNext={Boolean(workActive && (minimal ? ui.nextTechniqueLabel : true))}
        speechSupported={ui.speechSupported}
      />

      {ui.currentCombo && !minimal && (
        <>
          <div className="session-combo-mobile">
            <CompactComboPath
              combo={ui.currentCombo}
              activeIndex={ui.currentStepIndex}
              callStyle={config.callStyle}
              stance={config.stance}
              terminology={config.sideTerminology}
            />
          </div>
          <div className="session-combo-desktop">
            <ComboDisplay
              combo={ui.currentCombo}
              activeIndex={ui.currentStepIndex}
              callStyle={config.callStyle}
              stance={config.stance}
              terminology={config.sideTerminology}
              showMeta={false}
            />
          </div>
        </>
      )}

      {!minimal && (
        <div className="session-secondary">
          <button
            type="button"
            className="btn"
            onClick={toggleMinimal}
            aria-pressed={minimal}
            aria-label="Enter minimal mode"
          >
            <Minimize size={18} aria-hidden /> Minimal
          </button>
          {ui.currentCombo && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                const id = ui.currentCombo!.id
                const next = !favorites.includes(id)
                toggleFavorite(id)
                if (next) engineRef.current?.markFavorite(id)
                else engineRef.current?.unmarkFavorite(id)
              }}
              aria-pressed={favorites.includes(ui.currentCombo.id)}
            >
              {favorites.includes(ui.currentCombo.id) ? 'Unfavorite' : 'Favorite'}
            </button>
          )}
          <p className="session-stats text-sm text-[var(--text-muted)]">
            Combos {ui.combinationsCompleted} · Techniques {ui.techniquesCalled} · Defense {ui.defenseActions} ·
            Movement {ui.movementActions}
          </p>
        </div>
      )}

      {minimal && (
        <div className="session-minimal-tools">
          <button
            type="button"
            className="btn"
            onClick={toggleMinimal}
            aria-pressed={minimal}
            aria-label="Exit minimal mode"
          >
            <Maximize size={18} aria-hidden /> Exit minimal
          </button>
        </div>
      )}

      {showWakeTip && (
        <p className="session-wake-tip" role="status">
          This browser may not keep the screen awake. Lock orientation and keep the screen on if needed.{' '}
          <button
            type="button"
            className="btn btn-ghost !min-h-9 !px-2"
            onClick={() => {
              updatePreferences({ wakeLockNoticeDismissed: true })
              setShowWakeTip(false)
            }}
          >
            Dismiss
          </button>
        </p>
      )}

      <SessionControlDock
        paused={ui.paused || ui.phase === 'paused'}
        skipDisabled={skipDisabled}
        repeatDisabled={skipDisabled || !ui.currentCombo}
        pauseDisabled={ui.phase === 'summary' || ui.phase === 'idle'}
        minimal={minimal}
        onPause={() => engineRef.current?.pause()}
        onResume={() => void engineRef.current?.resume()}
        onSkip={() => void engineRef.current?.skipCombo()}
        onRepeat={() => void engineRef.current?.repeatCombo()}
        onEnd={() => setConfirmEnd(true)}
        endButtonRef={endButtonRef}
      />

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
