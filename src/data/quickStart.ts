import { createDefaultWorkout } from './defaults'
import type { UserPreferences, WorkoutConfig } from '../types'

export type QuickStartId =
  | 'quick-train'
  | 'heavy-bag'
  | 'shadowboxing'
  | 'conditioning'
  | 'daily-drill'

export interface QuickStartPreset {
  id: QuickStartId
  title: string
  body: string
  /** When true, navigate to Daily Drill page instead of starting a session. */
  routeToDaily?: boolean
  build: (prefs: UserPreferences) => WorkoutConfig
}

function baseFromPrefs(prefs: UserPreferences, partial: Partial<WorkoutConfig>): WorkoutConfig {
  return createDefaultWorkout({
    stance: prefs.stance,
    difficulty: prefs.experience,
    callStyle: prefs.callStyle,
    pace: prefs.pace,
    customPaceMultiplier: prefs.customPaceMultiplier,
    speech: { ...prefs.speech, callStyle: prefs.callStyle },
    sound: prefs.sound,
    timingMultipliers: prefs.timingMultipliers,
    sideTerminology: prefs.sideTerminology,
    largeText: prefs.largeText,
    resumeBehavior: prefs.resumeBehavior,
    defenseFrequency: prefs.includeDefense === false ? 0 : 0.35,
    movementFrequency: prefs.includeMovement === false ? 0 : 0.4,
    ...partial,
  })
}

export const QUICK_START_PRESETS: QuickStartPreset[] = [
  {
    id: 'quick-train',
    title: 'Quick Train',
    body: '5 minutes · continuous coaching',
    build: (prefs) =>
      baseFromPrefs(prefs, {
        mode: 'coach',
        equipment: prefs.equipment || 'shadowboxing',
        sessionDurationSec: 300,
        roundDurationSec: 300,
        rounds: 1,
        includeKnees: prefs.equipment !== 'shadowboxing',
        includeClinch: false,
        includeElbows: false,
        includeHeadKicks: false,
      }),
  },
  {
    id: 'heavy-bag',
    title: 'Heavy Bag',
    body: '3 × 2-minute rounds · 60s rest',
    build: (prefs) =>
      baseFromPrefs(prefs, {
        mode: 'round',
        equipment: 'heavy-bag',
        rounds: 3,
        roundDurationSec: 120,
        restDurationSec: 60,
        sessionDurationSec: 120,
        includeKnees: true,
        includeElbows: false,
        includeHeadKicks: false,
        includeClinch: false,
      }),
  },
  {
    id: 'shadowboxing',
    title: 'Shadowboxing',
    body: '3 × 2-minute rounds · 45s rest',
    build: (prefs) =>
      baseFromPrefs(prefs, {
        mode: 'round',
        equipment: 'shadowboxing',
        rounds: 3,
        roundDurationSec: 120,
        restDurationSec: 45,
        sessionDurationSec: 120,
        includeKnees: false,
        includeElbows: false,
        includeHeadKicks: false,
        includeClinch: false,
      }),
  },
  {
    id: 'conditioning',
    title: 'Conditioning',
    body: '10 minutes · fight-pace bursts',
    build: (prefs) =>
      baseFromPrefs(prefs, {
        mode: 'coach',
        equipment: prefs.equipment || 'shadowboxing',
        sessionDurationSec: 600,
        roundDurationSec: 600,
        rounds: 1,
        pace: prefs.pace === 'learn' || prefs.pace === 'slow' ? 'normal' : prefs.pace,
        includeKnees: prefs.equipment !== 'shadowboxing',
        includeElbows: false,
        includeHeadKicks: false,
        includeClinch: false,
        categories: ['punch', 'kick', 'teep', 'defense', 'movement'],
      }),
  },
  {
    id: 'daily-drill',
    title: 'Daily Drill',
    body: 'One focused combo · slow → fight pace',
    routeToDaily: true,
    build: (prefs) =>
      baseFromPrefs(prefs, {
        mode: 'daily',
        sessionDurationSec: 45,
        roundDurationSec: 45,
        rounds: 1,
      }),
  },
]

export function getQuickStartPreset(id: QuickStartId): QuickStartPreset {
  const preset = QUICK_START_PRESETS.find((p) => p.id === id)
  if (!preset) throw new Error(`Unknown quick start: ${id}`)
  return preset
}
