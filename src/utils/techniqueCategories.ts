import type { Equipment, MartialArt, TechniqueCategory } from '../types'

export function buildTechniqueCategories(options: {
  martialArt: MartialArt
  defenseFrequency: number
  movementFrequency: number
  includeKnees: boolean
  includeElbows: boolean
  includeClinch: boolean
  equipment: Equipment
}): TechniqueCategory[] {
  const boxing = options.martialArt === 'boxing'
  const categories: TechniqueCategory[] = boxing ? ['punch'] : ['punch', 'kick', 'teep']

  if (options.defenseFrequency > 0) {
    categories.push('defense', 'counter')
  }
  if (options.movementFrequency > 0) {
    categories.push('movement')
  }
  if (!boxing) {
    if (options.includeKnees) categories.push('knee')
    if (options.includeElbows) categories.push('elbow')
    if (options.includeClinch && options.equipment !== 'shadowboxing') {
      categories.push('clinch')
    }
  }

  return categories
}
