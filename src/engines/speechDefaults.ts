/** Fixed spoken call profile used at runtime (no user voice customization). */
export const RUNTIME_SPEECH = {
  rate: 1,
  pitch: 1,
  volume: 1,
} as const

export function pickEnglishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const en = voices.filter((v) => v.lang?.toLowerCase().startsWith('en'))
  return en.find((v) => v.default) ?? en[0] ?? null
}
