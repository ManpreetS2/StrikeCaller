import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getTechniquesByCategory, getTechnique } from '../data/techniques'
import { MAX_COMBO_LENGTH, validateTechniqueSequence } from '../engines/comboValidator'
import { useApp } from '../context/AppContext'
import { createDefaultWorkout } from '../data/defaults'
import { ConfirmDialog } from '../components/ConfirmDialog'
import {
  clampRepeatCount,
  clampTechniqueIds,
  customComboToRuntime,
  MAX_REPEAT_COUNT,
  MIN_REPEAT_COUNT,
} from '../utils/customCombo'
import type { CustomCombo, TechniqueCategory } from '../types'

const MT_CATEGORIES: TechniqueCategory[] = [
  'punch',
  'kick',
  'teep',
  'knee',
  'elbow',
  'defense',
  'movement',
  'counter',
  'clinch',
]

const BX_CATEGORIES: TechniqueCategory[] = ['punch', 'defense', 'movement', 'counter']

export function BuilderPage() {
  const {
    customCombos,
    upsertCustomCombo,
    removeCustomCombo,
    preferences,
    updatePreferences,
  } = useApp()
  const navigate = useNavigate()
  const art = preferences.martialArt
  const categories = art === 'boxing' ? BX_CATEGORIES : MT_CATEGORIES
  const [title, setTitle] = useState('My combo')
  const [sequence, setSequence] = useState<string[]>(['jab', 'cross'])
  const [category, setCategory] = useState<TechniqueCategory>('punch')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [repeatCount, setRepeatCount] = useState(3)
  const [notice, setNotice] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  useEffect(() => {
    const migrated = customCombos.filter((c) => c.migrated)
    if (migrated.length && !preferences.customComboMigrationNoticeShown) {
      setNotice(
        'Custom combos now support up to eight techniques. Longer saved combos were trimmed to the first eight.',
      )
      updatePreferences({ customComboMigrationNoticeShown: true })
    }
  }, [customCombos, preferences.customComboMigrationNoticeShown, updatePreferences])

  const validation = useMemo(() => validateTechniqueSequence(sequence), [sequence])
  const palette = getTechniquesByCategory(category, art).filter((t) => t.martialArts.includes(art))
  const atMax = sequence.length >= MAX_COMBO_LENGTH

  const addTechnique = (id: string) => {
    setSequence((prev) => {
      if (prev.length >= MAX_COMBO_LENGTH) return prev
      return [...prev, id]
    })
  }

  const save = () => {
    if (!validation.valid || sequence.length === 0 || sequence.length > MAX_COMBO_LENGTH) return
    const now = Date.now()
    const combo: CustomCombo = {
      id: editingId ?? `custom-${now}`,
      title: title.trim() || 'Custom combo',
      techniqueIds: clampTechniqueIds(sequence),
      createdAt: editingId
        ? (customCombos.find((c) => c.id === editingId)?.createdAt ?? now)
        : now,
      updatedAt: now,
      favorite: false,
      repeatCount: clampRepeatCount(repeatCount),
      martialArt: art,
    }
    upsertCustomCombo(combo)
    setEditingId(combo.id)
  }

  const trainCombo = (combo: CustomCombo) => {
    const runtime = customComboToRuntime(combo)
    const repeats = clampRepeatCount(combo.repeatCount)
    const queue = Array.from({ length: repeats }, () => ({
      ...runtime,
      techniques: [...runtime.techniques],
    }))
    const config = createDefaultWorkout({
      martialArt: runtime.martialArt,
      mode: 'custom',
      stance: preferences.stance,
      difficulty: preferences.experience,
      callStyle: preferences.callStyle,
      pace: preferences.pace,
      sessionDurationSec: Math.max(60, repeats * 20),
      roundDurationSec: Math.max(60, repeats * 20),
      rounds: 1,
      customComboId: combo.id,
      repeatCount: repeats,
      speech: { ...preferences.speech, callStyle: preferences.callStyle },
      sound: preferences.sound,
      sideTerminology: preferences.sideTerminology,
      resumeBehavior: preferences.resumeBehavior,
      categories:
        runtime.martialArt === 'boxing'
          ? ['punch', 'defense', 'movement', 'counter']
          : ['punch', 'kick', 'teep', 'defense', 'movement'],
      includeKnees: runtime.martialArt === 'muay-thai',
      includeElbows: false,
      includeHeadKicks: false,
      includeClinch: false,
    })
    navigate('/session', { state: { config, comboQueue: queue } })
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="display text-5xl">Custom Combo Builder</h1>
        <p className="mt-2 max-w-2xl text-[var(--text-muted)]">
          Tap techniques into a sequence (max {MAX_COMBO_LENGTH}). Invalid transitions are explained before you can
          save. Building for {art === 'boxing' ? 'Boxing' : 'Muay Thai'}.
        </p>
      </header>

      {notice && (
        <p className="rounded-lg border border-[var(--warning)] p-3 text-sm" role="status">
          {notice}
        </p>
      )}

      <div className="field max-w-md">
        <label htmlFor="combo-title">Combo title</label>
        <input id="combo-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <section className="panel p-4" aria-label="Current sequence">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Sequence</h2>
          <p className="text-sm font-semibold tabular-nums" aria-live="polite">
            {sequence.length} / {MAX_COMBO_LENGTH} techniques
          </p>
        </div>
        <ol className="flex flex-wrap items-center gap-2">
          {sequence.map((id, index) => {
            let name = id
            try {
              name = getTechnique(id).name
            } catch {
              // unknown legacy id
            }
            return (
              <li key={`${id}-${index}`} className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn !min-h-10"
                  onClick={() => setSequence((prev) => prev.filter((_, i) => i !== index))}
                  aria-label={`Remove ${name}`}
                >
                  {name} ×
                </button>
                {index < sequence.length - 1 && <span aria-hidden>→</span>}
              </li>
            )
          })}
        </ol>
        {atMax && (
          <p className="mt-3 text-sm font-semibold text-[var(--accent-text)]" role="status">
            Maximum combo length reached
          </p>
        )}
        {!validation.valid && (
          <ul className="mt-3 space-y-1 text-sm text-[var(--accent-text)]" role="alert">
            {validation.issues
              .filter((i) => i.severity === 'error')
              .map((issue) => (
                <li key={`${issue.code}-${issue.index}-${issue.message}`}>{issue.message}</li>
              ))}
          </ul>
        )}
      </section>

      <div role="tablist" aria-label="Technique categories" className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            role="tab"
            aria-selected={category === cat}
            className={`btn ${category === cat ? 'btn-primary' : ''}`}
            onClick={() => setCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {palette.map((tech) => (
          <button
            key={tech.id}
            type="button"
            className="btn"
            disabled={atMax}
            onClick={() => addTechnique(tech.id)}
          >
            {tech.name}
          </button>
        ))}
      </div>

      <div className="field max-w-xs">
        <label htmlFor="repeat-count">Repeat count</label>
        <input
          id="repeat-count"
          type="number"
          min={MIN_REPEAT_COUNT}
          max={MAX_REPEAT_COUNT}
          value={repeatCount}
          aria-label="Repeat count"
          onChange={(e) => setRepeatCount(clampRepeatCount(Number(e.target.value)))}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!validation.valid || sequence.length === 0 || sequence.length > MAX_COMBO_LENGTH}
          onClick={save}
        >
          Save combo
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setSequence(['jab', 'cross'])
            setTitle('My combo')
            setEditingId(null)
            setRepeatCount(3)
          }}
        >
          Reset builder
        </button>
      </div>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Saved custom combos</h2>
        {customCombos.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No custom combos yet.</p>
        ) : (
          <ul className="space-y-3">
            {customCombos.map((combo) => (
              <li key={combo.id} className="panel flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold">
                    {combo.title}
                    {combo.migrated ? ' · migrated' : ''}
                  </p>
                  <p className="text-sm text-[var(--text-muted)]">
                    {combo.techniqueIds
                      .map((id) => {
                        try {
                          return getTechnique(id).name
                        } catch {
                          return id
                        }
                      })
                      .join(' → ')}
                    {' · '}
                    {clampRepeatCount(combo.repeatCount)} reps
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-primary" onClick={() => trainCombo(combo)}>
                    Train Combo
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setEditingId(combo.id)
                      setTitle(combo.title)
                      setSequence(clampTechniqueIds(combo.techniqueIds))
                      setRepeatCount(clampRepeatCount(combo.repeatCount))
                    }}
                  >
                    Edit
                  </button>
                  <button type="button" className="btn btn-danger" onClick={() => setDeleteId(combo.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {deleteId && (
        <ConfirmDialog
          title="Delete custom combo?"
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            removeCustomCombo(deleteId)
            setDeleteId(null)
          }}
          onCancel={() => setDeleteId(null)}
        >
          This removes the saved combo from this device. This cannot be undone.
        </ConfirmDialog>
      )}
    </div>
  )
}
