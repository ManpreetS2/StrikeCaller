/** Progressive enhancement for the experimental Audio Session API. */

export type AudioSessionType = 'auto' | 'playback' | 'transient' | 'transient-solo' | 'ambient' | 'play-and-record'

export function isAudioSessionSupported(): boolean {
  return typeof navigator !== 'undefined' && 'audioSession' in navigator
}

export function setAudioSessionType(type: AudioSessionType): boolean {
  if (!isAudioSessionSupported()) return false
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
    if (!session) return false
    session.type = type
    return true
  } catch {
    return false
  }
}

/** Prefer transient ducking for short coaching calls when music-friendly mode is on. */
export function prepareCoachingAudioSession(musicFriendly: boolean): void {
  if (!musicFriendly) {
    setAudioSessionType('auto')
    return
  }
  // Prefer transient so short calls can duck music without permanently taking over.
  if (!setAudioSessionType('transient')) {
    setAudioSessionType('playback')
  }
}

export function resetAudioSession(): void {
  setAudioSessionType('auto')
}
