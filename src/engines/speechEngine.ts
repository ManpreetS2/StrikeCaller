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

export function createSpeechEngine(getSettings: () => SpeechSettings): SpeechEngine {
  const supported =
    typeof window !== 'undefined' &&
    typeof window.speechSynthesis !== 'undefined' &&
    typeof window.speechSynthesis?.speak === 'function'

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
    window.speechSynthesis.cancel()
    speaking = false
    resetAudioSession()
  }

  const cancel = () => {
    hardReset()
  }

  const getVoices = () => {
    if (!supported) return []
    return window.speechSynthesis.getVoices()
  }

  const speak = (text: string) =>
    new Promise<void>((resolve, reject) => {
      const settings = getSettings()
      if (!supported || settings.spokenCallsEnabled === false) {
        resolve()
        return
      }
      hardReset()
      const speakGeneration = generation
      prepareCoachingAudioSession(Boolean(settings.musicFriendly))

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = RUNTIME_SPEECH.rate
      utterance.pitch = RUNTIME_SPEECH.pitch
      utterance.volume = RUNTIME_SPEECH.volume
      const voice = pickEnglishVoice(getVoices())
      if (voice) utterance.voice = voice

      speaking = true
      utterance.onend = () => {
        if (speakGeneration !== generation) {
          resolve()
          return
        }
        speaking = false
        resolve()
      }
      utterance.onerror = (event) => {
        if (speakGeneration !== generation) {
          resolve()
          return
        }
        speaking = false
        if (event.error === 'canceled' || event.error === 'interrupted') {
          resolve()
          return
        }
        reject(new Error(event.error))
      }
      window.speechSynthesis.speak(utterance)
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
      return speaking && window.speechSynthesis.speaking && !window.speechSynthesis.paused
    },
  }
}
