import { getTechnique } from '../data/techniques'
import type { CallStyle, SideTerminology, SpeechSettings, Stance, Technique } from '../types'
import { prepareCoachingAudioSession, resetAudioSession } from './audioSession'

export interface SpeechEngine {
  supported: boolean
  speak: (text: string) => Promise<void>
  cancel: () => void
  /** Always cancels — never leave speechSynthesis in a paused state. */
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

export function formatTechniqueCall(
  technique: Technique,
  callStyle: CallStyle,
  options: { stance?: Stance; terminology?: SideTerminology; hybridPreferNumber?: boolean } = {},
): string {
  const stance = options.stance ?? 'orthodox'
  const terminology = options.terminology ?? 'lead-rear'

  const name =
    terminology === 'left-right' ? leftRightLabel(technique, stance) : technique.shortCall

  if (callStyle === 'names') return name

  if (callStyle === 'numbers') {
    if (technique.numberCall != null && technique.category === 'punch' && !technique.id.startsWith('body') && technique.id !== 'overhand' && technique.id !== 'double-jab') {
      return String(technique.numberCall)
    }
    if (technique.id === 'double-jab') return 'One, one'
    return name
  }

  // hybrid
  if (technique.numberCall != null && technique.category === 'punch' && !technique.id.startsWith('body') && technique.id !== 'overhand') {
    if (technique.id === 'double-jab') return 'One, one'
    const numberWords = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six']
    return numberWords[technique.numberCall] ?? name
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
      // If synthesis was left paused, resume then cancel clears the stuck state.
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
      if (!supported) {
        resolve()
        return
      }
      hardReset()
      const speakGeneration = generation
      const settings = getSettings()
      prepareCoachingAudioSession(Boolean(settings.musicFriendly))

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = settings.rate
      utterance.pitch = settings.pitch
      utterance.volume = settings.volume
      if (settings.voiceURI) {
        const voice = getVoices().find((v) => v.voiceURI === settings.voiceURI)
        if (voice) utterance.voice = voice
      }
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
    preview: async (voiceURI) => {
      if (!supported) return
      hardReset()
      const settings = getSettings()
      prepareCoachingAudioSession(Boolean(settings.musicFriendly))
      const utterance = new SpeechSynthesisUtterance('Jab, cross, rear low kick')
      utterance.rate = settings.rate
      utterance.pitch = settings.pitch
      utterance.volume = settings.volume
      const uri = voiceURI === undefined ? settings.voiceURI : voiceURI
      if (uri) {
        const voice = getVoices().find((v) => v.voiceURI === uri)
        if (voice) utterance.voice = voice
      }
      window.speechSynthesis.speak(utterance)
    },
    isSpeaking: () => {
      if (!supported) return false
      return speaking && window.speechSynthesis.speaking && !window.speechSynthesis.paused
    },
  }
}
