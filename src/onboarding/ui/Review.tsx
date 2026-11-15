'use client';

import { ArrowRight, CircleAlert, Loader2, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { MoneyAnswer } from '@/contracts/intake';
import { suggestPracticeRange } from '@/domain/intake-handoff';
import { formatMoney } from '@/domain/money';
import { objectiveForKind } from '@/contracts/domain';
import { ApiClientError } from '@/client/api/client';
import { saveDraft, EMPTY_DRAFT } from '@/client/storage/draft';
import { cn } from '@/components/ui/cn';
import { MoneyField } from '@/features/quiz/MoneyField';
import { TextComposer } from '@/features/session/TextComposer';
import type { IntakeAssessment, IntakeView, ProfileKey } from '../contracts';
import { confirmIntake, deleteIntake, getAssessment, patchProfile, sendMessage, type Corrections } from '../client/api';
import { CameraPractice } from './CameraPractice';
import { moneyText } from './ProfileSoFar';

const FIELD_LABELS: Partial<Record<ProfileKey, string>> = {
  kind: 'Conversation',
  userRole: 'Your role',
  counterpartRole: 'Speaking with',
  currentMoney: 'Current',
  targetMoney: 'Target',
  marketRange: 'Range you know',
  practiceRange: 'Practice bounds',
  reasons: 'What it is based on',
  fear: 'Response you worry about',
};

function StatusTag({ status }: { status: string }) {
  if (status === 'confirmed') return <span className="badge badge-won">confirmed</span>;
  if (status === 'candidate') return <span className="badge badge-hold">check</span>;
  if (status === 'skipped') return <span className="badge">skipped</span>;
  return <span className="badge">unknown</span>;
}

function MoneyEditor({ value, kind, onSave, onCancel }: { value: MoneyAnswer | null; kind: string | null; onSave: (m: MoneyAnswer) => void; onCancel: () => void }) {
  const [amount, setAmount] = useState<number | undefined>(value?.currency === 'USD' ? value.amountMinor : undefined);
  const [period, setPeriod] = useState<MoneyAnswer['period']>(value?.period ?? (kind === 'rent' || kind === 'bill' ? 'month' : 'year'));
  const [basis, setBasis] = useState<MoneyAnswer['basis']>(value?.basis ?? 'unspecified');
  return (
    <div className="pop-in grid gap-3 rounded-[18px] bg-paper-subtle p-4 shadow-[inset_0_0_0_1px_var(--line)]">
      <MoneyField label="Amount in US dollars" size="md" valueMinor={amount} period={period} onChange={setAmount} salaryScale={kind === 'raise' || kind === 'offer'} autoFocus />
      <div className="grid grid-cols-2 gap-2">
        <select className="input" value={period} onChange={(e) => setPeriod(e.target.value as MoneyAnswer['period'])} aria-label="Period">
          <option value="year">per year</option>
          <option value="month">per month</option>
          <option value="one_time">one-time</option>
        </select>
        <select className="input" value={basis} onChange={(e) => setBasis(e.target.value as MoneyAnswer['basis'])} aria-label="Tax basis">
          <option value="gross">before tax</option>
          <option value="net">after tax</option>
          <option value="unspecified">not specified</option>
        </select>
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn btn-primary btn-sm" disabled={!amount} onClick={() => amount && onSave({ amountMinor: amount, currency: 'USD', period, basis })}>
          Save
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

const FEEDBACK: Record<string, { title: string; className: string }> = {
  strength: { title: 'What worked', className: 'row-good' },
  improve: { title: 'One thing to change', className: 'row-cost' },
  next_attempt: { title: 'Next attempt', className: 'bg-raised shadow-[var(--shadow-raise)]' },
};

function AssessmentView({ assessment, onRetry, retrying }: { assessment: IntakeAssessment | null; onRetry: (text: string) => Promise<boolean>; retrying: boolean }) {
  const [again, setAgain] = useState(false);
  return (
    <section className="grid gap-4" aria-labelledby="delivery">
      <div className="grid gap-2">
        <p className="eyebrow m-0">Your opening</p>
        <h2 id="delivery" className="m-0 text-[24px] font-bold leading-[1.15] tracking-[-0.03em]">
          How you delivered your opening
        </h2>
      </div>
      {!assessment || assessment.status === 'unavailable' ? (
        <p className="m-0 text-muted">{assessment?.reason ?? 'Not enough speech to assess this yet.'} You can try the sentence once more below.</p>
      ) : (
        <>
          {assessment.practiceText && <p className="m-0 border-l-2 border-hold pl-4 text-[16px] italic leading-7 text-ink-soft">“{assessment.practiceText}”</p>}
          {assessment.stale && <p className="callout callout-warn m-0">Your numbers changed after this attempt; the advice may refer to the old amount.</p>}
          <ol className="m-0 grid list-none gap-3 p-0">
            {assessment.topFeedback.map((item, i) => {
              const meta = FEEDBACK[item.category] ?? FEEDBACK.next_attempt!;
              return (
                <li key={i} className={cn('grid gap-1.5 rounded-[20px] p-4 sm:p-5', meta.className)}>
                  <div className="label text-ink-soft">{meta.title}</div>
                  {item.category !== 'next_attempt' && <p className="m-0 text-[15.5px] font-medium leading-6">{item.claim}</p>}
                  {item.quote && <p className="m-0 text-[13.5px] italic text-muted">“{item.quote}”</p>}
                  <p className="m-0 text-[15px] leading-6">{item.suggestion}</p>
                  {item.limitations && <p className="m-0 text-[12.5px] text-muted">{item.limitations}</p>}
                </li>
              );
            })}
          </ol>
          <p className="m-0 text-[12.5px] leading-5 text-muted">
            {assessment.speechAvailable ? 'Speech measurements come from a transcript with word timings; recognition can miss or add filler words.' : 'Wording only. No speech measurements for a typed attempt.'} Nothing here judges your personality, accent or
            nerves.
          </p>
        </>
      )}
      {again ? (
        <TextComposer
          disabled={retrying}
          placeholder="Say your opening line again"
          onSend={async (text) => {
            const ok = await onRetry(text);
            if (ok) setAgain(false);
            return ok;
          }}
        />
      ) : (
        <button type="button" className="btn btn-secondary w-fit" onClick={() => setAgain(true)}>
          <RotateCcw size={16} strokeWidth={2} aria-hidden /> Try that sentence again
        </button>
      )}
    </section>
  );
}

export function Review({ view, onView }: { view: IntakeView; onView: (v: IntakeView) => void }) {
  const router = useRouter();
  const [editing, setEditing] = useState<ProfileKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [assessment, setAssessment] = useState<IntakeAssessment | null>(null);
  const p = view.publicProfile;

  useEffect(() => {
    getAssessment(view.id)
      .then(setAssessment)
      .catch(() => setAssessment(null));
  }, [view.id, view.assessmentStatus, view.revision]);

  async function patch(corrections: Corrections) {
    setError(null);
    try {
      onView(await patchProfile(view.id, view.revision, corrections));
      setEditing(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not save the change.');
    }
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    const fields = (Object.keys(p) as ProfileKey[]).filter((k) => p[k].status === 'candidate');
    try {
      const { intake, handoff } = await confirmIntake(view.id, view.revision, fields);
      onView(intake);
      if (!handoff) throw new Error('No handoff returned.');
      const missing = handoff.missingFields.filter((f) => f !== 'avatarId');
      if (missing.length > 0) {
        setBusy(false);
        setError(`Still needed before practising: ${missing.join(', ')}.`);
        return;
      }
      saveDraft({ ...EMPTY_DRAFT, draft: handoff.quizDraft, avatarId: null, intake: { intakeId: view.id, profileRevision: handoff.profileRevision, missingFields: handoff.missingFields } });
      router.push('/opponents');
    } catch (err) {
      setBusy(false);
      setError(err instanceof ApiClientError ? err.message : err instanceof Error ? err.message : 'Could not confirm.');
    }
  }

  const kind = p.kind.value;
  const current = p.currentMoney.value;
  const target = p.targetMoney.value;
  const practice =
    kind && current && target && current.currency === target.currency && current.period === target.period ? suggestPracticeRange(current.amountMinor, target.amountMinor, objectiveForKind(kind)) : null;

  const rows: { key: ProfileKey; value: string; editable: 'money' | 'text' | null }[] = [
    { key: 'kind', value: kind ?? '—', editable: null },
    { key: 'userRole', value: p.userRole.value ?? '—', editable: 'text' },
    { key: 'counterpartRole', value: p.counterpartRole.value ?? '—', editable: 'text' },
    { key: 'currentMoney', value: moneyText(current), editable: 'money' },
    { key: 'targetMoney', value: moneyText(target) + (p.targetMoney.formula ? ` (${p.targetMoney.formula})` : ''), editable: 'money' },
    { key: 'reasons', value: p.reasons.value ?? '—', editable: 'text' },
    { key: 'fear', value: p.fear.value ?? '—', editable: 'text' },
  ];

  if (view.inputMode === 'example') {
    return (
      <div className="mx-auto grid max-w-[640px] gap-5">
        <p className="eyebrow m-0">Example</p>
        <h1 className="h-title m-0">Example practice</h1>
        <p className="m-0 text-muted">You chose an example in US dollars: a raise from $95,000 to $110,000 a year with a $100,000–$112,000 range. It is not your personal situation.</p>
        <button type="button" className="btn btn-primary btn-xl" disabled={busy} onClick={() => void confirm()}>
          Start my practice
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-[720px] gap-12">
      <section className="grid gap-6" aria-labelledby="brief">
        <header className="grid gap-3">
          <p className="eyebrow m-0">Review</p>
          <h1 id="brief" className="h-title m-0">
            Your practice brief
          </h1>
          <p className="m-0 text-[15px] leading-6 text-muted">Here is what I heard. Check the numbers before we continue; nothing is used until you confirm.</p>
        </header>
        <dl className="card m-0 grid overflow-hidden p-0">
          {rows.map((row) => (
            <div key={row.key} className="grid gap-2 border-b border-line px-5 py-4 last:border-b-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <dt className="label">{FIELD_LABELS[row.key]}</dt>
                <StatusTag status={p[row.key].status} />
              </div>
              {editing === row.key && row.editable === 'money' ? (
                <MoneyEditor
                  value={(p[row.key].value as MoneyAnswer | null) ?? null}
                  kind={kind}
                  onCancel={() => setEditing(null)}
                  onSave={(m) => void patch(row.key === 'currentMoney' ? { currentMoney: m } : { targetMoney: m })}
                />
              ) : editing === row.key && row.editable === 'text' ? (
                <form
                  className="pop-in flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const value = String(new FormData(e.currentTarget).get('v') ?? '').trim();
                    void patch({ [row.key]: value } as Corrections);
                  }}
                >
                  <input name="v" className="input" defaultValue={String(p[row.key].value ?? '')} autoFocus aria-label={FIELD_LABELS[row.key]} />
                  <button type="submit" className="btn btn-primary">
                    Save
                  </button>
                </form>
              ) : (
                <dd className="m-0 flex items-center justify-between gap-3">
                  <span className={cn(row.editable === 'money' ? 'num text-[22px] font-bold tracking-[-0.03em]' : 'text-[15.5px]', row.value === '—' && 'text-muted')}>{row.value}</span>
                  {row.editable && (
                    <button type="button" className="btn btn-ghost btn-sm shrink-0" onClick={() => setEditing(row.key)} aria-label={`Edit ${FIELD_LABELS[row.key]}`}>
                      <Pencil size={14} strokeWidth={2} aria-hidden /> Edit
                    </button>
                  )}
                </dd>
              )}
            </div>
          ))}
          <div className="grid gap-3 bg-paper-subtle px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <dt className="label">{p.marketRange.value ? FIELD_LABELS.marketRange : FIELD_LABELS.practiceRange}</dt>
              <StatusTag status={p.marketRange.value ? p.marketRange.status : p.practiceRange.status} />
            </div>
            <dd className="m-0 grid gap-2">
              {p.marketRange.value ? (
                <span className="num text-[20px] font-bold tracking-[-0.03em]">
                  {formatMoney(p.marketRange.value.lowMinor)} – {formatMoney(p.marketRange.value.highMinor, p.marketRange.value.period)}
                </span>
              ) : practice ? (
                <label className="flex cursor-pointer items-start gap-3 rounded-[14px] bg-raised p-3 text-[15px] leading-6 shadow-[var(--shadow-raise)]">
                  <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={p.practiceRange.status !== 'unknown'} onChange={(e) => void patch({ usePracticeRange: e.target.checked })} />
                  <span>
                    Use practice bounds from <span className="num font-semibold">{formatMoney(practice.lowMinor)}</span> to <span className="num font-semibold">{formatMoney(practice.highMinor)}</span>. Practice assumption — not a market
                    estimate.
                  </span>
                </label>
              ) : (
                <span className="text-muted">Not known. Add your current amount and target in US dollars to use practice bounds.</span>
              )}
            </dd>
          </div>
        </dl>
        {!view.supportedCurrency && (
          <div className="card grid gap-3 p-5">
            <p className="m-0">Practice rounds use US dollars in this version. Your amounts stay as you said them here.</p>
            <button type="button" className="btn btn-secondary w-fit" onClick={() => void patch({ useExample: true })}>
              Practise with a USD example instead
            </button>
          </div>
        )}
        {error && (
          <p className="callout callout-warn m-0 flex items-start gap-2 text-ink" role="alert">
            <CircleAlert size={18} strokeWidth={2} className="mt-px shrink-0 text-gap" aria-hidden />
            {error}
          </p>
        )}
        <div className="funnel-actions">
          <button type="button" className="btn btn-primary btn-xl !max-w-none sm:!w-full" disabled={busy || !view.supportedCurrency} onClick={() => void confirm()}>
            {busy ? (
              <>
                <Loader2 size={18} className="animate-spin" aria-hidden /> Confirming…
              </>
            ) : (
              <>
                Confirm and start my practice <ArrowRight size={18} strokeWidth={2} className="arrow" aria-hidden />
              </>
            )}
          </button>
        </div>
      </section>

      <AssessmentView
        assessment={assessment}
        retrying={busy}
        onRetry={async (text) => {
          try {
            onView(await sendMessage(view.id, text, true));
            return true;
          } catch {
            return false;
          }
        }}
      />

      <CameraPractice prompt={assessment?.practiceText ?? (target ? `I’d like to talk about my pay. I’m asking for ${moneyText({ ...target, basis: 'unspecified' })}, because of what I delivered this year.` : 'I’d like to talk about my pay, and the number I have in mind.')} />

      <section className="flex flex-wrap items-center gap-3 border-t border-line pt-5 text-[14px]">
        <span className="mr-auto text-muted">Kept for 24 hours in this browser’s session.</span>
        <Link href="/quiz" className="btn btn-ghost btn-sm">
          Use the quick form instead
        </Link>
        <button
          type="button"
          className="btn btn-ghost btn-sm text-gap"
          onClick={async () => {
            await deleteIntake(view.id).catch(() => undefined);
            router.push('/');
          }}
        >
          <Trash2 size={14} strokeWidth={2} aria-hidden /> Delete my answers
        </button>
      </section>
    </div>
  );
}
