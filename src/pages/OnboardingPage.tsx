import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { flushSync } from 'react-dom'
import { useApp } from '../context/AppContext'
import { SafetyNotice } from '../components/SafetyNotice'
import { getQuickStartPreset, type QuickStartId } from '../data/quickStart'
import type { CallStyle, Difficulty, MartialArt, Stance } from '../types'

const STEPS = ['Martial art', 'Stance', 'Experience', 'Calling style'] as const

const RECOMMENDED = {
  martialArt: 'muay-thai' as MartialArt,
  stance: 'orthodox' as Stance,
  experience: 'beginner' as Difficulty,
  callStyle: 'hybrid' as CallStyle,
}

interface OnboardingLocationState {
  after?: 'quick' | 'train' | 'session' | 'daily' | 'learn' | 'builder' | string
  quickId?: QuickStartId
  from?: string
}

export function OnboardingPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const navState = (location.state as OnboardingLocationState | null) ?? {}
  const { preferences, updatePreferences } = useApp()
  const updating = preferences.onboardingComplete
  const redirectToSettings =
    preferences.onboardingComplete && !navState.after && !navState.from

  const [step, setStep] = useState(0)
  const [martialArt, setMartialArt] = useState<MartialArt>(preferences.martialArt)
  const [stance, setStance] = useState<Stance>(preferences.stance)
  const [experience, setExperience] = useState<Difficulty>(preferences.experience)
  const [callStyle, setCallStyle] = useState<CallStyle>(preferences.callStyle)
  const [touched, setTouched] = useState({
    martialArt: false,
    stance: false,
    experience: false,
    callStyle: false,
  })

  // Completed setup opened directly → Settings (not a fake “first run”)
  if (redirectToSettings) {
    return <Navigate to="/settings" replace />
  }

  const markTouched = (key: keyof typeof touched) => {
    setTouched((prev) => ({ ...prev, [key]: true }))
  }

  const finish = (skipped: boolean) => {
    const resolvedMartialArt =
      !skipped || touched.martialArt || step > 0 ? martialArt : RECOMMENDED.martialArt
    const resolvedStance =
      !skipped || touched.stance || step > 1 ? stance : RECOMMENDED.stance
    const resolvedExperience =
      !skipped || touched.experience || step > 2 ? experience : RECOMMENDED.experience
    const resolvedCallStyle =
      !skipped || touched.callStyle || step > 3 ? callStyle : RECOMMENDED.callStyle

    const nextPrefs = {
      martialArt: resolvedMartialArt,
      stance: resolvedStance,
      experience: resolvedExperience,
      callStyle: resolvedCallStyle,
      onboardingComplete: true,
      speech: {
        ...preferences.speech,
        callStyle: resolvedCallStyle,
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

    const dest =
      navState.after === 'train'
        ? '/train'
        : navState.after === 'daily'
          ? '/daily'
          : navState.after === 'learn'
            ? '/learn'
            : navState.after === 'builder'
              ? '/builder'
              : navState.after === 'session'
                ? '/train'
                : navState.from && navState.from !== '/onboarding'
                  ? navState.from
                  : '/'
    navigate(dest)
  }

  const continueStep = () => {
    if (step === 0) markTouched('martialArt')
    if (step === 1) markTouched('stance')
    if (step === 2) markTouched('experience')
    if (step === 3) markTouched('callStyle')
    if (step < STEPS.length - 1) setStep((s) => s + 1)
    else finish(false)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-[var(--accent-text)]">
          {updating ? 'Update training setup' : 'First run'}
        </p>
        <h1 className="display mt-2 text-5xl">
          {updating ? 'Update your setup' : 'Four quick choices'}
        </h1>
        <p className="mt-2 text-[var(--text-muted)]">
          Martial art, stance, experience, and how calls sound. Everything else can wait — change it anytime in
          Settings.
        </p>
      </header>

      <div className="flex flex-wrap gap-2" aria-label="Onboarding progress">
        {STEPS.map((label, index) => (
          <span
            key={label}
            className={`chip ${index === step ? 'chip-active' : ''}`}
            aria-current={index === step ? 'step' : undefined}
          >
            {index + 1}. {label}
          </span>
        ))}
      </div>

      <section className="panel space-y-4 p-5" aria-live="polite">
        {step === 0 && (
          <Choice
            title="Martial art"
            options={[
              { id: 'muay-thai', label: 'Muay Thai' },
              { id: 'boxing', label: 'Boxing' },
            ]}
            value={martialArt}
            onChange={(v) => {
              setMartialArt(v as MartialArt)
              markTouched('martialArt')
            }}
          />
        )}
        {step === 1 && (
          <Choice
            title="Your stance"
            options={[
              { id: 'orthodox', label: 'Orthodox' },
              { id: 'southpaw', label: 'Southpaw' },
            ]}
            value={stance}
            onChange={(v) => {
              setStance(v as Stance)
              markTouched('stance')
            }}
          />
        )}
        {step === 2 && (
          <Choice
            title="Experience level"
            options={[
              { id: 'beginner', label: 'Beginner' },
              { id: 'intermediate', label: 'Intermediate' },
              { id: 'advanced', label: 'Advanced' },
            ]}
            value={experience}
            onChange={(v) => {
              setExperience(v as Difficulty)
              markTouched('experience')
            }}
          />
        )}
        {step === 3 && (
          <Choice
            title="Calling style"
            options={[
              { id: 'names', label: 'Technique names' },
              { id: 'numbers', label: 'Numbers' },
              { id: 'hybrid', label: 'Hybrid' },
            ]}
            value={callStyle}
            onChange={(v) => {
              setCallStyle(v as CallStyle)
              markTouched('callStyle')
            }}
          />
        )}

        <div className="flex flex-wrap gap-3 pt-2">
          {step > 0 && (
            <button type="button" className="btn btn-ghost" onClick={() => setStep((s) => s - 1)}>
              Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn btn-primary" onClick={continueStep}>
              Continue
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => finish(false)}>
              Save and continue
            </button>
          )}
          <button type="button" className="btn" onClick={() => finish(true)}>
            Skip remaining — use recommended defaults
          </button>
        </div>
      </section>

      <p className="text-sm text-[var(--text-dim)]">
        Choices you already made stay. Skip only fills unanswered remaining steps with recommended defaults.
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
