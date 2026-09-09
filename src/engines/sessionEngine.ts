import { lookupTechnique } from '../data/techniques'
import { getCombo } from '../data/combos'
import { isRuntimeComboSemanticallyValid } from '../utils/comboSemantics'
import { createSessionId } from '../utils/sessionId'
import { nextCombo, optionsFromWorkout, getDemoCombos } from './comboGenerator'
import { computeTechniqueDurationMs } from './timingEngine'
import { formatTechniqueCall, createSpeechEngine } from './speechEngine'
import { audioEngine } from './audioEngine'
import type {
  ActiveTechniqueState,
  Combo,
  MartialArt,
  ResumeBehavior,
  SessionPhase,
  SessionSummary,
  SessionTechniqueEvent,
  WorkoutConfig,
} from '../types'

export interface SessionSnapshot {
  phase: SessionPhase
  round: number
  timeRemainingMs: number
  currentCombo: Combo | null
  currentStepIndex: number
  currentTechnique: ActiveTechniqueState | null
  nextTechniqueLabel: string | null
  caption: string
  combinationsCompleted: number
  techniquesCalled: number
  techniqueCounts: Record<string, number>
  defenseActions: number
  movementActions: number
  paused: boolean
  speechSupported: boolean
  canSkipOrRepeat: boolean
  wakeLockActive: boolean
  interrupted: boolean
}

type Listener = (snapshot: SessionSnapshot) => void

function canMutateCombo(phase: SessionPhase, paused: boolean): boolean {
  return !paused && phase === 'work'
}

/** Built-in/generated combos are expected valid; this still defends untrusted queue input. */
function runtimeComboIsPlayable(combo: Combo, martialArt: MartialArt): boolean {
  return isRuntimeComboSemanticallyValid(combo, martialArt)
}

export class SessionEngine {
  private config: WorkoutConfig
  private phase: SessionPhase = 'idle'
  private round = 0
  private roundsFullyCompleted = 0
  private timeRemainingMs = 0
  private combo: Combo | null = null
  private stepIndex = 0
  private current: ActiveTechniqueState | null = null
  private caption = ''
  private combinationsCompleted = 0
  private techniquesCalled = 0
  private techniqueCounts: Record<string, number> = {}
  private defenseActions = 0
  private movementActions = 0
  private recentComboIds: string[] = []
  private comboQueue: Combo[] = []
  private listeners = new Set<Listener>()
  private timerId: number | null = null
  private stepTimerId: number | null = null
  private waitResolve: (() => void) | null = null
  private startedAt = 0
  private sessionId: string | null = null
  private workElapsedMs = 0
  private lastTick = 0
  private paused = false
  private pausedFrom: SessionPhase = 'work'
  private finalWarningPlayed = false
  private speech = createSpeechEngine(() => this.config.speech)
  private cancelled = false
  private events: SessionTechniqueEvent[] = []
  private wakeLock: WakeLockSentinel | null = null
  private wakeLockRequest: Promise<void> | null = null
  private wakeLockGeneration = 0
  private wakeLockReleaseAttempted = new WeakSet<WakeLockSentinel>()
  private demoMode = false
  private runToken = 0
  private resumeInFlight = false
  private completedComboIds: string[] = []
  private comboSnapshots = new Map<string, Combo>()
  private techniqueCategoryCounts: Record<string, number> = {}
  private sessionFavoriteIds = new Set<string>()
  private visibilityHandler: (() => void) | null = null
  private wakeLockEnabled = true
  private wakeLockActive = false
  private interrupted = false
  /** Original queue template for Train Again / finite sessions */
  private initialQueue: Combo[] = []
  private finishWhenQueueEmpty = false

  constructor(config: WorkoutConfig, options?: { wakeLock?: boolean }) {
    this.config = config
    this.wakeLockEnabled = options?.wakeLock !== false
    this.finishWhenQueueEmpty = Boolean(config.finishWhenQueueEmpty)
    audioEngine.setVolume(config.sound.masterVolume)
    audioEngine.setEnabled(config.sound.tonesEnabled || config.sound.bellsEnabled)
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => this.listeners.delete(listener)
  }

  snapshot(): SessionSnapshot {
    const nextId =
      this.combo && this.stepIndex + 1 < this.combo.techniques.length
        ? this.combo.techniques[this.stepIndex + 1]!.techniqueId
        : null
    const nextTechnique = nextId ? lookupTechnique(nextId) : null
    const next = nextTechnique
      ? formatTechniqueCall(nextTechnique, this.config.callStyle, {
          stance: this.config.stance,
          terminology: this.config.sideTerminology,
        })
      : null

    return {
      phase: this.phase,
      round: this.round,
      timeRemainingMs: this.timeRemainingMs,
      currentCombo: this.combo,
      currentStepIndex: this.stepIndex,
      currentTechnique: this.current,
      nextTechniqueLabel: this.config.showNextTechnique ? next : null,
      caption: this.caption,
      combinationsCompleted: this.combinationsCompleted,
      techniquesCalled: this.techniquesCalled,
      techniqueCounts: { ...this.techniqueCounts },
      defenseActions: this.defenseActions,
      movementActions: this.movementActions,
      paused: this.paused,
      speechSupported: this.speech.supported,
      canSkipOrRepeat: canMutateCombo(this.phase, this.paused),
      wakeLockActive: this.wakeLockActive,
      interrupted: this.interrupted,
    }
  }

  private emit() {
    const snap = this.snapshot()
    this.listeners.forEach((l) => l(snap))
  }

  private setCaption(text: string) {
    this.caption = text
    this.emit()
  }

  private getResumeBehavior(): ResumeBehavior {
    return this.config.resumeBehavior ?? 'restart-combo'
  }

  markFavorite(comboId: string) {
    this.sessionFavoriteIds.add(comboId)
  }

  unmarkFavorite(comboId: string) {
    this.sessionFavoriteIds.delete(comboId)
  }

  getSessionFavorites(): string[] {
    return [...this.sessionFavoriteIds]
  }

  async start(options?: { demo?: boolean; comboQueue?: Combo[] }) {
    this.demoMode = Boolean(options?.demo) || this.config.mode === 'demo'
    this.cancelled = false
    this.paused = false
    this.interrupted = false
    this.resumeInFlight = false
    this.runToken += 1
    this.startedAt = Date.now()
    this.sessionId = createSessionId(this.startedAt)
    this.workElapsedMs = 0
    this.combinationsCompleted = 0
    this.techniquesCalled = 0
    this.techniqueCounts = {}
    this.defenseActions = 0
    this.movementActions = 0
    this.events = []
    this.recentComboIds = []
    this.completedComboIds = []
    this.comboSnapshots.clear()
    this.techniqueCategoryCounts = {}
    this.sessionFavoriteIds.clear()
    this.roundsFullyCompleted = 0
    this.round = 1
    const seeded =
      options?.comboQueue ??
      (this.demoMode ? getDemoCombos(this.config.stance, this.config.martialArt ?? 'muay-thai') : [])
    this.initialQueue = seeded.map((c) => ({
      ...c,
      techniques: c.techniques.map((t) => ({ ...t })),
    }))
    this.comboQueue = this.initialQueue.map((c) => ({
      ...c,
      techniques: c.techniques.map((t) => ({ ...t })),
    }))
    if (this.initialQueue.length > 0 && this.config.finishWhenQueueEmpty) {
      this.finishWhenQueueEmpty = true
    }
    this.bindVisibility()
    await this.requestWakeLock()
    if (this.cancelled) return
    const token = this.runToken
    await this.runCountdown(token)
    if (this.cancelled || token !== this.runToken) return
    await this.startWorkPeriod(token, true)
  }

  private bindVisibility() {
    if (typeof document === 'undefined') return
    this.unbindVisibility()
    this.visibilityHandler = () => {
      if (this.cancelled || this.phase === 'summary' || this.phase === 'idle') return
      if (document.visibilityState === 'hidden') {
        // Stop silent advancement while suspended; cancel any queued speech backlog.
        if (!this.paused && (this.phase === 'work' || this.phase === 'rest' || this.phase === 'countdown')) {
          this.pause({ interrupted: true })
        } else {
          this.speech.cancel()
          audioEngine.stopAll()
        }
        return
      }
      if (document.visibilityState === 'visible') {
        void this.requestWakeLock()
        if (this.interrupted && this.paused) {
          this.setCaption('Interrupted — tap Resume')
        }
      }
    }
    document.addEventListener('visibilitychange', this.visibilityHandler)
  }

  private unbindVisibility() {
    if (this.visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler)
    }
    this.visibilityHandler = null
  }

  private async runCountdown(token: number) {
    this.phase = 'countdown'
    this.paused = false
    this.emit()
    for (let n = 3; n >= 1; n--) {
      if (this.cancelled || token !== this.runToken) return
      this.setCaption(String(n))
      if (this.config.speech.countdownEnabled) {
        this.queueSpeech(String(n))
      }
      if (this.config.sound.tonesEnabled) {
        void audioEngine.playCountdownTick()
      }
      await this.wait(900)
      if (this.cancelled || token !== this.runToken) return
    }
    this.setCaption('Fight')
    if (this.config.speech.roundCallsEnabled) this.queueSpeech('Fight')
    if (this.config.sound.bellsEnabled) void audioEngine.playBell()
    if (this.config.sound.vibrationEnabled) void audioEngine.vibrate([40, 40, 40])
    await this.wait(400)
  }

  private async startWorkPeriod(token: number, resetClock: boolean) {
    if (this.cancelled || token !== this.runToken) return
    this.phase = 'work'
    this.finalWarningPlayed = false
    if (resetClock) {
      this.timeRemainingMs =
        this.config.mode === 'round' || this.config.mode === 'demo'
          ? this.config.roundDurationSec * 1000
          : this.config.sessionDurationSec * 1000
    }
    this.lastTick = Date.now()
    this.startClock()
    this.emit()
    await this.playNextCombo(token)
  }

  private startClock() {
    this.clearClock()
    this.timerId = window.setInterval(() => {
      if (this.paused || this.phase === 'paused' || this.phase === 'countdown') return
      const now = Date.now()
      const delta = now - this.lastTick
      this.lastTick = now
      if (this.phase === 'work') {
        this.workElapsedMs += delta
        this.timeRemainingMs = Math.max(0, this.timeRemainingMs - delta)
        if (
          this.timeRemainingMs <= 10000 &&
          this.timeRemainingMs > 9500 &&
          !this.finalWarningPlayed
        ) {
          this.finalWarningPlayed = true
          this.setCaption('Ten seconds')
          if (this.config.speech.roundCallsEnabled) this.queueSpeech('Ten seconds')
          if (this.config.sound.tonesEnabled) void audioEngine.playFinalWarning()
        }
        if (this.timeRemainingMs <= 0) {
          void this.onWorkComplete()
        }
      } else if (this.phase === 'rest') {
        this.timeRemainingMs = Math.max(0, this.timeRemainingMs - delta)
        if (this.timeRemainingMs <= 0) {
          void this.onRestComplete()
        }
      }
      this.emit()
    }, 100)
  }

  private clearClock() {
    if (this.timerId != null) {
      window.clearInterval(this.timerId)
      this.timerId = null
    }
  }

  private abortWait() {
    if (this.stepTimerId != null) {
      window.clearTimeout(this.stepTimerId)
      this.stepTimerId = null
    }
    if (this.waitResolve) {
      const resolve = this.waitResolve
      this.waitResolve = null
      resolve()
    }
  }

  private async onWorkComplete() {
    const token = this.runToken
    this.abortWait()
    this.speech.cancel()
    audioEngine.stopAll()
    if (this.config.sound.bellsEnabled) void audioEngine.playBell()

    this.roundsFullyCompleted += 1

    const totalRounds =
      this.config.mode === 'demo' ? 1 : this.config.mode === 'round' ? this.config.rounds : 1

    if ((this.config.mode === 'round' || this.config.mode === 'demo') && this.round < totalRounds) {
      this.phase = 'rest'
      this.timeRemainingMs = this.config.restDurationSec * 1000
      this.setCaption('Rest')
      if (this.config.speech.roundCallsEnabled) this.queueSpeech('Rest')
      if (this.config.sound.tonesEnabled) void audioEngine.playRestChime()
      this.emit()
    } else {
      this.finish(false)
    }
    void token
  }

  private async onRestComplete() {
    const token = ++this.runToken
    this.round += 1
    await this.runCountdown(token)
    if (!this.cancelled && token === this.runToken) {
      await this.startWorkPeriod(token, true)
    }
  }

  private rememberCombo(combo: Combo) {
    this.comboSnapshots.set(combo.id, combo)
  }

  private pickCombo(): Combo | null {
    const sessionArt = this.config.martialArt
    while (this.comboQueue.length) {
      const next = this.comboQueue.shift()!
      if (!runtimeComboIsPlayable(next, sessionArt)) continue
      this.rememberCombo(next)
      return next
    }
    if (this.finishWhenQueueEmpty) {
      return null
    }
    if (this.demoMode) {
      this.comboQueue = getDemoCombos(this.config.stance, this.config.martialArt ?? 'muay-thai')
      while (this.comboQueue.length) {
        const next = this.comboQueue.shift()!
        if (!runtimeComboIsPlayable(next, sessionArt)) continue
        this.rememberCombo(next)
        return next
      }
      return null
    }
    if (this.config.selectedComboIds?.length) {
      const id = this.config.selectedComboIds[this.combinationsCompleted % this.config.selectedComboIds.length]!
      try {
        const curated = getCombo(id)
        if (runtimeComboIsPlayable(curated, sessionArt)) {
          this.rememberCombo(curated)
          return curated
        }
      } catch {
        // fall through to generator
      }
    }
    const generated = nextCombo(optionsFromWorkout(this.config), this.recentComboIds)
    if (generated && runtimeComboIsPlayable(generated, sessionArt)) {
      this.rememberCombo(generated)
      return generated
    }
    return null
  }

  private async playNextCombo(token: number) {
    if (this.cancelled || token !== this.runToken || this.phase !== 'work') return
    const combo = this.pickCombo()
    if (!combo) {
      this.clearClock()
      this.finish(false)
      return
    }
    this.combo = combo
    this.recentComboIds = [...this.recentComboIds.slice(-8), combo.id]
    this.stepIndex = 0
    this.emit()
    await this.playStep(token)
  }

  private async restartCurrentCombo(token: number) {
    if (!this.combo || this.cancelled || token !== this.runToken) return
    this.stepIndex = 0
    this.phase = 'work'
    this.emit()
    await this.playStep(token)
  }

  private async playStep(token: number) {
    if (!this.combo || this.cancelled || token !== this.runToken || this.phase !== 'work') return

    const step = this.combo.techniques[this.stepIndex]
    if (!step) {
      // Full combo finished — count completion
      this.combinationsCompleted += 1
      if (this.combo) this.completedComboIds.push(this.combo.id)
      const pause = this.config.timingMultipliers.pauseBetweenCombosMs
      await this.wait(pause)
      if (this.cancelled || token !== this.runToken || this.phase !== 'work') return
      await this.playNextCombo(token)
      return
    }

    const technique = lookupTechnique(step.techniqueId)
    if (!technique) {
      this.combo = null
      this.current = null
      this.stepIndex = 0
      await this.playNextCombo(token)
      return
    }
    const spoken = formatTechniqueCall(technique, this.config.callStyle, {
      stance: this.config.stance,
      terminology: this.config.sideTerminology,
    })
    const duration = computeTechniqueDurationMs(
      technique,
      this.config.pace,
      this.config.customPaceMultiplier,
      this.config.timingMultipliers,
    )

    this.current = {
      combo: this.combo,
      comboIndex: this.combinationsCompleted,
      stepIndex: this.stepIndex,
      technique,
      spokenLabel: spoken,
      durationMs: duration,
      startedAt: Date.now(),
    }
    this.setCaption(spoken)
    this.techniquesCalled += 1
    this.techniqueCounts[technique.id] = (this.techniqueCounts[technique.id] ?? 0) + 1
    this.techniqueCategoryCounts[technique.category] =
      (this.techniqueCategoryCounts[technique.category] ?? 0) + 1
    if (technique.category === 'defense' || technique.category === 'counter') this.defenseActions += 1
    if (technique.category === 'movement') this.movementActions += 1
    this.events.push({ techniqueId: technique.id, calledAt: Date.now(), spokenAs: spoken })

    this.queueSpeech(spoken)

    if (this.config.sound.vibrationEnabled) void audioEngine.vibrate(20)

    await this.wait(duration)
    if (this.cancelled || token !== this.runToken || this.phase !== 'work') return

    this.stepIndex += 1
    await this.playStep(token)
  }

  pause(options?: { interrupted?: boolean }) {
    if (this.paused || this.phase === 'summary' || this.phase === 'idle') return
    if (this.phase !== 'work' && this.phase !== 'rest' && this.phase !== 'countdown') return

    this.pausedFrom = this.phase
    this.paused = true
    this.phase = 'paused'
    this.interrupted = Boolean(options?.interrupted)
    this.runToken += 1
    this.resumeInFlight = false
    this.abortWait()
    this.clearClock()
    this.speech.cancel()
    audioEngine.stopAll()
    this.setCaption(this.interrupted ? 'Interrupted — tap Resume' : 'Paused')
  }

  async resume() {
    if (!this.paused || this.resumeInFlight || this.cancelled) return
    this.resumeInFlight = true
    this.interrupted = false
    this.speech.hardReset()
    audioEngine.stopAll()
    // Audio unlock is best-effort. A hanging AudioContext.resume() must not
    // leave the session stuck on Pause with no way to continue.
    void Promise.resolve(audioEngine.prepare()).catch(() => {})

    const token = ++this.runToken
    this.paused = false
    this.emit()

    try {
      // Rest resumes remaining rest without Fight countdown/bell
      if (this.pausedFrom === 'rest') {
        this.phase = 'rest'
        this.lastTick = Date.now()
        this.startClock()
        this.setCaption('Rest')
        return
      }

      await this.runCountdown(token)
      if (this.cancelled || token !== this.runToken) return

      if (this.pausedFrom === 'countdown' && this.timeRemainingMs <= 0) {
        await this.startWorkPeriod(token, true)
        return
      }

      this.phase = 'work'
      this.lastTick = Date.now()
      this.startClock()

      if (this.getResumeBehavior() === 'next-combo' || !this.combo) {
        await this.playNextCombo(token)
      } else {
        await this.restartCurrentCombo(token)
      }
    } finally {
      if (token === this.runToken) {
        this.resumeInFlight = false
      }
    }
  }

  async skipCombo() {
    if (!canMutateCombo(this.phase, this.paused)) return
    this.speech.cancel()
    audioEngine.stopAll()
    this.abortWait()
    // Do not count skipped combos as completed
    this.stepIndex = 0
    const token = ++this.runToken
    this.resumeInFlight = false
    this.lastTick = Date.now()
    if (!this.timerId) this.startClock()
    await this.playNextCombo(token)
  }

  async repeatCombo() {
    if (!canMutateCombo(this.phase, this.paused)) return
    if (!this.combo) return
    this.speech.cancel()
    audioEngine.stopAll()
    this.abortWait()
    // Finite-queue sessions: restart current combo without increasing the target count
    if (!this.finishWhenQueueEmpty) {
      const repeat = { ...this.combo, techniques: [...this.combo.techniques] }
      this.comboQueue.unshift(repeat)
    }
    this.stepIndex = 0
    const token = ++this.runToken
    this.resumeInFlight = false
    this.lastTick = Date.now()
    if (!this.timerId) this.startClock()
    await this.wait(this.config.timingMultipliers.pauseBeforeRepeatMs)
    if (token !== this.runToken) return
    if (this.finishWhenQueueEmpty) {
      await this.restartCurrentCombo(token)
    } else {
      await this.playNextCombo(token)
    }
  }

  stop() {
    this.cancelled = true
    this.paused = false
    this.resumeInFlight = false
    this.runToken += 1
    this.speech.cancel()
    audioEngine.stopAll()
    this.abortWait()
    this.clearClock()
    this.releaseWakeLock()
    this.unbindVisibility()
    this.finish(true)
  }

  dispose() {
    this.cancelled = true
    this.paused = false
    this.resumeInFlight = false
    this.runToken += 1
    this.speech.cancel()
    audioEngine.stopAll()
    this.abortWait()
    this.clearClock()
    this.releaseWakeLock()
    this.unbindVisibility()
  }

  private finish(cancelled: boolean) {
    this.cancelled = true
    this.speech.cancel()
    audioEngine.stopAll()
    this.abortWait()
    this.clearClock()
    this.releaseWakeLock()
    this.unbindVisibility()
    this.phase = 'summary'
    this.paused = false
    this.emit()
    void cancelled
  }

  getSummary(): SessionSummary {
    const endedAt = Date.now()
    const isDemo = this.demoMode || this.config.mode === 'demo'

    return {
      id: this.sessionId ?? `session-${this.startedAt}`,
      startedAt: this.startedAt,
      endedAt,
      martialArt: (this.config.martialArt ?? 'muay-thai') as MartialArt,
      mode: this.config.mode,
      stance: this.config.stance,
      pace: this.config.pace,
      customPaceMultiplier: this.config.customPaceMultiplier,
      totalTrainingMs: this.workElapsedMs,
      roundsCompleted: this.roundsFullyCompleted,
      combinationsCompleted: this.combinationsCompleted,
      techniquesCalled: this.techniquesCalled,
      techniqueCounts: { ...this.techniqueCounts },
      techniqueCategoryCounts: { ...this.techniqueCategoryCounts },
      comboIds: [...this.completedComboIds],
      comboSnapshots: [...this.comboSnapshots.values()].filter((c) =>
        this.completedComboIds.includes(c.id),
      ),
      defenseActions: this.defenseActions,
      movementActions: this.movementActions,
      averagePaceLabel: this.config.pace,
      dailyDrillCompleted: false,
      cancelled: false,
      favoriteComboIds: [...this.sessionFavoriteIds].filter((id) =>
        this.completedComboIds.includes(id),
      ),
      usedCustomCombo: Boolean(this.config.customComboId) || this.finishWhenQueueEmpty,
      workoutConfig: { ...this.config, finishWhenQueueEmpty: this.finishWhenQueueEmpty },
      queuedCombos: this.initialQueue.map((c) => ({
        ...c,
        techniques: c.techniques.map((t) => ({ ...t })),
      })),
      excludeFromStats: isDemo,
      isDemo,
    }
  }

  /** Best-effort TTS. Workout timing never awaits this Promise. */
  private queueSpeech(text: string) {
    void Promise.resolve(this.speech.speak(text)).catch(() => {
      /* expected synthesis failures must not become unhandled rejections */
    })
  }

  clearSpeechQueue() {
    this.speech.cancel()
  }

  getSpeechEngine() {
    return this.speech
  }

  private wait(ms: number) {
    return new Promise<void>((resolve) => {
      this.abortWait()
      this.waitResolve = resolve
      this.stepTimerId = window.setTimeout(() => {
        this.stepTimerId = null
        this.waitResolve = null
        resolve()
      }, ms)
    })
  }

  private ownsActiveWakeLock(): boolean {
    const sentinel = this.wakeLock
    if (!sentinel) return false
    if (sentinel.released === true) {
      this.wakeLock = null
      this.wakeLockActive = false
      return false
    }
    return true
  }

  private safelyReleaseWakeLockSentinel(sentinel: WakeLockSentinel) {
    if (this.wakeLockReleaseAttempted.has(sentinel)) return
    this.wakeLockReleaseAttempted.add(sentinel)
    if (sentinel.released === true) return
    void Promise.resolve(sentinel.release()).catch(() => {
      /* wake-lock release is best-effort */
    })
  }

  private installOwnedWakeLock(sentinel: WakeLockSentinel) {
    this.wakeLock = sentinel
    this.wakeLockActive = true
    const owned = sentinel
    owned.addEventListener?.('release', () => {
      if (this.wakeLock !== owned) return
      this.wakeLock = null
      this.wakeLockActive = false
      this.emit()
    })
    this.emit()
  }

  private async acquireWakeLockSentinel(generation: number): Promise<void> {
    let sentinel: WakeLockSentinel
    try {
      sentinel = await navigator.wakeLock.request('screen')
    } catch {
      if (generation === this.wakeLockGeneration) {
        this.wakeLockActive = false
        this.emit()
      }
      return
    }

    if (generation !== this.wakeLockGeneration) {
      this.safelyReleaseWakeLockSentinel(sentinel)
      return
    }

    if (sentinel.released === true) {
      this.wakeLockActive = false
      return
    }

    this.installOwnedWakeLock(sentinel)
  }

  private requestWakeLock(): Promise<void> {
    if (!this.wakeLockEnabled) {
      this.wakeLockActive = false
      return Promise.resolve()
    }
    if (typeof navigator === 'undefined') return Promise.resolve()
    if (!('wakeLock' in navigator) || typeof navigator.wakeLock?.request !== 'function') {
      this.wakeLockActive = false
      return Promise.resolve()
    }
    if (this.ownsActiveWakeLock()) {
      return Promise.resolve()
    }
    if (this.wakeLockRequest) {
      return this.wakeLockRequest
    }

    const generation = this.wakeLockGeneration
    const request = this.acquireWakeLockSentinel(generation).finally(() => {
      if (this.wakeLockRequest === request) {
        this.wakeLockRequest = null
      }
    })
    this.wakeLockRequest = request
    return request
  }

  private releaseWakeLock() {
    this.wakeLockGeneration += 1
    const sentinel = this.wakeLock
    this.wakeLock = null
    this.wakeLockActive = false
    if (sentinel) this.safelyReleaseWakeLockSentinel(sentinel)
  }
}
