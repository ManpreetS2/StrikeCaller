import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { filterCombos } from '../data/combos'
import { ComboDisplay } from '../components/ComboDisplay'
import { useApp } from '../context/AppContext'
import { createDefaultWorkout } from '../data/defaults'
import { getTechnique } from '../data/techniques'
import type { PacePreset, WorkoutConfig } from '../types'

interface LearnLocationState {
  workoutSeed?: WorkoutConfig
}

export function LearnPage() {
  const { preferences } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const seed = (location.state as LearnLocationState | null)?.workoutSeed
  const martialArt = seed?.martialArt ?? preferences.martialArt
  const stance = seed?.stance ?? preferences.stance
  const callStyle = seed?.callStyle ?? preferences.callStyle
  const terminology = seed?.sideTerminology ?? preferences.sideTerminology
  const difficulty = seed?.difficulty ?? preferences.experience

  const combos = useMemo(
    () =>
      filterCombos({
        martialArt,
        difficulty,
        includeDefense: (seed?.defenseFrequency ?? 0.35) > 0,
        includeMovement: (seed?.movementFrequency ?? 0.4) > 0,
        includeClinch: Boolean(seed?.includeClinch),
        includeElbows: Boolean(seed?.includeElbows),
        includeHeadKicks: Boolean(seed?.includeHeadKicks),
        includeKnees: martialArt === 'muay-thai' && (seed?.includeKnees ?? true),
        equipment: seed?.equipment,
      }),
    [martialArt, difficulty, seed],
  )
  const [index, setIndex] = useState(0)
  const [step, setStep] = useState(0)
  const [pace, setPace] = useState<PacePreset>(seed?.pace === 'fight' || seed?.pace === 'fast' ? 'technical' : seed?.pace ?? 'learn')
  const combo = combos[index] ?? combos[0]

  if (!combo) {
    return <p>No combinations available.</p>
  }

  const technique = getTechnique(combo.techniques[Math.min(step, combo.techniques.length - 1)]!.techniqueId)

  const practice = () => {
    const config = createDefaultWorkout({
      ...(seed ?? {}),
      martialArt,
      mode: 'learn',
      stance,
      difficulty,
      pace,
      callStyle,
      sessionDurationSec: seed?.sessionDurationSec ?? 90,
      roundDurationSec: seed?.roundDurationSec ?? 90,
      rounds: 1,
      selectedComboIds: [combo.id],
      speech: { ...(seed?.speech ?? preferences.speech), callStyle },
      sound: seed?.sound ?? preferences.sound,
      sideTerminology: terminology,
      resumeBehavior: seed?.resumeBehavior ?? preferences.resumeBehavior,
    })
    navigate('/session', { state: { config } })
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="display text-5xl">Learn Mode</h1>
        <p className="mt-2 max-w-2xl text-[var(--text-muted)]">
          Study one combination, practice each technique, then gradually increase pace.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn"
          disabled={index <= 0}
          onClick={() => {
            setIndex((i) => Math.max(0, i - 1))
            setStep(0)
          }}
        >
          Previous combo
        </button>
        <button
          type="button"
          className="btn"
          disabled={index >= combos.length - 1}
          onClick={() => {
            setIndex((i) => Math.min(combos.length - 1, i + 1))
            setStep(0)
          }}
        >
          Next combo
        </button>
      </div>

      <ComboDisplay
        combo={combo}
        activeIndex={step}
        callStyle={callStyle}
        stance={stance}
        terminology={terminology}
      />

      <section className="panel space-y-3 p-5">
        <h2 className="text-xl font-semibold">Step-by-step</h2>
        <p className="text-2xl font-semibold text-[var(--accent-text)]">{technique.name}</p>
        <p className="text-sm text-[var(--text-muted)]">{technique.coachingCue}</p>
        {technique.safetyNote && <p className="text-sm text-[var(--warning)]">{technique.safetyNote}</p>}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn"
            disabled={step <= 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Previous technique
          </button>
          <button
            type="button"
            className="btn"
            disabled={step >= combo.techniques.length - 1}
            onClick={() => setStep((s) => Math.min(combo.techniques.length - 1, s + 1))}
          >
            Next technique
          </button>
          <button type="button" className="btn" onClick={() => setStep(0)}>
            Repeat from start
          </button>
        </div>
      </section>

      <div className="field max-w-xs">
        <label htmlFor="learn-pace">Practice pace</label>
        <select
          id="learn-pace"
          value={pace}
          onChange={(e) => setPace(e.target.value as PacePreset)}
        >
          <option value="learn">Learn</option>
          <option value="slow">Slow</option>
          <option value="technical">Technical</option>
          <option value="normal">Normal</option>
        </select>
      </div>

      <button type="button" className="btn btn-primary" onClick={practice}>
        Practice with coach calls
      </button>
    </div>
  )
}
