'use client';
import { useRef,useState,type FormEvent } from 'react';
import { Check,ChevronDown,Pencil } from 'lucide-react';
import type { IntakeView,ProfilePatch } from '../contracts';
import { parseMoneyInput,moneyInputValue } from '../client/money-input';
import { requestJson } from '../client/api';
import { IntakeViewSchema } from '../contracts';
import { Button } from '@/components/ui/button';

export function BriefForm({view,onView,initialEditing=false,readOnly=false}:{view:IntakeView;onView(view:IntakeView):void;initialEditing?:boolean;readOnly?:boolean}) {
  const [editing,setEditing]=useState(initialEditing&&!view.confirmed);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const errorRef=useRef<HTMLParagraphElement>(null);
  const profile=view.publicProfile;
  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setError('');
    try {
      const data=new FormData(event.currentTarget);
      const patch:ProfilePatch={kind:'raise',inputMode:'personal',currency:'USD',userRole:String(data.get('userRole')??''),counterpartRole:String(data.get('counterpartRole')??'').trim()||null,
        description:String(data.get('description')??''),fear:String(data.get('fear')??''),period:data.get('period') as 'year'|'month'|'one_time',moneyBasis:data.get('moneyBasis') as 'gross'|'net'|'unspecified',
        currentMinor:parseMoneyInput(String(data.get('currentMinor')??'')),targetMinor:parseMoneyInput(String(data.get('targetMinor')??'')),
        marketLowMinor:parseMoneyInput(String(data.get('marketLowMinor')??'')),marketHighMinor:parseMoneyInput(String(data.get('marketHighMinor')??'')),
        rangeSource:String(data.get('rangeSource')??'') as ProfilePatch['rangeSource']||null};
      const next=IntakeViewSchema.parse(await requestJson('/'+view.id+'/profile','PATCH',{expectedRevision:view.revision,patch},crypto.randomUUID()));onView(next);setEditing(false);
    }catch(e){setError(e instanceof Error?e.message:'Your changes could not be saved.');setTimeout(()=>errorRef.current?.focus(),0);}
    finally{setBusy(false);}
  }
  async function confirm() {
    setBusy(true);setError('');
    try{onView(IntakeViewSchema.parse(await requestJson('/'+view.id+'/confirm','POST',{expectedRevision:view.revision},crypto.randomUUID())));}
    catch(e){setError(e instanceof Error?e.message:'The brief could not be confirmed.');}finally{setBusy(false);}
  }
  const money=(amount:number|undefined)=>amount===undefined?'Not provided':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:amount%100?2:0}).format(amount/100);
  return <section className="brief-card" aria-labelledby="brief-heading"><div className="section-heading"><div><span className="eyebrow">YOUR NEXT CONVERSATION</span><h2 id="brief-heading">Your practice brief</h2></div>{!editing&&!readOnly?<Button variant="quiet" onClick={()=>setEditing(true)} disabled={busy}><Pencil size={15} aria-hidden="true"/>Edit</Button>:null}</div>
    {view.confirmed?<div className="confirmed-banner" role="status"><Check size={16} aria-hidden="true"/>Brief confirmed. These are the answers your practice will use.</div>:<p className="small muted">{readOnly?'Alex can suggest answers here. You’ll check them after the call.':'Check the amounts and their units. Leave anything you don’t want to share blank.'}</p>}
    {editing&&!readOnly?<form onSubmit={event=>void save(event)} className="brief-form"><label>Your role<input name="userRole" defaultValue={profile.userRole??''} maxLength={200} autoComplete="organization-title" placeholder="e.g. Backend engineer"/></label><label>Who will you speak with?<input name="counterpartRole" defaultValue={profile.counterpartRole??''} maxLength={200} placeholder="e.g. My manager"/></label>
      <div className="form-pair"><label>Current base pay · USD<input name="currentMinor" inputMode="decimal" defaultValue={moneyInputValue(profile.currentMinor)} placeholder="Optional" maxLength={24}/></label><label>Amount you want to ask for · USD<input name="targetMinor" inputMode="decimal" defaultValue={moneyInputValue(profile.targetMinor)} placeholder="Optional" maxLength={24}/></label></div>
      <div className="form-pair"><label>Pay period<span className="select-wrap"><select name="period" defaultValue={profile.period??'year'}><option value="year">Per year</option><option value="month">Per month</option><option value="one_time">One-time</option></select><ChevronDown size={16} aria-hidden="true"/></span></label><label>Before or after tax?<span className="select-wrap"><select name="moneyBasis" defaultValue={profile.moneyBasis??'unspecified'}><option value="unspecified">Not specified</option><option value="gross">Gross · before tax</option><option value="net">Net · after tax</option></select><ChevronDown size={16} aria-hidden="true"/></span></label></div>
      <details className="range-editor" open={profile.marketLowMinor!==undefined||profile.marketHighMinor!==undefined}><summary>Known range · optional</summary><p className="small muted">Only add a range you know, or an explicitly labelled practice assumption. Leave it blank if unknown.</p><div className="form-pair"><label>Range low · USD<input name="marketLowMinor" inputMode="decimal" defaultValue={moneyInputValue(profile.marketLowMinor)} placeholder="Optional" maxLength={24}/></label><label>Range high · USD<input name="marketHighMinor" inputMode="decimal" defaultValue={moneyInputValue(profile.marketHighMinor)} placeholder="Optional" maxLength={24}/></label></div><label>Range source<span className="select-wrap"><select name="rangeSource" defaultValue={profile.rangeSource??''}><option value="">Not provided</option><option value="user_provided">My information</option><option value="practice_assumption">Practice assumption · not a market estimate</option><option value="example">Example training range</option></select><ChevronDown size={16} aria-hidden="true"/></span></label></details>
      <label>What supports your ask?<textarea name="description" defaultValue={profile.description??''} maxLength={4000} rows={3} placeholder="Results, responsibilities, or context you want to bring up."/></label><label>What response concerns you? <span className="muted">Optional</span><input name="fear" defaultValue={profile.fear??''} maxLength={500}/></label>
      <div className="button-row"><Button variant="primary" type="submit" disabled={busy}>{busy?'Saving…':'Save brief'}<Check size={16} aria-hidden="true"/></Button><Button type="button" variant="quiet" disabled={busy} onClick={()=>setEditing(false)}>Cancel</Button></div></form>:<>
      <dl className="brief-details"><div><dt>Your role</dt><dd>{profile.userRole||'Not provided'}</dd></div><div><dt>Speaking with</dt><dd>{profile.counterpartRole||'Not provided'}</dd></div></dl>
      <div className="money-pair"><div><span className="label">CURRENT</span><strong className={profile.currentMinor===undefined?'unknown-amount':''}>{money(profile.currentMinor)}</strong></div><span className="money-arrow" aria-hidden="true">→</span><div><span className="label">YOUR ASK</span><strong className={profile.targetMinor===undefined?'unknown-amount':''}>{money(profile.targetMinor)}</strong></div></div>
      <p className="small muted">{profile.currency??'Currency not set'} · {profile.period==='year'?'per year':profile.period==='month'?'per month':profile.period==='one_time'?'one-time':'period not set'} · {profile.moneyBasis==='gross'?'gross, before tax':profile.moneyBasis==='net'?'net, after tax':'tax basis not specified'}</p>
      {profile.marketLowMinor!==undefined||profile.marketHighMinor!==undefined?<div className="brief-range"><span className="label">{profile.rangeSource==='practice_assumption'?'PRACTICE ASSUMPTION · NOT A MARKET ESTIMATE':profile.rangeSource==='example'?'EXAMPLE TRAINING RANGE':profile.rangeSource==='user_provided'?'RANGE FROM YOUR INFORMATION':'RANGE · SOURCE NOT PROVIDED'}</span><p>{money(profile.marketLowMinor)} – {money(profile.marketHighMinor)}</p><p className="small muted">Same currency, period and tax basis as above. Check this range before confirming.</p></div>:null}
      {profile.rangeSource&&profile.marketLowMinor===undefined&&profile.marketHighMinor===undefined?<p className="small muted">Range source: {profile.rangeSource.replaceAll('_',' ')}. Amounts are not provided.</p>:null}
      {profile.description?<p className="brief-context">{profile.description}</p>:null}
      {!readOnly&&!view.confirmed?<Button variant="primary" className="full-width" onClick={()=>void confirm()} disabled={busy||!['closed','not_started'].includes(view.mediaStatus)}>{busy?'Confirming…':'Confirm practice brief'}<Check size={16} aria-hidden="true"/></Button>:null}
      {!readOnly?<p className="small muted">Unknown answers stay unknown. No market range or salary is invented.</p>:null}
    </>}
    {error?<p ref={errorRef} tabIndex={-1} role="alert" className="notice notice-error">{error}</p>:null}
  </section>;
}
