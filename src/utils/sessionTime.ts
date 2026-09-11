/**
 * Temporal plausibility for completed training sessions.
 *
 * LOAD / salvage: locally stored rows are kept even if the device clock later
 * moves backward. Do not delete historical records solely because `now` changed.
 *
 * STRICT IMPORT: reject sessions that are implausibly in the future before any
 * imported section is written.
 *
 * USER-FACING STATS / HOME: exclude implausible-future rows from aggregates,
 * streaks, milestones, and Recent workout so they cannot look like training
 * that has already happened.
 *
 * Timestamps are never rewritten.
 */
export const SESSION_FUTURE_SKEW_MS = 5 * 60 * 1000

/**
 * Clock-skew tolerance for "has this session already occurred?"
 *
 * Five minutes covers typical device-clock drift without accepting
 * tomorrow / next-month / next-year sessions as completed work.
 */
export function isTemporallyPlausibleSession(
  session: { startedAt: number; endedAt: number },
  now = Date.now(),
  skewMs = SESSION_FUTURE_SKEW_MS,
): boolean {
  if (!Number.isFinite(session.startedAt) || !Number.isFinite(session.endedAt)) return false
  const latestAllowed = now + skewMs
  return session.startedAt <= latestAllowed && session.endedAt <= latestAllowed
}
