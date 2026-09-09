import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useOnceAction } from '../hooks/useOnceAction'

function trackUnhandled() {
  const reasons: unknown[] = []
  const onWindow = (event: PromiseRejectionEvent) => {
    reasons.push(event.reason)
    event.preventDefault()
  }
  window.addEventListener('unhandledrejection', onWindow)
  return {
    reasons,
    stop() {
      window.removeEventListener('unhandledrejection', onWindow)
    },
  }
}

describe('useOnceAction failure safety', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('releases the lock after a synchronous throw so the user can retry', async () => {
    vi.useFakeTimers()
    const calls: string[] = []
    const unhandled = trackUnhandled()
    const action = vi.fn(() => {
      calls.push('sync')
      throw new Error('boom')
    })
    const { result } = renderHook(() => useOnceAction(action, 700))

    expect(() => {
      act(() => {
        result.current()
      })
    }).not.toThrow()
    expect(action).toHaveBeenCalledTimes(1)

    act(() => {
      result.current()
    })
    expect(action).toHaveBeenCalledTimes(1)

    await act(async () => {
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(700)
    })
    expect(unhandled.reasons).toEqual([])
    unhandled.stop()

    act(() => {
      result.current()
    })
    expect(action).toHaveBeenCalledTimes(2)
    expect(calls).toEqual(['sync', 'sync'])
  })

  it('releases the lock after a rejected promise without manufacturing an unhandled rejection', async () => {
    vi.useFakeTimers()
    const unhandled = trackUnhandled()
    const action = vi.fn(async () => {
      throw new Error('async boom')
    })
    const { result } = renderHook(() => useOnceAction(action, 700))

    act(() => {
      result.current()
    })
    act(() => {
      result.current()
    })
    expect(action).toHaveBeenCalledTimes(1)

    await act(async () => {
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(unhandled.reasons).toEqual([])

    await act(async () => {
      await vi.advanceTimersByTimeAsync(700)
    })
    unhandled.stop()

    act(() => {
      result.current()
    })
    expect(action).toHaveBeenCalledTimes(2)
  })

  it('still ignores a rapid second tap on success', async () => {
    vi.useFakeTimers()
    const action = vi.fn(() => undefined)
    const { result } = renderHook(() => useOnceAction(action, 700))
    act(() => {
      result.current()
      result.current()
      result.current()
    })
    expect(action).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700)
    })
    act(() => {
      result.current()
    })
    expect(action).toHaveBeenCalledTimes(2)
  })

  it('survives 20 mixed sync/rejected failures without sticking locked or leaking rejections', async () => {
    vi.useFakeTimers()
    const unhandled = trackUnhandled()
    let n = 0
    const action = vi.fn(() => {
      n += 1
      if (n % 2 === 0) throw new Error(`sync-${n}`)
      return Promise.reject(new Error(`async-${n}`))
    })
    const { result } = renderHook(() => useOnceAction(action, 50))

    for (let i = 0; i < 20; i++) {
      act(() => {
        result.current()
        result.current()
      })
      await act(async () => {
        await Promise.resolve()
        await vi.advanceTimersByTimeAsync(50)
      })
    }

    expect(action).toHaveBeenCalledTimes(20)
    expect(unhandled.reasons).toEqual([])
    unhandled.stop()
  })
})
