/** Local civil-date helpers that stay correct across DST transitions. */

export function localDateKey(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function localDateKeyFromTimestamp(ts: number): string {
  return localDateKey(new Date(ts))
}

export function startOfLocalDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Add calendar days in local time (DST-safe). */
export function addLocalDays(ts: number, days: number): number {
  const d = new Date(startOfLocalDay(ts))
  d.setDate(d.getDate() + days)
  return d.getTime()
}

export function isNextLocalDay(earlier: number, later: number): boolean {
  return startOfLocalDay(later) === addLocalDays(earlier, 1)
}
