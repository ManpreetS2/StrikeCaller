import { useState, useRef } from 'react'
import { useApp, type StorageIssue } from '../context/useApp'
import { SafetyNotice } from '../components/SafetyNotice'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { createSpeechEngine } from '../engines/speechEngine'
import { isAudioSessionSupported, prepareCoachingAudioSession } from '../engines/audioSession'
import { DEFAULT_TIMING_MULTIPLIERS } from '../engines/timingEngine'
import { MAX_IMPORT_BYTES, storageAvailable } from '../storage/localStore'
import { DELETE_ALL_PARTIAL_MESSAGE, DELETE_ALL_SUCCESS_MESSAGE, IMPORT_EXECUTION_FAILED_MESSAGE } from '../storage/storageTypes'
import type { CallStyle, MartialArt, MusicCompatibilityResult, SideTerminology, Stance } from '../types'
import { MARTIAL_ART_ORDER, martialArtLabel } from '../utils/martialArt'

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
    deleteAllUserData,
    history,
    historyReady,
    dataMutationPending,
    storageIssue,
  } = useApp()
  const [importMessage, setImportMessage] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearPending, setClearPending] = useState(false)
  const clearPendingRef = useRef(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [deleteAllPending, setDeleteAllPending] = useState(false)
  const [deleteAllMessage, setDeleteAllMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(
    null,
  )
  const deleteAllPendingRef = useRef(false)
  const dataBusy = !historyReady || dataMutationPending || clearPending || deleteAllPending
  const mutationBusy = dataMutationPending || clearPending || deleteAllPending
  const fieldsetClass = 'm-0 min-w-0 border-0 p-0 disabled:opacity-60'

  return (
    <div className="space-y-6">
      <header>
        <h1 className="display text-5xl">Settings</h1>
        <p className="mt-2 text-[var(--text-muted)]">
          Preferences stay on this device. No accounts or cloud sync. Privacy-first anonymous site
          analytics. Training data never leaves this browser.
        </p>
      </header>

      <section className="panel p-5" aria-label="Training preferences">
        <fieldset disabled={mutationBusy} className={`grid gap-4 md:grid-cols-2 ${fieldsetClass}`}>
          <legend className="sr-only">Training preferences</legend>
        <Field label="Martial art">
          <select
            value={preferences.martialArt}
            aria-label="Default martial art"
            onChange={(e) => updatePreferences({ martialArt: e.target.value as MartialArt })}
          >
            {MARTIAL_ART_ORDER.map((art) => (
              <option key={art} value={art}>
                {martialArtLabel(art)}
              </option>
            ))}
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
        <Field label="Minimal mode preference">
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              checked={preferences.preferMinimalMode}
              onChange={(e) => updatePreferences({ preferMinimalMode: e.target.checked })}
            />
            Prefer Minimal Mode for new workouts
          </label>
        </Field>
        <Field label="Keep screen awake">
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              checked={preferences.wakeLock}
              onChange={(e) => updatePreferences({ wakeLock: e.target.checked })}
            />
            Request wake lock during sessions when supported
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
        </fieldset>
      </section>

      <section className="panel space-y-4 p-5" aria-label="Audio and feedback">
        <fieldset disabled={mutationBusy} className={`space-y-4 ${fieldsetClass}`}>
          <legend className="sr-only">Audio and feedback</legend>
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
        </fieldset>
      </section>

      <section className="panel space-y-4 p-5" aria-label="Music-friendly audio">
        <fieldset disabled={mutationBusy} className={`space-y-4 ${fieldsetClass}`}>
          <legend className="sr-only">Music-friendly audio</legend>
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
        <MusicCompatibilityTest disabled={mutationBusy} />
        </fieldset>
      </section>

      <section className="panel p-5" aria-label="Timing multipliers">
        <fieldset disabled={mutationBusy} className={`grid gap-4 md:grid-cols-2 ${fieldsetClass}`}>
          <legend className="sr-only">Timing multipliers</legend>
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
        </fieldset>
      </section>

      <section className="panel space-y-3 p-5" aria-label="Install on phone">
        <h2 className="text-xl font-semibold">Install on phone</h2>
        <p className="text-sm text-[var(--text-muted)]">
          StrikeCaller can be added to your home screen from the browser menu (Add to Home Screen / Install app)
          where supported. No account and no push notifications are required. Normal browser use continues to work
          with hash routes unchanged.
        </p>
      </section>

      <section className="panel space-y-3 p-5" aria-label="Data">
        <h2 className="text-xl font-semibold">Data</h2>
        <p className="text-sm text-[var(--text-muted)]">
          {!historyReady && history.length === 0
            ? 'Loading saved sessions…'
            : storageIssue?.source === 'history'
              ? `${history.length} sessions available in this tab. The latest may not be saved to browser storage.`
              : `${history.length} saved sessions on this device.`}
        </p>
        <StorageStatus issue={storageIssue} />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn"
            disabled={dataBusy}
            onClick={() => {
              void (async () => {
                const json = await exportData()
                const blob = new Blob([json], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'strikecaller-export.json'
                a.click()
                URL.revokeObjectURL(url)
              })()
            }}
          >
            Export JSON
          </button>
          <label className={`btn ${dataBusy ? 'opacity-60' : 'cursor-pointer'}`}>
            Import JSON
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              aria-label="Import JSON"
              disabled={dataBusy}
              onChange={async (e) => {
                const input = e.currentTarget
                try {
                  const file = input.files?.[0]
                  if (!file) return
                  if (dataBusy) return
                  if (file.size > MAX_IMPORT_BYTES) {
                    setImportMessage('Import file exceeds the 2 MB limit.')
                    return
                  }
                  const text = await file.text()
                  const result = await importData(text)
                  setImportMessage(result.message)
                } catch {
                  setImportMessage(IMPORT_EXECUTION_FAILED_MESSAGE)
                } finally {
                  input.value = ''
                }
              }}
            />
          </label>
          <button
            type="button"
            className="btn"
            disabled={dataBusy}
            onClick={() => setConfirmClear(true)}
          >
            Clear workout history
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={mutationBusy}
            onClick={() => setConfirmReset(true)}
          >
            Reset preferences
          </button>
        </div>
        {importMessage && (
          <p className="text-sm" role="status">
            {importMessage}
          </p>
        )}
      </section>

      <section className="panel space-y-3 p-5" aria-label="Delete all local data">
        <h2 className="text-xl font-semibold">Delete all local data</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Permanently removes workout history, preferences, favorites, custom combos, and daily drills stored on
          this device. This cannot be undone.
        </p>
        <button
          type="button"
          className="btn btn-danger"
          disabled={dataBusy}
          onClick={() => {
            setDeleteAllMessage(null)
            setConfirmDeleteAll(true)
          }}
        >
          Delete all data
        </button>
        {deleteAllMessage && (
          <p
            className="text-sm"
            role={deleteAllMessage.tone === 'error' ? 'alert' : 'status'}
          >
            {deleteAllMessage.text}
          </p>
        )}
      </section>

      {confirmClear && (
        <ConfirmDialog
          title="Clear workout history?"
          confirmLabel="Clear history"
          danger
          confirmDisabled={clearPending || dataMutationPending}
          cancelDisabled={clearPending || dataMutationPending}
          onConfirm={() => {
            if (clearPendingRef.current) return
            clearPendingRef.current = true
            setClearPending(true)
            void (async () => {
              try {
                await clearHistory()
                setConfirmClear(false)
              } catch {
                // Keep the dialog usable after an unexpected failure.
              } finally {
                clearPendingRef.current = false
                setClearPending(false)
              }
            })()
          }}
          onCancel={() => {
            if (clearPendingRef.current) return
            setConfirmClear(false)
          }}
        >
          This permanently removes saved sessions from this device.
        </ConfirmDialog>
      )}

      {confirmReset && (
        <ConfirmDialog
          title="Reset preferences?"
          confirmLabel="Reset preferences"
          danger
          confirmDisabled={mutationBusy}
          cancelDisabled={mutationBusy}
          onConfirm={() => {
            if (mutationBusy) return
            resetPreferences()
            setConfirmReset(false)
          }}
          onCancel={() => setConfirmReset(false)}
        >
          Stance, call style, audio, and other preferences return to defaults. History is kept.
        </ConfirmDialog>
      )}

      {confirmDeleteAll && (
        <ConfirmDialog
          title="Delete all local data?"
          confirmLabel="Delete permanently"
          danger
          confirmDisabled={deleteAllPending || dataMutationPending}
          cancelDisabled={deleteAllPending || dataMutationPending}
          onConfirm={() => {
            if (deleteAllPendingRef.current) return
            deleteAllPendingRef.current = true
            setDeleteAllPending(true)
            void (async () => {
              try {
                const result = await deleteAllUserData()
                setConfirmDeleteAll(false)
                if (result.ok) {
                  setDeleteAllMessage({ tone: 'success', text: DELETE_ALL_SUCCESS_MESSAGE })
                } else {
                  setDeleteAllMessage({ tone: 'error', text: DELETE_ALL_PARTIAL_MESSAGE })
                }
              } catch {
                // Keep the dialog usable after an unexpected failure.
              } finally {
                deleteAllPendingRef.current = false
                setDeleteAllPending(false)
              }
            })()
          }}
          onCancel={() => {
            if (deleteAllPendingRef.current) return
            setConfirmDeleteAll(false)
          }}
        >
          This permanently deletes all StrikeCaller data stored on this device. This cannot be undone.
        </ConfirmDialog>
      )}

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

function StorageStatus({ issue }: { issue: StorageIssue | null }) {
  const available = storageAvailable()
  let status = 'Storage: Available'
  if (issue) {
    if (issue.source === 'delete') status = 'Storage issue: Some StrikeCaller data could not be deleted.'
    else if (issue.reason === 'quota-exceeded') status = 'Storage issue: Browser storage is full.'
    else if (issue.reason === 'unavailable') status = 'Storage issue: Browser storage is unavailable.'
    else status = 'Storage issue: StrikeCaller could not save your latest data.'
  } else if (!available) {
    status = 'Storage issue: Browser storage is unavailable.'
  }

  return (
    <div className="space-y-1 text-sm">
      <p role="status">{status}</p>
      {issue?.reason === 'quota-exceeded' ? (
        <p className="text-[var(--text-muted)]">
          Export a backup before reloading or closing this tab.
        </p>
      ) : null}
    </div>
  )
}

function MusicCompatibilityTest({ disabled = false }: { disabled?: boolean }) {
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
      <button type="button" className="btn" disabled={disabled || phase === 'playing'} onClick={() => void runTest()}>
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
            <button
              key={opt.id}
              type="button"
              className="btn justify-start"
              disabled={disabled}
              onClick={() => saveResult(opt.id)}
            >
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
