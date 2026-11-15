'use client';
import { useRef, useState, type FormEvent } from 'react';
import { Check, ChevronDown, Pencil } from 'lucide-react';
import type { ConversationKind, QuizDraft } from '@/contracts/domain';
import type { IntakeView, ProfilePatch } from '../contracts';
import { parseMoneyInput, moneyInputValue } from '../client/money-input';
import { requestJson } from '../client/api';
import { IntakeViewSchema } from '../contracts';
import { conversationScenarios, unselectedScenario } from '../scenarios';
import { Button } from '@/components/ui/button';

const amountFields = ['currentMinor', 'targetMinor', 'marketLowMinor', 'marketHighMinor'] as const;
const hasAmounts = (profile: QuizDraft) => amountFields.some(field => profile[field] !== undefined);
const money = (amount: number | undefined) => amount === undefined ? 'Not provided' :
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: amount % 100 ? 2 : 0 }).format(amount / 100);

function MoneyEditor({ profile, kind }: { profile: QuizDraft; kind: ConversationKind | '' }) {
  const scenario = kind ? conversationScenarios[kind] : unselectedScenario;
  return <details className="range-editor" open={scenario.financial || hasAmounts(profile)}>
    <summary>Money details · optional</summary>
    <p className="small muted">Add amounts only if they matter to this conversation. Include their currency, period and tax basis. Leave unknown details blank.</p>
    <div className="form-pair">
      <label>{scenario.currentLabel}<input name="currentMinor" inputMode="decimal" defaultValue={moneyInputValue(profile.currentMinor)} placeholder="Optional" maxLength={24}/></label>
      <label>{scenario.targetLabel}<input name="targetMinor" inputMode="decimal" defaultValue={moneyInputValue(profile.targetMinor)} placeholder="Optional" maxLength={24}/></label>
    </div>
    <div className="form-pair">
      <label>Currency<span className="select-wrap"><select name="currency" aria-label="Currency" defaultValue={profile.currency ?? ''}><option value="">Not provided</option><option value="USD">USD</option></select><ChevronDown size={16} aria-hidden="true"/></span></label>
      <label>{scenario.periodLabel}<span className="select-wrap"><select name="period" aria-label={scenario.periodLabel} defaultValue={profile.period ?? ''}><option value="">Not provided</option><option value="year">Per year</option><option value="month">Per month</option><option value="one_time">One-time</option></select><ChevronDown size={16} aria-hidden="true"/></span></label>
    </div>
    <label>Before or after tax?<span className="select-wrap"><select name="moneyBasis" defaultValue={profile.moneyBasis ?? ''}><option value="">Not provided</option><option value="unspecified">Not specified</option><option value="gross">Gross · before tax</option><option value="net">Net · after tax</option></select><ChevronDown size={16} aria-hidden="true"/></span></label>
    <details className="range-editor" open={profile.marketLowMinor !== undefined || profile.marketHighMinor !== undefined}>
      <summary>Known range · optional</summary>
      <p className="small muted">Only add a range you know, or an explicitly labelled practice assumption. Leave it blank if unknown.</p>
      <div className="form-pair">
        <label>Range low · USD<input name="marketLowMinor" inputMode="decimal" defaultValue={moneyInputValue(profile.marketLowMinor)} placeholder="Optional" maxLength={24}/></label>
        <label>Range high · USD<input name="marketHighMinor" inputMode="decimal" defaultValue={moneyInputValue(profile.marketHighMinor)} placeholder="Optional" maxLength={24}/></label>
      </div>
      <label>Range source<span className="select-wrap"><select name="rangeSource" defaultValue={profile.rangeSource ?? ''}><option value="">Not provided</option><option value="user_provided">My information</option><option value="practice_assumption">Practice assumption · not a market estimate</option><option value="example">Example training range</option></select><ChevronDown size={16} aria-hidden="true"/></span></label>
    </details>
  </details>;
}

function BriefEditor({ profile, busy, onSave, onCancel }: {
  profile: QuizDraft; busy: boolean; onSave(event: FormEvent<HTMLFormElement>): void; onCancel(): void;
}) {
  const [kind, setKind] = useState<ConversationKind | ''>(profile.kind ?? '');
  const [moneyDefaults, setMoneyDefaults] = useState<QuizDraft>(profile);
  const [moneyRevision, setMoneyRevision] = useState(0);
  function changeKind(next: ConversationKind | '') {
    // First choosing a kind for a legacy kindless draft preserves its amounts.
    // Every subsequent change resets the editor so hidden values cannot follow it.
    if (kind && next !== kind) {
      setMoneyDefaults({});
      setMoneyRevision(revision => revision + 1);
    }
    setKind(next);
  }
  return <form onSubmit={onSave} className="brief-form" aria-busy={busy}>
    <label>Conversation type<span className="select-wrap"><select name="kind" aria-label="Conversation type" value={kind} onChange={event => changeKind(event.target.value as ConversationKind | '')}>
      <option value="">Choose a conversation</option>
      {Object.entries(conversationScenarios).map(([value, scenario]) => <option key={value} value={value}>{scenario.label}</option>)}
    </select><ChevronDown size={16} aria-hidden="true"/></span></label>
    <p className="small muted">Interviews, feedback, relationships, presentations, or any topic you need to talk through. Choose Something else for your own situation.</p>
    <label>Your role <span className="muted">Optional</span><input name="userRole" aria-label="Your role" defaultValue={profile.userRole ?? ''} maxLength={200} autoComplete="organization-title" placeholder="e.g. Team member, partner, or presenter"/></label>
    <label>Who will you speak with?<input name="counterpartRole" defaultValue={profile.counterpartRole ?? ''} maxLength={200} placeholder="A person, group, or audience"/></label>
    <label>What&apos;s the situation?<textarea name="description" defaultValue={profile.description ?? ''} maxLength={4000} rows={3} placeholder="What happened, and what do they need to understand?"/></label>
    <label>What do you want to achieve?<textarea name="goal" defaultValue={profile.goal ?? ''} maxLength={2000} rows={2} placeholder="What would a useful outcome look like?"/></label>
    <label>How do you want to come across? <span className="muted">Optional</span><input name="desiredTone" aria-label="How do you want to come across?" defaultValue={profile.desiredTone ?? ''} maxLength={300} placeholder="e.g. Calm, direct, or curious"/></label>
    <label>What response concerns you? <span className="muted">Optional</span><input name="fear" defaultValue={profile.fear ?? ''} maxLength={500}/></label>
    <MoneyEditor key={moneyRevision} profile={moneyDefaults} kind={kind}/>
    <div className="button-row"><Button variant="primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save brief'}<Check size={16} aria-hidden="true"/></Button><Button type="button" variant="quiet" disabled={busy} onClick={onCancel}>Cancel</Button></div>
  </form>;
}

export function BriefForm({ view, onView, initialEditing = false, readOnly = false }: {
  view: IntakeView; onView(view: IntakeView): void; initialEditing?: boolean; readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(initialEditing && !view.confirmed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLParagraphElement>(null);
  const profile = view.publicProfile;
  const scenario = profile.kind ? conversationScenarios[profile.kind] : unselectedScenario;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const data = new FormData(event.currentTarget);
      const text = (name: string) => String(data.get(name) ?? '').trim();
      const patch: ProfilePatch = {
        kind: text('kind') as ConversationKind || null,
        userRole: text('userRole') || null, counterpartRole: text('counterpartRole') || null,
        description: text('description'), goal: text('goal') || null,
        desiredTone: text('desiredTone') || null, fear: text('fear') || null,
        currency: text('currency') as ProfilePatch['currency'] || null,
        period: text('period') as ProfilePatch['period'] || null,
        moneyBasis: text('moneyBasis') as ProfilePatch['moneyBasis'] || null,
        currentMinor: parseMoneyInput(text('currentMinor')), targetMinor: parseMoneyInput(text('targetMinor')),
        marketLowMinor: parseMoneyInput(text('marketLowMinor')), marketHighMinor: parseMoneyInput(text('marketHighMinor')),
        rangeSource: text('rangeSource') as ProfilePatch['rangeSource'] || null,
      };
      const next = IntakeViewSchema.parse(await requestJson('/' + view.id + '/profile', 'PATCH', { expectedRevision: view.revision, patch }, crypto.randomUUID()));
      onView(next); setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Your changes could not be saved.');
      setTimeout(() => errorRef.current?.focus(), 0);
    } finally { setBusy(false); }
  }
  async function confirm() {
    setBusy(true); setError('');
    try { onView(IntakeViewSchema.parse(await requestJson('/' + view.id + '/confirm', 'POST', { expectedRevision: view.revision }, crypto.randomUUID()))); }
    catch (e) { setError(e instanceof Error ? e.message : 'The brief could not be confirmed.'); }
    finally { setBusy(false); }
  }
  return <section className="brief-card" aria-labelledby="brief-heading">
    <div className="section-heading"><div><span className="eyebrow">YOUR NEXT CONVERSATION</span><h2 id="brief-heading">Your practice brief</h2></div>{!editing && !readOnly ? <Button variant="quiet" onClick={() => setEditing(true)} disabled={busy}><Pencil size={15} aria-hidden="true"/>Edit</Button> : null}</div>
    {view.confirmed ? <div className="confirmed-banner" role="status"><Check size={16} aria-hidden="true"/>Brief confirmed. These are the answers your practice will use.</div> : <p className="small muted">{readOnly ? 'Alex can suggest answers here. You’ll check them after the call.' : 'Check the situation, your goal and who you’ll speak with. Money details are optional.'}</p>}
    {editing && !readOnly ? <BriefEditor key={view.profileRevision} profile={profile} busy={busy} onSave={event => void save(event)} onCancel={() => setEditing(false)}/> : <>
      <dl className="brief-details">
        <div><dt>Conversation type</dt><dd>{scenario.label}</dd></div>
        <div><dt>Your role</dt><dd>{profile.userRole || 'Not provided'}</dd></div>
        <div><dt>Speaking with</dt><dd>{profile.counterpartRole || 'Not provided'}</dd></div>
      </dl>
      <div className="brief-context"><span className="label">THE SITUATION</span><p>{profile.description || 'Not provided'}</p></div>
      <div className="brief-context"><span className="label">YOUR GOAL</span><p>{profile.goal || 'Not provided'}</p></div>
      {profile.desiredTone ? <div className="brief-context"><span className="label">HOW YOU WANT TO COME ACROSS</span><p>{profile.desiredTone}</p></div> : null}
      {profile.fear ? <div className="brief-context"><span className="label">YOUR CONCERNS</span><p>{profile.fear}</p></div> : null}
      {hasAmounts(profile) ? <>
        <div className="money-pair"><div><span className="label">{scenario.currentLabel.replace(' · USD', '')}</span><strong className={profile.currentMinor === undefined ? 'unknown-amount' : ''}>{money(profile.currentMinor)}</strong></div><span className="money-arrow" aria-hidden="true">→</span><div><span className="label">{scenario.targetLabel.replace(' · USD', '')}</span><strong className={profile.targetMinor === undefined ? 'unknown-amount' : ''}>{money(profile.targetMinor)}</strong></div></div>
        <p className="small muted">{profile.currency ?? 'Currency not set'} · {profile.period === 'year' ? 'per year' : profile.period === 'month' ? 'per month' : profile.period === 'one_time' ? 'one-time' : 'period not set'} · {profile.moneyBasis === 'gross' ? 'gross, before tax' : profile.moneyBasis === 'net' ? 'net, after tax' : 'tax basis not specified'}</p>
        {profile.marketLowMinor !== undefined || profile.marketHighMinor !== undefined ? <div className="brief-range"><span className="label">{profile.rangeSource === 'practice_assumption' ? 'PRACTICE ASSUMPTION · NOT A MARKET ESTIMATE' : profile.rangeSource === 'example' ? 'EXAMPLE TRAINING RANGE' : profile.rangeSource === 'user_provided' ? 'RANGE FROM YOUR INFORMATION' : 'RANGE · SOURCE NOT PROVIDED'}</span><p>{money(profile.marketLowMinor)} – {money(profile.marketHighMinor)}</p><p className="small muted">Same currency, period and tax basis as above. Check this range before confirming.</p></div> : null}
      </> : null}
      {!readOnly && !view.confirmed ? <Button variant="primary" className="full-width" onClick={() => void confirm()} disabled={busy || !['closed', 'not_started'].includes(view.mediaStatus)}>{busy ? 'Confirming…' : 'Confirm practice brief'}<Check size={16} aria-hidden="true"/></Button> : null}
      {!readOnly ? <p className="small muted">Unknown answers stay unknown. You confirm the final brief.</p> : null}
    </>}
    {error ? <p ref={errorRef} tabIndex={-1} role="alert" className="notice notice-error">{error}</p> : null}
  </section>;
}
