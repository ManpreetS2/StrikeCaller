import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { flushSync } from 'react-dom'
import { useApp } from '../context/AppContext'
import { SafetyNotice } from '../components/SafetyNotice'
import type { CallStyle, Difficulty, Equipment, PacePreset, Stance, ThemePreference } from '../types'

const STEPS = [
  'Stance',
  'Experience',
  'Call style',
  'Equipment',
  'Pace',
  'Theme',
  'Defense & movement',
] as const

export function OnboardingPage() {
  const navigate = useNavigate()
  const { preferences, updatePreferences } = useApp()
  const [step, setStep] = useState(0)
  const [stance, setStance] = useState<Stance>(preferences.stance)
  const [experience, setExperience] = useState<Difficulty>(preferences.experience)
  const [callStyle, setCallStyle] = useState<CallStyle>(preferences.callStyle)
  const [equipment, setEquipment] = useState<Equipment>(preferences.equipment)
  const [pace, setPace] = useState<PacePreset>(preferences.pace)
  const [theme, setTheme] = useState<ThemePreference>(preferences.theme)
  const [includeDefense, setIncludeDefense] = useState(preferences.includeDefense)
  const [includeMovement, setIncludeMovement] = useState(preferences.includeMovement)

  const finish = (skipped = false) => {
    flushSync(() => {
      updatePreferences({
        stance,
        experience,
        callStyle,
        equipment,
        pace,
        theme,
        includeDefense,
        includeMovement,
        onboardingComplete: true,
        speech: { ...preferences.speech, callStyle },
      })
    })
    void skipped
    navigate('/train')
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-[var(--accent-text)]">First run</p>
        <h1 className="display mt-2 text-5xl">Quick setup</h1>
        <p className="mt-2 text-[var(--text-muted)]">
          Skippable preferences so StrikeCaller can call combos your way. Technique quality matters more than
          speed.
        </p>
      </header>

      <div className="flex flex-wrap gap-2" aria-label="Onboarding progress">
        {STEPS.map((label, index) => (
          <span key={label} className={`chip ${index === step ? 'chip-active' : ''}`}>
            {index + 1}. {label}
          </span>
        ))}
      </div>

      <section className="panel space-y-4 p-5" aria-live="polite">
        {step === 0 && (
          <Choice
            title="Your stance"
            options={[
              { id: 'orthodox', label: 'Orthodox' },
              { id: 'southpaw', label: 'Southpaw' },
            ]}
            value={stance}
            onChange={(v) => setStance(v as Stance)}
          />
        )}
        {step === 1 && (
          <Choice
            title="Experience level"
            options={[
              { id: 'beginner', label: 'Beginner' },
              { id: 'intermediate', label: 'Intermediate' },
              { id: 'advanced', label: 'Advanced' },
            ]}
            value={experience}
            onChange={(v) => setExperience(v as Difficulty)}
          />
        )}
        {step === 2 && (
          <Choice
            title="Preferred call style"
            options={[
              { id: 'names', label: 'Technique names' },
              { id: 'numbers', label: 'Numbers' },
              { id: 'hybrid', label: 'Hybrid' },
            ]}
            value={callStyle}
            onChange={(v) => setCallStyle(v as CallStyle)}
          />
        )}
        {step === 3 && (
          <Choice
            title="Training equipment"
            options={[
              { id: 'shadowboxing', label: 'Shadowboxing' },
              { id: 'heavy-bag', label: 'Heavy bag' },
              { id: 'pads', label: 'Pads' },
              { id: 'partner', label: 'Partner drill' },
              { id: 'open-space', label: 'Open space' },
              { id: 'limited-space', label: 'Limited space' },
            ]}
            value={equipment}
            onChange={(v) => setEquipment(v as Equipment)}
          />
        )}
        {step === 4 && (
          <Choice
            title="Default pace"
            options={[
              { id: 'learn', label: 'Learn' },
              { id: 'slow', label: 'Slow' },
              { id: 'technical', label: 'Technical' },
              { id: 'normal', label: 'Normal' },
              { id: 'fast', label: 'Fast' },
              { id: 'fight', label: 'Fight pace' },
            ]}
            value={pace}
            onChange={(v) => setPace(v as PacePreset)}
          />
        )}
        {step === 5 && (
          <Choice
            title="Theme"
            options={[
              { id: 'dark', label: 'Dark' },
              { id: 'light', label: 'Light' },
              { id: 'system', label: 'System' },
            ]}
            value={theme}
            onChange={(v) => setTheme(v as ThemePreference)}
          />
        )}
        {step === 6 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Include defense and movement?</h2>
            <p className="text-sm text-[var(--text-muted)]">Defaults to enabled — recommended for realistic drills.</p>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={includeDefense}
                onChange={(e) => setIncludeDefense(e.target.checked)}
              />
              Include defense and counters
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={includeMovement}
                onChange={(e) => setIncludeMovement(e.target.checked)}
              />
              Include movement and exits
            </label>
          </div>
        )}

        <div className="flex flex-wrap gap-3 pt-2">
          {step > 0 && (
            <button type="button" className="btn btn-ghost" onClick={() => setStep((s) => s - 1)}>
              Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn btn-primary" onClick={() => setStep((s) => s + 1)}>
              Continue
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => finish(false)}>
              Start training
            </button>
          )}
          <button type="button" className="btn" onClick={() => finish(true)}>
            Skip setup
          </button>
        </div>
      </section>

      <SafetyNotice />
    </div>
  )
}

function Choice({
  title,
  options,
  value,
  onChange,
}: {
  title: string
  options: { id: string; label: string }[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <fieldset>
      <legend className="mb-3 text-xl font-semibold">{title}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`btn justify-start ${value === opt.id ? 'chip-active' : ''}`}
            aria-pressed={value === opt.id}
            onClick={() => onChange(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
