import { createDefaultWorkout } from './defaults'
import type { MartialArt, UserPreferences, WorkoutConfig } from '../types'

export type QuickStartId =
  | 'quick-train'
  | 'heavy-bag'
  | 'shadowboxing'
  | 'conditioning'
  | 'daily-drill'
  | 'quick-boxing'
  | 'boxing-bag'
  | 'boxing-shadow'
  | 'boxing-defense'
  | 'boxing-conditioning'
  | 'boxing-daily'
  | 'quick-mma'
  | 'mma-low-kick'
  | 'mma-defense'
  | 'mma-fight'
  | 'mma-shadow'
  | 'mma-daily'

export interface QuickStartPreset {
  id: QuickStartId
  title: string
  body: string
  martialArt: MartialArt
  routeToDaily?: boolean
  build: (prefs: UserPreferences) => WorkoutConfig
}

function baseFromPrefs(prefs: UserPreferences, partial: Partial<WorkoutConfig>): WorkoutConfig {
  const martialArt = partial.martialArt ?? prefs.martialArt
  const boxing = martialArt === 'boxing'
  const mma = martialArt === 'mma-striking'
  return createDefaultWorkout({
    stance: prefs.stance,
    difficulty: prefs.experience,
    callStyle: prefs.callStyle,
    pace: prefs.pace,
    customPaceMultiplier: prefs.customPaceMultiplier,
    speech: {
      ...prefs.speech,
      callStyle: prefs.callStyle,
      voiceURI: null,
      rate: 1,
      pitch: 1,
      volume: 1,
    },
    sound: prefs.sound,
    timingMultipliers: prefs.timingMultipliers,
    sideTerminology: prefs.sideTerminology,
    largeText: prefs.largeText,
    resumeBehavior: prefs.resumeBehavior,
    minimalMode: prefs.preferMinimalMode,
    showNextTechnique: !prefs.preferMinimalMode,
    defenseFrequency: prefs.includeDefense === false ? 0 : 0.35,
    movementFrequency: prefs.includeMovement === false ? 0 : 0.4,
    includeKnees: boxing ? false : prefs.equipment !== 'shadowboxing',
    includeElbows: false,
    includeHeadKicks: false,
    includeClinch: false,
    categories: boxing
      ? ['punch', 'defense', 'movement', 'counter']
      : ['punch', 'kick', 'teep', 'defense', 'movement'],
    ...(mma ? { comboLength: { min: 2, max: 4 } } : {}),
    ...partial,
    martialArt,
  })
}

const MUAY_THAI_PRESETS: QuickStartPreset[] = [
  {
    id: 'quick-train',
    title: 'Quick Train',
    body: '5 minutes · continuous coaching',
    martialArt: 'muay-thai',
    build: (prefs) =>
      baseFromPrefs(prefs, {
        martialArt: 'muay-thai',
        mode: 'coach',
        equipment: prefs.equipment || 'shadowboxing',
        sessionDurationSec: 300,
        roundDurationSec: 300,
        rounds: 1,
      }),
  },
  {
    id: 'heavy-bag',
    title: 'Heavy Bag',
    body: '3 × 2-minute rounds · 60s rest',
    martialArt: 'muay-thai',
    build: (prefs) =>
      baseFromPrefs(prefs, {
        martialArt: 'muay-thai',
        mode: 'round',
        equipment: 'heavy-bag',
        rounds: 3,
        roundDurationSec: 120,
        restDurationSec: 60,
        sessionDurationSec: 120,
        includeKnees: true,
      }),
  },
  {
    id: 'shadowboxing',
    title: 'Shadowboxing',
    body: '3 × 2-minute rounds · 45s rest',
    martialArt: 'muay-thai',
    build: (prefs) =>
      baseFromPrefs(prefs, {
        martialArt: 'muay-thai',
        mode: 'round',
        equipment: 'shadowboxing',
        rounds: 3,
        roundDurationSec: 120,
        restDurationSec: 45,
        sessionDurationSec: 120,
        includeKnees: false,
      }),
  },
  {
    id: 'conditioning',
    title: 'Conditioning',
    body: '10 minutes · fight-pace bursts',
    martialArt: 'muay-thai',
    build: (prefs) =>
      baseFromPrefs(prefs, {
        martialArt: 'muay-thai',
        mode: 'coach',
        equipment: prefs.equipment || 'shadowboxing',
        sessionDurationSec: 600,
        roundDurationSec: 600,
        rounds: 1,
        pace: prefs.pace === 'learn' || prefs.pace === 'slow' ? 'normal' : prefs.pace,
      }),
  },
  {
    id: 'daily-drill',
    title: 'Daily Drill',
    body: 'One focused combo · slow → fight pace',
    martialArt: 'muay-thai',
    routeToDaily: true,
    build: (prefs) =>
      baseFromPrefs(prefs, {
        martialArt: 'muay-thai',
        mode: 'daily',
        sessionDurationSec: 45,
        roundDurationSec: 45,
        rounds: 1,
      }),
  },
]

const BOXING_PRESETS: QuickStartPreset[] = [
  {
    id: 'quick-boxing',
    title: 'Quick Boxing',
    body: '5 minutes · continuous coaching',
    martialArt: 'boxing',
    build: (prefs) =>
      baseFromPrefs(prefs, {
        martialArt: 'boxing',
        mode: 'coach',
        equipment: 'shadowboxing',
        sessionDurationSec: 300,
        roundDurationSec: 300,
        rounds: 1,
      }),
  },
  {
    id: 'boxing-bag',
    title: 'Boxing Bag',
    body: '3 × 2-minute rounds · 60s rest',
    martialArt: 'boxing',
    build: (prefs) =>
      baseFromPrefs(prefs, {
        martialArt: 'boxing',
        mode: 'round',
        equipment: 'heavy-bag',
        rounds: 3,
        roundDurationSec: 120,
        restDurationSec: 60,
        sessionDurationSec: 120,
      }),
  },
  {
    id: 'boxing-shadow',
    title: 'Shadowboxing',
    body: '3 × 2-minute rounds · 45s rest',
    martialArt: 'boxing',
    build: (prefs) =>
      baseFromPrefs(prefs, {
        martialArt: 'boxing',
        mode: 'round',
        equipment: 'shadowboxing',
        rounds: 3,
        roundDurationSec: 120,
        restDurationSec: 45,
        sessionDurationSec: 120,
      }),
  },
  {
    id: 'boxing-defense',
    title: 'Defense & Counters',
    body: '5 minutes · defense and returns',
    martialArt: 'boxing',
    build: (prefs) =>
      baseFromPrefs(prefs, {
        martialArt: 'boxing',
        mode: 'reaction',
        equipment: 'shadowboxing',
        sessionDurationSec: 300,
        roundDurationSec: 300,
        rounds: 1,
        defenseFrequency: 0.7,
        movementFrequency: 0.35,
        categories: ['punch', 'defense', 'counter', 'movement'],
      }),
  },
  {
    id: 'boxing-conditioning',
    title: 'Boxing Conditioning',
    body: '10 minutes · fight-pace bursts',
    martialArt: 'boxing',
    build: (prefs) =>
      baseFromPrefs(prefs, {
        martialArt: 'boxing',
        mode: 'coach',
        sessionDurationSec: 600,
        roundDurationSec: 600,
        rounds: 1,
        pace: prefs.pace === 'learn' || prefs.pace === 'slow' ? 'normal' : prefs.pace,
      }),
  },
  {
    id: 'boxing-daily',
    title: 'Daily Boxing Drill',
    body: 'One focused combo · slow → fight pace',
    martialArt: 'boxing',
    routeToDaily: true,
    build: (prefs) =>
      baseFromPrefs(prefs, {
        martialArt: 'boxing',
        mode: 'daily',
        sessionDurationSec: 45,
        roundDurationSec: 45,
        rounds: 1,
      }),
  },
]

const MMA_PRESETS: QuickStartPreset[] = [
  {
    id: 'quick-mma',
    title: 'MMA Fundamentals',
    body: '5 minutes · short mixed combinations',
    martialArt: 'mma-striking',
    build: (prefs) =>
      baseFromPrefs(prefs, {
        martialArt: 'mma-striking',
        mode: 'coach',
        equipment: prefs.equipment || 'shadowboxing',
        sessionDurationSec: 300,
        roundDurationSec: 300,
        rounds: 1,
      }),
  },
  {
    id: 'mma-low-kick',
    title: 'Hands to Low Kick',
    body: '3 × 2-minute rounds · 60s rest',
    martialArt: 'mma-striking',
    build: (prefs) =>
      baseFromPrefs(prefs, {
        martialArt: 'mma-striking',
        mode: 'round',
        equipment: 'heavy-bag',
        rounds: 3,
        roundDurationSec: 120,
        restDurationSec: 60,
        sessionDurationSec: 120,
        includeKnees: false,
        categories: ['punch', 'kick', 'teep', 'defense', 'movement'],
      }),
  },
  {
    id: 'mma-defense',
    title: 'Defense & Exit',
    body: '5 minutes · counters and angle exits',
    martialArt: 'mma-striking',
    build: (prefs) =>
      baseFromPrefs(prefs, {
        martialArt: 'mma-striking',
        mode: 'reaction',
        equipment: 'shadowboxing',
        sessionDurationSec: 300,
        roundDurationSec: 300,
        rounds: 1,
        defenseFrequency: 0.7,
        movementFrequency: 0.55,
        includeKnees: false,
      }),
  },
  {
    id: 'mma-fight',
    title: 'MMA Fight Pace',
    body: '10 minutes · short bursts, clean recovery',
    martialArt: 'mma-striking',
    build: (prefs) =>
      baseFromPrefs(prefs, {
        martialArt: 'mma-striking',
        mode: 'coach',
        sessionDurationSec: 600,
        roundDurationSec: 600,
        rounds: 1,
        pace: prefs.pace === 'learn' || prefs.pace === 'slow' ? 'normal' : prefs.pace,
      }),
  },
  {
    id: 'mma-shadow',
    title: 'MMA Shadowboxing',
    body: '3 × 2-minute rounds · 45s rest',
    martialArt: 'mma-striking',
    build: (prefs) =>
      baseFromPrefs(prefs, {
        martialArt: 'mma-striking',
        mode: 'round',
        equipment: 'shadowboxing',
        rounds: 3,
        roundDurationSec: 120,
        restDurationSec: 45,
        sessionDurationSec: 120,
        includeKnees: false,
      }),
  },
  {
    id: 'mma-daily',
    title: 'Daily MMA Drill',
    body: 'One focused combo · slow → fight pace',
    martialArt: 'mma-striking',
    routeToDaily: true,
    build: (prefs) =>
      baseFromPrefs(prefs, {
        martialArt: 'mma-striking',
        mode: 'daily',
        sessionDurationSec: 45,
        roundDurationSec: 45,
        rounds: 1,
      }),
  },
]

/** @deprecated Prefer getQuickStartPresets(martialArt) */
export const QUICK_START_PRESETS = MUAY_THAI_PRESETS

export function getQuickStartPresets(martialArt: MartialArt): QuickStartPreset[] {
  if (martialArt === 'boxing') return BOXING_PRESETS
  if (martialArt === 'mma-striking') return MMA_PRESETS
  return MUAY_THAI_PRESETS
}

export function getQuickStartPreset(id: QuickStartId): QuickStartPreset {
  const preset = [...MUAY_THAI_PRESETS, ...BOXING_PRESETS, ...MMA_PRESETS].find((p) => p.id === id)
  if (!preset) throw new Error(`Unknown quick start: ${id}`)
  return preset
}
