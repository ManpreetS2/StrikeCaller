import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { useEffect, useRef } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, useNavigate } from 'react-router-dom'
import { AppProvider, useApp } from '../context/AppContext'
import { AppLayout } from '../components/AppLayout'
import { SummaryPage } from '../pages/SummaryPage'
import { appRoutes } from '../routes'
import { DEFAULT_PREFERENCES } from '../data/defaults'
import { LEGACY_HISTORY_KEY } from '../storage/localStore'
import { HISTORY_QUOTA_MESSAGE } from '../storage/storageTypes'
import * as historyStore from '../storage/historyStore'
import {
  clearHistory,
  resetHistoryDbConnection,
  saveSession,
} from '../storage/historyStore'
import * as idb from '../storage/idb'
import { transactSessions } from '../storage/idb'
import type { SessionSummary } from '../types'

function session(id: string, extra: Partial<SessionSummary> = {}): SessionSummary {
  const startedAt = extra.startedAt ?? 1_700_000_000_000
  const endedAt = extra.endedAt ?? startedAt + 60_000
  return {
    id,
    martialArt: 'muay-thai',
    mode: 'coach',
    stance: 'orthodox',
    pace: 'technical',
    totalTrainingMs: 60_000,
    roundsCompleted: 1,
    combinationsCompleted: 4,
    techniquesCalled: 8,
    techniqueCounts: { jab: 4 },
    techniqueCategoryCounts: { punch: 8 },
    comboIds: ['beg-01'],
    defenseActions: 0,
    movementActions: 0,
    averagePaceLabel: 'technical',
    dailyDrillCompleted: false,
    cancelled: false,
    favoriteComboIds: [],
    usedCustomCombo: false,
    ...extra,
    startedAt,
    endedAt,
  }
}

function seedOnboarding() {
  localStorage.setItem(
    'strikecaller:preferences',
    JSON.stringify({ ...DEFAULT_PREFERENCES, onboardingComplete: true }),
  )
}

function renderSummary(
  entry: string | { pathname: string; state?: unknown },
) {
  const router = createMemoryRouter(appRoutes, {
    initialEntries: [typeof entry === 'string' ? entry : entry],
  })
  const view = render(
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>,
  )
  return { ...view, router }
}

function CompleteAndGo({ summary }: { summary: SessionSummary }) {
  const { addHistory } = useApp()
  const navigate = useNavigate()
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    void (async () => {
      const result = await addHistory(summary)
      if (result.status === 'persisted') {
        navigate(`/summary/${encodeURIComponent(summary.id)}`, { state: { summary }, replace: true })
        return
      }
      navigate('/summary', { state: { summary }, replace: true })
    })()
  }, [addHistory, navigate, summary])
  return <p>Finishing workout…</p>
}

function CompleteWhenReady({ summary }: { summary: SessionSummary }) {
  const { addHistory, historyReady } = useApp()
  const navigate = useNavigate()
  const started = useRef(false)
  useEffect(() => {
    if (!historyReady || started.current) return
    started.current = true
    void (async () => {
      const result = await addHistory(summary)
      if (result.status === 'persisted') {
        navigate(`/summary/${encodeURIComponent(summary.id)}`, { state: { summary }, replace: true })
        return
      }
      navigate('/summary', { state: { summary }, replace: true })
    })()
  }, [addHistory, historyReady, navigate, summary])
  return <p>{historyReady ? 'Finishing workout…' : 'Waiting for history…'}</p>
}

function renderCompletion(summary: SessionSummary, mode: 'now' | 'when-ready' = 'now') {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AppLayout />,
        children: [
          {
            index: true,
            element: mode === 'when-ready' ? <CompleteWhenReady summary={summary} /> : <CompleteAndGo summary={summary} />,
          },
          { path: 'summary', element: <SummaryPage /> },
          { path: 'summary/:sessionId', element: <SummaryPage /> },
        ],
      },
    ],
    { initialEntries: ['/'] },
  )
  const view = render(
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>,
  )
  return { ...view, router }
}

function deferIndexedDbOpen() {
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const original = idb.openHistoryDb
  vi.spyOn(idb, 'openHistoryDb').mockImplementation(async () => {
    await gate
    return original()
  })
  return { release: () => release() }
}

async function expectFound(summary: Pick<SessionSummary, 'martialArt' | 'mode' | 'stance' | 'pace' | 'roundsCompleted' | 'combinationsCompleted' | 'cancelled'>) {
  const art = summary.martialArt === 'boxing' ? 'Boxing' : 'Muay Thai'
  await waitFor(() => {
    expect(
      screen.getByText(`${art} · ${summary.mode} · ${summary.stance} · ${summary.pace}`),
    ).toBeInTheDocument()
  })
  expect(screen.getByRole('heading', { name: 'Summary' })).toBeInTheDocument()
  expect(screen.getByText(summary.cancelled ? 'Session ended early' : 'Session complete')).toBeInTheDocument()
  const rounds = screen.getByText('Rounds').closest('.panel')
  const combos = screen.getByText('Combinations').closest('.panel')
  expect(rounds).toBeTruthy()
  expect(combos).toBeTruthy()
  expect(within(rounds as HTMLElement).getByText(String(summary.roundsCompleted))).toBeInTheDocument()
  expect(within(combos as HTMLElement).getByText(String(summary.combinationsCompleted))).toBeInTheDocument()
}

async function expectNotFound() {
  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'Workout summary not found.' })).toBeInTheDocument()
  })
  const main = within(document.getElementById('main') as HTMLElement)
  expect(main.getByRole('link', { name: 'Training Stats' })).toBeInTheDocument()
  expect(main.getByRole('link', { name: 'Home' })).toBeInTheDocument()
  expect(main.getByRole('link', { name: 'Start workout' })).toBeInTheDocument()
}

describe('durable summary recovery by session id', () => {
  beforeEach(() => {
    localStorage.clear()
    seedOnboarding()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('renders matching route-state immediately without waiting on IndexedDB', async () => {
    const summary = session('fast-A', {
      martialArt: 'boxing',
      roundsCompleted: 3,
      combinationsCompleted: 14,
    })
    renderSummary({ pathname: `/summary/${summary.id}`, state: { summary } })
    expect(screen.getByRole('heading', { name: 'Summary' })).toBeInTheDocument()
    await expectFound(summary)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('ignores mismatched route-state and loads the URL id instead', async () => {
    const requested = session('A', {
      martialArt: 'boxing',
      roundsCompleted: 3,
      combinationsCompleted: 12,
    })
    const other = session('B', {
      martialArt: 'muay-thai',
      roundsCompleted: 1,
      combinationsCompleted: 4,
    })
    expect(await saveSession(requested)).toEqual({ ok: true })
    expect(await saveSession(other)).toEqual({ ok: true })
    renderSummary({ pathname: '/summary/A', state: { summary: other } })
    await expectFound(requested)
  })

  it('recovers a seeded session from IndexedDB with no router state', async () => {
    const summary = session('idb-A', {
      martialArt: 'boxing',
      roundsCompleted: 2,
      combinationsCompleted: 8,
    })
    expect(await saveSession(summary)).toEqual({ ok: true })
    renderSummary(`/summary/${summary.id}`)
    await expectFound(summary)
  })

  it('recovers the same session after remounting the router with no state', async () => {
    const summary = session('reload-A', {
      martialArt: 'boxing',
      stance: 'southpaw',
      roundsCompleted: 4,
      combinationsCompleted: 16,
    })
    expect(await saveSession(summary)).toEqual({ ok: true })
    const first = renderSummary(`/summary/${summary.id}`)
    await expectFound(summary)
    first.unmount()
    renderSummary(`/summary/${summary.id}`)
    await expectFound(summary)
  })

  it('renders exact session A when history also contains a newer B', async () => {
    const a = session('A', {
      startedAt: 1_700_000_000_000,
      martialArt: 'boxing',
      roundsCompleted: 5,
      combinationsCompleted: 21,
    })
    const b = session('B', {
      startedAt: 1_800_000_000_000,
      martialArt: 'muay-thai',
      roundsCompleted: 1,
      combinationsCompleted: 2,
    })
    expect(await saveSession(a)).toEqual({ ok: true })
    expect(await saveSession(b)).toEqual({ ok: true })
    renderSummary('/summary/A')
    await expectFound(a)
  })

  it('shows not found for an unknown id', async () => {
    renderSummary('/summary/does-not-exist')
    await expectNotFound()
  })

  it('shows not found for an oversized route id without crashing', async () => {
    renderSummary(`/summary/${'x'.repeat(201)}`)
    await expectNotFound()
  })

  it('shows not found for a corrupt IndexedDB row and leaves that row in place', async () => {
    await transactSessions('readwrite', (store) => {
      store.put({ id: 'corrupt-A', garbage: true })
    })
    renderSummary('/summary/corrupt-A')
    await expectNotFound()
    let raw: unknown
    await transactSessions('readonly', (store) => {
      const request = store.get('corrupt-A')
      request.onsuccess = () => {
        raw = request.result
      }
    })
    expect(raw).toEqual({ id: 'corrupt-A', garbage: true })
  })

  it('still renders matching transient state when IndexedDB is unavailable', async () => {
    const summary = session('transient-A', {
      martialArt: 'boxing',
      roundsCompleted: 2,
      combinationsCompleted: 9,
    })
    resetHistoryDbConnection()
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true, writable: true })
    renderSummary({ pathname: `/summary/${summary.id}`, state: { summary } })
    await expectFound(summary)
  })

  it('shows not found when IndexedDB is unavailable and there is no matching state', async () => {
    resetHistoryDbConnection()
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true, writable: true })
    renderSummary('/summary/no-state-A')
    await expectNotFound()
  })

  it('does not infer the latest workout for legacy /summary', async () => {
    expect(await saveSession(session('latest', { combinationsCompleted: 30 }))).toEqual({ ok: true })
    renderSummary('/summary')
    await expectNotFound()
    expect(screen.queryByText('30')).not.toBeInTheDocument()
  })

  it('may still show leftover in-app state on legacy /summary', async () => {
    const summary = session('legacy-state', {
      martialArt: 'boxing',
      combinationsCompleted: 13,
      roundsCompleted: 2,
    })
    renderSummary({ pathname: '/summary', state: { summary } })
    await expectFound(summary)
  })

  it('still displays a transient summary when the durable write fails', async () => {
    const summary = session('unsaved-A', {
      martialArt: 'boxing',
      roundsCompleted: 2,
      combinationsCompleted: 15,
    })
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    })
    const first = renderSummary({ pathname: `/summary/${summary.id}`, state: { summary } })
    await expectFound(summary)
    first.unmount()
    renderSummary(`/summary/${summary.id}`)
    await expectNotFound()
  })

  it('shows a demo summary from transient /summary state and cannot recover it after refresh', async () => {
    const demo = session('demo-1', {
      mode: 'demo',
      isDemo: true,
      excludeFromStats: true,
      martialArt: 'boxing',
      combinationsCompleted: 6,
      roundsCompleted: 1,
    })
    expect(await saveSession(demo)).toEqual({ ok: true })
    const { router, unmount } = renderCompletion(demo, 'when-ready')
    await expectFound(demo)
    expect(router.state.location.pathname).toBe('/summary')
    expect(router.state.location.pathname).not.toBe(`/summary/${demo.id}`)
    unmount()
    renderSummary(`/summary/${demo.id}`)
    await expectNotFound()
  })

  it('recovers a cancelled session by id because cancelled workouts remain persistable', async () => {
    const cancelled = session('cancelled-A', {
      cancelled: true,
      combinationsCompleted: 3,
      roundsCompleted: 1,
    })
    expect(await saveSession(cancelled)).toEqual({ ok: true })
    renderSummary(`/summary/${cancelled.id}`)
    await expectFound(cancelled)
    expect(screen.getByText('Session ended early')).toBeInTheDocument()
  })

  it('shows not found after the requested session is deleted from history', async () => {
    const summary = session('deleted-A', {
      martialArt: 'boxing',
      combinationsCompleted: 18,
    })
    expect(await saveSession(summary)).toEqual({ ok: true })
    const first = renderSummary(`/summary/${summary.id}`)
    await expectFound(summary)
    first.unmount()
    expect((await clearHistory()).ok).toBe(true)
    renderSummary(`/summary/${summary.id}`)
    await expectNotFound()
  })

  it('migrates leftover localStorage history before recovering a summary URL', async () => {
    const summary = session('legacy-migrate', {
      martialArt: 'boxing',
      roundsCompleted: 6,
      combinationsCompleted: 22,
    })
    localStorage.setItem(LEGACY_HISTORY_KEY, JSON.stringify([summary]))
    renderSummary(`/summary/${summary.id}`)
    await expectFound(summary)
    await waitFor(() => {
      expect(localStorage.getItem(LEGACY_HISTORY_KEY)).toBeNull()
    })
  })

  it('leaves Training Stats on the shared history list', async () => {
    const now = Date.now()
    expect(
      await saveSession(session('stats-A', { startedAt: now - 60_000, combinationsCompleted: 4 })),
    ).toEqual({ ok: true })
    expect(
      await saveSession(session('stats-B', { startedAt: now, combinationsCompleted: 8 })),
    ).toEqual({ ok: true })
    renderSummary('/stats')
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Training Stats' })).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.queryByText('No sessions in this range')).not.toBeInTheDocument()
    })
  })
})

describe('summary completion persistence handshake', () => {
  beforeEach(() => {
    localStorage.clear()
    seedOnboarding()
    vi.restoreAllMocks()
    resetHistoryDbConnection()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('does not enter the durable summary URL until the IndexedDB write commits, then recovers without route state', async () => {
    const summary = session('race-A', {
      martialArt: 'boxing',
      roundsCompleted: 3,
      combinationsCompleted: 17,
    })
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const originalSave = historyStore.saveSession
    const saveSpy = vi.spyOn(historyStore, 'saveSession').mockImplementation(async (next) => {
      if (next.id === summary.id) await held
      return originalSave(next)
    })

    const { router, unmount } = renderCompletion(summary, 'when-ready')
    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1))
    expect(router.state.location.pathname).toBe('/')
    expect(router.state.location.pathname).not.toBe(`/summary/${summary.id}`)

    release()
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/summary/${summary.id}`)
    })
    await expectFound(summary)
    expect(saveSpy).toHaveBeenCalledTimes(1)

    unmount()
    renderSummary(`/summary/${summary.id}`)
    await expectFound(summary)
  })

  it('queues a completion while history is initializing, then navigates only after the flushed write commits', async () => {
    const summary = session('queued-A', {
      martialArt: 'boxing',
      roundsCompleted: 2,
      combinationsCompleted: 10,
    })
    const { release } = deferIndexedDbOpen()
    resetHistoryDbConnection()
    const originalSave = historyStore.saveSession
    const saveSpy = vi.spyOn(historyStore, 'saveSession').mockImplementation(async (next) => originalSave(next))
    const putIds: string[] = []
    const originalPut = IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      const id = typeof value === 'object' && value && 'id' in value ? String(value.id) : ''
      if (id) putIds.push(id)
      return originalPut.call(this, value, key)
    })

    const { router, unmount } = renderCompletion(summary, 'now')
    await waitFor(() => expect(screen.getByText('Finishing workout…')).toBeInTheDocument())
    expect(router.state.location.pathname).toBe('/')
    expect(saveSpy).not.toHaveBeenCalled()

    release()
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/summary/${summary.id}`)
    })
    await expectFound(summary)
    expect(saveSpy).toHaveBeenCalledTimes(1)
    expect(putIds.filter((id) => id === summary.id)).toEqual([summary.id])

    unmount()
    renderSummary(`/summary/${summary.id}`)
    await expectFound(summary)
  })

  it('keeps a failed save on transient /summary with a storage warning and never uses the durable ID URL', async () => {
    const summary = session('warn-A', {
      martialArt: 'boxing',
      combinationsCompleted: 11,
      roundsCompleted: 2,
    })
    const originalPut = IDBObjectStore.prototype.put
    const putIds: string[] = []
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      const id = typeof value === 'object' && value && 'id' in value ? String(value.id) : ''
      if (id) putIds.push(id)
      if (id === summary.id) {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      }
      return originalPut.call(this, value, key)
    })

    const { router, unmount } = renderCompletion(summary, 'when-ready')
    await expectFound(summary)
    expect(router.state.location.pathname).toBe('/summary')
    expect(router.state.location.pathname).not.toBe(`/summary/${summary.id}`)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByRole('alert')).toHaveTextContent(HISTORY_QUOTA_MESSAGE)
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(putIds.filter((id) => id === summary.id)).toHaveLength(1)

    unmount()
    renderSummary(`/summary/${summary.id}`)
    await expectNotFound()
  })
})
