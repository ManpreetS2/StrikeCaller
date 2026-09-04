import { COMBO_MAP } from '../data/combos'
import type { Combo, CustomCombo, SessionSummary } from '../types'
import { isRuntimeComboSemanticallyValid } from './comboSemantics'
import { tryCustomComboToRuntime } from './customCombo'

export function resolveCombo(
  id: string,
  options: { customCombos?: CustomCombo[]; history?: SessionSummary[] } = {},
): Combo | null {
  const curated = COMBO_MAP[id]
  if (curated) return curated

  const custom = options.customCombos?.find((c) => c.id === id)
  if (custom) {
    const runtime = tryCustomComboToRuntime(custom)
    if (runtime) return runtime
  }

  for (const summary of options.history ?? []) {
    const snap = summary.comboSnapshots?.find((c) => c.id === id)
    const expectedArt = summary.workoutConfig?.martialArt ?? summary.martialArt
    if (snap && isRuntimeComboSemanticallyValid(snap, expectedArt)) return snap
  }

  return null
}
