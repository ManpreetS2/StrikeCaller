import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BEGINNER_COMBOS, INTERMEDIATE_COMBOS, BOXING_COMBOS, getCombo } from '../data/combos'
import { BOXING_BEGINNER, BOXING_INTERMEDIATE } from '../data/boxing'
import { ComboDisplay } from '../components/ComboDisplay'
import { useApp } from '../context/AppContext'
import { createDefaultWorkout } from '../data/defaults'
import { localDateKey } from '../utils/localDate'
import type { MartialArt, PacePreset, WorkoutConfig } from '../types'

interface DailyLocationState {
  workoutSeed?: WorkoutConfig
}

function pickDailyComboId(key: string, martialArt: MartialArt): string {
  const pool =
    martialArt === 'boxing'
      ? [...BOXING_BEGINNER, ...BOXING_INTERMEDIATE]
      : [...BEGINNER_COMBOS, ...INTERMEDIATE_COMBOS]
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash + key.charCodeAt(i) * (i + 1)) % pool.length
  return pool[hash]!.id
}

export function DailyPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const seed = (location.state as DailyLocationState | null)?.workoutSeed
  const { preferences, dailyDrill, setDailyDrill } = useApp()
  const martialArt = seed?.martialArt ?? preferences.martialArt
  const key = `${localDateKey()}:${martialArt}`

  const comboId = useMemo(() => {
    if (dailyDrill?.dateKey === key && dailyDrill.martialArt === martialArt) {
      return dailyDrill.comboId
    }
    return pickDailyComboId(key, martialArt)
  }, [dailyDrill, key, martialArt])

  const combo = useMemo(() => {
    try {
      return getCombo(comboId)
    } catch {
      return martialArt === 'boxing' ? BOXING_COMBOS[0]! : BEGINNER_COMBOS[0]!
    }
  }, [comboId, martialArt])

  const state =
    dailyDrill?.dateKey === key
      ? dailyDrill
      : {
          dateKey: key,
          comboId,
          martialArt,
          slowDone: false,
          normalDone: false,
          fightDone: false,
          completed: false,
        }

  const startPhase = (pace: PacePreset, field: 'slowDone' | 'normalDone' | 'fightDone') => {
    // Persist date/combo identity without marking the phase complete yet
    setDailyDrill({
      ...state,
      comboId: combo.id,
      martialArt,
      dateKey: key,
    })

    const config = createDefaultWorkout({
      ...(seed ?? {}),
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
      selectedComboIds: [combo.id],
      speech: {
        ...(seed?.speech ?? preferences.speech),
        callStyle: seed?.callStyle ?? preferences.callStyle,
      },
      sound: seed?.sound ?? preferences.sound,
      sideTerminology: seed?.sideTerminology ?? preferences.sideTerminology,
      resumeBehavior: seed?.resumeBehavior ?? preferences.resumeBehavior,
      includeKnees: seed?.includeKnees,
      includeElbows: seed?.includeElbows,
      includeHeadKicks: seed?.includeHeadKicks,
      includeClinch: seed?.includeClinch,
      defenseFrequency: seed?.defenseFrequency,
      movementFrequency: seed?.movementFrequency,
      categories: seed?.categories,
    })
    navigate('/session', { state: { config, dailyPhase: field } })
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="display text-5xl">Daily Drill</h1>
        <p className="mt-2 max-w-2xl text-[var(--text-muted)]">
          One focused combination. Slow practice, normal practice, then a fight-pace attempt.
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
          onClick={() => startPhase('slow', 'slowDone')}
        />
        <PhaseCard
          title="Normal practice"
          done={state.normalDone}
          onClick={() => startPhase('normal', 'normalDone')}
        />
        <PhaseCard
          title="Fight-pace attempt"
          done={state.fightDone}
          onClick={() => startPhase('fight', 'fightDone')}
        />
      </div>

      {state.completed && (
        <p className="rounded-lg border border-[var(--success)] p-3 text-sm" role="status">
          Daily drill complete for {key}. Consistency beats intensity.
        </p>
      )}
    </div>
  )
}

function PhaseCard({ title, done, onClick }: { title: string; done: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`panel p-4 text-left ${done ? 'border-[var(--success)]' : ''}`} onClick={onClick}>
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{done ? 'Completed' : 'Tap to start'}</p>
    </button>
  )
}
