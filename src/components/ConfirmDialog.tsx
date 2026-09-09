import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface ConfirmDialogProps {
  title: string
  children: ReactNode
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  confirmDisabled?: boolean
  cancelDisabled?: boolean
  onConfirm: () => void
  onCancel: () => void
  initialFocus?: 'confirm' | 'cancel'
}

type AttrSnapshot = { existed: boolean; value: string | null }

function snapshotAttr(el: Element, name: string): AttrSnapshot {
  return { existed: el.hasAttribute(name), value: el.getAttribute(name) }
}

function restoreAttr(el: Element, name: string, snap: AttrSnapshot) {
  if (!snap.existed) el.removeAttribute(name)
  else el.setAttribute(name, snap.value ?? '')
}

function isElementDisabled(el: HTMLElement): boolean {
  if (el.hasAttribute('disabled')) return true
  if (el instanceof HTMLButtonElement && el.disabled) return true
  if (el.getAttribute('aria-disabled') === 'true') return true
  return false
}

function canRestoreFocus(el: EventTarget | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false
  if (!el.isConnected) return false
  if (isElementDisabled(el)) return false
  return typeof el.focus === 'function'
}

function getEnabledFocusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((el) => !isElementDisabled(el) && el.tabIndex >= 0)
}

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger = false,
  confirmDisabled = false,
  cancelDisabled = false,
  onConfirm,
  onCancel,
  initialFocus,
}: ConfirmDialogProps) {
  const titleId = useId()
  const overlayRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const focusTarget = initialFocus ?? (danger ? 'cancel' : 'confirm')

  useEffect(() => {
    const previouslyFocused = document.activeElement
    const shell = document.querySelector('.app-shell') ?? document.getElementById('main')
    const inertSnap = shell ? snapshotAttr(shell, 'inert') : null
    const hiddenSnap = shell ? snapshotAttr(shell, 'aria-hidden') : null
    if (shell) {
      shell.setAttribute('inert', '')
      shell.setAttribute('aria-hidden', 'true')
    }

    return () => {
      if (shell && inertSnap) restoreAttr(shell, 'inert', inertSnap)
      if (shell && hiddenSnap) restoreAttr(shell, 'aria-hidden', hiddenSnap)
      if (canRestoreFocus(previouslyFocused)) {
        previouslyFocused.focus()
      }
    }
  }, [])

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const requested = focusTarget === 'cancel' ? cancelRef.current : confirmRef.current
    const enabled = getEnabledFocusables(panel)
    const active = document.activeElement
    const activeOk =
      active instanceof HTMLElement &&
      panel.contains(active) &&
      !isElementDisabled(active) &&
      (active === panel || enabled.includes(active))
    if (activeOk) return
    const start =
      requested && !isElementDisabled(requested) && enabled.includes(requested)
        ? requested
        : (enabled[0] ?? panel)
    start.focus()
  }, [focusTarget, confirmDisabled, cancelDisabled])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!cancelDisabled) onCancel()
        return
      }
      if (event.key !== 'Tab') return
      const panel = panelRef.current
      const overlay = overlayRef.current
      if (!panel) return
      const enabled = getEnabledFocusables(panel)
      const active = document.activeElement
      const inside =
        (overlay instanceof HTMLElement && overlay.contains(active)) || panel.contains(active)

      if (enabled.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }

      const first = enabled[0]!
      const last = enabled[enabled.length - 1]!
      if (!inside || active === panel) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
        return
      }
      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel, cancelDisabled])

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-busy={confirmDisabled || cancelDisabled || undefined}
    >
      <div ref={panelRef} className="panel dialog-scroll max-w-md space-y-4 p-5" tabIndex={-1}>
        <h2 id={titleId} className="text-xl font-semibold">
          {title}
        </h2>
        <div className="text-sm text-[var(--text-muted)]">{children}</div>
        <div className="flex flex-wrap gap-2">
          <button
            ref={confirmRef}
            type="button"
            className={danger ? 'btn btn-danger' : 'btn btn-primary'}
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
          <button ref={cancelRef} type="button" className="btn" disabled={cancelDisabled} onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
