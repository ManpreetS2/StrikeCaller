import { createDefaultWorkout } from '../data/defaults'
import type { Combo, CustomCombo, SessionSummary, WorkoutConfig } from '../types'
import { isRuntimeComboSemanticallyValid } from './comboSemantics'
import { clampRepeatCount, tryCustomComboToRuntime } from './customCombo'

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

function finiteSafePayload(config: WorkoutConfig, comboQueue: Combo[]): TrainAgainPayload {
  const next: WorkoutConfig = {
    ...config,
    finishWhenQueueEmpty: true,
    mode: config.mode === 'demo' ? 'custom' : config.mode,
    customComboId: config.customComboId ?? comboQueue[0]?.id,
  }
  if (comboQueue.length > 0) {
    next.repeatCount = comboQueue.length
  } else if (config.repeatCount == null || config.repeatCount < 1 || config.repeatCount > 20) {
    delete next.repeatCount
  }
  return { config: next, comboQueue }
}

/**
 * Rebuild a Train Again session from a completed summary.
 * Custom / fixed-queue workouts restore semantically valid runtime combos
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
  const sessionArt = baseConfig.martialArt

  if (summary.queuedCombos && summary.queuedCombos.length > 0) {
    const comboQueue = summary.queuedCombos
      .map(cloneCombo)
      .filter((combo) => isRuntimeComboSemanticallyValid(combo, sessionArt))
    return finiteSafePayload(
      {
        ...baseConfig,
        customComboId: baseConfig.customComboId ?? summary.queuedCombos[0]!.id,
      },
      comboQueue,
    )
  }

  const customId = baseConfig.customComboId
  const usedCustom = Boolean(customId) || summary.usedCustomCombo || baseConfig.finishWhenQueueEmpty

  if (usedCustom) {
    const live = customId ? customCombos.find((c) => c.id === customId) : undefined
    const snap =
      (customId ? summary.comboSnapshots?.find((c) => c.id === customId) : undefined) ??
      summary.comboSnapshots?.[0]

    if (live) {
      const runtime = tryCustomComboToRuntime(live)
      if (runtime && isRuntimeComboSemanticallyValid(runtime, sessionArt)) {
        const repeats = clampRepeatCount(baseConfig.repeatCount ?? live.repeatCount)
        return finiteSafePayload(
          {
            ...baseConfig,
            mode: 'custom',
            customComboId: live.id,
            martialArt: runtime.martialArt,
          },
          queueFromCombo(runtime, repeats),
        )
      }
    }

    if (snap && isRuntimeComboSemanticallyValid(snap, sessionArt)) {
      const repeats = clampRepeatCount(baseConfig.repeatCount ?? 1)
      return finiteSafePayload(
        {
          ...baseConfig,
          mode: 'custom',
          customComboId: snap.id,
          martialArt: snap.martialArt ?? baseConfig.martialArt,
        },
        queueFromCombo(snap, repeats),
      )
    }

    return finiteSafePayload({ ...baseConfig, mode: 'custom' }, [])
  }

  return { config: { ...baseConfig, finishWhenQueueEmpty: false } }
}
