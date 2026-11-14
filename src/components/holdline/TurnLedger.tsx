import type { Period } from '@/contracts/domain';
import type { DebriefRow } from '@/contracts/voice';
import { moveLabel } from '@/domain/debrief';
import { formatMoney } from '@/domain/money';

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
  if (items.length === 0) return <p className="m-0 mt-1 text-[13px] text-muted">Voice: not measurable for this turn.</p>;
  return (
    <p className="m-0 mt-1 text-[13px] text-muted">
      <span className="label mr-2">Voice</span>
      {items.join(' · ')}
      {!v.relativeToBaseline && ' (absolute, no calibration)'}
    </p>
  );
}

/** Ledger of moves: money and voice of the same turn side by side. */
export function TurnLedger({ rows, period }: { rows: DebriefRow[]; period: Period }) {
  if (rows.length === 0) return <p className="text-muted">No moves were played in this round.</p>;
  return (
    <ol className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Moves ledger">
      {rows.map((row) => (
        <li key={row.turnId} className={`grid grid-cols-[28px_minmax(0,1fr)] gap-3 rounded-[4px] border-b border-line px-4 py-3 sm:grid-cols-[28px_minmax(0,1fr)_auto] row-${row.quality}`}>
          <span className="mono text-[14px] text-muted">{row.turn}</span>
          <div className="min-w-0">
            <div className="label">{moveLabel(row.move)}</div>
            <p className="m-0 text-[14px] leading-5">{row.note}</p>
            <p className="m-0 mt-1 text-[13px] italic text-muted">“{row.userText}”</p>
            <VoiceLine row={row} />
            {row.betterLine && (
              <p className="m-0 mt-2 text-[14px] leading-5">
                <span className="label mr-2">Try</span>
                {row.betterLine}
              </p>
            )}
          </div>
          <span className={`mono col-start-2 whitespace-nowrap text-[15px] sm:col-start-3 ${row.quality === 'good' ? 'text-won' : row.quality === 'cost' ? 'text-gap' : 'text-muted'}`}>{effectText(row, period)}</span>
        </li>
      ))}
    </ol>
  );
}
