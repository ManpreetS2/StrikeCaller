import { MMA_BEGINNER } from './mma_beginner'
import { MMA_INTERMEDIATE } from './mma_intermediate'
import { MMA_ADVANCED } from './mma_advanced'
import { MMA_DEFENSIVE } from './mma_defensive'
import { MMA_MOVEMENT } from './mma_movement'
import type { Combo } from '../../types'

export const MMA_STRIKING_COMBOS: Combo[] = [
  ...MMA_BEGINNER,
  ...MMA_INTERMEDIATE,
  ...MMA_ADVANCED,
  ...MMA_DEFENSIVE,
  ...MMA_MOVEMENT,
]

export function getMmaStrikingComboStats() {
  return {
    total: MMA_STRIKING_COMBOS.length,
    beginner: MMA_BEGINNER.length,
    intermediate: MMA_INTERMEDIATE.length,
    advanced: MMA_ADVANCED.length,
    defensive: MMA_DEFENSIVE.length,
    movement: MMA_MOVEMENT.length,
  }
}

export { MMA_BEGINNER, MMA_INTERMEDIATE, MMA_ADVANCED, MMA_DEFENSIVE, MMA_MOVEMENT }
