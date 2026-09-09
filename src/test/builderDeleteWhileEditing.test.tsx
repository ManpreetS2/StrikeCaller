import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppProvider } from '../context/AppContext'
import { BuilderPage } from '../pages/BuilderPage'
import { DEFAULT_PREFERENCES } from '../data/defaults'
import { loadCustomCombos, saveCustomCombos, savePreferences } from '../storage/localStore'
import * as primeAudio from '../utils/primeAudio'
import type { CustomCombo } from '../types'

function comboRecord(
  id: string,
  extra: Partial<CustomCombo> & { techniqueIds?: string[] } = {},
): CustomCombo {
  return {
    id,
    title: extra.title ?? `Combo ${id}`,
    techniqueIds: extra.techniqueIds ?? ['jab', 'cross'],
    createdAt: extra.createdAt ?? 1,
    updatedAt: extra.updatedAt ?? 2,
    favorite: extra.favorite ?? false,
    repeatCount: extra.repeatCount ?? 3,
    martialArt: extra.martialArt ?? 'muay-thai',
  }
}

function seedBuilderPrefs() {
  savePreferences({
    ...DEFAULT_PREFERENCES,
    onboardingComplete: true,
    customComboMigrationNoticeShown: true,
  })
}

function renderBuilder() {
  return render(
    <AppProvider>
      <MemoryRouter initialEntries={['/builder']}>
        <Routes>
          <Route path="/builder" element={<BuilderPage />} />
          <Route path="/session" element={<div data-testid="session-page">session</div>} />
        </Routes>
      </MemoryRouter>
    </AppProvider>,
  )
}

function savedRow(title: string) {
  const heading = screen.getByText(title)
  const row = heading.closest('li')
  if (!row) throw new Error(`No saved combo row for ${title}`)
  return row
}

async function confirmDelete(user: ReturnType<typeof userEvent.setup>) {
  const dialog = await screen.findByRole('dialog', { name: /delete custom combo/i })
  await user.click(within(dialog).getByRole('button', { name: /^delete$/i }))
  await waitFor(() => {
    expect(screen.queryByRole('dialog', { name: /delete custom combo/i })).not.toBeInTheDocument()
  })
}

describe('S1 Builder delete while editing', () => {
  beforeEach(() => {
    localStorage.clear()
    seedBuilderPrefs()
  })

  it('clears editing identity after deleting the combo currently being edited', async () => {
    const user = userEvent.setup()
    saveCustomCombos([comboRecord('combo-a', { title: 'Alpha' })])
    renderBuilder()

    await user.click(within(savedRow('Alpha')).getByRole('button', { name: /^edit$/i }))
    expect(screen.getByRole('status')).toHaveTextContent(/editing a muay thai combo/i)
    expect(screen.getByLabelText(/combo title/i)).toHaveValue('Alpha')

    await user.click(within(savedRow('Alpha')).getByRole('button', { name: /^delete$/i }))
    await confirmDelete(user)

    expect(screen.queryByText('Alpha')).not.toBeInTheDocument()
    expect(screen.queryByText(/editing a muay thai combo/i)).not.toBeInTheDocument()
    expect(loadCustomCombos()).toEqual([])
  })

  it('does not resurrect the deleted combo id on a later Save', async () => {
    const user = userEvent.setup()
    saveCustomCombos([comboRecord('combo-a', { title: 'Alpha' })])
    renderBuilder()

    await user.click(within(savedRow('Alpha')).getByRole('button', { name: /^edit$/i }))
    await user.click(within(savedRow('Alpha')).getByRole('button', { name: /^delete$/i }))
    await confirmDelete(user)

    await user.click(screen.getByRole('button', { name: /^save combo$/i }))
    await waitFor(() => {
      const ids = loadCustomCombos().map((combo) => combo.id)
      expect(ids).not.toContain('combo-a')
      expect(ids).toHaveLength(1)
      expect(ids[0]).toMatch(/^custom-\d+$/)
    })
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument()
  })

  it('keeps the active edit intact when a different saved combo is deleted', async () => {
    const user = userEvent.setup()
    saveCustomCombos([
      comboRecord('combo-a', { title: 'Alpha', techniqueIds: ['jab', 'cross', 'lead-hook'], repeatCount: 4 }),
      comboRecord('combo-b', { title: 'Bravo' }),
    ])
    renderBuilder()

    await user.click(within(savedRow('Alpha')).getByRole('button', { name: /^edit$/i }))
    await user.clear(screen.getByLabelText(/combo title/i))
    await user.type(screen.getByLabelText(/combo title/i), 'Alpha edited')

    await user.click(within(savedRow('Bravo')).getByRole('button', { name: /^delete$/i }))
    await confirmDelete(user)

    expect(screen.getByRole('status')).toHaveTextContent(/editing a muay thai combo/i)
    expect(screen.getByLabelText(/combo title/i)).toHaveValue('Alpha edited')
    expect(screen.getByLabelText(/repeat count/i)).toHaveValue(4)
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.queryByText('Bravo')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^save combo$/i }))
    await waitFor(() => {
      const saved = loadCustomCombos()
      expect(saved.map((combo) => combo.id)).toEqual(['combo-a'])
      expect(saved[0]?.title).toBe('Alpha edited')
      expect(saved[0]?.techniqueIds).toEqual(['jab', 'cross', 'lead-hook'])
      expect(saved[0]?.repeatCount).toBe(4)
    })
  })

  it('preserves the combo id on a normal Edit then Save', async () => {
    const user = userEvent.setup()
    saveCustomCombos([comboRecord('combo-a', { title: 'Alpha' })])
    renderBuilder()

    await user.click(within(savedRow('Alpha')).getByRole('button', { name: /^edit$/i }))
    await user.clear(screen.getByLabelText(/combo title/i))
    await user.type(screen.getByLabelText(/combo title/i), 'Alpha kept')
    await user.click(screen.getByRole('button', { name: /^save combo$/i }))

    await waitFor(() => {
      const saved = loadCustomCombos()
      expect(saved).toHaveLength(1)
      expect(saved[0]?.id).toBe('combo-a')
      expect(saved[0]?.title).toBe('Alpha kept')
    })
  })

  it('creates a new id for a normal new Save', async () => {
    const user = userEvent.setup()
    saveCustomCombos([])
    renderBuilder()

    await user.click(screen.getByRole('button', { name: /^save combo$/i }))
    await waitFor(() => {
      const saved = loadCustomCombos()
      expect(saved).toHaveLength(1)
      expect(saved[0]?.id).toMatch(/^custom-\d+$/)
      expect(saved[0]?.title).toBe('My combo')
    })
  })

  it('leaves Train Combo working after deleting a different combo', async () => {
    const user = userEvent.setup()
    const primeSpy = vi.spyOn(primeAudio, 'primeTrainingAudio').mockResolvedValue({ ok: true, timedOut: false })
    saveCustomCombos([comboRecord('combo-a', { title: 'Alpha' }), comboRecord('combo-b', { title: 'Bravo' })])
    renderBuilder()

    await user.click(within(savedRow('Alpha')).getByRole('button', { name: /^edit$/i }))
    await user.click(within(savedRow('Bravo')).getByRole('button', { name: /^delete$/i }))
    await confirmDelete(user)

    await user.click(within(savedRow('Alpha')).getByRole('button', { name: /train combo/i }))
    expect(await screen.findByTestId('session-page')).toBeInTheDocument()
    primeSpy.mockRestore()
  })

  it('survives 20 delete-while-editing cycles without resurrecting ids', async () => {
    const user = userEvent.setup()
    for (let i = 0; i < 20; i += 1) {
      saveCustomCombos([comboRecord(`combo-${i}`, { title: `Alpha ${i}` })])
      const view = renderBuilder()
      await user.click(within(savedRow(`Alpha ${i}`)).getByRole('button', { name: /^edit$/i }))
      await user.click(within(savedRow(`Alpha ${i}`)).getByRole('button', { name: /^delete$/i }))
      await confirmDelete(user)
      await user.click(screen.getByRole('button', { name: /^save combo$/i }))
      await waitFor(() => {
        const ids = loadCustomCombos().map((combo) => combo.id)
        expect(ids).not.toContain(`combo-${i}`)
        expect(ids).toHaveLength(1)
        expect(ids[0]).toMatch(/^custom-\d+$/)
      })
      view.unmount()
      localStorage.clear()
      seedBuilderPrefs()
    }
  })
})
