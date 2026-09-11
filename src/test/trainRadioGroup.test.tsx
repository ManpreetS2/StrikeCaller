import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppProvider } from '../context/AppContext'
import { TrainPage } from '../pages/TrainPage'
import { DEFAULT_PREFERENCES } from '../data/defaults'
import { savePreferences } from '../storage/localStore'

function renderTrain() {
  savePreferences({
    ...DEFAULT_PREFERENCES,
    onboardingComplete: true,
    customComboMigrationNoticeShown: true,
  })
  return render(
    <AppProvider>
      <MemoryRouter>
        <TrainPage />
      </MemoryRouter>
    </AppProvider>,
  )
}

describe('A4 Train radio group keyboard', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('keeps a single tab stop in the martial-art group and moves with arrows', async () => {
    const user = userEvent.setup()
    renderTrain()
    const group = screen.getByRole('radiogroup', { name: /martial art/i })
    const muay = within(group).getByRole('radio', { name: /muay thai/i })
    const boxing = within(group).getByRole('radio', { name: /boxing/i })

    expect(muay).toHaveAttribute('aria-checked', 'true')
    expect(boxing).toHaveAttribute('aria-checked', 'false')
    expect(muay).toHaveAttribute('tabindex', '0')
    expect(boxing).toHaveAttribute('tabindex', '-1')

    muay.focus()
    await user.keyboard('{ArrowRight}')
    expect(boxing).toHaveAttribute('aria-checked', 'true')
    expect(boxing).toHaveFocus()
    expect(boxing).toHaveAttribute('tabindex', '0')
    expect(muay).toHaveAttribute('tabindex', '-1')

    await user.keyboard('{ArrowLeft}')
    expect(muay).toHaveAttribute('aria-checked', 'true')
    expect(muay).toHaveFocus()
  })

  it('wraps arrow keys at both ends of the training-mode group', async () => {
    const user = userEvent.setup()
    renderTrain()
    const group = screen.getByRole('radiogroup', { name: /training mode/i })
    const radios = within(group).getAllByRole('radio')
    const first = radios[0]!
    const last = radios[radios.length - 1]!

    first.focus()
    await user.keyboard('{ArrowUp}')
    expect(last).toHaveFocus()
    expect(last).toHaveAttribute('aria-checked', 'true')

    await user.keyboard('{ArrowDown}')
    expect(first).toHaveFocus()
    expect(first).toHaveAttribute('aria-checked', 'true')
  })
})
