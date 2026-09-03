import { audioEngine } from '../engines/audioEngine'
import { prepareCoachingAudioSession } from '../engines/audioSession'

export type AudioPreparationResult = {
  ok: boolean
  timedOut: boolean
}

/**
 * Warm audio from a trusted user gesture before Session mounts.
 * Best-effort: expected browser/capability failures resolve `{ ok: false }`
 * instead of rejecting into session startup.
 */
export async function primeTrainingAudio(options?: {
  musicFriendly?: boolean
  timeoutMs?: number
}): Promise<AudioPreparationResult> {
  const timeoutMs = options?.timeoutMs ?? 1200
  try {
    prepareCoachingAudioSession(Boolean(options?.musicFriendly))
  } catch {
    /* Audio Session API is optional. */
  }

  const work = (async (): Promise<boolean> => {
    try {
      const prepared = await audioEngine.prepare()
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.getVoices()
          window.speechSynthesis.cancel()
        } catch {
          /* speech priming is independent of Web Audio */
        }
      }
      return prepared || audioEngine.isReady()
    } catch {
      return false
    }
  })()

  let settled = false
  const guarded = work.then(
    (ok) => {
      settled = true
      return { ok, timedOut: false as const }
    },
    () => {
      settled = true
      return { ok: false, timedOut: false as const }
    },
  )
  // If the timeout wins, `work` may still reject later — keep that from going unhandled.
  void guarded.catch(() => {})

  const timeout = new Promise<AudioPreparationResult>((resolve) => {
    window.setTimeout(() => {
      if (!settled) resolve({ ok: audioEngine.isReady(), timedOut: true })
    }, timeoutMs)
  })

  try {
    const result = await Promise.race([guarded, timeout])
    return { ok: result.ok || audioEngine.isReady(), timedOut: result.timedOut }
  } catch {
    return { ok: audioEngine.isReady(), timedOut: false }
  }
}
