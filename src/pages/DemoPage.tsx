import { useNavigate } from 'react-router-dom'
import { createDefaultWorkout } from '../data/defaults'
import { useApp } from '../context/AppContext'
import { SafetyNotice } from '../components/SafetyNotice'
import { Sparkles } from 'lucide-react'
import { primeTrainingAudio } from '../utils/primeAudio'
import { useOnceAction } from '../hooks/useOnceAction'

export function DemoPage() {
  const navigate = useNavigate()
  const { preferences } = useApp()
  const boxing = preferences.martialArt === 'boxing'

  const startDemo = useOnceAction(async () => {
    // Temporary demo values only — never mutate saved preferences
    const config = createDefaultWorkout({
      martialArt: preferences.martialArt,
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
      categories: boxing
        ? ['punch', 'defense', 'movement', 'counter']
        : ['punch', 'kick', 'teep', 'defense', 'movement'],
      speech: { ...preferences.speech, callStyle: 'hybrid' },
      sound: preferences.sound,
      sideTerminology: 'lead-rear',
      resumeBehavior: preferences.resumeBehavior,
      minimalMode: preferences.preferMinimalMode,
    })

    await primeTrainingAudio({ musicFriendly: preferences.speech.musicFriendly })
    navigate('/session', { state: { config, demo: true, audioPrimed: true } })
  })

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
        <li>
          {boxing
            ? 'Uses hybrid calls (One, two / jab, cross, lead hook)'
            : 'Uses hybrid calls (One, two / jab, cross, rear low kick)'}
        </li>
        <li>Runs a 60-second technical round</li>
        <li>Calls curated beginner combinations for {boxing ? 'Boxing' : 'Muay Thai'}</li>
        <li>Includes a defensive counter and a movement exit</li>
        <li>
          {boxing
            ? 'Gives hooks and uppercuts more recovery time than jabs'
            : 'Gives kicks more time than punches'}
        </li>
        <li>Ends with a session summary</li>
      </ol>

      <button type="button" className="btn btn-primary !min-h-12" onClick={() => void startDemo()}>
        <Sparkles size={18} aria-hidden />
        Start guided demo
      </button>

      <SafetyNotice compact />
    </div>
  )
}
