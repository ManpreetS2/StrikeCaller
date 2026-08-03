import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from './useReducedMotion'

/**
 * Animates a number toward `value` when it changes.
 * Reduced motion and large jumps snap to the final value immediately.
 * Screen readers should use the final `value`, not this display number.
 */
export function useCountUp(value: number, durationMs = 420): number {
  const reduced = useReducedMotion()
  const [display, setDisplay] = useState(() => (reduced ? value : 0))
  const primed = useRef(false)

  useEffect(() => {
    if (reduced || !Number.isFinite(value) || Math.abs(value) > 5000) {
      setDisplay(value)
      primed.current = true
      return
    }

    const start = primed.current ? display : 0
    primed.current = true
    if (value === start) {
      setDisplay(value)
      return
    }

    const delta = value - start
    if (Math.abs(delta) > 5000) {
      setDisplay(value)
      return
    }

    const startAt = performance.now()
    let frame = 0

    const tick = (now: number) => {
      const t = Math.min(1, (now - startAt) / durationMs)
      const eased = 1 - (1 - t) * (1 - t)
      const next = Math.round(start + delta * eased)
      setDisplay(t >= 1 ? value : next)
      if (t < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- animate only when value changes
  }, [value, reduced, durationMs])

  return display
}
