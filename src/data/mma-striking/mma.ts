import { combo } from '../combos/helpers'
import type { Combo } from '../../types'

/** Curated MMA Striking wrapper — keeps sport explicit without duplicating techniques. */
export function mma(opts: Omit<Parameters<typeof combo>[0], 'martialArt'>): Combo {
  return combo({
    ...opts,
    martialArt: 'mma-striking',
    tags: opts.tags?.includes('mma') ? opts.tags : [...(opts.tags ?? []), 'mma'],
  })
}
