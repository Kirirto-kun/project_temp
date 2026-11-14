import { REASON_TEXT, describe, describeMoment } from '../client/vision/copy'
import type { Moment, VisualSummary } from '../client/vision/types'

type Props = { summary: VisualSummary; moments?: Moment[] }

/** Camera section of the intake review. Styling uses brandbook tokens mapped in Tailwind. */
export function VisualReport({ summary, moments = [] }: Props) {
  const pct = Math.round(summary.coverage * 100)
  return (
    <section aria-labelledby="visual-report-title" className="rounded-lg border border-line bg-raised p-6 text-ink">
      <h3 id="visual-report-title" className="font-display text-lg font-semibold">Camera observations</h3>
      {summary.status === 'unavailable' ? (
        <p className="mt-2 text-muted">
          Visual feedback unavailable: {REASON_TEXT[summary.unavailableReason ?? 'not_enough_valid_time']}.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">
            Based on <span className="font-mono">{Math.round(summary.validMs / 1000)} s</span> of clear camera time
            (<span className="font-mono">{pct}%</span> of the call).
          </p>
          {summary.status === 'partial' && (
            <p className="mt-2 text-sm text-muted">
              Not enough clear camera time for overall figures
              {summary.unavailableReason ? ` (${REASON_TEXT[summary.unavailableReason].toLowerCase()})` : ''}.
              Showing individual moments only.
            </p>
          )}
          {moments.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold">While you spoke</h4>
              <ul className="mt-2 space-y-1">{moments.map((m) => <li key={m.turnId}>{describeMoment(m)}</li>)}</ul>
            </div>
          )}
          {summary.events.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold">Moments</h4>
              <ul className="mt-2 space-y-1">{summary.events.map((o) => <li key={o.id}>{describe(o)}</li>)}</ul>
            </div>
          )}
          {summary.metrics.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold">Across the call</h4>
              <ul className="mt-2 space-y-1">{summary.metrics.map((o) => <li key={o.id}>{describe(o)}</li>)}</ul>
            </div>
          )}
        </>
      )}
      <p className="mt-4 text-xs text-muted">
        Measured on your device from a 2D webcam. These describe movements, not how you felt.
      </p>
    </section>
  )
}
