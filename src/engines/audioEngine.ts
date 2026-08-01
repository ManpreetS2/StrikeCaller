export class AudioEngine {
  private ctx: AudioContext | null = null
  private masterVolume = 0.7
  private enabled = true

  setVolume(volume: number) {
    this.masterVolume = Math.min(1, Math.max(0, volume))
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled
  }

  private async ensure(): Promise<AudioContext | null> {
    if (typeof window === 'undefined') return null
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return null
    if (!this.ctx) this.ctx = new AudioCtx()
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume()
      } catch {
        return this.ctx
      }
    }
    return this.ctx
  }

  private async tone(freq: number, durationMs: number, type: OscillatorType = 'sine', gain = 0.2) {
    if (!this.enabled) return
    const ctx = await this.ensure()
    if (!ctx) return
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
    osc.start(now)
    osc.stop(now + durationMs / 1000 + 0.02)
  }

  async playBell() {
    await this.tone(880, 180, 'triangle', 0.25)
    await delay(120)
    await this.tone(660, 220, 'triangle', 0.22)
  }

  async playCountdownTick() {
    await this.tone(720, 80, 'square', 0.12)
  }

  async playFinalWarning() {
    await this.tone(520, 120, 'sawtooth', 0.15)
    await delay(100)
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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const audioEngine = new AudioEngine()
