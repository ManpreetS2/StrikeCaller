import { getTechnique } from '../data/techniques'
import { getCombo } from '../data/combos'
import { nextCombo, optionsFromWorkout, getDemoCombos } from './comboGenerator'
import { computeTechniqueDurationMs } from './timingEngine'
import { formatTechniqueCall, createSpeechEngine } from './speechEngine'
import { audioEngine } from './audioEngine'
import type {
  ActiveTechniqueState,
  Combo,
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
}

type Listener = (snapshot: SessionSnapshot) => void

export class SessionEngine {
  private config: WorkoutConfig
  private phase: SessionPhase = 'idle'
  private round = 0
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
  private startedAt = 0
  private workElapsedMs = 0
  private lastTick = 0
  private paused = false
  private finalWarningPlayed = false
  private speech = createSpeechEngine(() => this.config.speech)
  private cancelled = false
  private events: SessionTechniqueEvent[] = []
  private wakeLock: WakeLockSentinel | null = null
  private demoMode = false

  constructor(config: WorkoutConfig) {
    this.config = config
    audioEngine.setVolume(config.sound.masterVolume)
    audioEngine.setEnabled(config.sound.tonesEnabled || config.sound.bellsEnabled)
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => this.listeners.delete(listener)
  }

  snapshot(): SessionSnapshot {
    const next =
      this.combo && this.stepIndex + 1 < this.combo.techniques.length
        ? formatTechniqueCall(
            getTechnique(this.combo.techniques[this.stepIndex + 1]!.techniqueId),
            this.config.callStyle,
            { stance: this.config.stance, terminology: this.config.sideTerminology },
          )
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

  async start(options?: { demo?: boolean; comboQueue?: Combo[] }) {
    this.demoMode = Boolean(options?.demo)
    this.cancelled = false
    this.startedAt = Date.now()
    this.workElapsedMs = 0
    this.combinationsCompleted = 0
    this.techniquesCalled = 0
    this.techniqueCounts = {}
    this.defenseActions = 0
    this.movementActions = 0
    this.events = []
    this.recentComboIds = []
    this.round = this.config.mode === 'round' || this.config.mode === 'demo' ? 1 : 1
    this.comboQueue = options?.comboQueue ?? (this.demoMode ? getDemoCombos(this.config.stance) : [])
    await this.requestWakeLock()
    await this.runCountdown()
    if (this.cancelled) return
    await this.startWorkPeriod()
  }

  private async runCountdown() {
    this.phase = 'countdown'
    this.paused = false
    for (let n = 3; n >= 1; n--) {
      if (this.cancelled) return
      this.setCaption(String(n))
      if (this.config.speech.countdownEnabled) {
        void this.speech.speak(String(n))
      }
      if (this.config.sound.tonesEnabled) await audioEngine.playCountdownTick()
      await this.wait(900)
      if (this.paused) await this.waitWhilePaused()
    }
    this.setCaption('Fight')
    if (this.config.speech.roundCallsEnabled) void this.speech.speak('Fight')
    if (this.config.sound.bellsEnabled) await audioEngine.playBell()
    if (this.config.sound.vibrationEnabled) void audioEngine.vibrate([40, 40, 40])
    await this.wait(400)
  }

  private async startWorkPeriod() {
    this.phase = 'work'
    this.finalWarningPlayed = false
    this.timeRemainingMs =
      this.config.mode === 'round' || this.config.mode === 'demo'
        ? this.config.roundDurationSec * 1000
        : this.config.sessionDurationSec * 1000

    this.lastTick = Date.now()
    this.startClock()
    await this.playNextCombo()
  }

  private startClock() {
    this.clearClock()
    this.timerId = window.setInterval(() => {
      if (this.paused || this.phase === 'paused') return
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
          if (this.config.speech.roundCallsEnabled) void this.speech.speak('Ten seconds')
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

  private clearStepTimer() {
    if (this.stepTimerId != null) {
      window.clearTimeout(this.stepTimerId)
      this.stepTimerId = null
    }
  }

  private async onWorkComplete() {
    this.clearStepTimer()
    this.speech.cancel()
    if (this.config.sound.bellsEnabled) void audioEngine.playBell()

    const totalRounds =
      this.config.mode === 'demo' ? 1 : this.config.mode === 'round' ? this.config.rounds : 1

    if ((this.config.mode === 'round' || this.config.mode === 'demo') && this.round < totalRounds) {
      this.phase = 'rest'
      this.timeRemainingMs = this.config.restDurationSec * 1000
      this.setCaption('Rest')
      if (this.config.speech.roundCallsEnabled) void this.speech.speak('Rest')
      if (this.config.sound.tonesEnabled) void audioEngine.playRestChime()
      this.emit()
    } else {
      this.finish(false)
    }
  }

  private async onRestComplete() {
    this.round += 1
    await this.runCountdown()
    if (!this.cancelled) await this.startWorkPeriod()
  }

  private pickCombo(): Combo {
    if (this.comboQueue.length) {
      return this.comboQueue.shift()!
    }
    if (this.demoMode) {
      // Loop the real demo sequence rather than falling into free generation
      this.comboQueue = getDemoCombos(this.config.stance)
      return this.comboQueue.shift()!
    }
    if (this.config.selectedComboIds?.length) {
      const id = this.config.selectedComboIds[this.combinationsCompleted % this.config.selectedComboIds.length]!
      return getCombo(id)
    }
    return nextCombo(optionsFromWorkout(this.config), this.recentComboIds)
  }

  private async playNextCombo() {
    if (this.cancelled || this.phase !== 'work') return
    const combo = this.pickCombo()
    this.combo = combo
    this.recentComboIds = [...this.recentComboIds.slice(-8), combo.id]
    this.stepIndex = 0
    this.emit()
    await this.playStep()
  }

  private async playStep() {
    if (!this.combo || this.cancelled || this.phase !== 'work') return
    if (this.paused) {
      await this.waitWhilePaused()
      if (this.cancelled || this.phase !== 'work') return
    }

    const step = this.combo.techniques[this.stepIndex]
    if (!step) {
      this.combinationsCompleted += 1
      const pause = this.config.timingMultipliers.pauseBetweenCombosMs
      await this.wait(pause)
      if (!this.cancelled && this.phase === 'work') await this.playNextCombo()
      return
    }

    const technique = getTechnique(step.techniqueId)
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
    if (technique.category === 'defense' || technique.category === 'counter') this.defenseActions += 1
    if (technique.category === 'movement') this.movementActions += 1
    this.events.push({ techniqueId: technique.id, calledAt: Date.now(), spokenAs: spoken })

    try {
      void this.speech.speak(spoken)
    } catch {
      // fall back to caption only
    }

    if (this.config.sound.vibrationEnabled) void audioEngine.vibrate(20)

    await this.wait(duration)
    if (this.cancelled || this.phase !== 'work') return

    this.stepIndex += 1
    await this.playStep()
  }

  pause() {
    if (this.phase !== 'work' && this.phase !== 'rest' && this.phase !== 'countdown') return
    this.paused = true
    this.phase = 'paused'
    this.speech.pause()
    this.emit()
  }

  resume() {
    if (!this.paused) return
    this.paused = false
    this.phase = this.timeRemainingMs > 0 ? 'work' : 'work'
    // Rest resume: if we were resting, caption tells us
    if (this.caption === 'Rest') this.phase = 'rest'
    this.lastTick = Date.now()
    this.speech.resume()
    this.emit()
  }

  async skipCombo() {
    this.clearStepTimer()
    this.speech.cancel()
    if (this.combo) this.combinationsCompleted += 1
    this.stepIndex = 0
    if (this.phase === 'work' || this.phase === 'paused') {
      this.phase = 'work'
      this.paused = false
      await this.playNextCombo()
    }
  }

  async repeatCombo() {
    if (!this.combo) return
    this.clearStepTimer()
    this.speech.cancel()
    const repeat = { ...this.combo }
    this.comboQueue.unshift(repeat)
    this.stepIndex = 0
    this.phase = 'work'
    this.paused = false
    await this.wait(this.config.timingMultipliers.pauseBeforeRepeatMs)
    await this.playNextCombo()
  }

  stop() {
    this.cancelled = true
    this.speech.cancel()
    this.clearClock()
    this.clearStepTimer()
    this.releaseWakeLock()
    this.finish(true)
  }

  /** Tear down timers/speech without entering summary (Strict Mode remounts). */
  dispose() {
    this.cancelled = true
    this.speech.cancel()
    this.clearClock()
    this.clearStepTimer()
    this.releaseWakeLock()
  }

  private finish(cancelled: boolean) {
    this.cancelled = true
    this.speech.cancel()
    this.clearClock()
    this.clearStepTimer()
    this.releaseWakeLock()
    this.phase = 'summary'
    this.paused = false
    this.emit()
    void cancelled
  }

  getSummary(): SessionSummary {
    const endedAt = Date.now()
    return {
      id: `session-${this.startedAt}`,
      startedAt: this.startedAt,
      endedAt,
      mode: this.config.mode,
      stance: this.config.stance,
      pace: this.config.pace,
      totalTrainingMs: this.workElapsedMs,
      roundsCompleted: this.config.mode === 'round' || this.config.mode === 'demo' ? this.round : 1,
      combinationsCompleted: this.combinationsCompleted,
      techniquesCalled: this.techniquesCalled,
      techniqueCounts: { ...this.techniqueCounts },
      defenseActions: this.defenseActions,
      movementActions: this.movementActions,
      averagePaceLabel: this.config.pace,
      dailyDrillCompleted: this.config.mode === 'daily',
      cancelled: this.phase === 'summary' && this.caption === '',
      favoriteComboIds: [],
    }
  }

  /** Expose cancel speech for tests */
  clearSpeechQueue() {
    this.speech.cancel()
  }

  getSpeechEngine() {
    return this.speech
  }

  private wait(ms: number) {
    return new Promise<void>((resolve) => {
      this.stepTimerId = window.setTimeout(() => resolve(), ms)
    })
  }

  private async waitWhilePaused() {
    while (this.paused && !this.cancelled) {
      await this.wait(100)
    }
  }

  private async requestWakeLock() {
    if (!this.config || typeof navigator === 'undefined') return
    try {
      if ('wakeLock' in navigator) {
        this.wakeLock = await navigator.wakeLock.request('screen')
      }
    } catch {
      // unsupported / denied
    }
  }

  private releaseWakeLock() {
    void this.wakeLock?.release()
    this.wakeLock = null
  }
}
