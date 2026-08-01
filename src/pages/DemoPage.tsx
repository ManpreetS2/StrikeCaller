import { useNavigate } from 'react-router-dom'
import { createDefaultWorkout } from '../data/defaults'
import { useApp } from '../context/AppContext'
import { SafetyNotice } from '../components/SafetyNotice'
import { Sparkles } from 'lucide-react'

export function DemoPage() {
  const navigate = useNavigate()
  const { preferences, updatePreferences } = useApp()

  const startDemo = () => {
    updatePreferences({
      stance: 'orthodox',
      callStyle: 'hybrid',
      speech: { ...preferences.speech, callStyle: 'hybrid' },
    })

    const config = createDefaultWorkout({
      mode: 'demo',
      stance: 'orthodox',
      difficulty: 'beginner',
      pace: 'technical',
      callStyle: 'hybrid',
      rounds: 1,
      roundDurationSec: 60,
      restDurationSec: 30,
      sessionDurationSec: 60,
      defenseFrequency: 0.4,
      movementFrequency: 0.5,
      includeKnees: false,
      includeElbows: false,
      includeHeadKicks: false,
      includeClinch: false,
      speech: { ...preferences.speech, callStyle: 'hybrid' },
      sound: preferences.sound,
      sideTerminology: 'lead-rear',
      resumeBehavior: preferences.resumeBehavior,
    })

    navigate('/session', { state: { config, demo: true } })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-[var(--accent-text)]">Guided demo</p>
        <h1 className="display mt-2 text-5xl">Hear StrikeCaller work</h1>
        <p className="mt-3 text-[var(--text-muted)]">
          A recruiter-friendly 60-second technical round that uses the real combo library, validation rules,
          adaptive timing, and speech engine — not a fake slideshow.
        </p>
      </header>

      <ol className="panel list-decimal space-y-2 p-5 pl-10 text-sm text-[var(--text-muted)]">
        <li>Selects orthodox stance</li>
        <li>Uses hybrid calls (One, two / jab, cross, rear low kick)</li>
        <li>Runs a 60-second technical round</li>
        <li>Calls curated beginner combinations</li>
        <li>Includes a defensive counter and a movement exit</li>
        <li>Gives kicks more time than punches</li>
        <li>Ends with a session summary</li>
      </ol>

      <button type="button" className="btn btn-primary" onClick={startDemo}>
        <Sparkles size={18} aria-hidden />
        Start guided demo
      </button>

      <SafetyNotice compact />
    </div>
  )
}
