import type { Equipment, MartialArt, TechniqueCategory } from '../types'
import { sportUsesClinch, sportUsesKicks } from './martialArt'

export function buildTechniqueCategories(options: {
  martialArt: MartialArt
  defenseFrequency: number
  movementFrequency: number
  includeKnees: boolean
  includeElbows: boolean
  includeClinch: boolean
  equipment: Equipment
}): TechniqueCategory[] {
  const categories: TechniqueCategory[] = sportUsesKicks(options.martialArt)
    ? ['punch', 'kick', 'teep']
    : ['punch']

  if (options.defenseFrequency > 0) {
    categories.push('defense', 'counter')
  }
  if (options.movementFrequency > 0) {
    categories.push('movement')
  }
  if (sportUsesKicks(options.martialArt)) {
    if (options.includeKnees) categories.push('knee')
    if (options.includeElbows) categories.push('elbow')
  }
  if (sportUsesClinch(options.martialArt) && options.includeClinch && options.equipment !== 'shadowboxing') {
    categories.push('clinch')
  }

  return categories
}
