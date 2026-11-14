'use client';
import { useEffect,useRef,useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight,Camera,Clock3,Check,AudioLines } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { requestJson } from '../client/api';
import { IntakeViewSchema } from '../contracts';
import { Brand } from './Brand';
import { CoachPoster } from './CoachPoster';

export function IntakeEntry({formOnly=false}:{formOnly?:boolean}) {
  const router=useRouter();const [available,setAvailable]=useState(false);const [checking,setChecking]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const inFlight=useRef(false);const createKey=useRef('');
  useEffect(()=>{let cancelled=false;requestJson('/config').then(c=>{if(!cancelled)setAvailable(c.available===true);}).catch(()=>{}).finally(()=>{if(!cancelled)setChecking(false);});return()=>{cancelled=true;};},[]);
  async function begin(form:boolean) {
    if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');createKey.current||=crypto.randomUUID();
    try{const view=IntakeViewSchema.parse(await requestJson('','POST',{mode:'video',locale:'en',consentVersion:1,consents:{audioAnalysis:false,visualAnalysis:false}},createKey.current));router.push('/intake/'+view.id+(form?'?mode=form':''));}
    catch(e){setError(e instanceof Error?e.message:'The brief could not open. Please try again.');inFlight.current=false;setBusy(false);}
  }
  return <><Brand/><main className="entry-layout">
    <section className="entry-copy"><div className="eyebrow"><span className="tiny-line"/>01 / A CLEARER ASK</div>
      <h1>Prepare for your next money conversation<span className="accent">.</span></h1>
      <p className="entry-description">Tell me about your role and what you want to ask for. We’ll build your practice together.</p>
      <div className="entry-facts"><span><Clock3 size={16} aria-hidden="true"/>About 3–4 minutes</span><span><Camera size={16} aria-hidden="true"/>Camera optional</span></div>
      <div className="entry-actions"><Button variant="primary" disabled={busy||checking} onClick={()=>void begin(formOnly||!available)}>{busy?'Opening your brief…':formOnly||!available?'Use the quick form':'Start the conversation'}<ArrowRight size={18} aria-hidden="true"/></Button>
        {!formOnly?<Button variant="quiet" disabled={busy||checking} onClick={()=>void begin(available)}>{available?'Use the quick form':'Preview call setup'}<ArrowRight size={16} aria-hidden="true"/></Button>:null}</div>
      <p className="small muted">No sign-up. No camera recording.</p>
      {!checking&&!available?<p className="availability-note">Video conversations are being set up. Your practice brief is available in the quick form.</p>:null}
      {error?<p role="alert" className="notice notice-error">{error}</p>:null}
      <div className="entry-steps">{[['01','Set the context','Your role. Your conversation. Your goal.'],['02','Say the first sentence','A short opening, in your own words.'],['03','Check your practice brief','You check the numbers before moving on.']].map(([n,title,text])=><div className="entry-step" key={n}><span className="step-number">{n}</span><div><h2>{title}</h2><p>{text}</p></div><Check size={16} aria-hidden="true"/></div>)}</div>
    </section>
    <aside className="entry-visual"><div className="preview-topline"><span className="eyebrow">YOUR PRACTICE COACH</span><span className="ai-badge">AI</span></div><div className="poster-frame"><CoachPoster/><div className="poster-label"><AudioLines size={18} aria-hidden="true"/><div><strong>Alex</strong><span>AI practice coach · illustrated preview</span></div></div></div><div className="coach-note"><span className="label">A MOMENT TO PREPARE</span><p>“We’ll work out what you want to say.<br/>Then you can try saying it.”</p></div></aside>
  </main><footer className="site-footer"><span>Hold your line.</span><span>A practice conversation. You make the decisions.</span></footer></>;
}
