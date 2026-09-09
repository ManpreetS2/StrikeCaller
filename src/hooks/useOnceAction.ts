import { useCallback, useRef } from 'react'

function isThenable(value: unknown): value is Promise<void> {
  return typeof value === 'object' && value !== null && typeof (value as Promise<void>).then === 'function'
}

/** Prevents double-tap duplicate submissions on primary actions. */
export function useOnceAction<T extends unknown[]>(
  action: (...args: T) => void | Promise<void>,
  lockMs = 700,
): (...args: T) => void {
  const locked = useRef(false)
  return useCallback(
    (...args: T) => {
      if (locked.current) return
      locked.current = true
      const release = () => {
        window.setTimeout(() => {
          locked.current = false
        }, lockMs)
      }
      try {
        const result = action(...args)
        if (isThenable(result)) {
          void result.then(
            () => undefined,
            () => undefined,
          ).finally(release)
          return
        }
        release()
      } catch {
        release()
      }
    },
    [action, lockMs],
  )
}
