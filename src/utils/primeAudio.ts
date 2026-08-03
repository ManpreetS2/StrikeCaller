import { audioEngine } from '../engines/audioEngine'
import { prepareCoachingAudioSession } from '../engines/audioSession'

/**
 * Warm audio from a trusted user gesture before Session mounts.
 * Must complete (or time out) before countdown begins.
 */
export async function primeTrainingAudio(options?: {
  musicFriendly?: boolean
  timeoutMs?: number
}): Promise<{ ok: boolean; timedOut: boolean }> {
  const timeoutMs = options?.timeoutMs ?? 1200
  prepareCoachingAudioSession(Boolean(options?.musicFriendly))

  const work = (async () => {
    await audioEngine.prepare()
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.getVoices()
        window.speechSynthesis.cancel()
      } catch {
        // ignore
      }
    }
  })()

  let settled = false
  const result = await Promise.race([
    work.then(() => {
      settled = true
      return { ok: true as const, timedOut: false as const }
    }),
    new Promise<{ ok: boolean; timedOut: boolean }>((resolve) => {
      window.setTimeout(() => {
        if (!settled) resolve({ ok: audioEngine.isReady(), timedOut: true })
      }, timeoutMs)
    }),
  ])

  return { ok: result.ok || audioEngine.isReady(), timedOut: result.timedOut }
}
