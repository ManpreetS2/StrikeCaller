import { getTechnique } from '../data/techniques'
import type { CallStyle, SideTerminology, SpeechSettings, Stance, Technique } from '../types'
import { prepareCoachingAudioSession, resetAudioSession } from './audioSession'
import { pickEnglishVoice, RUNTIME_SPEECH } from './speechDefaults'

export interface SpeechEngine {
  supported: boolean
  speak: (text: string) => Promise<void>
  cancel: () => void
  hardReset: () => void
  getVoices: () => SpeechSynthesisVoice[]
  preview: (voiceURI?: string | null) => Promise<void>
  isSpeaking: () => boolean
}

function leftRightLabel(technique: Technique, stance: Stance): string {
  if (technique.side === 'neutral' || technique.side === 'both') return technique.shortCall
  const leadIsLeft = stance === 'orthodox'
  if (technique.side === 'lead') {
    return technique.shortCall.replace(/Lead/i, leadIsLeft ? 'Left' : 'Right')
  }
  return technique.shortCall.replace(/Rear/i, leadIsLeft ? 'Right' : 'Left')
}

function isNumberablePunch(technique: Technique): boolean {
  if (technique.category !== 'punch' || technique.numberCall == null) return false
  if (technique.id.startsWith('body')) return false
  if (technique.id.includes('overhand')) return false
  if (technique.id === 'shovel-hook') return false
  return true
}

const NUMBER_WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six']

export function formatTechniqueCall(
  technique: Technique,
  callStyle: CallStyle,
  options: { stance?: Stance; terminology?: SideTerminology } = {},
): string {
  const stance = options.stance ?? 'orthodox'
  const terminology = options.terminology ?? 'lead-rear'
  const name =
    terminology === 'left-right' ? leftRightLabel(technique, stance) : technique.shortCall

  if (callStyle === 'names') return name

  if (technique.id === 'double-jab') {
    return callStyle === 'numbers' ? 'One, one' : 'One, one'
  }
  if (technique.id === 'triple-jab') {
    return 'One, one, one'
  }

  if (callStyle === 'numbers') {
    if (isNumberablePunch(technique)) return String(technique.numberCall)
    return name
  }

  // hybrid
  if (isNumberablePunch(technique)) {
    return NUMBER_WORDS[technique.numberCall!] ?? name
  }
  return name
}

export function formatComboCall(
  techniqueIds: string[],
  callStyle: CallStyle,
  options: { stance?: Stance; terminology?: SideTerminology } = {},
): string {
  return techniqueIds
    .map((id) => formatTechniqueCall(getTechnique(id), callStyle, options))
    .join(', ')
}

function utteranceConstructor(): (typeof SpeechSynthesisUtterance) | undefined {
  if (typeof SpeechSynthesisUtterance === 'function') return SpeechSynthesisUtterance
  if (typeof window !== 'undefined' && typeof window.SpeechSynthesisUtterance === 'function') {
    return window.SpeechSynthesisUtterance
  }
  return undefined
}

function isSpeechSynthesisSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.speechSynthesis !== 'undefined' &&
    typeof window.speechSynthesis?.speak === 'function' &&
    typeof utteranceConstructor() === 'function'
  )
}

export function createSpeechEngine(getSettings: () => SpeechSettings): SpeechEngine {
  const supported = isSpeechSynthesisSupported()

  let speaking = false
  let generation = 0

  const hardReset = () => {
    if (!supported) return
    generation += 1
    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume()
      }
    } catch {
      // ignore
    }
    try {
      window.speechSynthesis.cancel()
    } catch {
      // Some implementations throw; cancellation must not crash the session.
    }
    speaking = false
    try {
      resetAudioSession()
    } catch {
      /* optional */
    }
  }

  const cancel = () => {
    hardReset()
  }

  const getVoices = () => {
    if (!supported) return []
    try {
      return window.speechSynthesis.getVoices()
    } catch {
      return []
    }
  }

  const speak = (text: string) =>
    new Promise<void>((resolve) => {
      const finishQuietly = () => {
        speaking = false
        resolve()
      }
      try {
        const settings = getSettings()
        if (!supported || settings.spokenCallsEnabled === false) {
          resolve()
          return
        }

        hardReset()
        const speakGeneration = generation
        try {
          prepareCoachingAudioSession(Boolean(settings.musicFriendly))
        } catch {
          /* Audio Session API is optional. */
        }

        const Utterance = utteranceConstructor()
        if (!Utterance) {
          finishQuietly()
          return
        }

        const utterance = new Utterance(text)
        utterance.rate = RUNTIME_SPEECH.rate
        utterance.pitch = RUNTIME_SPEECH.pitch
        utterance.volume = RUNTIME_SPEECH.volume
        const voice = pickEnglishVoice(getVoices())
        if (voice) utterance.voice = voice

        let settled = false
        const settle = () => {
          if (settled) return
          settled = true
          if (speakGeneration === generation) speaking = false
          resolve()
        }

        speaking = true
        utterance.onend = () => settle()
        utterance.onerror = () => {
          // canceled / interrupted / synthesis-failed / hardware / etc.
          // Expected browser failures must not reject into SessionEngine.
          settle()
        }
        try {
          window.speechSynthesis.speak(utterance)
        } catch {
          settle()
        }
      } catch {
        finishQuietly()
      }
    })

  return {
    supported,
    speak,
    cancel,
    hardReset,
    getVoices,
    preview: async () => {
      await speak('Jab, cross, rear low kick')
    },
    isSpeaking: () => {
      if (!supported) return false
      try {
        return speaking && window.speechSynthesis.speaking && !window.speechSynthesis.paused
      } catch {
        return false
      }
    },
  }
}
