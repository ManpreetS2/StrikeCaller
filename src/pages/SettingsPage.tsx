import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { SafetyNotice } from '../components/SafetyNotice'
import { createSpeechEngine } from '../engines/speechEngine'
import { DEFAULT_TIMING_MULTIPLIERS } from '../engines/timingEngine'
import type { CallStyle, SideTerminology, Stance } from '../types'

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
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [importMessage, setImportMessage] = useState('')
  const speech = createSpeechEngine(() => preferences.speech)

  useEffect(() => {
    const load = () => setVoices(speech.getVoices())
    load()
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.addEventListener('voiceschanged', load)
      return () => window.speechSynthesis.removeEventListener('voiceschanged', load)
    }
  }, [speech])

  return (
    <div className="space-y-6">
      <header>
        <h1 className="display text-5xl">Settings</h1>
        <p className="mt-2 text-[var(--text-muted)]">
          Preferences stay on this device. No accounts, analytics, or cloud sync.
        </p>
      </header>

      <section className="panel grid gap-4 p-5 md:grid-cols-2" aria-label="Training preferences">
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
      </section>

      <section className="panel grid gap-4 p-5 md:grid-cols-2" aria-label="Voice settings">
        <h2 className="md:col-span-2 text-xl font-semibold">Voice</h2>
        {!speech.supported && (
          <p className="md:col-span-2 text-sm text-[var(--warning)]" role="status">
            Web Speech API is not supported here. Captions and tones remain available.
          </p>
        )}
        <Field label="Voice">
          <select
            value={preferences.speech.voiceURI ?? ''}
            aria-label="Speech voice"
            onChange={(e) =>
              updatePreferences({
                speech: { ...preferences.speech, voiceURI: e.target.value || null },
              })
            }
          >
            <option value="">Browser default</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Speech rate (${preferences.speech.rate.toFixed(2)})`}>
          <input
            type="range"
            min={0.7}
            max={1.4}
            step={0.05}
            value={preferences.speech.rate}
            aria-label="Speech rate"
            onChange={(e) =>
              updatePreferences({
                speech: { ...preferences.speech, rate: Number(e.target.value) },
              })
            }
          />
        </Field>
        <Field label={`Pitch (${preferences.speech.pitch.toFixed(2)})`}>
          <input
            type="range"
            min={0.7}
            max={1.4}
            step={0.05}
            value={preferences.speech.pitch}
            aria-label="Speech pitch"
            onChange={(e) =>
              updatePreferences({
                speech: { ...preferences.speech, pitch: Number(e.target.value) },
              })
            }
          />
        </Field>
        <Field label={`Volume (${preferences.speech.volume.toFixed(2)})`}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={preferences.speech.volume}
            aria-label="Speech volume"
            onChange={(e) =>
              updatePreferences({
                speech: { ...preferences.speech, volume: Number(e.target.value) },
              })
            }
          />
        </Field>
        <div className="md:col-span-2">
          <button type="button" className="btn" onClick={() => void speech.preview()}>
            Preview voice
          </button>
        </div>
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

      <section className="panel space-y-3 p-5" aria-label="Sound">
        <h2 className="text-xl font-semibold">Sound</h2>
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
