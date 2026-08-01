import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { filterCombos } from '../data/combos'
import { ComboDisplay } from '../components/ComboDisplay'
import { useApp } from '../context/AppContext'
import { createDefaultWorkout } from '../data/defaults'
import { getTechnique } from '../data/techniques'
import type { PacePreset } from '../types'

export function LearnPage() {
  const { preferences } = useApp()
  const navigate = useNavigate()
  const combos = useMemo(
    () =>
      filterCombos({
        difficulty: preferences.experience,
        includeDefense: preferences.includeDefense,
        includeMovement: preferences.includeMovement,
        includeClinch: false,
        includeElbows: false,
        includeHeadKicks: false,
      }),
    [preferences],
  )
  const [index, setIndex] = useState(0)
  const [step, setStep] = useState(0)
  const [pace, setPace] = useState<PacePreset>('learn')
  const combo = combos[index] ?? combos[0]

  if (!combo) {
    return <p>No combinations available.</p>
  }

  const technique = getTechnique(combo.techniques[Math.min(step, combo.techniques.length - 1)]!.techniqueId)

  const practice = () => {
    const config = createDefaultWorkout({
      mode: 'learn',
      stance: preferences.stance,
      difficulty: preferences.experience,
      pace,
      callStyle: preferences.callStyle,
      sessionDurationSec: 90,
      roundDurationSec: 90,
      rounds: 1,
      selectedComboIds: [combo.id],
      speech: { ...preferences.speech, callStyle: preferences.callStyle },
      sound: preferences.sound,
      sideTerminology: preferences.sideTerminology,
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
        callStyle={preferences.callStyle}
        stance={preferences.stance}
        terminology={preferences.sideTerminology}
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
