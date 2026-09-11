import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ComboDisplay } from '../components/ComboDisplay'
import { useApp } from '../context/useApp'
import { createDefaultWorkout, definedPartial, resolveWorkoutDisplayPrefs } from '../data/defaults'
import { localDateKey, msUntilNextLocalMidnight } from '../utils/localDate'
import {
  dailyDrillCompleteMessage,
  dailyDrillKey,
  emptyDailyDrill,
  phaseLockReason,
  phaseUnlocked,
  pickDailyComboId,
  resolveDailyDrillCombo,
} from '../utils/dailyDrill'
import type { PacePreset, WorkoutConfig } from '../types'

interface DailyLocationState {
  workoutSeed?: WorkoutConfig
}

export function DailyPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const seed = (location.state as DailyLocationState | null)?.workoutSeed
  const { preferences, getDailyDrill, setDailyDrill } = useApp()
  const martialArt = seed?.martialArt ?? preferences.martialArt
  const [displayedCivilDate, setDisplayedCivilDate] = useState(() => localDateKey())

  const refreshCivilDate = useCallback(() => {
    const next = localDateKey()
    setDisplayedCivilDate((prev) => (prev === next ? prev : next))
  }, [])

  useEffect(() => {
    let timeoutId = 0
    let cancelled = false

    const arm = () => {
      timeoutId = window.setTimeout(() => {
        if (cancelled) return
        refreshCivilDate()
        arm()
      }, msUntilNextLocalMidnight())
    }
    arm()

    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshCivilDate()
    }
    const onFocus = () => {
      refreshCivilDate()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
    }
  }, [refreshCivilDate])

  const key = dailyDrillKey(displayedCivilDate, martialArt)

  const comboId = useMemo(() => {
    const existing = getDailyDrill(key)
    if (existing?.comboId) return existing.comboId
    return pickDailyComboId(key, martialArt)
  }, [getDailyDrill, key, martialArt])

  const combo = useMemo(() => resolveDailyDrillCombo(comboId, martialArt, key), [comboId, martialArt, key])

  const state = getDailyDrill(key) ?? emptyDailyDrill(displayedCivilDate, martialArt, comboId)

  const startPhase = (pace: PacePreset, field: 'slowDone' | 'normalDone' | 'fightDone') => {
    const actualCivilDate = localDateKey()
    if (actualCivilDate !== displayedCivilDate) {
      setDisplayedCivilDate(actualCivilDate)
      return
    }

    const originCivilDate = displayedCivilDate
    const originKey = dailyDrillKey(originCivilDate, martialArt)
    const existing = getDailyDrill(originKey)
    const originComboId = existing?.comboId ?? pickDailyComboId(originKey, martialArt)
    const originCombo = resolveDailyDrillCombo(originComboId, martialArt, originKey)
    const originState = existing ?? emptyDailyDrill(originCivilDate, martialArt, originCombo.id)

    if (!existing) {
      setDailyDrill({
        ...originState,
        comboId: originCombo.id,
        martialArt,
        dateKey: originKey,
      })
    }

    if (!phaseUnlocked(originState, field)) return

    setDailyDrill({
      ...originState,
      comboId: originCombo.id,
      martialArt,
      dateKey: originKey,
    })

    const seedDefined = definedPartial(seed ?? {})
    const display = resolveWorkoutDisplayPrefs(seed, preferences.preferMinimalMode)
    const config = createDefaultWorkout({
      ...seedDefined,
      martialArt,
      mode: 'daily',
      stance: seed?.stance ?? preferences.stance,
      difficulty: seed?.difficulty ?? preferences.experience,
      equipment: seed?.equipment ?? preferences.equipment,
      pace,
      callStyle: seed?.callStyle ?? preferences.callStyle,
      sessionDurationSec: 45,
      roundDurationSec: 45,
      rounds: 1,
      selectedComboIds: [originCombo.id],
      speech: {
        ...(seed?.speech ?? preferences.speech),
        callStyle: seed?.callStyle ?? preferences.callStyle,
      },
      sound: seed?.sound ?? preferences.sound,
      timingMultipliers: seed?.timingMultipliers ?? preferences.timingMultipliers,
      sideTerminology: seed?.sideTerminology ?? preferences.sideTerminology,
      resumeBehavior: seed?.resumeBehavior ?? preferences.resumeBehavior,
      ...display,
      ...(seed?.includeKnees !== undefined ? { includeKnees: seed.includeKnees } : {}),
      ...(seed?.includeElbows !== undefined ? { includeElbows: seed.includeElbows } : {}),
      ...(seed?.includeHeadKicks !== undefined ? { includeHeadKicks: seed.includeHeadKicks } : {}),
      ...(seed?.includeClinch !== undefined ? { includeClinch: seed.includeClinch } : {}),
      ...(seed?.defenseFrequency !== undefined ? { defenseFrequency: seed.defenseFrequency } : {}),
      ...(seed?.movementFrequency !== undefined ? { movementFrequency: seed.movementFrequency } : {}),
      ...(seed?.categories !== undefined ? { categories: seed.categories } : {}),
    })
    navigate('/session', { state: { config, dailyPhase: field, dailyDrillKey: originKey } })
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="display text-5xl">Daily Drill</h1>
        <p className="mt-2 max-w-2xl text-[var(--text-muted)]">
          One focused {martialArt === 'boxing' ? 'Boxing' : 'Muay Thai'} combination. Complete Slow, then Normal,
          then Fight Pace.
        </p>
      </header>

      <ComboDisplay
        combo={combo}
        callStyle={seed?.callStyle ?? preferences.callStyle}
        stance={seed?.stance ?? preferences.stance}
        terminology={seed?.sideTerminology ?? preferences.sideTerminology}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <PhaseCard
          title="Slow practice"
          done={state.slowDone}
          locked={!phaseUnlocked(state, 'slowDone')}
          lockReason={phaseLockReason('slowDone')}
          onClick={() => startPhase('slow', 'slowDone')}
        />
        <PhaseCard
          title="Normal practice"
          done={state.normalDone}
          locked={!phaseUnlocked(state, 'normalDone')}
          lockReason={phaseLockReason('normalDone')}
          onClick={() => startPhase('normal', 'normalDone')}
        />
        <PhaseCard
          title="Fight-pace attempt"
          done={state.fightDone}
          locked={!phaseUnlocked(state, 'fightDone')}
          lockReason={phaseLockReason('fightDone')}
          onClick={() => startPhase('fight', 'fightDone')}
        />
      </div>

      {state.completed && (
        <p className="rounded-lg border border-[var(--success)] p-3 text-sm" role="status">
          {dailyDrillCompleteMessage(martialArt)} Consistency beats intensity.
        </p>
      )}
    </div>
  )
}

function PhaseCard({
  title,
  done,
  locked,
  lockReason,
  onClick,
}: {
  title: string
  done: boolean
  locked: boolean
  lockReason: string | null
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`panel p-4 text-left ${done ? 'border-[var(--success)]' : ''} ${locked ? 'opacity-50' : ''}`}
      onClick={onClick}
      disabled={locked}
      aria-disabled={locked}
      title={locked && lockReason ? lockReason : undefined}
    >
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        {done ? 'Completed' : locked && lockReason ? lockReason : 'Tap to start'}
      </p>
    </button>
  )
}
