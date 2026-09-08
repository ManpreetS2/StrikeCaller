import type { Combo, WorkoutConfig } from '../types'
import {
  DAILY_PHASES,
  MAX_SESSION_QUEUED_COMBOS,
  validateCombo,
  validateWorkoutConfig,
} from '../storage/sessionValidation'
import { hasOwn, isPlainObject, oneOf, readBoolean } from '../storage/parseUnknown'
import { isRuntimeComboSemanticallyValid } from './comboSemantics'
import { parseDailyDrillKey } from './dailyDrill'

export type DailyPhase = (typeof DAILY_PHASES)[number]

export interface SessionStartState {
  config: WorkoutConfig
  comboQueue?: Combo[]
  demo?: boolean
  dailyPhase?: DailyPhase
  dailyDrillKey?: string
  audioPrimed?: boolean
}

export type SessionStartFailReason =
  | 'missing-state'
  | 'not-object'
  | 'missing-config'
  | 'invalid-config'
  | 'invalid-combo-queue'
  | 'invalid-combo-semantics'
  | 'invalid-audio-primed'
  | 'invalid-demo'
  | 'inconsistent-demo'
  | 'invalid-daily-phase'
  | 'inconsistent-daily-phase'
  | 'invalid-daily-drill-key'
  | 'inconsistent-daily-drill-key'

export type SessionStartParseResult =
  | { ok: true; value: SessionStartState }
  | { ok: false; reason: SessionStartFailReason }

/**
 * Parse React Router location.state for `/session`.
 *
 * Present-but-invalid optional fields are rejected, not coerced.
 * `config.mode` is the source of truth for demo vs training.
 * `dailyPhase` is allowed only on `mode: 'daily'` and requires a matching `dailyDrillKey`.
 * `dailyDrillKey` is origin-day metadata: it is not required to equal today's date.
 * DailyPage phase sessions always send both. Train Again of a Daily workout may use
 * `mode: 'daily'` without completion metadata and must not mark Daily progress.
 * A supplied comboQueue is an execution command: one bad entry fails the payload.
 */
export function parseSessionStartState(raw: unknown): SessionStartParseResult {
  if (raw == null) return { ok: false, reason: 'missing-state' }
  if (!isPlainObject(raw)) return { ok: false, reason: 'not-object' }

  if (!hasOwn(raw, 'config') || raw.config == null) {
    return { ok: false, reason: 'missing-config' }
  }

  const config = validateWorkoutConfig(raw.config)
  if (!config) return { ok: false, reason: 'invalid-config' }

  const value: SessionStartState = { config }

  if (hasOwn(raw, 'comboQueue') && raw.comboQueue !== undefined) {
    const queue = parseComboQueue(raw.comboQueue, config.martialArt)
    if (!queue.ok) return queue
    value.comboQueue = queue.value
  }

  if (hasOwn(raw, 'audioPrimed')) {
    const audioPrimed = readBoolean(raw.audioPrimed)
    if (audioPrimed === undefined) return { ok: false, reason: 'invalid-audio-primed' }
    value.audioPrimed = audioPrimed
  }

  if (hasOwn(raw, 'demo')) {
    const demo = readBoolean(raw.demo)
    if (demo === undefined) return { ok: false, reason: 'invalid-demo' }
    if (demo !== (config.mode === 'demo')) {
      return { ok: false, reason: 'inconsistent-demo' }
    }
    value.demo = demo
  }

  if (hasOwn(raw, 'dailyPhase')) {
    const dailyPhase = oneOf(raw.dailyPhase, DAILY_PHASES)
    if (!dailyPhase) return { ok: false, reason: 'invalid-daily-phase' }
    if (config.mode !== 'daily') return { ok: false, reason: 'inconsistent-daily-phase' }
    if (!hasOwn(raw, 'dailyDrillKey')) return { ok: false, reason: 'inconsistent-daily-drill-key' }
    value.dailyPhase = dailyPhase
  }

  if (hasOwn(raw, 'dailyDrillKey')) {
    if (config.mode !== 'daily') return { ok: false, reason: 'inconsistent-daily-drill-key' }
    if (!value.dailyPhase) return { ok: false, reason: 'inconsistent-daily-drill-key' }
    const parsed = parseDailyDrillKey(raw.dailyDrillKey)
    if (!parsed.ok) return { ok: false, reason: 'invalid-daily-drill-key' }
    if (parsed.martialArt !== config.martialArt) return { ok: false, reason: 'inconsistent-daily-drill-key' }
    value.dailyDrillKey = parsed.key
  }

  return { ok: true, value }
}

function parseComboQueue(
  raw: unknown,
  martialArt: WorkoutConfig['martialArt'],
): { ok: true; value: Combo[] } | { ok: false; reason: 'invalid-combo-queue' | 'invalid-combo-semantics' } {
  if (!Array.isArray(raw) || raw.length > MAX_SESSION_QUEUED_COMBOS) {
    return { ok: false, reason: 'invalid-combo-queue' }
  }
  const out: Combo[] = []
  for (const item of raw) {
    const combo = validateCombo(item)
    if (!combo) return { ok: false, reason: 'invalid-combo-queue' }
    if (!isRuntimeComboSemanticallyValid(combo, martialArt)) {
      return { ok: false, reason: 'invalid-combo-semantics' }
    }
    out.push(combo)
  }
  return { ok: true, value: out }
}
