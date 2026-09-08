import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionEngine } from '../engines/sessionEngine'
import { createDefaultWorkout, DEFAULT_SPEECH } from '../data/defaults'
import type { Combo, WorkoutConfig } from '../types'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function flush() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function silentWorkout(partial: Partial<WorkoutConfig> = {}): WorkoutConfig {
  return createDefaultWorkout({
    mode: 'coach',
    sessionDurationSec: 90,
    roundDurationSec: 90,
    speech: {
      ...DEFAULT_SPEECH,
      volume: 0,
      spokenCallsEnabled: false,
      countdownEnabled: false,
      roundCallsEnabled: false,
      coachingCuesEnabled: false,
    },
    sound: { bellsEnabled: false, tonesEnabled: false, vibrationEnabled: false, masterVolume: 0 },
    ...partial,
  })
}

function jabCross(): Combo {
  return {
    id: 'wl-jc',
    title: 'Jab cross',
    difficulty: 'beginner',
    stance: 'orthodox',
    trainingModes: ['coach', 'round', 'custom', 'learn', 'daily', 'demo', 'reaction'],
    purpose: 'establish-jab',
    techniques: [{ techniqueId: 'jab' }, { techniqueId: 'cross' }],
    recommendedPace: 'technical',
    setupExplanation: 't',
    endingPosition: 'base',
    safeExit: 'reset',
    coachingNotes: 'n',
    tags: [],
    equipment: ['shadowboxing'],
    martialArt: 'muay-thai',
  }
}

type FakeSentinel = WakeLockSentinel & { fireRelease: () => void }

function createFakeSentinel(options?: { releaseImpl?: () => Promise<void> }): FakeSentinel {
  const listeners = new Set<() => void>()
  const sentinel = {
    released: false,
    type: 'screen' as const,
    onrelease: null,
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (type !== 'release') return
      const fn =
        typeof listener === 'function' ? () => listener(new Event('release')) : () => listener.handleEvent(new Event('release'))
      listeners.add(fn)
    },
    removeEventListener() {},
    dispatchEvent() {
      return false
    },
    release: vi.fn(async () => {
      if (options?.releaseImpl) return options.releaseImpl()
      if (sentinel.released) return
      sentinel.released = true
      for (const listener of [...listeners]) listener()
    }),
    fireRelease() {
      sentinel.released = true
      for (const listener of [...listeners]) listener()
    },
  }
  return sentinel as FakeSentinel
}

function installWakeLockRequest(request: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: { request },
  })
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
}

function fireVisible() {
  setVisibility('visible')
  document.dispatchEvent(new Event('visibilitychange'))
}

function trackUnhandled() {
  const reasons: unknown[] = []
  const onWindow = (event: PromiseRejectionEvent) => {
    reasons.push(event.reason)
    event.preventDefault()
  }
  const onProcess = (reason: unknown) => {
    reasons.push(reason)
  }
  window.addEventListener('unhandledrejection', onWindow)
  const proc = (
    globalThis as {
      process?: {
        on: (event: string, listener: (reason: unknown) => void) => void
        off: (event: string, listener: (reason: unknown) => void) => void
      }
    }
  ).process
  proc?.on('unhandledRejection', onProcess)
  return {
    reasons,
    stop() {
      window.removeEventListener('unhandledrejection', onWindow)
      proc?.off('unhandledRejection', onProcess)
    },
  }
}

describe('A7 wake-lock ownership lifecycle', () => {
  let engine: SessionEngine | undefined
  const snapshots: boolean[] = []

  afterEach(() => {
    engine?.dispose()
    engine = undefined
    snapshots.length = 0
    Reflect.deleteProperty(navigator, 'wakeLock')
    setVisibility('visible')
  })

  function createEngine(wakeLock = true) {
    const next = new SessionEngine(silentWorkout(), { wakeLock })
    next.subscribe((snap) => {
      snapshots.push(snap.wakeLockActive)
    })
    engine = next
    return next
  }

  async function startPending(request: ReturnType<typeof vi.fn>) {
    const session = createEngine(true)
    void session.start({ comboQueue: [jabCross()] })
    await flush()
    expect(request).toHaveBeenCalledTimes(1)
    expect(session.snapshot().wakeLockActive).toBe(false)
    return session
  }

  async function waitUntilNotIdle(session: SessionEngine) {
    for (let i = 0; i < 25; i++) {
      if (session.snapshot().phase !== 'idle') return
      await Promise.resolve()
    }
    expect(session.snapshot().phase).not.toBe('idle')
  }

  it('overlapping acquisition calls make one browser request', async () => {
    const sentinelA = createFakeSentinel()
    const gate = deferred<FakeSentinel>()
    const request = vi.fn()
    request.mockImplementationOnce(async () => sentinelA)
    request.mockImplementation(() => gate.promise)
    installWakeLockRequest(request)
    const session = createEngine(true)
    void session.start({ comboQueue: [jabCross()] })
    await flush()
    expect(session.snapshot().wakeLockActive).toBe(true)
    await waitUntilNotIdle(session)
    sentinelA.fireRelease()
    fireVisible()
    fireVisible()
    await flush()
    expect(request).toHaveBeenCalledTimes(2)
    const sentinelB = createFakeSentinel()
    gate.resolve(sentinelB)
    await flush()
    expect(session.snapshot().wakeLockActive).toBe(true)
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('successful request sets wakeLockActive true', async () => {
    const sentinel = createFakeSentinel()
    const request = vi.fn(async () => sentinel)
    installWakeLockRequest(request)
    const session = createEngine(true)
    void session.start({ comboQueue: [jabCross()] })
    await flush()
    expect(session.snapshot().wakeLockActive).toBe(true)
    expect(snapshots.includes(true)).toBe(true)
  })

  it('active lock prevents duplicate acquisition', async () => {
    const sentinel = createFakeSentinel()
    const request = vi.fn(async () => sentinel)
    installWakeLockRequest(request)
    const session = createEngine(true)
    void session.start({ comboQueue: [jabCross()] })
    await flush()
    expect(request).toHaveBeenCalledTimes(1)
    await waitUntilNotIdle(session)
    fireVisible()
    await flush()
    expect(request).toHaveBeenCalledTimes(1)
    expect(session.snapshot().wakeLockActive).toBe(true)
  })

  it('current sentinel release clears active state', async () => {
    const sentinel = createFakeSentinel()
    const request = vi.fn(async () => sentinel)
    installWakeLockRequest(request)
    const session = createEngine(true)
    void session.start({ comboQueue: [jabCross()] })
    await flush()
    expect(session.snapshot().wakeLockActive).toBe(true)
    sentinel.fireRelease()
    expect(session.snapshot().wakeLockActive).toBe(false)
  })

  it('stale old release cannot clear newer sentinel', async () => {
    const first = deferred<FakeSentinel>()
    const request = vi.fn(() => first.promise)
    installWakeLockRequest(request)
    const session = await startPending(request)
    const sentinelA = createFakeSentinel()
    first.resolve(sentinelA)
    await flush()
    expect(session.snapshot().wakeLockActive).toBe(true)
    await waitUntilNotIdle(session)

    sentinelA.fireRelease()
    expect(session.snapshot().wakeLockActive).toBe(false)

    const sentinelB = createFakeSentinel()
    request.mockImplementation(async () => sentinelB)
    fireVisible()
    await flush()
    expect(session.snapshot().wakeLockActive).toBe(true)

    sentinelA.fireRelease()
    expect(session.snapshot().wakeLockActive).toBe(true)
  })

  it('stop during pending acquisition releases stale result', async () => {
    const gate = deferred<FakeSentinel>()
    const request = vi.fn(() => gate.promise)
    installWakeLockRequest(request)
    const session = await startPending(request)
    session.stop()
    expect(session.snapshot().wakeLockActive).toBe(false)
    const sentinel = createFakeSentinel()
    gate.resolve(sentinel)
    await flush()
    expect(sentinel.release).toHaveBeenCalledTimes(1)
    expect(session.snapshot().wakeLockActive).toBe(false)
    expect(session.snapshot().phase).toBe('summary')
    expect(snapshots.filter((active) => active).length).toBe(0)
  })

  it('dispose during pending acquisition releases stale result', async () => {
    const gate = deferred<FakeSentinel>()
    const request = vi.fn(() => gate.promise)
    installWakeLockRequest(request)
    const session = await startPending(request)
    session.dispose()
    const sentinel = createFakeSentinel()
    gate.resolve(sentinel)
    await flush()
    expect(sentinel.release).toHaveBeenCalledTimes(1)
    expect(session.snapshot().wakeLockActive).toBe(false)
    expect(snapshots.filter((active) => active).length).toBe(0)
  })

  it('active sentinel stop releases exactly once', async () => {
    const sentinel = createFakeSentinel()
    const request = vi.fn(async () => sentinel)
    installWakeLockRequest(request)
    const session = createEngine(true)
    void session.start({ comboQueue: [jabCross()] })
    await flush()
    expect(session.snapshot().wakeLockActive).toBe(true)
    session.stop()
    await flush()
    expect(sentinel.release).toHaveBeenCalledTimes(1)
    expect(session.snapshot().wakeLockActive).toBe(false)
  })

  it('active sentinel dispose releases exactly once', async () => {
    const sentinel = createFakeSentinel()
    const request = vi.fn(async () => sentinel)
    installWakeLockRequest(request)
    const session = createEngine(true)
    void session.start({ comboQueue: [jabCross()] })
    await flush()
    session.dispose()
    await flush()
    expect(sentinel.release).toHaveBeenCalledTimes(1)
    expect(session.snapshot().wakeLockActive).toBe(false)
  })

  it('repeated teardown does not double-release', async () => {
    const sentinel = createFakeSentinel()
    const request = vi.fn(async () => sentinel)
    installWakeLockRequest(request)
    const session = createEngine(true)
    void session.start({ comboQueue: [jabCross()] })
    await flush()
    session.dispose()
    session.dispose()
    session.stop()
    await flush()
    expect(sentinel.release).toHaveBeenCalledTimes(1)
    expect(session.snapshot().wakeLockActive).toBe(false)
  })

  it('release Promise rejection produces no unhandled rejection', async () => {
    const tracked = trackUnhandled()
    const sentinel = createFakeSentinel({
      releaseImpl: () => Promise.reject(new Error('release failed')),
    })
    const request = vi.fn(async () => sentinel)
    installWakeLockRequest(request)
    const session = createEngine(true)
    void session.start({ comboQueue: [jabCross()] })
    await flush()
    session.stop()
    await flush()
    tracked.stop()
    expect(tracked.reasons).toEqual([])
    expect(session.snapshot().wakeLockActive).toBe(false)
    expect(session.snapshot().phase).toBe('summary')
  })

  it('request rejection clears in-flight slot and can retry later', async () => {
    const first = deferred<FakeSentinel>()
    const second = deferred<FakeSentinel>()
    let calls = 0
    const request = vi.fn(() => {
      calls += 1
      return calls === 1 ? first.promise : second.promise
    })
    installWakeLockRequest(request)
    const session = await startPending(request)
    first.reject(new Error('denied'))
    await flush()
    expect(session.snapshot().wakeLockActive).toBe(false)
    expect(request).toHaveBeenCalledTimes(1)
    await waitUntilNotIdle(session)

    const sentinelB = createFakeSentinel()
    fireVisible()
    await flush()
    expect(request).toHaveBeenCalledTimes(2)
    second.resolve(sentinelB)
    await flush()
    expect(session.snapshot().wakeLockActive).toBe(true)
  })

  it('unsupported API stays false', async () => {
    Reflect.deleteProperty(navigator, 'wakeLock')
    const session = createEngine(true)
    void session.start({ comboQueue: [jabCross()] })
    await flush()
    expect(session.snapshot().wakeLockActive).toBe(false)
    fireVisible()
    await flush()
    expect(session.snapshot().wakeLockActive).toBe(false)
  })

  it('wakeLock disabled makes zero browser requests', async () => {
    const request = vi.fn(async () => createFakeSentinel())
    installWakeLockRequest(request)
    const session = createEngine(false)
    void session.start({ comboQueue: [jabCross()] })
    await flush()
    fireVisible()
    await flush()
    expect(request).not.toHaveBeenCalled()
    expect(session.snapshot().wakeLockActive).toBe(false)
  })

  it('visible after browser release reacquires', async () => {
    const sentinelA = createFakeSentinel()
    const sentinelB = createFakeSentinel()
    const request = vi.fn()
    request.mockImplementationOnce(async () => sentinelA)
    request.mockImplementation(async () => sentinelB)
    installWakeLockRequest(request)
    const session = createEngine(true)
    void session.start({ comboQueue: [jabCross()] })
    await flush()
    expect(session.snapshot().wakeLockActive).toBe(true)
    await waitUntilNotIdle(session)
    sentinelA.fireRelease()
    expect(session.snapshot().wakeLockActive).toBe(false)
    fireVisible()
    await flush()
    expect(request).toHaveBeenCalledTimes(2)
    expect(session.snapshot().wakeLockActive).toBe(true)
  })

  it('visible while request pending does not duplicate request', async () => {
    const sentinelA = createFakeSentinel()
    const gate = deferred<FakeSentinel>()
    const request = vi.fn()
    request.mockImplementationOnce(async () => sentinelA)
    request.mockImplementation(() => gate.promise)
    installWakeLockRequest(request)
    const session = createEngine(true)
    void session.start({ comboQueue: [jabCross()] })
    await flush()
    await waitUntilNotIdle(session)
    sentinelA.fireRelease()
    fireVisible()
    await flush()
    expect(request).toHaveBeenCalledTimes(2)
    fireVisible()
    await flush()
    expect(request).toHaveBeenCalledTimes(2)
    gate.resolve(createFakeSentinel())
    await flush()
    expect(request).toHaveBeenCalledTimes(2)
    expect(session.snapshot().wakeLockActive).toBe(true)
  })

  it('no late active snapshot after teardown', async () => {
    const gate = deferred<FakeSentinel>()
    const request = vi.fn(() => gate.promise)
    installWakeLockRequest(request)
    const session = await startPending(request)
    const recorded: boolean[] = []
    session.subscribe((snap) => recorded.push(snap.wakeLockActive))
    session.dispose()
    const sentinel = createFakeSentinel()
    gate.resolve(sentinel)
    await flush()
    expect(sentinel.release).toHaveBeenCalledTimes(1)
    expect(session.snapshot().wakeLockActive).toBe(false)
    expect(recorded.every((active) => active === false)).toBe(true)
    expect(snapshots.filter((active) => active).length).toBe(0)
  })
})
