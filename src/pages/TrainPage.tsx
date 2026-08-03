import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Sparkles, AlertTriangle, ChevronDown } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { createDefaultWorkout } from '../data/defaults'
import { isPaceTooFast } from '../engines/timingEngine'
import { SafetyNotice } from '../components/SafetyNotice'
import { InteractiveCard } from '../components/InteractiveCard'
import { ModeVisual, SportVisual } from '../components/visual'
import { primeTrainingAudio } from '../utils/primeAudio'
import { useOnceAction } from '../hooks/useOnceAction'
import {
  clampNumber,
  parseIntegerInput,
  parseNumberInput,
  validateWorkoutFields,
  WORKOUT_LIMITS,
} from '../utils/workoutValidation'
import type {
  CallStyle,
  Difficulty,
  Equipment,
  MartialArt,
  PacePreset,
  SideTerminology,
  Stance,
  TrainingMode,
  WorkoutConfig,
} from '../types'

const MODES: { id: TrainingMode; title: string; body: string }[] = [
  { id: 'learn', title: 'Learn Mode', body: 'One combo, explanations, step-by-step practice.' },
  { id: 'coach', title: 'Coach Mode', body: 'Continuous combinations with adaptive pacing.' },
  { id: 'round', title: 'Round Mode', body: 'Timed rounds, rest, bells, and summaries.' },
  { id: 'reaction', title: 'Reaction Mode', body: 'Offense, defense, counters, and movement mix.' },
  { id: 'daily', title: 'Daily Drill', body: 'Opens the focused daily drill page.' },
]

export function TrainPage() {
  const navigate = useNavigate()
  const { preferences, updatePreferences } = useApp()
  const [martialArt, setMartialArt] = useState<MartialArt>(preferences.martialArt)
  const [mode, setMode] = useState<TrainingMode>('round')
  const [stance, setStance] = useState<Stance>(preferences.stance)
  const [difficulty, setDifficulty] = useState<Difficulty>(preferences.experience)
  const [equipment, setEquipment] = useState<Equipment>(preferences.equipment)
  const [pace, setPace] = useState<PacePreset>(preferences.pace)
  const [callStyle, setCallStyle] = useState<CallStyle>(preferences.callStyle)
  const [roundsInput, setRoundsInput] = useState('3')
  const [roundDurationInput, setRoundDurationInput] = useState('180')
  const [restDurationInput, setRestDurationInput] = useState('60')
  const [sessionDurationInput, setSessionDurationInput] = useState('180')
  const [customPaceInput, setCustomPaceInput] = useState(String(preferences.customPaceMultiplier))
  const [comboMin, setComboMin] = useState(2)
  const [comboMax, setComboMax] = useState(5)
  const [defenseFrequency, setDefenseFrequency] = useState(preferences.includeDefense ? 0.35 : 0)
  const [movementFrequency, setMovementFrequency] = useState(preferences.includeMovement ? 0.4 : 0)
  const [repetitionFrequency, setRepetitionFrequency] = useState(0.25)
  const [includeKnees, setIncludeKnees] = useState(martialArt === 'muay-thai' && equipment !== 'shadowboxing')
  const [includeElbows, setIncludeElbows] = useState(false)
  const [includeHeadKicks, setIncludeHeadKicks] = useState(false)
  const [includeClinch, setIncludeClinch] = useState(false)
  const [spokenCallsEnabled, setSpokenCallsEnabled] = useState(preferences.speech.spokenCallsEnabled)
  const [captionsEnabled, setCaptionsEnabled] = useState(preferences.speech.captionsEnabled)
  const [bellsEnabled, setBellsEnabled] = useState(preferences.sound.bellsEnabled)
  const [tonesEnabled, setTonesEnabled] = useState(preferences.sound.tonesEnabled)
  const [volumeOn, setVolumeOn] = useState(preferences.sound.masterVolume > 0)
  const [vibrationEnabled, setVibrationEnabled] = useState(preferences.sound.vibrationEnabled)
  const [musicFriendly, setMusicFriendly] = useState(preferences.speech.musicFriendly)
  const [minimalMode, setMinimalMode] = useState(preferences.preferMinimalMode)
  const [largeText, setLargeText] = useState(preferences.largeText)
  const [sideTerminology, setSideTerminology] = useState<SideTerminology>(preferences.sideTerminology)
  const [openAdvanced, setOpenAdvanced] = useState(false)
  const [openAudio, setOpenAudio] = useState(false)
  const [openDisplay, setOpenDisplay] = useState(false)

  const boxing = martialArt === 'boxing'
  const rounds = parseIntegerInput(roundsInput)
  const roundDurationSec = parseIntegerInput(roundDurationInput)
  const restDurationSec = parseIntegerInput(restDurationInput)
  const sessionDurationSec = parseIntegerInput(sessionDurationInput)
  const customPaceMultiplier = parseNumberInput(customPaceInput)
  const validationErrors = useMemo(
    () =>
      validateWorkoutFields({
        rounds: rounds ?? Number.NaN,
        roundDurationSec: roundDurationSec ?? Number.NaN,
        restDurationSec: restDurationSec ?? Number.NaN,
        sessionDurationSec: sessionDurationSec ?? Number.NaN,
        comboMin,
        comboMax,
        customPaceMultiplier: customPaceMultiplier ?? Number.NaN,
        defenseFrequency,
        movementFrequency,
        repetitionFrequency,
      }),
    [
      rounds,
      roundDurationSec,
      restDurationSec,
      sessionDurationSec,
      comboMin,
      comboMax,
      customPaceMultiplier,
      defenseFrequency,
      movementFrequency,
      repetitionFrequency,
    ],
  )
  const configValid = validationErrors.length === 0
  const tooFast = isPaceTooFast(pace, customPaceMultiplier ?? 1)
  const showSessionConfig = mode !== 'daily' && mode !== 'learn'
  const showRoundControls = mode === 'round'
  const showSessionDuration = mode === 'coach' || mode === 'reaction'

  useEffect(() => {
    if (equipment === 'shadowboxing') {
      setIncludeClinch(false)
    }
    if (equipment === 'limited-space') {
      // movement still allowed; clinch remains equipment-gated above
    }
  }, [equipment])

  const selectMartialArt = (art: MartialArt) => {
    setMartialArt(art)
    updatePreferences({ martialArt: art })
    if (art === 'boxing') {
      setIncludeKnees(false)
      setIncludeElbows(false)
      setIncludeHeadKicks(false)
      setIncludeClinch(false)
    }
  }

  const selectMode = (next: TrainingMode) => {
    setMode(next)
    if (next === 'reaction') {
      setDefenseFrequency((v) => Math.max(v, 0.45))
      setMovementFrequency((v) => Math.max(v, 0.4))
    }
  }

  const buildConfig = (overrideMode?: typeof mode): WorkoutConfig => {
    const resolvedMode = overrideMode ?? mode
    const roundish = resolvedMode === 'round'
    const safeRounds = clampNumber(rounds ?? 3, WORKOUT_LIMITS.rounds.min, WORKOUT_LIMITS.rounds.max)
    const safeRoundDur = clampNumber(
      roundDurationSec ?? 180,
      WORKOUT_LIMITS.roundDurationSec.min,
      WORKOUT_LIMITS.roundDurationSec.max,
    )
    const safeRest = clampNumber(
      restDurationSec ?? 60,
      WORKOUT_LIMITS.restDurationSec.min,
      WORKOUT_LIMITS.restDurationSec.max,
    )
    const safeSession = clampNumber(
      sessionDurationSec ?? 180,
      WORKOUT_LIMITS.sessionDurationSec.min,
      WORKOUT_LIMITS.sessionDurationSec.max,
    )
    const safePace = clampNumber(
      customPaceMultiplier ?? 1,
      WORKOUT_LIMITS.customPaceMultiplier.min,
      WORKOUT_LIMITS.customPaceMultiplier.max,
    )
    return createDefaultWorkout({
      martialArt,
      mode: resolvedMode === 'daily' ? 'daily' : resolvedMode === 'learn' ? 'learn' : resolvedMode,
      stance,
      difficulty,
      equipment,
      pace,
      callStyle,
      rounds: roundish ? Math.round(safeRounds) : 1,
      roundDurationSec: roundish ? Math.round(safeRoundDur) : Math.round(safeSession),
      restDurationSec: Math.round(safeRest),
      sessionDurationSec: Math.round(safeSession),
      customPaceMultiplier: safePace,
      comboLength: { min: comboMin, max: Math.max(comboMin, comboMax) },
      defenseFrequency,
      movementFrequency,
      repetitionFrequency,
      includeKnees: boxing ? false : includeKnees,
      includeElbows: boxing ? false : includeElbows,
      includeHeadKicks: boxing ? false : includeHeadKicks,
      includeClinch: boxing ? false : includeClinch && equipment !== 'shadowboxing',
      categories: boxing
        ? ['punch', 'defense', 'movement', 'counter']
        : ['punch', 'kick', 'teep', 'defense', 'movement'],
      speech: {
        ...preferences.speech,
        callStyle,
        spokenCallsEnabled,
        captionsEnabled,
        musicFriendly,
      },
      sound: {
        ...preferences.sound,
        bellsEnabled,
        tonesEnabled,
        vibrationEnabled,
        masterVolume: volumeOn ? Math.max(preferences.sound.masterVolume, 0.75) : 0,
      },
      timingMultipliers: preferences.timingMultipliers,
      sideTerminology,
      largeText,
      minimalMode: minimalMode || preferences.preferMinimalMode,
      resumeBehavior: preferences.resumeBehavior,
      showNextTechnique: !minimalMode,
    })
  }

  const start = useOnceAction(async () => {
    if (!configValid) return
    updatePreferences({
      martialArt,
      stance,
      experience: difficulty,
      callStyle,
      pace,
      equipment,
      largeText,
      sideTerminology,
      preferMinimalMode: minimalMode,
      customPaceMultiplier: customPaceMultiplier ?? preferences.customPaceMultiplier,
      speech: {
        ...preferences.speech,
        callStyle,
        spokenCallsEnabled,
        captionsEnabled,
        musicFriendly,
      },
      sound: {
        ...preferences.sound,
        bellsEnabled,
        tonesEnabled,
        vibrationEnabled,
        masterVolume: volumeOn ? Math.max(preferences.sound.masterVolume, 0.75) : 0,
      },
    })

    if (mode === 'daily') {
      navigate('/daily', { state: { workoutSeed: buildConfig('daily') } })
      return
    }
    if (mode === 'learn') {
      navigate('/learn', { state: { workoutSeed: buildConfig('learn') } })
      return
    }

    await primeTrainingAudio({ musicFriendly })
    navigate('/session', { state: { config: buildConfig(), audioPrimed: true } })
  })

  const equipmentWarning = useMemo(() => {
    if (boxing) return null
    if (equipment === 'shadowboxing' && (includeClinch || includeElbows)) {
      return 'Clinch and elbows are limited or cautioned for solo shadowboxing.'
    }
    if (equipment === 'limited-space') {
      return 'Large lateral movement and circling may be limited in small spaces.'
    }
    return null
  }, [boxing, equipment, includeClinch, includeElbows])

  return (
    <div className="space-y-6">
      <header>
        <h1 className="display text-5xl">Customize Workout</h1>
        <p className="mt-2 max-w-2xl text-[var(--text-muted)]">
          Choose your sport and mode. Advanced options stay collapsed until you need them.
        </p>
      </header>

      <section aria-labelledby="art-heading">
        <h2 id="art-heading" className="mb-3 text-xl font-semibold">
          Martial art
        </h2>
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Martial art">
          {(
            [
              { id: 'muay-thai' as const, title: 'Muay Thai', body: '125 curated combinations' },
              { id: 'boxing' as const, title: 'Boxing', body: '100+ curated combinations' },
            ] as const
          ).map((art) => (
            <SelectableCard
              key={art.id}
              selected={martialArt === art.id}
              title={art.title}
              body={art.body}
              visual={<SportVisual art={art.id} size="md" />}
              onSelect={() => selectMartialArt(art.id)}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="mode-heading">
        <h2 id="mode-heading" className="mb-3 text-xl font-semibold">
          Training mode
        </h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="Training mode">
          {MODES.map((m) => (
            <SelectableCard
              key={m.id}
              selected={mode === m.id}
              title={m.title}
              body={m.body}
              visual={<ModeVisual mode={m.id} size="md" />}
              onSelect={() => selectMode(m.id)}
            />
          ))}
        </div>
        <div className="mt-3">
          <button type="button" className="btn" onClick={() => navigate('/demo')}>
            <Sparkles size={16} aria-hidden /> Try Guided Demo
          </button>
        </div>
      </section>

      {mode === 'daily' ? (
        <section className="panel space-y-3 p-5">
          <p className="text-[var(--text-muted)]">
            Daily Drill uses a separate focused flow with slow → normal → fight-pace practice of one combo.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => void start()} disabled={!configValid}>
            Open Daily Drill
          </button>
        </section>
      ) : (
        <>
          <section className="panel grid gap-4 p-5 md:grid-cols-2" aria-label="Core session settings">
            <Field label="Experience">
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                aria-label="Experience"
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </Field>
            <Field label="Stance">
              <select value={stance} onChange={(e) => setStance(e.target.value as Stance)} aria-label="Stance">
                <option value="orthodox">Orthodox</option>
                <option value="southpaw">Southpaw</option>
              </select>
            </Field>
            <Field label="Calling style">
              <select
                value={callStyle}
                onChange={(e) => setCallStyle(e.target.value as CallStyle)}
                aria-label="Calling style"
              >
                <option value="names">Names</option>
                <option value="numbers">Numbers</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </Field>
            <Field label="Pace">
              <select value={pace} onChange={(e) => setPace(e.target.value as PacePreset)} aria-label="Pace">
                <option value="learn">Learn</option>
                <option value="slow">Slow</option>
                <option value="technical">Technical</option>
                <option value="normal">Normal</option>
                <option value="fast">Fast</option>
                <option value="fight">Fight pace</option>
                <option value="custom">Custom</option>
              </select>
            </Field>

            {showRoundControls && (
              <>
                <Field
                  label="Rounds"
                  hint={`Valid ${WORKOUT_LIMITS.rounds.min}–${WORKOUT_LIMITS.rounds.max}`}
                >
                  <input
                    type="number"
                    min={WORKOUT_LIMITS.rounds.min}
                    max={WORKOUT_LIMITS.rounds.max}
                    value={roundsInput}
                    aria-label="Number of rounds"
                    onChange={(e) => setRoundsInput(e.target.value)}
                  />
                </Field>
                <Field
                  label="Round duration (seconds)"
                  hint={`Valid ${WORKOUT_LIMITS.roundDurationSec.min}–${WORKOUT_LIMITS.roundDurationSec.max}`}
                >
                  <input
                    type="number"
                    min={WORKOUT_LIMITS.roundDurationSec.min}
                    max={WORKOUT_LIMITS.roundDurationSec.max}
                    value={roundDurationInput}
                    aria-label="Round duration in seconds"
                    onChange={(e) => setRoundDurationInput(e.target.value)}
                  />
                </Field>
                <Field
                  label="Rest duration (seconds)"
                  hint={`Valid ${WORKOUT_LIMITS.restDurationSec.min}–${WORKOUT_LIMITS.restDurationSec.max}`}
                >
                  <input
                    type="number"
                    min={WORKOUT_LIMITS.restDurationSec.min}
                    max={WORKOUT_LIMITS.restDurationSec.max}
                    value={restDurationInput}
                    aria-label="Rest duration in seconds"
                    onChange={(e) => setRestDurationInput(e.target.value)}
                  />
                </Field>
              </>
            )}

            {showSessionDuration && (
              <Field
                label="Session duration (seconds)"
                hint={`Valid ${WORKOUT_LIMITS.sessionDurationSec.min}–${WORKOUT_LIMITS.sessionDurationSec.max}`}
              >
                <input
                  type="number"
                  min={WORKOUT_LIMITS.sessionDurationSec.min}
                  max={WORKOUT_LIMITS.sessionDurationSec.max}
                  value={sessionDurationInput}
                  aria-label="Session duration in seconds"
                  onChange={(e) => setSessionDurationInput(e.target.value)}
                />
              </Field>
            )}

            {mode === 'learn' && (
              <p className="md:col-span-2 text-sm text-[var(--text-muted)]">
                Learn Mode opens the guided combo browser. Start Workout continues to Learn Mode.
              </p>
            )}
          </section>

          {showSessionConfig && (
            <>
              <Collapsible
                title="Advanced Training"
                icon={<ModeVisual mode="advanced" size="sm" />}
                open={openAdvanced}
                onToggle={() => setOpenAdvanced((v) => !v)}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label={`Combo length min (${comboMin})`}>
                    <input
                      type="range"
                      min={2}
                      max={6}
                      value={comboMin}
                      aria-label="Minimum combo length"
                      onChange={(e) => setComboMin(Number(e.target.value))}
                    />
                  </Field>
                  <Field label={`Combo length max (${comboMax})`}>
                    <input
                      type="range"
                      min={2}
                      max={8}
                      value={comboMax}
                      aria-label="Maximum combo length"
                      onChange={(e) => setComboMax(Number(e.target.value))}
                    />
                  </Field>
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
                  <Field label={`Repetition frequency (${Math.round(repetitionFrequency * 100)}%)`}>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={repetitionFrequency}
                      aria-label="Repetition frequency"
                      onChange={(e) => setRepetitionFrequency(Number(e.target.value))}
                    />
                  </Field>
                  <Field label="Equipment">
                    <select
                      value={equipment}
                      onChange={(e) => {
                        const next = e.target.value as Equipment
                        setEquipment(next)
                        if (next === 'shadowboxing') {
                          setIncludeClinch(false)
                        }
                      }}
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
                  <Field
                    label={`Custom pace (${Number.isFinite(customPaceMultiplier) ? (customPaceMultiplier as number).toFixed(2) : '—'}x)`}
                    hint={`Valid ${WORKOUT_LIMITS.customPaceMultiplier.min}–${WORKOUT_LIMITS.customPaceMultiplier.max}`}
                  >
                    <input
                      type="number"
                      min={WORKOUT_LIMITS.customPaceMultiplier.min}
                      max={WORKOUT_LIMITS.customPaceMultiplier.max}
                      step={0.05}
                      value={customPaceInput}
                      aria-label="Custom pace multiplier"
                      onChange={(e) => {
                        setCustomPaceInput(e.target.value)
                        setPace('custom')
                      }}
                    />
                  </Field>
                </div>
                {!boxing && (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <label className="flex items-center gap-3">
                      <input type="checkbox" checked={includeKnees} onChange={(e) => setIncludeKnees(e.target.checked)} />
                      Include knees
                    </label>
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={includeElbows}
                        onChange={(e) => setIncludeElbows(e.target.checked)}
                      />
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
                      <input
                        type="checkbox"
                        checked={includeClinch}
                        disabled={equipment === 'shadowboxing'}
                        onChange={(e) => setIncludeClinch(e.target.checked)}
                      />
                      Include clinch
                    </label>
                  </div>
                )}
              </Collapsible>

              <Collapsible
                title="Audio & Feedback"
                icon={<ModeVisual mode="audio" size="sm" />}
                open={openAudio}
                onToggle={() => setOpenAudio((v) => !v)}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={spokenCallsEnabled}
                      onChange={(e) => setSpokenCallsEnabled(e.target.checked)}
                    />
                    Spoken calls enabled
                  </label>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={captionsEnabled}
                      onChange={(e) => setCaptionsEnabled(e.target.checked)}
                    />
                    Captions enabled
                  </label>
                  <label className="flex items-center gap-3">
                    <input type="checkbox" checked={bellsEnabled} onChange={(e) => setBellsEnabled(e.target.checked)} />
                    Round bells
                  </label>
                  <label className="flex items-center gap-3">
                    <input type="checkbox" checked={tonesEnabled} onChange={(e) => setTonesEnabled(e.target.checked)} />
                    Countdown tones
                  </label>
                  <label className="flex items-center gap-3">
                    <input type="checkbox" checked={volumeOn} onChange={(e) => setVolumeOn(e.target.checked)} />
                    Volume on
                  </label>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={vibrationEnabled}
                      onChange={(e) => setVibrationEnabled(e.target.checked)}
                    />
                    Vibration when supported
                  </label>
                </div>
                <div className="mt-4 rounded-lg border border-[var(--border)] p-3">
                  <p className="mb-2 text-sm font-semibold">Advanced Audio</p>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={musicFriendly}
                      onChange={(e) => setMusicFriendly(e.target.checked)}
                    />
                    Music-friendly voice calls
                  </label>
                </div>
              </Collapsible>

              <Collapsible
                title="Display Settings"
                icon={<ModeVisual mode="display" size="sm" />}
                open={openDisplay}
                onToggle={() => setOpenDisplay((v) => !v)}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-3">
                    <input type="checkbox" checked={minimalMode} onChange={(e) => setMinimalMode(e.target.checked)} />
                    Minimal mode
                  </label>
                  <label className="flex items-center gap-3">
                    <input type="checkbox" checked={largeText} onChange={(e) => setLargeText(e.target.checked)} />
                    Large text
                  </label>
                  <Field label="Side terminology">
                    <select
                      value={sideTerminology}
                      onChange={(e) => setSideTerminology(e.target.value as SideTerminology)}
                      aria-label="Side terminology"
                    >
                      <option value="lead-rear">Lead / rear</option>
                      <option value="left-right">Left / right</option>
                    </select>
                  </Field>
                </div>
              </Collapsible>
            </>
          )}

          {tooFast && (
            <p
              className="flex items-start gap-2 rounded-lg border border-[var(--warning)] bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] p-3 text-sm"
              role="status"
            >
              <AlertTriangle size={16} className="mt-0.5" aria-hidden />
              This pace may be too fast for technical practice. Favor control and balance.
            </p>
          )}
          {equipmentWarning && (
            <p className="text-sm text-[var(--warning)]" role="status">
              {equipmentWarning}
            </p>
          )}

          {validationErrors.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-[var(--accent)] p-3 text-sm text-[var(--accent-text)]" role="alert">
              {validationErrors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          )}

          <div className="sticky-start-bar">
            <p className="mb-2 text-sm text-[var(--text-muted)]">
              {martialArt === 'boxing' ? 'Boxing' : 'Muay Thai'} · {mode}
              {showRoundControls
                ? ` · ${roundsInput || '—'} rounds × ${roundDurationInput || '—'}s`
                : showSessionDuration
                  ? ` · ${sessionDurationInput || '—'}s`
                  : ''}{' '}
              · {pace}
            </p>
            <button
              type="button"
              className="btn btn-primary w-full sm:w-auto"
              onClick={() => void start()}
              disabled={!configValid}
            >
              {mode === 'learn' ? 'Open Learn Mode' : 'Start Workout'}
            </button>
          </div>
        </>
      )}

      <SafetyNotice compact />
    </div>
  )
}

function SelectableCard({
  selected,
  title,
  body,
  visual,
  onSelect,
}: {
  selected: boolean
  title: string
  body: string
  visual?: ReactNode
  onSelect: () => void
}) {
  return (
    <InteractiveCard
      role="radio"
      aria-checked={selected}
      selected={selected}
      title={title}
      body={body}
      visual={visual}
      badge={
        selected ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-text)]">
            <Check size={14} aria-hidden /> Selected
          </span>
        ) : (
          <span className="text-xs text-[var(--text-dim)]">Select</span>
        )
      }
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
    />
  )
}

function Collapsible({
  title,
  icon,
  open,
  onToggle,
  children,
}: {
  title: string
  icon?: ReactNode
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <section className="panel overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="flex items-center gap-3 text-lg font-semibold">
          {icon ? (
            <span className="icon-well !h-9 !w-9" aria-hidden>
              {icon}
            </span>
          ) : null}
          {title}
        </span>
        <ChevronDown size={18} className={`transition ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open ? (
        <div className="border-t border-[var(--border)] p-4 onboarding-step-enter">{children}</div>
      ) : null}
    </section>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint ? <p className="mt-1 text-xs text-[var(--text-dim)]">{hint}</p> : null}
    </div>
  )
}
