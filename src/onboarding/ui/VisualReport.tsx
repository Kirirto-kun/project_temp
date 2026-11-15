import { REASON_TEXT, describe, describeMoment } from '../client/vision/copy'
import type { Moment, VisualSummary } from '../client/vision/types'

type Props = { summary: VisualSummary; moments?: Moment[] }

function Group({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="grid gap-2">
      <h4 className="label m-0">{title}</h4>
      <ul className="m-0 grid list-none gap-1.5 p-0">
        {items.map((text, i) => (
          <li key={`${i}-${text}`} className="flex items-start gap-2.5 rounded-[12px] bg-raised px-3 py-2 text-[14.5px] leading-6 shadow-[var(--shadow-xs)]">
            <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-hold" aria-hidden />
            {text}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Camera section of the intake review. Facts about movement only; the copy never interprets feelings. */
export function VisualReport({ summary, moments = [] }: Props) {
  const pct = Math.round(summary.coverage * 100)
  return (
    <section aria-labelledby="visual-report-title" className="panel grid gap-4 p-5 text-ink">
      <h3 id="visual-report-title" className="m-0 text-[18px] font-semibold tracking-[-0.015em]">Camera observations</h3>
      {summary.status === 'unavailable' ? (
        <p className="m-0 text-muted">
          Visual feedback unavailable: {REASON_TEXT[summary.unavailableReason ?? 'not_enough_valid_time']}.
        </p>
      ) : (
        <>
          <p className="m-0 text-[14px] text-muted">
            Based on <span className="mono font-medium text-ink">{Math.round(summary.validMs / 1000)} s</span> of clear camera time
            (<span className="mono font-medium text-ink">{pct}%</span> of the analysed time).
          </p>
          {summary.status === 'partial' && (
            <p className="callout m-0">
              Not enough clear camera time for overall figures
              {summary.unavailableReason ? ` (${REASON_TEXT[summary.unavailableReason].toLowerCase()})` : ''}.
              Showing individual moments only.
            </p>
          )}
          {moments.length > 0 && <Group title="While you spoke" items={moments.map(describeMoment)} />}
          {summary.events.length > 0 && <Group title="Moments" items={summary.events.map(describe)} />}
          {summary.metrics.length > 0 && <Group title="Across the call" items={summary.metrics.map(describe)} />}
        </>
      )}
      <p className="m-0 text-[12.5px] text-muted">
        Measured on your device from a 2D webcam. These describe movements, not how you felt.
      </p>
    </section>
  )
}
