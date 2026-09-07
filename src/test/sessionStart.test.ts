import { describe, expect, it } from 'vitest'
import { createDefaultWorkout } from '../data/defaults'
import { validateWorkoutConfig } from '../storage/sessionValidation'
import { buildTrainAgainPayload } from '../utils/trainAgain'
import { parseSessionStartState } from '../utils/sessionStart'
import type { Combo, SessionSummary, WorkoutConfig } from '../types'

function runtimeCombo(
  id: string,
  techniqueIds: string[],
  martialArt: Combo['martialArt'] = 'muay-thai',
): Combo {
  return {
    id,
    title: `Combo ${id}`,
    difficulty: 'beginner',
    stance: 'orthodox',
    trainingModes: ['custom', 'coach', 'round', 'learn', 'daily', 'demo', 'reaction'],
    purpose: 'conditioning',
    techniques: techniqueIds.map((techniqueId) => ({ techniqueId })),
    recommendedPace: 'technical',
    setupExplanation: 't',
    endingPosition: 'base',
    safeExit: 'reset',
    coachingNotes: 'n',
    tags: ['custom'],
    equipment: ['shadowboxing'],
    martialArt,
  }
}

function roundConfig(partial: Partial<WorkoutConfig> = {}): WorkoutConfig {
  return createDefaultWorkout({ mode: 'round', ...partial })
}

describe('parseSessionStartState valid payloads', () => {
  it('accepts an ordinary round config from createDefaultWorkout', () => {
    const config = roundConfig()
    expect(validateWorkoutConfig(config)).not.toBeNull()
    const parsed = parseSessionStartState({ config })
    expect(parsed).toEqual({ ok: true, value: { config } })
  })

  it('accepts a demo config with matching demo: true', () => {
    const config = createDefaultWorkout({
      mode: 'demo',
      rounds: 1,
      roundDurationSec: 60,
      sessionDurationSec: 60,
    })
    const parsed = parseSessionStartState({ config, demo: true })
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.value.config.mode).toBe('demo')
      expect(parsed.value.demo).toBe(true)
    }
  })

  it('accepts a valid finite combo queue', () => {
    const config = createDefaultWorkout({
      mode: 'custom',
      finishWhenQueueEmpty: true,
      martialArt: 'boxing',
    })
    const comboQueue = [runtimeCombo('keep', ['jab', 'cross'], 'boxing')]
    const parsed = parseSessionStartState({ config, comboQueue })
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.value.comboQueue).toHaveLength(1)
  })

  it('accepts a valid empty finite combo queue', () => {
    const config = createDefaultWorkout({
      mode: 'custom',
      finishWhenQueueEmpty: true,
      customComboId: 'gone',
    })
    const parsed = parseSessionStartState({ config, comboQueue: [] })
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.value.config.finishWhenQueueEmpty).toBe(true)
      expect(parsed.value.comboQueue).toEqual([])
    }
  })

  it('accepts an A3 all-corrupt Train Again finite-safe payload', () => {
    const payload = buildTrainAgainPayload(
      {
        id: 'hist-all-bad',
        martialArt: 'boxing',
        mode: 'custom',
        usedCustomCombo: true,
        workoutConfig: createDefaultWorkout({
          mode: 'custom',
          martialArt: 'boxing',
          finishWhenQueueEmpty: true,
          customComboId: 'A',
        }),
        queuedCombos: [runtimeCombo('A', ['cross', 'rear-hook'], 'boxing')],
      } as SessionSummary,
      [],
    )
    const parsed = parseSessionStartState({
      config: payload.config,
      comboQueue: payload.comboQueue,
    })
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.value.config.finishWhenQueueEmpty).toBe(true)
      expect(parsed.value.comboQueue).toEqual([])
    }
  })

  it('omits an undefined comboQueue instead of treating it as malformed', () => {
    const config = roundConfig()
    const parsed = parseSessionStartState({ config, comboQueue: undefined })
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.value.comboQueue).toBeUndefined()
  })

  it('accepts a daily phase payload', () => {
    const config = createDefaultWorkout({ mode: 'daily', selectedComboIds: ['beg-01'] })
    const parsed = parseSessionStartState({ config, dailyPhase: 'slowDone' })
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.value.dailyPhase).toBe('slowDone')
  })
})

describe('parseSessionStartState invalid payloads', () => {
  it('rejects null', () => {
    expect(parseSessionStartState(null)).toEqual({ ok: false, reason: 'missing-state' })
  })

  it('rejects undefined', () => {
    expect(parseSessionStartState(undefined)).toEqual({ ok: false, reason: 'missing-state' })
  })

  it('rejects an empty object', () => {
    expect(parseSessionStartState({})).toEqual({ ok: false, reason: 'missing-config' })
  })

  it('rejects missing config', () => {
    expect(parseSessionStartState({ audioPrimed: true })).toEqual({ ok: false, reason: 'missing-config' })
  })

  it('rejects a malformed incomplete config', () => {
    expect(parseSessionStartState({ config: { martialArt: 'boxing' } })).toEqual({
      ok: false,
      reason: 'invalid-config',
    })
  })

  it('rejects an explicit null comboQueue', () => {
    const result = parseSessionStartState({
      config: roundConfig(),
      comboQueue: null,
    })
    expect(result).toEqual({
      ok: false,
      reason: 'invalid-combo-queue',
    })
  })

  it('rejects a malformed comboQueue entry', () => {
    expect(parseSessionStartState({ config: roundConfig(), comboQueue: [{}] })).toEqual({
      ok: false,
      reason: 'invalid-combo-queue',
    })
  })

  it('rejects a structurally valid combo with an unknown technique', () => {
    const config = createDefaultWorkout({ martialArt: 'boxing' })
    const comboQueue = [runtimeCombo('bad', ['does-not-exist'], 'boxing')]
    expect(parseSessionStartState({ config, comboQueue })).toEqual({
      ok: false,
      reason: 'invalid-combo-semantics',
    })
  })

  it('rejects a wrong-sport combo in the route queue', () => {
    const config = createDefaultWorkout({ martialArt: 'boxing' })
    const comboQueue = [runtimeCombo('kick', ['jab', 'rear-low-kick'], 'boxing')]
    expect(parseSessionStartState({ config, comboQueue })).toEqual({
      ok: false,
      reason: 'invalid-combo-semantics',
    })
  })

  it('rejects an invalid-sequence combo in the route queue', () => {
    const config = createDefaultWorkout({ martialArt: 'boxing' })
    const comboQueue = [runtimeCombo('seq', ['cross', 'rear-hook'], 'boxing')]
    expect(parseSessionStartState({ config, comboQueue })).toEqual({
      ok: false,
      reason: 'invalid-combo-semantics',
    })
  })

  it('rejects invalid audioPrimed without coercing strings', () => {
    expect(parseSessionStartState({ config: roundConfig(), audioPrimed: 'yes' })).toEqual({
      ok: false,
      reason: 'invalid-audio-primed',
    })
  })

  it('rejects invalid demo without coercing strings', () => {
    expect(parseSessionStartState({ config: roundConfig(), demo: 'true' })).toEqual({
      ok: false,
      reason: 'invalid-demo',
    })
  })

  it('rejects inconsistent demo metadata', () => {
    expect(parseSessionStartState({ config: roundConfig(), demo: true })).toEqual({
      ok: false,
      reason: 'inconsistent-demo',
    })
  })

  it('rejects an invalid dailyPhase', () => {
    const config = createDefaultWorkout({ mode: 'daily' })
    expect(parseSessionStartState({ config, dailyPhase: 'banana' })).toEqual({
      ok: false,
      reason: 'invalid-daily-phase',
    })
  })

  it('rejects dailyPhase on a non-daily session', () => {
    expect(parseSessionStartState({ config: roundConfig(), dailyPhase: 'slowDone' })).toEqual({
      ok: false,
      reason: 'inconsistent-daily-phase',
    })
  })
})
