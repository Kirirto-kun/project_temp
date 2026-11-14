import { ChevronLeft } from 'lucide-react';

export function FunnelProgress({ step, total, onBack }: { step: number; total: number; onBack?: () => void }) {
  return (
    <div className="flex items-center gap-3">
      {onBack ? (
        <button type="button" className="btn btn-ghost min-h-[44px] px-2" onClick={onBack} aria-label="Back">
          <ChevronLeft size={20} strokeWidth={1.5} aria-hidden />
        </button>
      ) : (
        <span className="w-[36px]" aria-hidden />
      )}
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step} aria-label="Progress">
        <div className="h-full bg-hold" style={{ width: `${(step / total) * 100}%` }} />
      </div>
      <span className="mono text-[12px] text-muted">
        {step} / {total}
      </span>
    </div>
  );
}
