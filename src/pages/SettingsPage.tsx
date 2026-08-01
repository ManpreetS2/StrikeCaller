import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { SafetyNotice } from '../components/SafetyNotice'
import { createSpeechEngine } from '../engines/speechEngine'
import { isAudioSessionSupported, prepareCoachingAudioSession } from '../engines/audioSession'
import { DEFAULT_TIMING_MULTIPLIERS } from '../engines/timingEngine'
import type { CallStyle, MartialArt, MusicCompatibilityResult, SideTerminology, Stance } from '../types'

const COMPAT_OPTIONS: { id: MusicCompatibilityResult; label: string }[] = [
  { id: 'music-lowered', label: 'Music lowered' },
  { id: 'music-continued', label: 'Music continued at the same volume' },
  { id: 'music-paused', label: 'Music paused' },
  { id: 'music-stopped', label: 'Music stopped' },
  { id: 'voice-not-heard', label: 'Coaching voice was not heard' },
]

export function SettingsPage() {
  const {
    preferences,
    updatePreferences,
    resetPreferences,
    clearHistory,
    exportData,
    importData,
    history,
  } = useApp()
  const [importMessage, setImportMessage] = useState('')

  return (
    <div className="space-y-6">
      <header>
        <h1 className="display text-5xl">Settings</h1>
        <p className="mt-2 text-[var(--text-muted)]">
          Preferences stay on this device. No accounts, analytics, or cloud sync.
        </p>
      </header>

      <section className="panel grid gap-4 p-5 md:grid-cols-2" aria-label="Training preferences">
        <Field label="Martial art">
          <select
            value={preferences.martialArt}
            aria-label="Default martial art"
            onChange={(e) => updatePreferences({ martialArt: e.target.value as MartialArt })}
          >
            <option value="muay-thai">Muay Thai</option>
            <option value="boxing">Boxing</option>
          </select>
        </Field>
        <Field label="Stance">
          <select
            value={preferences.stance}
            aria-label="Default stance"
            onChange={(e) => updatePreferences({ stance: e.target.value as Stance })}
          >
            <option value="orthodox">Orthodox</option>
            <option value="southpaw">Southpaw</option>
          </select>
        </Field>
        <Field label="Call style">
          <select
            value={preferences.callStyle}
            aria-label="Default call style"
            onChange={(e) => {
              const callStyle = e.target.value as CallStyle
              updatePreferences({
                callStyle,
                speech: { ...preferences.speech, callStyle },
              })
            }}
          >
            <option value="names">Names</option>
            <option value="numbers">Numbers</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </Field>
        <Field label="Side terminology">
          <select
            value={preferences.sideTerminology}
            aria-label="Side terminology"
            onChange={(e) =>
              updatePreferences({ sideTerminology: e.target.value as SideTerminology })
            }
          >
            <option value="lead-rear">Lead / rear</option>
            <option value="left-right">Left / right</option>
          </select>
        </Field>
        <Field label="Large text">
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              checked={preferences.largeText}
              onChange={(e) => updatePreferences({ largeText: e.target.checked })}
            />
            Enable large text
          </label>
        </Field>
        <Field label="Resume behavior">
          <select
            value={preferences.resumeBehavior}
            aria-label="Resume behavior"
            onChange={(e) =>
              updatePreferences({
                resumeBehavior: e.target.value as 'restart-combo' | 'next-combo',
              })
            }
          >
            <option value="restart-combo">Restart current combo</option>
            <option value="next-combo">Skip to next combo</option>
          </select>
        </Field>
      </section>

      <section className="panel space-y-4 p-5" aria-label="Audio and feedback">
        <h2 className="text-xl font-semibold">Audio & feedback</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Spoken combo calls use the browser’s default English voice with a fixed clear rate. Calling style
          (Names / Numbers / Hybrid) still applies.
        </p>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={preferences.speech.spokenCallsEnabled !== false}
            onChange={(e) =>
              updatePreferences({
                speech: { ...preferences.speech, spokenCallsEnabled: e.target.checked },
              })
            }
          />
          Spoken calls enabled
        </label>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={preferences.speech.captionsEnabled !== false}
            onChange={(e) =>
              updatePreferences({
                speech: { ...preferences.speech, captionsEnabled: e.target.checked },
              })
            }
          />
          Captions enabled
        </label>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={preferences.sound.bellsEnabled}
            onChange={(e) =>
              updatePreferences({ sound: { ...preferences.sound, bellsEnabled: e.target.checked } })
            }
          />
          Round bells
        </label>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={preferences.sound.tonesEnabled}
            onChange={(e) =>
              updatePreferences({ sound: { ...preferences.sound, tonesEnabled: e.target.checked } })
            }
          />
          Countdown tones
        </label>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={preferences.sound.vibrationEnabled}
            onChange={(e) =>
              updatePreferences({
                sound: { ...preferences.sound, vibrationEnabled: e.target.checked },
              })
            }
          />
          Vibration (supported devices)
        </label>
      </section>

      <section className="panel space-y-4 p-5" aria-label="Music-friendly audio">
        <h2 className="text-xl font-semibold">Music-friendly voice calls</h2>
        <p className="text-sm text-[var(--text-muted)]">
          StrikeCaller will try to play short coaching calls over your music. Music behavior depends on your
          phone, browser, and music application. This site cannot directly control Spotify, Apple Music,
          YouTube Music, or another app’s volume.
        </p>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={preferences.speech.musicFriendly}
            onChange={(e) =>
              updatePreferences({
                speech: { ...preferences.speech, musicFriendly: e.target.checked },
              })
            }
          />
          Enable music-friendly voice calls
        </label>
        <p className="text-sm text-[var(--text-dim)]">
          Audio Session API:{' '}
          {typeof navigator !== 'undefined' && 'audioSession' in navigator
            ? 'available in this browser'
            : 'not available — captions and normal speech still work'}
        </p>
        <MusicCompatibilityTest />
      </section>

      <section className="panel grid gap-4 p-5 md:grid-cols-2" aria-label="Timing multipliers">
        <h2 className="md:col-span-2 text-xl font-semibold">Advanced timing multipliers</h2>
        {(
          [
            ['punch', 'Punch'],
            ['kick', 'Kick'],
            ['teep', 'Teep'],
            ['knee', 'Knee'],
            ['elbow', 'Elbow'],
            ['defense', 'Defense'],
            ['movement', 'Movement'],
          ] as const
        ).map(([key, label]) => (
          <Field key={key} label={`${label} (${preferences.timingMultipliers[key].toFixed(2)}x)`}>
            <input
              type="range"
              min={0.7}
              max={1.8}
              step={0.05}
              value={preferences.timingMultipliers[key]}
              aria-label={`${label} timing multiplier`}
              onChange={(e) =>
                updatePreferences({
                  timingMultipliers: {
                    ...preferences.timingMultipliers,
                    [key]: Number(e.target.value),
                  },
                })
              }
            />
          </Field>
        ))}
        <button
          type="button"
          className="btn md:col-span-2"
          onClick={() => updatePreferences({ timingMultipliers: { ...DEFAULT_TIMING_MULTIPLIERS } })}
        >
          Reset timing multipliers
        </button>
      </section>

      <section className="panel space-y-3 p-5" aria-label="Data">
        <h2 className="text-xl font-semibold">Data</h2>
        <p className="text-sm text-[var(--text-muted)]">{history.length} saved sessions on this device.</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn"
            onClick={() => {
              const blob = new Blob([exportData()], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = 'strikecaller-export.json'
              a.click()
              URL.revokeObjectURL(url)
            }}
          >
            Export JSON
          </button>
          <label className="btn cursor-pointer">
            Import JSON
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const text = await file.text()
                const result = importData(text)
                setImportMessage(result.message)
              }}
            />
          </label>
          <button type="button" className="btn" onClick={() => clearHistory()}>
            Clear workout history
          </button>
          <button type="button" className="btn btn-danger" onClick={() => resetPreferences()}>
            Reset preferences
          </button>
        </div>
        {importMessage && (
          <p className="text-sm" role="status">
            {importMessage}
          </p>
        )}
      </section>

      <SafetyNotice />
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

function MusicCompatibilityTest() {
  const { preferences, updatePreferences } = useApp()
  const [phase, setPhase] = useState<'idle' | 'playing' | 'ask'>('idle')
  const [status, setStatus] = useState('')
  const speech = createSpeechEngine(() => preferences.speech)

  const runTest = async () => {
    setPhase('playing')
    setStatus('Playing sample calls…')
    prepareCoachingAudioSession(true)
    const samples = ['Jab', 'Cross', 'Rear low kick']
    for (const sample of samples) {
      setStatus(`Playing: ${sample}`)
      try {
        await speech.speak(sample)
      } catch {
        // continue samples
      }
      await new Promise((r) => setTimeout(r, 350))
    }
    setPhase('ask')
    setStatus('What happened to your music?')
  }

  const saveResult = (result: MusicCompatibilityResult) => {
    updatePreferences({
      musicCompatibility: {
        result,
        testedAt: Date.now(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        audioSessionSupported: isAudioSessionSupported(),
      },
    })
    setPhase('idle')
    setStatus('Compatibility result saved on this device.')
  }

  const saved = preferences.musicCompatibility
  const savedLabel = saved
    ? COMPAT_OPTIONS.find((o) => o.id === saved.result)?.label ?? saved.result
    : null

  return (
    <div className="space-y-3 rounded-lg border border-[var(--border)] p-4">
      <h3 className="font-semibold">Music Compatibility Test</h3>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-[var(--text-muted)]">
        <li>Start music in another application.</li>
        <li>Play three sample calls: Jab, Cross, Rear low kick.</li>
        <li>Tell StrikeCaller what happened.</li>
      </ol>
      <button type="button" className="btn" disabled={phase === 'playing'} onClick={() => void runTest()}>
        {phase === 'playing' ? 'Playing samples…' : 'Run compatibility test'}
      </button>
      {status && (
        <p className="text-sm" role="status">
          {status}
        </p>
      )}
      {phase === 'ask' && (
        <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Music compatibility result">
          {COMPAT_OPTIONS.map((opt) => (
            <button key={opt.id} type="button" className="btn justify-start" onClick={() => saveResult(opt.id)}>
              {opt.label}
            </button>
          ))}
        </div>
      )}
      {savedLabel && phase === 'idle' && (
        <p className="text-sm text-[var(--text-muted)]">
          Last result: <span className="text-[var(--text)]">{savedLabel}</span>
          {saved?.audioSessionSupported ? ' · Audio Session API was available' : ' · Audio Session API was not available'}
        </p>
      )}
    </div>
  )
}
