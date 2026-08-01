import { BOXING_BEGINNER } from './boxing_beginner'
import { BOXING_INTERMEDIATE } from './boxing_intermediate'
import { BOXING_ADVANCED } from './boxing_advanced'
import { BOXING_DEFENSIVE } from './boxing_defensive'
import { BOXING_MOVEMENT } from './boxing_movement'
import { BOXING_CONDITIONING } from './boxing_conditioning'
import type { Combo } from '../../types'

export const BOXING_COMBOS: Combo[] = [
  ...BOXING_BEGINNER,
  ...BOXING_INTERMEDIATE,
  ...BOXING_ADVANCED,
  ...BOXING_DEFENSIVE,
  ...BOXING_MOVEMENT,
  ...BOXING_CONDITIONING,
]

export function getBoxingComboStats() {
  return {
    total: BOXING_COMBOS.length,
    beginner: BOXING_BEGINNER.length,
    intermediate: BOXING_INTERMEDIATE.length,
    advanced: BOXING_ADVANCED.length,
    defensive: BOXING_DEFENSIVE.length,
    movement: BOXING_MOVEMENT.length,
    conditioning: BOXING_CONDITIONING.length,
  }
}

export {
  BOXING_BEGINNER,
  BOXING_INTERMEDIATE,
  BOXING_ADVANCED,
  BOXING_DEFENSIVE,
  BOXING_MOVEMENT,
  BOXING_CONDITIONING,
}
