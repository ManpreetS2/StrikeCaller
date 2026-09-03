export class AudioEngine {
  private ctx: AudioContext | null = null
  private masterVolume = 0.7
  private enabled = true
  private toneGeneration = 0
  private activeNodes: Array<{ osc: OscillatorNode; stopAt: number }> = []

  setVolume(volume: number) {
    this.masterVolume = Math.min(1, Math.max(0, volume))
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled
  }

  /** Cancel pending/overlapping tones without closing the AudioContext. */
  stopAll() {
    this.toneGeneration += 1
    for (const node of this.activeNodes) {
      try {
        node.osc.stop()
      } catch {
        // already stopped
      }
    }
    this.activeNodes = []
  }

  /**
   * Unlock / resume AudioContext from a user gesture.
   * Best-effort: capability failures resolve false instead of rejecting.
   */
  async prepare(): Promise<boolean> {
    try {
      const ctx = await this.ensure()
      return Boolean(ctx && ctx.state === 'running')
    } catch {
      return false
    }
  }

  isReady(): boolean {
    return Boolean(this.ctx && this.ctx.state === 'running')
  }

  /** Drop any cached context so tests can simulate construction failures. */
  resetForTests() {
    this.stopAll()
    if (this.ctx) {
      try {
        void Promise.resolve(this.ctx.close()).catch(() => {})
      } catch {
        /* ignore */
      }
    }
    this.ctx = null
  }

  private audioContextConstructor(): (new () => AudioContext) | undefined {
    if (typeof window === 'undefined') return undefined
    const w = window as Window & { webkitAudioContext?: typeof AudioContext }
    return window.AudioContext ?? w.webkitAudioContext
  }

  private async ensure(): Promise<AudioContext | null> {
    const AudioCtx = this.audioContextConstructor()
    if (!AudioCtx) return null
    try {
      if (!this.ctx) {
        this.ctx = new AudioCtx()
      }
    } catch {
      this.ctx = null
      return null
    }
    if (this.ctx.state === 'suspended') {
      try {
        await Promise.race([this.ctx.resume(), delay(AUDIO_UNLOCK_TIMEOUT_MS)])
      } catch {
        // Autoplay policy / browser bugs: keep the context for a later gesture.
      }
    }
    return this.ctx
  }

  private async tone(freq: number, durationMs: number, type: OscillatorType = 'sine', gain = 0.2) {
    if (!this.enabled) return
    try {
      const gen = this.toneGeneration
      const ctx = await this.ensure()
      if (!ctx || gen !== this.toneGeneration) return
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = type
      osc.frequency.value = freq
      g.gain.value = gain * this.masterVolume
      osc.connect(g)
      g.connect(ctx.destination)
      const now = ctx.currentTime
      g.gain.setValueAtTime(gain * this.masterVolume, now)
      g.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000)
      const entry = { osc, stopAt: now + durationMs / 1000 + 0.02 }
      this.activeNodes.push(entry)
      osc.onended = () => {
        this.activeNodes = this.activeNodes.filter((n) => n !== entry)
      }
      osc.start(now)
      osc.stop(entry.stopAt)
    } catch {
      // Oscillator / destination failures must not reject cue playback.
    }
  }

  async playBell() {
    const gen = this.toneGeneration
    await this.tone(880, 180, 'triangle', 0.25)
    if (gen !== this.toneGeneration) return
    await delay(120)
    if (gen !== this.toneGeneration) return
    await this.tone(660, 220, 'triangle', 0.22)
  }

  async playCountdownTick() {
    await this.tone(720, 80, 'square', 0.12)
  }

  async playFinalWarning() {
    const gen = this.toneGeneration
    await this.tone(520, 120, 'sawtooth', 0.15)
    if (gen !== this.toneGeneration) return
    await delay(100)
    if (gen !== this.toneGeneration) return
    await this.tone(520, 120, 'sawtooth', 0.15)
  }

  async playRestChime() {
    await this.tone(440, 200, 'sine', 0.18)
  }

  async vibrate(pattern: number | number[] = 40) {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern)
      } catch {
        // ignore
      }
    }
  }
}

/** Firefox/Linux CI can leave AudioContext.resume() pending indefinitely. */
const AUDIO_UNLOCK_TIMEOUT_MS = 800

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const audioEngine = new AudioEngine()
