import { COMBO_MAP } from '../data/combos'
import type { Combo, CustomCombo, SessionSummary } from '../types'
import { customComboToRuntime } from './customCombo'

export function resolveCombo(
  id: string,
  options: { customCombos?: CustomCombo[]; history?: SessionSummary[] } = {},
): Combo | null {
  const curated = COMBO_MAP[id]
  if (curated) return curated

  const custom = options.customCombos?.find((c) => c.id === id)
  if (custom) return customComboToRuntime(custom)

  for (const summary of options.history ?? []) {
    const snap = summary.comboSnapshots?.find((c) => c.id === id)
    if (snap) return snap
  }

  return null
}
