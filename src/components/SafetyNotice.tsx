import { AlertTriangle } from 'lucide-react'

export function SafetyNotice({ compact = false }: { compact?: boolean }) {
  return (
    <aside
      className="panel p-4"
      aria-labelledby="safety-heading"
    >
      <div className="mb-2 flex items-center gap-2 text-[var(--warning)]">
        <AlertTriangle size={18} aria-hidden />
        <h2 id="safety-heading" className="text-sm font-semibold tracking-wide text-[var(--text)]">
          Train responsibly
        </h2>
      </div>
      {compact ? (
        <p className="text-sm text-[var(--text-muted)]">
          Warm up, keep enough space, prioritize balance and control, and stop for pain or dizziness.
          StrikeCaller is a training aid — not a substitute for qualified coaching or medical advice.
        </p>
      ) : (
        <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--text-muted)]">
          <li>Warm up thoroughly before training.</li>
          <li>Use appropriate equipment and maintain enough clear space.</li>
          <li>Prioritize balance, control, and technique quality over speed.</li>
          <li>Train under qualified instruction whenever possible.</li>
          <li>Avoid hard contact without proper supervision.</li>
          <li>Stop immediately for pain, dizziness, or injury.</li>
          <li>Combinations are realistic drills — not guarantees of fight performance.</li>
        </ul>
      )}
    </aside>
  )
}
