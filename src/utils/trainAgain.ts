import { createDefaultWorkout } from '../data/defaults'
import type { Combo, CustomCombo, SessionSummary, WorkoutConfig } from '../types'
import { clampRepeatCount, customComboToRuntime } from './customCombo'

export interface TrainAgainPayload {
  config: WorkoutConfig
  comboQueue?: Combo[]
}

function cloneCombo(combo: Combo): Combo {
  return {
    ...combo,
    techniques: combo.techniques.map((t) => ({ ...t })),
  }
}

function queueFromCombo(combo: Combo, repeats: number): Combo[] {
  const n = clampRepeatCount(repeats)
  return Array.from({ length: n }, () => cloneCombo(combo))
}

/**
 * Rebuild a Train Again session from a completed summary.
 * Custom / fixed-queue workouts restore the exact runtime queue (or snapshot)
 * and never fall through to the generator.
 */
export function buildTrainAgainPayload(
  summary: SessionSummary,
  customCombos: CustomCombo[] = [],
): TrainAgainPayload {
  const baseConfig = summary.workoutConfig
    ? { ...summary.workoutConfig }
    : createDefaultWorkout({
        martialArt: summary.martialArt,
        mode: summary.mode === 'demo' ? 'round' : summary.mode,
        stance: summary.stance,
        pace: summary.pace,
        customPaceMultiplier: summary.customPaceMultiplier,
      })

  if (summary.queuedCombos && summary.queuedCombos.length > 0) {
    return {
      config: {
        ...baseConfig,
        finishWhenQueueEmpty: true,
        mode: baseConfig.mode === 'demo' ? 'custom' : baseConfig.mode,
        customComboId: baseConfig.customComboId ?? summary.queuedCombos[0]!.id,
        repeatCount: summary.queuedCombos.length,
      },
      comboQueue: summary.queuedCombos.map(cloneCombo),
    }
  }

  const customId = baseConfig.customComboId
  const usedCustom = Boolean(customId) || summary.usedCustomCombo || baseConfig.finishWhenQueueEmpty

  if (usedCustom) {
    const live = customId ? customCombos.find((c) => c.id === customId) : undefined
    const snap =
      (customId ? summary.comboSnapshots?.find((c) => c.id === customId) : undefined) ??
      summary.comboSnapshots?.[0]

    if (live) {
      const runtime = customComboToRuntime(live)
      const repeats = clampRepeatCount(baseConfig.repeatCount ?? live.repeatCount)
      return {
        config: {
          ...baseConfig,
          finishWhenQueueEmpty: true,
          mode: 'custom',
          customComboId: live.id,
          repeatCount: repeats,
          martialArt: runtime.martialArt,
        },
        comboQueue: queueFromCombo(runtime, repeats),
      }
    }

    if (snap) {
      const repeats = clampRepeatCount(baseConfig.repeatCount ?? 1)
      return {
        config: {
          ...baseConfig,
          finishWhenQueueEmpty: true,
          mode: 'custom',
          customComboId: snap.id,
          repeatCount: repeats,
          martialArt: snap.martialArt ?? baseConfig.martialArt,
        },
        comboQueue: queueFromCombo(snap, repeats),
      }
    }
  }

  return { config: { ...baseConfig, finishWhenQueueEmpty: false } }
}
