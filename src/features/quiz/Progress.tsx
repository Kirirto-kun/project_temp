import { ChevronLeft } from 'lucide-react';

/** Segmented progress. Each segment fills with a transform, so stepping never shifts layout. */
export function FunnelProgress({ step, total, onBack }: { step: number; total: number; onBack?: () => void }) {
  return (
    <div className="flex items-center gap-3">
      {onBack ? (
        <button type="button" className="btn btn-secondary btn-icon !min-h-10 !w-10 shrink-0" onClick={onBack} aria-label="Back">
          <ChevronLeft size={18} strokeWidth={2} aria-hidden />
        </button>
      ) : (
        <span className="w-10 shrink-0" aria-hidden />
      )}
      <div className="flex flex-1 gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step} aria-label="Progress">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
            <span
              className="block h-full origin-left rounded-full bg-hold transition-transform duration-300 ease-[var(--ease-out)] motion-reduce:transition-none"
              style={{ transform: `scaleX(${i < step ? 1 : 0})` }}
            />
          </span>
        ))}
      </div>
      <span className="mono w-10 shrink-0 text-right text-[12px] text-muted">
        {step}/{total}
      </span>
    </div>
  );
}
