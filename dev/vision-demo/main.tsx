import { StrictMode, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'
import { alignMoments } from '@/onboarding/client/vision/align'
import { describe } from '@/onboarding/client/vision/copy'
import { createMockEventsServer } from '@/onboarding/client/vision/mock-events'
import { createVisionSession, type VisionSession, type VisionUpdate } from '@/onboarding/client/vision/session'
import type { LandmarkSample, Moment, SpeechTurn, VisualSummary } from '@/onboarding/client/vision/types'
import { createEventsUploader } from '@/onboarding/client/vision/upload'
import { VisualReport } from '@/onboarding/ui/VisualReport'

type Live = { session: VisionSession; stream: MediaStream; t0: number; turns: SpeechTurn[]; speakingSince: number | null; server: ReturnType<typeof createMockEventsServer> }

function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const live = useRef<Live | null>(null)
  const starting = useRef(false)
  const lastSamples = useRef<LandmarkSample[] | null>(null)
  const [phase, setPhase] = useState<'idle' | 'starting' | 'live'>('idle')
  const [hasClip, setHasClip] = useState(false)
  const [consent, setConsent] = useState(false)
  const [hands, setHands] = useState(true)
  const [update, setUpdate] = useState<VisionUpdate | null>(null)
  const [last, setLast] = useState<LandmarkSample | null>(null)
  const [summary, setSummary] = useState<VisualSummary | null>(null)
  const [moments, setMoments] = useState<Moment[]>([])
  const [batches, setBatches] = useState(0)
  const [error, setError] = useState<string | null>(null)

  function release(l: { stream: MediaStream }) {
    l.stream.getTracks().forEach((track) => track.stop())
    if (videoRef.current) videoRef.current.srcObject = null
  }

  function closeTurn(l: Live, now: number) {
    if (l.speakingSince === null) return
    l.turns.push({ turnId: `turn-${l.turns.length + 1}`, t0Ms: l.speakingSince, t1Ms: now })
    l.speakingSince = null
  }

  useEffect(() => {
    const onPageHide = () => {
      const l = live.current
      if (!l) return
      live.current = null
      release(l)
      void l.session.stop().catch(() => {})
    }
    window.addEventListener('pagehide', onPageHide)
    return () => window.removeEventListener('pagehide', onPageHide)
  }, [])

  async function start() {
    if (live.current || starting.current) return
    starting.current = true
    setPhase('starting')
    setSummary(null)
    setError(null)
    setUpdate(null)
    setLast(null)
    setMoments([])
    setHasClip(false)
    lastSamples.current = null
    let stream: MediaStream | null = null
    let session: VisionSession | null = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360 }, audio: false })
      const video = videoRef.current!
      video.srcObject = stream
      await video.play()
      const t0 = performance.now()
      const server = createMockEventsServer()
      const uploader = createEventsUploader({ intakeId: 'demo', consentVersion: 1, fetchImpl: server.fetchImpl, onError: (e) => console.warn(e) })
      let lastUi = 0
      session = createVisionSession({
        video, clock: () => performance.now() - t0, recordingId: 'demo-recording', consent, enableHands: hands, uploader,
        onUpdate: (u) => { setUpdate(u); setBatches(server.batches.length) },
        onSample: (s) => { if (s.tMs - lastUi > 200) { lastUi = s.tMs; setLast(s) } },
      })
      live.current = { session, stream, t0, turns: [], speakingSince: null, server }
      await session.start()
      setPhase('live')
    } catch (err) {
      stream?.getTracks().forEach((track) => track.stop())
      if (videoRef.current) videoRef.current.srcObject = null
      live.current = null
      await session?.stop().catch(() => {})
      setPhase('idle')
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      starting.current = false
    }
  }

  async function stop() {
    const l = live.current
    if (!l) return
    live.current = null
    release(l)
    closeTurn(l, performance.now() - l.t0)
    try {
      const s = await l.session.stop()
      lastSamples.current = l.session.getSamples()
      setHasClip(true)
      setSummary(s)
      setMoments(alignMoments(l.session.getObservations(), l.turns, l.turns.slice(-1).map((t) => t.turnId)))
      setBatches(l.server.batches.length)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      release(l)
      setPhase('idle')
    }
  }

  const speaking = (down: boolean) => {
    const l = live.current
    if (!l) return
    if (down) l.speakingSince ??= performance.now() - l.t0
    else closeTurn(l, performance.now() - l.t0)
  }
  const holdKey = (down: boolean) => (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== ' ' && e.key !== 'Enter') return
    e.preventDefault()
    if (!e.repeat) speaking(down)
  }

  function download() {
    const samples = live.current?.session.getSamples() ?? lastSamples.current
    if (!samples) return
    const clip = { name: `clip-${Date.now()}`, samples, labels: [] }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(clip)], { type: 'application/json' }))
    a.download = `${clip.name}.json`
    a.click()
    const url = a.href
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const events = (update?.observations ?? []).filter((o) => o.unit === 'ms').slice(-5)
  const btn = 'h-11 rounded-md px-4 font-semibold'

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="font-display text-2xl font-bold">Body language: on-device demo</h1>
      <p className="mt-1 text-sm text-muted">Frames are analysed in this browser. Only observations reach the mock endpoint; "Download clip" saves landmark timelines to your own disk for labelling.</p>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> Analyse my camera on this device</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={hands} onChange={(e) => setHands(e.target.checked)} /> Hand tracking</label>
        <button className={`${btn} bg-hold text-on-hold disabled:opacity-50`} disabled={!consent || phase !== 'idle'} onClick={start}>Start</button>
        <button className={`${btn} border border-line bg-raised disabled:opacity-50`} disabled={phase !== 'live'} onClick={stop}>Stop</button>
        <button className={`${btn} border border-line bg-raised disabled:opacity-50`} disabled={phase !== 'live'} onPointerDown={() => speaking(true)} onPointerUp={() => speaking(false)} onPointerLeave={() => speaking(false)} onPointerCancel={() => speaking(false)} onKeyDown={holdKey(true)} onKeyUp={holdKey(false)} onBlur={() => speaking(false)}>Hold while speaking</button>
        <button className={`${btn} border border-line bg-raised disabled:opacity-50`} disabled={phase !== 'live' && !hasClip} onClick={download}>Download clip</button>
      </div>
      {error && <p className="mt-2 text-gap">{error}</p>}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <video ref={videoRef} muted playsInline className="w-full rounded-lg border border-line" style={{ transform: 'scaleX(-1)' }} />
        <div className="rounded-lg border border-line bg-raised p-4 font-mono text-sm">
          <div>status {update?.status ?? '–'} · tier {update?.tier ?? '–'} · {update?.pacing.fps ?? '–'} fps · hands {String(update?.pacing.hands ?? '–')}</div>
          <div>valid {Math.round((update?.validMs ?? 0) / 1000)} s / {Math.round((update?.observedMs ?? 0) / 1000)} s{update?.offReason ? ` · off: ${update.offReason}` : ''}</div>
          <div>yaw {last?.face?.yawDeg.toFixed(0) ?? '–'}° · pitch {last?.face?.pitchDeg.toFixed(0) ?? '–'}° · gaze h {last?.face?.gaze?.h.toFixed(2) ?? '–'} v {last?.face?.gaze?.v.toFixed(2) ?? '–'}</div>
          <div>faces {last?.faces ?? '–'} · poses {last?.poses ?? '–'} · luma {last?.luma.toFixed(0) ?? '–'} · open palms {last?.hands?.filter((h) => h.openPalm).length ?? '–'}/{last?.hands?.length ?? '–'}</div>
          <div>mock batches received {batches}</div>
          <ul className="mt-2 font-sans">{events.map((o) => <li key={o.id}>{describe(o)}</li>)}</ul>
        </div>
      </div>

      {summary && <div className="mt-6"><VisualReport summary={summary} moments={moments} /></div>}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
