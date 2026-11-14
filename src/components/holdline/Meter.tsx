/** Patience / trust meter, 0–100. Below 25 the value turns amber and says "low". */
export function Meter({ label, value, delta, tone = 'hold' }: { label: string; value: number; delta?: number | null; tone?: 'hold' | 'ink' }) {
  const low = value < 25;
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="grid grid-cols-[80px_minmax(0,1fr)_auto] items-center gap-3">
      <span className="label">{label}</span>
      <div className="meter-track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={clamped} aria-valuetext={`${clamped}${low ? ', low' : ''}`}>
        <div className="meter-fill" style={{ width: `${clamped}%`, background: low ? 'var(--gap)' : tone === 'ink' ? 'var(--ink)' : 'var(--hold)' }} />
      </div>
      <span className={`num min-w-[96px] text-right text-[18px] font-semibold leading-6 ${low ? 'text-gap' : ''}`}>
        {clamped}
        {low && <span> low</span>}
        {delta ? <span className={`ml-1 ${delta > 0 ? 'text-won' : 'text-gap'}`}>{delta > 0 ? `+${delta}` : delta}</span> : null}
      </span>
    </div>
  );
}
