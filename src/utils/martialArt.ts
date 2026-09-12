import type { MartialArt, TechniqueCategory } from '../types'

export const MARTIAL_ART_ORDER: MartialArt[] = ['muay-thai', 'boxing', 'mma-striking']

const LABELS: Record<MartialArt, string> = {
  'muay-thai': 'Muay Thai',
  boxing: 'Boxing',
  'mma-striking': 'MMA Striking',
}

export function martialArtLabel(art: MartialArt): string {
  return LABELS[art]
}

export function isMartialArt(value: unknown): value is MartialArt {
  return value === 'muay-thai' || value === 'boxing' || value === 'mma-striking'
}

/** Kicks, teeps, optional knees/elbows — not boxing. */
export function sportUsesKicks(art: MartialArt): boolean {
  return art !== 'boxing'
}

/** Clinch entries stay Muay Thai-only in this product. */
export function sportUsesClinch(art: MartialArt): boolean {
  return art === 'muay-thai'
}

export function categoriesForSport(art: MartialArt): TechniqueCategory[] {
  if (art === 'boxing') return ['punch', 'defense', 'movement', 'counter']
  if (art === 'mma-striking') {
    return ['punch', 'kick', 'teep', 'knee', 'elbow', 'defense', 'movement', 'counter']
  }
  return ['punch', 'kick', 'teep', 'knee', 'elbow', 'defense', 'movement', 'counter', 'clinch']
}
