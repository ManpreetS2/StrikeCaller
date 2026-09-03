import type { Page } from '@playwright/test'

export type AudioStubMode = 'real' | 'unavailable'
export type SpeechStubMode = 'stub' | 'unavailable'

export type StubOptions = {
  audio?: AudioStubMode
  speech?: SpeechStubMode
}

type InitPayload = {
  audio: AudioStubMode
  speech: SpeechStubMode
}

/**
 * Install before app code runs. Real DOM/IndexedDB stay intact.
 * Default speech stub is deterministic and silent so E2E does not wait on TTS.
 *
 * Unavailable modes delete the browser APIs (or hide them) the same way a
 * browser without the feature looks to `typeof` / `in` checks. They do not
 * install throwing getters.
 */
export async function installBrowserStubs(page: Page, options: StubOptions = {}): Promise<void> {
  const payload: InitPayload = {
    audio: options.audio ?? 'real',
    speech: options.speech ?? 'stub',
  }

  await page.addInitScript(({ audio, speech }: InitPayload) => {
    const hideApi = (target: object, name: string) => {
      try {
        Reflect.deleteProperty(target, name)
      } catch {
        /* non-configurable */
      }
      if (name in target) {
        try {
          Object.defineProperty(target, name, {
            configurable: true,
            enumerable: false,
            writable: true,
            value: undefined,
          })
        } catch {
          /* leave as-is; capability checks use typeof / ?? */
        }
      }
    }

    const wakeLock = {
      request: async () => {
        const sentinel = {
          released: false,
          release: async () => {
            sentinel.released = true
          },
          addEventListener() {},
          removeEventListener() {},
        }
        return sentinel
      },
    }
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: wakeLock,
    })

    if (audio === 'unavailable') {
      hideApi(window, 'AudioContext')
      hideApi(window, 'webkitAudioContext')
    }

    if (speech === 'unavailable') {
      hideApi(window, 'speechSynthesis')
      hideApi(window, 'SpeechSynthesisUtterance')
      return
    }

    class StubUtterance {
      text: string
      lang = 'en-US'
      volume = 1
      rate = 1
      pitch = 1
      voice: SpeechSynthesisVoice | null = null
      onstart: ((event: Event) => void) | null = null
      onend: ((event: Event) => void) | null = null
      onerror: ((event: Event) => void) | null = null
      onpause: ((event: Event) => void) | null = null
      onresume: ((event: Event) => void) | null = null
      onboundary: ((event: Event) => void) | null = null
      onmark: ((event: Event) => void) | null = null
      constructor(text = '') {
        this.text = text
      }
    }

    const voices: SpeechSynthesisVoice[] = [
      {
        default: true,
        lang: 'en-US',
        localService: true,
        name: 'StrikeCaller Test Voice',
        voiceURI: 'strikecaller-test-voice',
      },
    ]

    const synthesis = {
      paused: false,
      pending: false,
      speaking: false,
      onvoiceschanged: null as ((event: Event) => void) | null,
      getVoices() {
        return voices
      },
      speak(utterance: StubUtterance) {
        synthesis.speaking = true
        queueMicrotask(() => {
          synthesis.speaking = false
          utterance.onend?.(new Event('end'))
        })
      },
      cancel() {
        synthesis.speaking = false
      },
      pause() {
        synthesis.paused = true
      },
      resume() {
        synthesis.paused = false
      },
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false
      },
    }

    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: StubUtterance,
    })
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: synthesis,
    })
  }, payload)
}
