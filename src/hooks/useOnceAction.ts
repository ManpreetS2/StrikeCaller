import { useCallback, useRef } from 'react'

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
      void Promise.resolve(action(...args)).finally(() => {
        window.setTimeout(() => {
          locked.current = false
        }, lockMs)
      })
    },
    [action, lockMs],
  )
}
