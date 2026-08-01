import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { flushSync } from 'react-dom'
import { useApp } from '../context/AppContext'
import { SafetyNotice } from '../components/SafetyNotice'
import { getQuickStartPreset, type QuickStartId } from '../data/quickStart'
import type { CallStyle, Difficulty, Stance } from '../types'

const STEPS = ['Stance', 'Experience', 'Calling style'] as const

interface OnboardingLocationState {
  after?: 'quick' | 'train'
  quickId?: QuickStartId
}

export function OnboardingPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const navState = (location.state as OnboardingLocationState | null) ?? {}
  const { preferences, updatePreferences } = useApp()
  const [step, setStep] = useState(0)
  const [stance, setStance] = useState<Stance>(preferences.stance)
  const [experience, setExperience] = useState<Difficulty>(preferences.experience)
  const [callStyle, setCallStyle] = useState<CallStyle>(preferences.callStyle)

  const finish = (skipped = false) => {
    const nextPrefs = {
      stance: skipped ? preferences.stance : stance,
      experience: skipped ? preferences.experience : experience,
      callStyle: skipped ? preferences.callStyle : callStyle,
      onboardingComplete: true,
      speech: {
        ...preferences.speech,
        callStyle: skipped ? preferences.callStyle : callStyle,
      },
    }

    flushSync(() => {
      updatePreferences(nextPrefs)
    })

    if (navState.after === 'quick' && navState.quickId) {
      const preset = getQuickStartPreset(navState.quickId)
      if (preset.routeToDaily) {
        navigate('/daily')
        return
      }
      const merged = { ...preferences, ...nextPrefs, speech: nextPrefs.speech }
      navigate('/session', { state: { config: preset.build(merged) } })
      return
    }

    navigate(navState.after === 'train' ? '/train' : '/')
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-[var(--accent-text)]">First run</p>
        <h1 className="display mt-2 text-5xl">Three quick choices</h1>
        <p className="mt-2 text-[var(--text-muted)]">
          Stance, experience, and how calls sound. Everything else can wait — change it anytime in Settings.
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
            title="Calling style"
            options={[
              { id: 'names', label: 'Technique names' },
              { id: 'numbers', label: 'Numbers' },
              { id: 'hybrid', label: 'Hybrid' },
            ]}
            value={callStyle}
            onChange={(v) => setCallStyle(v as CallStyle)}
          />
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
              Save and continue
            </button>
          )}
          <button type="button" className="btn" onClick={() => finish(true)}>
            Skip and use recommended settings
          </button>
        </div>
      </section>

      <p className="text-sm text-[var(--text-dim)]">
        Equipment, pace, defense, movement, and theme stay optional. Open Settings anytime to refine them.
      </p>

      <SafetyNotice compact />
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
