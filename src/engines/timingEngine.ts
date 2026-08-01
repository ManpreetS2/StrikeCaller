import { getTechnique } from '../data/techniques'
import type { PacePreset, Technique, TechniqueCategory, TimingMultipliers } from '../types'

export const DEFAULT_TIMING_MULTIPLIERS: TimingMultipliers = {
  punch: 1,
  kick: 1,
  knee: 1,
  elbow: 1,
  defense: 1,
  movement: 1,
  teep: 1,
  counter: 1,
  clinch: 1,
  pauseBetweenCombosMs: 900,
  pauseBeforeRepeatMs: 700,
}

export const PACE_MULTIPLIERS: Record<Exclude<PacePreset, 'custom'>, number> = {
  learn: 1.85,
  slow: 1.55,
  technical: 1.25,
  normal: 1,
  fast: 0.82,
  fight: 0.68,
}

export const MIN_TECHNIQUE_MS = 280
export const MIN_KICK_MS = 650
export const WARNING_PACE_THRESHOLD = 0.75

export function getPaceMultiplier(pace: PacePreset, customMultiplier: number): number {
  if (pace === 'custom') return clamp(customMultiplier, 0.55, 2.5)
  return PACE_MULTIPLIERS[pace]
}

export function isPaceTooFast(pace: PacePreset, customMultiplier: number): boolean {
  return getPaceMultiplier(pace, customMultiplier) < WARNING_PACE_THRESHOLD
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function categoryMultiplier(category: TechniqueCategory, multipliers: TimingMultipliers): number {
  switch (category) {
    case 'punch':
      return multipliers.punch
    case 'kick':
      return multipliers.kick
    case 'teep':
      return multipliers.teep
    case 'knee':
      return multipliers.knee
    case 'elbow':
      return multipliers.elbow
    case 'defense':
      return multipliers.defense
    case 'movement':
      return multipliers.movement
    case 'counter':
      return multipliers.counter
    case 'clinch':
      return multipliers.clinch
    default:
      return 1
  }
}

export function computeTechniqueDurationMs(
  technique: Technique,
  pace: PacePreset,
  customPaceMultiplier: number,
  multipliers: TimingMultipliers = DEFAULT_TIMING_MULTIPLIERS,
): number {
  const paceMul = getPaceMultiplier(pace, customPaceMultiplier)
  const catMul = categoryMultiplier(technique.category, multipliers)
  const raw =
    (technique.baseExecutionMs + technique.recoveryMs + technique.transitionMs) * paceMul * catMul

  const min =
    technique.category === 'kick' || technique.category === 'knee' || technique.category === 'teep'
      ? MIN_KICK_MS * Math.min(1, paceMul)
      : MIN_TECHNIQUE_MS

  // Even at fight pace, kicks/movement keep extra time relative to jabs
  const floor = technique.category === 'movement' ? Math.max(min, 500 * paceMul) : min
  return Math.round(Math.max(floor, raw))
}

export function computeTechniqueDurationById(
  techniqueId: string,
  pace: PacePreset,
  customPaceMultiplier: number,
  multipliers?: TimingMultipliers,
): number {
  return computeTechniqueDurationMs(getTechnique(techniqueId), pace, customPaceMultiplier, multipliers)
}

export function compareKickVsJabTiming(
  pace: PacePreset = 'normal',
  custom = 1,
  multipliers = DEFAULT_TIMING_MULTIPLIERS,
): { jabMs: number; kickMs: number } {
  return {
    jabMs: computeTechniqueDurationById('jab', pace, custom, multipliers),
    kickMs: computeTechniqueDurationById('rear-low-kick', pace, custom, multipliers),
  }
}
