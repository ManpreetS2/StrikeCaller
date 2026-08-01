import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { BEGINNER_COMBOS, INTERMEDIATE_COMBOS } from '../data/combos'
import { ComboDisplay } from '../components/ComboDisplay'
import { useApp } from '../context/AppContext'
import { createDefaultWorkout } from '../data/defaults'
import type { PacePreset } from '../types'

function dateKey(d = new Date()) {
  return d.toISOString().slice(0, 10)
}

function pickDailyComboId(key: string): string {
  const pool = [...BEGINNER_COMBOS, ...INTERMEDIATE_COMBOS]
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash + key.charCodeAt(i) * (i + 1)) % pool.length
  return pool[hash]!.id
}

export function DailyPage() {
  const navigate = useNavigate()
  const { preferences, dailyDrill, setDailyDrill } = useApp()
  const key = dateKey()

  const comboId = useMemo(() => {
    if (dailyDrill?.dateKey === key) return dailyDrill.comboId
    return pickDailyComboId(key)
  }, [dailyDrill, key])

  const combo = useMemo(
    () => [...BEGINNER_COMBOS, ...INTERMEDIATE_COMBOS].find((c) => c.id === comboId) ?? BEGINNER_COMBOS[0]!,
    [comboId],
  )

  const state =
    dailyDrill?.dateKey === key
      ? dailyDrill
      : {
          dateKey: key,
          comboId,
          slowDone: false,
          normalDone: false,
          fightDone: false,
          completed: false,
        }

  const startPhase = (pace: PacePreset, field: 'slowDone' | 'normalDone' | 'fightDone') => {
    const next = {
      ...state,
      comboId: combo.id,
      dateKey: key,
      [field]: true,
    }
    const completed = Boolean(next.slowDone && next.normalDone && next.fightDone)
    setDailyDrill({ ...next, completed })

    const config = createDefaultWorkout({
      mode: 'daily',
      stance: preferences.stance,
      difficulty: preferences.experience,
      pace,
      callStyle: preferences.callStyle,
      sessionDurationSec: 45,
      roundDurationSec: 45,
      rounds: 1,
      selectedComboIds: [combo.id],
      speech: { ...preferences.speech, callStyle: preferences.callStyle },
      sound: preferences.sound,
      sideTerminology: preferences.sideTerminology,
      resumeBehavior: preferences.resumeBehavior,
    })
    navigate('/session', { state: { config } })
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
        callStyle={preferences.callStyle}
        stance={preferences.stance}
        terminology={preferences.sideTerminology}
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
