import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Sparkles, AlertTriangle, ChevronDown } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { createDefaultWorkout } from '../data/defaults'
import { isPaceTooFast } from '../engines/timingEngine'
import { SafetyNotice } from '../components/SafetyNotice'
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
  const [rounds, setRounds] = useState(3)
  const [roundDurationSec, setRoundDurationSec] = useState(180)
  const [restDurationSec, setRestDurationSec] = useState(60)
  const [sessionDurationSec, setSessionDurationSec] = useState(180)
  const [customPaceMultiplier, setCustomPaceMultiplier] = useState(preferences.customPaceMultiplier)
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
  const [minimalMode, setMinimalMode] = useState(false)
  const [largeText, setLargeText] = useState(preferences.largeText)
  const [sideTerminology, setSideTerminology] = useState<SideTerminology>(preferences.sideTerminology)
  const [openAdvanced, setOpenAdvanced] = useState(false)
  const [openAudio, setOpenAudio] = useState(false)
  const [openDisplay, setOpenDisplay] = useState(false)

  const boxing = martialArt === 'boxing'
  const tooFast = isPaceTooFast(pace, customPaceMultiplier)
  const showSessionConfig = mode !== 'daily' && mode !== 'learn'
  const showRoundControls = mode === 'round'
  const showSessionDuration = mode === 'coach' || mode === 'reaction'

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

  const buildConfig = (): WorkoutConfig =>
    createDefaultWorkout({
      martialArt,
      mode: mode === 'daily' || mode === 'learn' ? 'coach' : mode,
      stance,
      difficulty,
      equipment,
      pace,
      callStyle,
      rounds: showRoundControls ? rounds : 1,
      roundDurationSec: showRoundControls ? roundDurationSec : sessionDurationSec,
      restDurationSec,
      sessionDurationSec,
      customPaceMultiplier,
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
      minimalMode,
      resumeBehavior: preferences.resumeBehavior,
      showNextTechnique: !minimalMode,
    })

  const start = () => {
    updatePreferences({
      martialArt,
      stance,
      experience: difficulty,
      callStyle,
      pace,
      equipment,
      largeText,
      sideTerminology,
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
      navigate('/daily')
      return
    }
    if (mode === 'learn') {
      navigate('/learn')
      return
    }

    navigate('/session', { state: { config: buildConfig() } })
  }

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
          <button type="button" className="btn btn-primary" onClick={start}>
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
            )}

            {showSessionDuration && (
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

            {mode === 'learn' && (
              <p className="md:col-span-2 text-sm text-[var(--text-muted)]">
                Learn Mode opens the guided combo browser. Start Workout continues to Learn Mode.
              </p>
            )}
          </section>

          {showSessionConfig && (
            <>
              <Collapsible title="Advanced Training" open={openAdvanced} onToggle={() => setOpenAdvanced((v) => !v)}>
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
                  <Field label={`Custom pace (${customPaceMultiplier.toFixed(2)}x)`}>
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
                        onChange={(e) => setIncludeClinch(e.target.checked)}
                      />
                      Include clinch
                    </label>
                  </div>
                )}
              </Collapsible>

              <Collapsible title="Audio & Feedback" open={openAudio} onToggle={() => setOpenAudio((v) => !v)}>
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

              <Collapsible title="Display Settings" open={openDisplay} onToggle={() => setOpenDisplay((v) => !v)}>
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

          <button type="button" className="btn btn-primary" onClick={start}>
            {mode === 'learn' ? 'Open Learn Mode' : 'Start Workout'}
          </button>
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
  onSelect,
}: {
  selected: boolean
  title: string
  body: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={`panel p-4 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
        selected ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]' : ''
      }`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        {selected ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-text)]">
            <Check size={14} aria-hidden /> Selected
          </span>
        ) : (
          <span className="text-xs text-[var(--text-dim)]">Select</span>
        )}
      </div>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{body}</p>
    </button>
  )
}

function Collapsible({
  title,
  open,
  onToggle,
  children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <section className="panel overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="text-lg font-semibold">{title}</span>
        <ChevronDown size={18} className={`transition ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && <div className="border-t border-[var(--border)] p-4">{children}</div>}
    </section>
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
