import type { Period } from '@/contracts/domain';
import type { DebriefRow } from '@/contracts/voice';
import { moveLabel } from '@/domain/debrief';
import { formatMoney } from '@/domain/money';
import { cn } from '@/components/ui/cn';

function effectText(row: DebriefRow, period: Period): string {
  if (row.userConcessionMinor > 0) return `${formatMoney(row.userConcessionMinor)} conceded`;
  if (row.offerDeltaMinor > 0) return `+${formatMoney(row.offerDeltaMinor, period)} offer`;
  if (row.actionKind === 'walk_away') return 'They walked';
  const parts: string[] = [];
  if (row.meterEffect.trust) parts.push(`Trust ${row.meterEffect.trust > 0 ? '+' : ''}${row.meterEffect.trust}`);
  if (row.meterEffect.patience) parts.push(`Patience ${row.meterEffect.patience > 0 ? '+' : ''}${row.meterEffect.patience}`);
  return parts.length ? parts.join(' · ') : 'no change';
}

function VoiceLine({ row }: { row: DebriefRow }) {
  const v = row.voice;
  if (!v) return null;
  const items: string[] = [];
  if (v.wpm !== null) items.push(`${Math.round(v.wpm)} wpm`);
  if (v.pauseBeforeNumberMs !== null) items.push(`${(v.pauseBeforeNumberMs / 1000).toFixed(1)} s pause before the amount`);
  if (v.fillers !== null) items.push(`${v.fillers} filler${v.fillers === 1 ? '' : 's'}`);
  if (v.f0MeanHz !== null) items.push(`pitch ${Math.round(v.f0MeanHz)} Hz`);
  if (v.rmsDipAtNumber === true) items.push('quieter on the amount');
  if (v.tensionIndex !== null) items.push(`tension index ${v.tensionIndex}`);
  if (items.length === 0) return <p className="m-0 mt-2 text-[13px] text-muted">Voice: not measurable for this turn.</p>;
  return (
    <p className="m-0 mt-2 text-[13px] text-muted">
      <span className="label mr-2">Voice</span>
      {items.join(' · ')}
      {!v.relativeToBaseline && ' (absolute, no calibration)'}
    </p>
  );
}

const MARKER: Record<DebriefRow['quality'], string> = {
  good: 'bg-won text-white',
  cost: 'bg-gap text-white',
  neutral: 'bg-sunken text-muted',
};

const EFFECT: Record<DebriefRow['quality'], string> = {
  good: 'badge-won',
  cost: 'badge-gap',
  neutral: '',
};

/** Ledger of moves: money and voice of the same turn side by side. */
export function TurnLedger({ rows, period }: { rows: DebriefRow[]; period: Period }) {
  if (rows.length === 0) return <p className="text-muted">No moves were played in this round.</p>;
  return (
    <ol className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Moves ledger">
      {rows.map((row) => (
        <li
          key={row.turnId}
          className={cn(
            'grid grid-cols-[32px_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-[20px] p-4 sm:grid-cols-[32px_minmax(0,1fr)_auto] sm:p-5',
            `row-${row.quality}`,
            row.quality === 'neutral' && 'shadow-[var(--shadow-raise)]',
          )}
        >
          <span className={cn('mono grid h-8 w-8 place-items-center rounded-full text-[13px] font-medium', MARKER[row.quality])}>{row.turn}</span>
          <div className="min-w-0">
            <div className="label text-ink-soft">{moveLabel(row.move)}</div>
            <p className="m-0 mt-1 text-[15px] leading-6">{row.note}</p>
            <p className="m-0 mt-2 border-l-2 border-line-strong pl-3 text-[14px] italic leading-6 text-muted">“{row.userText}”</p>
            <VoiceLine row={row} />
            {row.betterLine && (
              <p className="m-0 mt-3 rounded-[14px] bg-raised p-3 text-[14px] leading-6 shadow-[inset_0_0_0_1px_var(--hold-tint-strong)]">
                <span className="badge badge-hold mr-2 align-[1px]">Try</span>
                {row.betterLine}
              </p>
            )}
          </div>
          <span className={cn('badge col-start-2 h-7 w-fit px-2.5 text-[11.5px] sm:col-start-3 sm:row-start-1', EFFECT[row.quality])}>{effectText(row, period)}</span>
        </li>
      ))}
    </ol>
  );
}
