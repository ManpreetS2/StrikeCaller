import { describe, expect, it, beforeEach, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { AppLayout } from '../components/AppLayout'
import { AppProvider } from '../context/AppContext'
import { SettingsPage } from '../pages/SettingsPage'
import { DEFAULT_PREFERENCES } from '../data/defaults'
import { savePreferences } from '../storage/localStore'
import * as historyStore from '../storage/historyStore'
import * as userData from '../storage/userData'

function pressTab(shift = false) {
  fireEvent.keyDown(document, { key: 'Tab', shiftKey: shift, bubbles: true, cancelable: true })
}

function pressEscape() {
  fireEvent.keyDown(document, { key: 'Escape', bubbles: true, cancelable: true })
}

function dialogPanel() {
  return document.querySelector('.dialog-scroll') as HTMLElement | null
}

function ShellDialog({
  confirmDisabled = false,
  cancelDisabled = false,
  danger = true,
  initialFocus,
  onConfirm = () => undefined,
  onCancel = () => undefined,
  confirmLabel = 'Confirm',
  title = 'Danger?',
}: {
  confirmDisabled?: boolean
  cancelDisabled?: boolean
  danger?: boolean
  initialFocus?: 'confirm' | 'cancel'
  onConfirm?: () => void
  onCancel?: () => void
  confirmLabel?: string
  title?: string
}) {
  return (
    <div className="app-shell">
      <header>
        <a href="/">Home</a>
        <button type="button">Theme</button>
      </header>
      <main id="main">
        <button type="button">Inside main</button>
      </main>
      <nav>
        <a href="/train">Train</a>
      </nav>
      <ConfirmDialog
        title={title}
        confirmLabel={confirmLabel}
        danger={danger}
        confirmDisabled={confirmDisabled}
        cancelDisabled={cancelDisabled}
        initialFocus={initialFocus}
        onConfirm={onConfirm}
        onCancel={onCancel}
      >
        Pending work
      </ConfirmDialog>
    </div>
  )
}

function seedSettingsPrefs() {
  savePreferences({
    ...DEFAULT_PREFERENCES,
    onboardingComplete: true,
    customComboMigrationNoticeShown: true,
  })
}

function renderSettingsShell() {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AppLayout />,
        children: [{ path: 'settings', element: <SettingsPage /> }],
      },
    ],
    { initialEntries: ['/settings'] },
  )
  return render(
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>,
  )
}

describe('S2 ConfirmDialog focus and inert', () => {
  beforeEach(() => {
    localStorage.clear()
    seedSettingsPrefs()
  })

  it('moves initial focus to Cancel for a danger dialog', () => {
    render(<ShellDialog />)
    expect(screen.getByRole('button', { name: /^cancel$/i })).toHaveFocus()
  })

  it('moves initial focus to Confirm when requested', () => {
    render(<ShellDialog danger={false} initialFocus="confirm" confirmLabel="Save" />)
    expect(screen.getByRole('button', { name: /^save$/i })).toHaveFocus()
  })

  it('wraps Tab from the last control to the first', () => {
    render(<ShellDialog />)
    screen.getByRole('button', { name: /^cancel$/i }).focus()
    pressTab()
    expect(screen.getByRole('button', { name: /^confirm$/i })).toHaveFocus()
  })

  it('wraps Shift+Tab from the first control to the last', () => {
    render(<ShellDialog />)
    screen.getByRole('button', { name: /^confirm$/i }).focus()
    pressTab(true)
    expect(screen.getByRole('button', { name: /^cancel$/i })).toHaveFocus()
  })

  it('keeps Tab on Cancel when Confirm is disabled', () => {
    render(<ShellDialog confirmDisabled />)
    expect(screen.getByRole('button', { name: /^cancel$/i })).toHaveFocus()
    pressTab()
    expect(screen.getByRole('button', { name: /^cancel$/i })).toHaveFocus()
    expect(document.querySelector('.app-shell')?.contains(document.activeElement)).toBe(false)
  })

  it('keeps Tab on Confirm when Cancel is disabled', () => {
    render(<ShellDialog cancelDisabled initialFocus="confirm" danger={false} />)
    expect(screen.getByRole('button', { name: /^confirm$/i })).toHaveFocus()
    pressTab()
    expect(screen.getByRole('button', { name: /^confirm$/i })).toHaveFocus()
    pressTab(true)
    expect(screen.getByRole('button', { name: /^confirm$/i })).toHaveFocus()
  })

  it('keeps focus in the dialog when both actions are disabled', () => {
    render(<ShellDialog confirmDisabled cancelDisabled />)
    const panel = dialogPanel()
    expect(panel).toBeTruthy()
    expect(panel).toHaveAttribute('tabindex', '-1')
    expect(panel?.contains(document.activeElement) || document.activeElement === panel).toBe(true)

    pressTab()
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
    pressTab(true)
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
    expect(document.querySelector('.app-shell')?.contains(document.activeElement)).toBe(false)
  })

  it('uses the panel as the fallback target when no enabled controls exist', () => {
    render(<ShellDialog confirmDisabled cancelDisabled />)
    expect(dialogPanel()).toHaveFocus()
    pressTab()
    expect(dialogPanel()).toHaveFocus()
  })

  it('invokes cancel on Escape when Cancel is enabled', () => {
    const onCancel = vi.fn()
    render(<ShellDialog onCancel={onCancel} />)
    pressEscape()
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('does not invoke cancel on Escape while cancelDisabled', () => {
    const onCancel = vi.fn()
    render(<ShellDialog cancelDisabled confirmDisabled onCancel={onCancel} />)
    pressEscape()
    expect(onCancel).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('makes the app shell inert and restores it on unmount', () => {
    const { unmount } = render(<ShellDialog />)
    const shell = document.querySelector('.app-shell')
    expect(shell).toHaveAttribute('inert')
    expect(shell).toHaveAttribute('aria-hidden', 'true')
    expect(document.body.hasAttribute('inert')).toBe(false)
    expect(screen.getByRole('dialog')).not.toHaveAttribute('inert')
    unmount()
    expect(document.querySelector('.app-shell')).toBeNull()
  })

  it('preserves a pre-existing aria-hidden value on the app shell', () => {
    function Host() {
      const [open, setOpen] = useState(true)
      return (
        <div className="app-shell" aria-hidden="false">
          <main id="main">
            <button type="button" onClick={() => setOpen(false)}>
              Close
            </button>
          </main>
          {open ? (
            <ConfirmDialog title="Keep?" confirmLabel="OK" onConfirm={() => setOpen(false)} onCancel={() => setOpen(false)}>
              Body
            </ConfirmDialog>
          ) : null}
        </div>
      )
    }
    render(<Host />)
    expect(document.querySelector('.app-shell')).toHaveAttribute('aria-hidden', 'true')
    fireEvent.click(screen.getByRole('button', { name: /^ok$/i }))
    expect(document.querySelector('.app-shell')).toHaveAttribute('aria-hidden', 'false')
  })

  it('restores focus to the opener after the dialog unmounts', async () => {
    const user = userEvent.setup()
    function Host() {
      const [open, setOpen] = useState(false)
      return (
        <div className="app-shell">
          <header>
            <button type="button" onClick={() => setOpen(true)}>
              Open dialog
            </button>
          </header>
          <main id="main">content</main>
          {open ? (
            <ConfirmDialog
              title="Close me?"
              confirmLabel="Done"
              danger
              onConfirm={() => setOpen(false)}
              onCancel={() => setOpen(false)}
            >
              Body
            </ConfirmDialog>
          ) : null}
        </div>
      )
    }
    render(<Host />)
    const opener = screen.getByRole('button', { name: /open dialog/i })
    await user.click(opener)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('does not throw when the originating element disappeared', () => {
    function Host() {
      const [open, setOpen] = useState(true)
      const [showOpener, setShowOpener] = useState(true)
      return (
        <div className="app-shell">
          {showOpener ? (
            <button type="button" onClick={() => setOpen(true)}>
              Open dialog
            </button>
          ) : null}
          {open ? (
            <ConfirmDialog
              title="Gone?"
              confirmLabel="OK"
              onConfirm={() => {
                setShowOpener(false)
                setOpen(false)
              }}
              onCancel={() => setOpen(false)}
            >
              Body
            </ConfirmDialog>
          ) : null}
        </div>
      )
    }
    render(<Host />)
    expect(() => {
      fireEvent.click(screen.getByRole('button', { name: /^ok$/i }))
    }).not.toThrow()
  })

  it('can open and close repeatedly without leaking inert', async () => {
    const user = userEvent.setup()
    function Host() {
      const [open, setOpen] = useState(false)
      return (
        <div className="app-shell">
          <button type="button" onClick={() => setOpen(true)}>
            Open dialog
          </button>
          {open ? (
            <ConfirmDialog title="Again?" confirmLabel="OK" onConfirm={() => setOpen(false)} onCancel={() => setOpen(false)}>
              Body
            </ConfirmDialog>
          ) : null}
        </div>
      )
    }
    render(<Host />)
    const opener = screen.getByRole('button', { name: /open dialog/i })
    for (let i = 0; i < 4; i += 1) {
      await user.click(opener)
      expect(document.querySelector('.app-shell')).toHaveAttribute('inert')
      await user.click(screen.getByRole('button', { name: /^cancel$/i }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(document.querySelector('.app-shell')?.hasAttribute('inert')).toBe(false)
    }
  })

  it('keeps a pending Settings Clear History dialog contained', async () => {
    const user = userEvent.setup()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.spyOn(historyStore, 'clearHistory').mockImplementation(async () => {
      await gate
      return { ok: true }
    })
    renderSettingsShell()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Clear workout history' })).toBeEnabled())
    const opener = screen.getByRole('button', { name: 'Clear workout history' })
    await user.click(opener)
    const dialog = screen.getByRole('dialog', { name: 'Clear workout history?' })
    await user.click(within(dialog).getByRole('button', { name: 'Clear history' }))
    await waitFor(() => {
      expect(within(dialog).getByRole('button', { name: 'Clear history' })).toBeDisabled()
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    })
    expect(document.querySelector('.app-shell')).toHaveAttribute('inert')
    pressTab()
    expect(dialog.contains(document.activeElement)).toBe(true)
    pressTab(true)
    expect(dialog.contains(document.activeElement)).toBe(true)
    pressEscape()
    expect(dialog).toBeInTheDocument()
    await act(async () => {
      release()
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Clear workout history?' })).not.toBeInTheDocument()
    })
    expect(document.querySelector('.app-shell')?.hasAttribute('inert')).toBe(false)
    expect(opener).toHaveFocus()
  })

  it('keeps a pending Settings Delete All dialog contained', async () => {
    const user = userEvent.setup()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.spyOn(userData, 'deleteAllUserData').mockImplementation(async () => {
      await gate
      return { ok: true }
    })
    renderSettingsShell()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete all data' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Delete all data' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete all local data?' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete permanently' }))
    await waitFor(() => {
      expect(within(dialog).getByRole('button', { name: 'Delete permanently' })).toBeDisabled()
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    })
    expect(document.querySelector('.app-shell')).toHaveAttribute('inert')
    pressEscape()
    expect(dialog).toBeInTheDocument()
    pressTab()
    expect(dialog.contains(document.activeElement)).toBe(true)
    await act(async () => {
      release()
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Delete all local data?' })).not.toBeInTheDocument()
    })
  })

  it('still allows Escape to cancel a Builder-style enabled danger dialog', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<ShellDialog onCancel={onCancel} confirmLabel="Delete" />)
    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalled()
  })

  it('survives 20 pending both-disabled keyboard cycles', () => {
    for (let i = 0; i < 20; i += 1) {
      const onCancel = vi.fn()
      const view = render(<ShellDialog confirmDisabled cancelDisabled onCancel={onCancel} />)
      expect(dialogPanel()).toHaveFocus()
      pressTab()
      expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
      pressTab(true)
      expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
      pressEscape()
      expect(onCancel).not.toHaveBeenCalled()
      expect(document.querySelector('.app-shell')).toHaveAttribute('inert')
      view.unmount()
    }
  })
})
