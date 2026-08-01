import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { createDefaultWorkout } from '../data/defaults'
import { isPaceTooFast } from '../engines/timingEngine'
import { SafetyNotice } from '../components/SafetyNotice'
import type {
  CallStyle,
  Difficulty,
  Equipment,
  PacePreset,
  Stance,
  TrainingMode,
  WorkoutConfig,
} from '../types'
import { AlertTriangle } from 'lucide-react'

const MODES: { id: TrainingMode; title: string; body: string }[] = [
  { id: 'learn', title: 'Learn Mode', body: 'One combo, explanations, step-by-step practice.' },
  { id: 'coach', title: 'Coach Mode', body: 'Continuous combinations with adaptive pacing.' },
  { id: 'round', title: 'Round Mode', body: 'Timed rounds, rest, bells, and summaries.' },
  { id: 'reaction', title: 'Reaction Mode', body: 'Offense, defense, counters, and movement mix.' },
  { id: 'daily', title: 'Daily Drill', body: 'Focused combination with pace progression.' },
  { id: 'demo', title: 'Guided Demo', body: 'Recruiter-friendly 60s technical showcase.' },
]

export function TrainPage() {
  const navigate = useNavigate()
  const { preferences } = useApp()
  const [mode, setMode] = useState<TrainingMode>('round')
  const [stance, setStance] = useState<Stance>(preferences.stance)
  const [difficulty, setDifficulty] = useState<Difficulty>(preferences.experience)
  const [equipment, setEquipment] = useState<Equipment>(preferences.equipment)
  const [pace, setPace] = useState<PacePreset>(preferences.pace)
  const [callStyle, setCallStyle] = useState<CallStyle>(preferences.callStyle)
  const [rounds, setRounds] = useState(3)
  const [roundDurationSec, setRoundDurationSec] = useState(180)
  const [restDurationSec, setRestDurationSec] = useState(60)
  const [sessionDurationSec, setSessionDurationSec] = useState(180)
  const [customPaceMultiplier, setCustomPaceMultiplier] = useState(preferences.customPaceMultiplier)
  const [defenseFrequency, setDefenseFrequency] = useState(preferences.includeDefense ? 0.35 : 0)
  const [movementFrequency, setMovementFrequency] = useState(preferences.includeMovement ? 0.4 : 0)
  const [includeKnees, setIncludeKnees] = useState(equipment !== 'shadowboxing')
  const [includeElbows, setIncludeElbows] = useState(false)
  const [includeHeadKicks, setIncludeHeadKicks] = useState(false)
  const [includeClinch, setIncludeClinch] = useState(false)

  const tooFast = isPaceTooFast(pace, customPaceMultiplier)

  const equipmentWarning = useMemo(() => {
    if (equipment === 'shadowboxing' && (includeClinch || includeElbows)) {
      return 'Clinch and elbows are limited or cautioned for solo shadowboxing.'
    }
    if (equipment === 'limited-space') {
      return 'Large lateral movement and circling may be limited in small spaces.'
    }
    return null
  }, [equipment, includeClinch, includeElbows])

  const start = () => {
    if (mode === 'daily') {
      navigate('/daily')
      return
    }
    if (mode === 'demo') {
      navigate('/demo')
      return
    }
    if (mode === 'learn') {
      navigate('/learn')
      return
    }

    const config: WorkoutConfig = createDefaultWorkout({
      mode,
      stance,
      difficulty,
      equipment,
      pace,
      callStyle,
      rounds,
      roundDurationSec: mode === 'round' ? roundDurationSec : sessionDurationSec,
      restDurationSec,
      sessionDurationSec,
      customPaceMultiplier,
      defenseFrequency,
      movementFrequency,
      includeKnees,
      includeElbows,
      includeHeadKicks,
      includeClinch: includeClinch && equipment !== 'shadowboxing',
      speech: { ...preferences.speech, callStyle },
      sound: preferences.sound,
      timingMultipliers: preferences.timingMultipliers,
      sideTerminology: preferences.sideTerminology,
      largeText: preferences.largeText,
      resumeBehavior: preferences.resumeBehavior,
      comboLength:
        mode === 'reaction'
          ? { min: 2, max: difficulty === 'advanced' ? 5 : 4 }
          : { min: 2, max: difficulty === 'beginner' ? 4 : 5 },
    })

    navigate('/session', { state: { config } })
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="display text-5xl">Customize Workout</h1>
        <p className="mt-2 max-w-2xl text-[var(--text-muted)]">
          Full session controls. During rounds, StrikeCaller keeps calls short and clear.
        </p>
      </header>

      <section aria-labelledby="mode-heading">
        <h2 id="mode-heading" className="mb-3 text-xl font-semibold">
          Training mode
        </h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`panel p-4 text-left ${mode === m.id ? 'border-[var(--accent)]' : ''}`}
              aria-pressed={mode === m.id}
              onClick={() => setMode(m.id)}
            >
              <h3 className="font-semibold">{m.title}</h3>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{m.body}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="panel grid gap-4 p-5 md:grid-cols-2" aria-label="Session settings">
        <Field label="Stance">
          <select value={stance} onChange={(e) => setStance(e.target.value as Stance)} aria-label="Stance">
            <option value="orthodox">Orthodox</option>
            <option value="southpaw">Southpaw</option>
          </select>
        </Field>
        <Field label="Difficulty">
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            aria-label="Difficulty"
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </Field>
        <Field label="Equipment">
          <select
            value={equipment}
            onChange={(e) => setEquipment(e.target.value as Equipment)}
            aria-label="Equipment"
          >
            <option value="shadowboxing">Shadowboxing</option>
            <option value="heavy-bag">Heavy bag</option>
            <option value="pads">Pads</option>
            <option value="partner">Partner drill</option>
            <option value="open-space">Open space</option>
            <option value="limited-space">Limited space</option>
          </select>
        </Field>
        <Field label="Call style">
          <select
            value={callStyle}
            onChange={(e) => setCallStyle(e.target.value as CallStyle)}
            aria-label="Call style"
          >
            <option value="names">Technique names</option>
            <option value="numbers">Numbers</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </Field>
        <Field label="Pace">
          <select value={pace} onChange={(e) => setPace(e.target.value as PacePreset)} aria-label="Pace preset">
            <option value="learn">Learn</option>
            <option value="slow">Slow</option>
            <option value="technical">Technical</option>
            <option value="normal">Normal</option>
            <option value="fast">Fast</option>
            <option value="fight">Fight pace</option>
            <option value="custom">Custom</option>
          </select>
        </Field>
        <Field label={`Custom pace multiplier (${customPaceMultiplier.toFixed(2)}x)`}>
          <input
            type="range"
            min={0.55}
            max={2.5}
            step={0.05}
            value={customPaceMultiplier}
            aria-label="Custom pace multiplier"
            onChange={(e) => {
              setCustomPaceMultiplier(Number(e.target.value))
              setPace('custom')
            }}
          />
        </Field>

        {mode === 'round' ? (
          <>
            <Field label="Rounds">
              <input
                type="number"
                min={1}
                max={12}
                value={rounds}
                aria-label="Number of rounds"
                onChange={(e) => setRounds(Number(e.target.value))}
              />
            </Field>
            <Field label="Round duration (seconds)">
              <input
                type="number"
                min={30}
                max={300}
                value={roundDurationSec}
                aria-label="Round duration in seconds"
                onChange={(e) => setRoundDurationSec(Number(e.target.value))}
              />
            </Field>
            <Field label="Rest duration (seconds)">
              <input
                type="number"
                min={15}
                max={180}
                value={restDurationSec}
                aria-label="Rest duration in seconds"
                onChange={(e) => setRestDurationSec(Number(e.target.value))}
              />
            </Field>
          </>
        ) : (
          <Field label="Session duration (seconds)">
            <input
              type="number"
              min={30}
              max={900}
              value={sessionDurationSec}
              aria-label="Session duration in seconds"
              onChange={(e) => setSessionDurationSec(Number(e.target.value))}
            />
          </Field>
        )}

        <Field label={`Defense frequency (${Math.round(defenseFrequency * 100)}%)`}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={defenseFrequency}
            aria-label="Defense frequency"
            onChange={(e) => setDefenseFrequency(Number(e.target.value))}
          />
        </Field>
        <Field label={`Movement frequency (${Math.round(movementFrequency * 100)}%)`}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={movementFrequency}
            aria-label="Movement frequency"
            onChange={(e) => setMovementFrequency(Number(e.target.value))}
          />
        </Field>
      </section>

      <section className="panel space-y-3 p-5" aria-label="Technique filters">
        <h2 className="text-lg font-semibold">Technique filters</h2>
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={includeKnees} onChange={(e) => setIncludeKnees(e.target.checked)} />
          Include knees
        </label>
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={includeElbows} onChange={(e) => setIncludeElbows(e.target.checked)} />
          Include elbows
        </label>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={includeHeadKicks}
            onChange={(e) => setIncludeHeadKicks(e.target.checked)}
          />
          Include head kicks
        </label>
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={includeClinch} onChange={(e) => setIncludeClinch(e.target.checked)} />
          Include clinch (partner / bag)
        </label>
      </section>

      {tooFast && (
        <p className="flex items-start gap-2 rounded-lg border border-[var(--warning)] bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] p-3 text-sm" role="status">
          <AlertTriangle size={16} className="mt-0.5" aria-hidden />
          This pace may be too fast for technical practice. Favor control and balance.
        </p>
      )}
      {equipmentWarning && (
        <p className="text-sm text-[var(--warning)]" role="status">
          {equipmentWarning}
        </p>
      )}

      <button type="button" className="btn btn-primary" onClick={start}>
        Begin session
      </button>

      <SafetyNotice compact />
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  )
}
