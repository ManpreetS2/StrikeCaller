import { useEffect, useMemo, useState } from 'react'
import { getTechniquesByCategory, getTechnique } from '../data/techniques'
import { MAX_COMBO_LENGTH, validateTechniqueSequence } from '../engines/comboValidator'
import { useApp } from '../context/AppContext'
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
  const art = preferences.martialArt
  const categories = art === 'boxing' ? BX_CATEGORIES : MT_CATEGORIES
  const [title, setTitle] = useState('My combo')
  const [sequence, setSequence] = useState<string[]>(['jab', 'cross'])
  const [category, setCategory] = useState<TechniqueCategory>('punch')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [repeatCount, setRepeatCount] = useState(3)
  const [notice, setNotice] = useState<string | null>(null)

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
    if (!validation.valid || sequence.length > MAX_COMBO_LENGTH) return
    const now = Date.now()
    const combo: CustomCombo = {
      id: editingId ?? `custom-${now}`,
      title: title.trim() || 'Custom combo',
      techniqueIds: sequence.slice(0, MAX_COMBO_LENGTH),
      createdAt: editingId
        ? (customCombos.find((c) => c.id === editingId)?.createdAt ?? now)
        : now,
      updatedAt: now,
      favorite: false,
      repeatCount,
      martialArt: art,
    }
    upsertCustomCombo(combo)
    setEditingId(combo.id)
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

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Technique categories">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            role="tab"
            aria-selected={category === cat}
            className={`chip ${category === cat ? 'chip-active' : ''}`}
            onClick={() => setCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
        {palette.map((tech) => (
          <button
            key={tech.id}
            type="button"
            className="btn justify-start"
            disabled={atMax}
            aria-disabled={atMax}
            onClick={() => addTechnique(tech.id)}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && !atMax) {
                e.preventDefault()
                addTechnique(tech.id)
              }
            }}
          >
            {preferences.sideTerminology === 'lead-rear' ? tech.name : tech.shortCall}
          </button>
        ))}
      </div>

      <div className="field max-w-xs">
        <label htmlFor="repeat-count">Repeat count</label>
        <input
          id="repeat-count"
          type="number"
          min={1}
          max={20}
          value={repeatCount}
          onChange={(e) => setRepeatCount(Number(e.target.value))}
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
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setEditingId(combo.id)
                      setTitle(combo.title)
                      setSequence(combo.techniqueIds.slice(0, MAX_COMBO_LENGTH))
                      setRepeatCount(combo.repeatCount)
                    }}
                  >
                    Edit
                  </button>
                  <button type="button" className="btn btn-danger" onClick={() => removeCustomCombo(combo.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
