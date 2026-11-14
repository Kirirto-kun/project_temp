import { describe, expect, it } from 'vitest';
import { completeAudioUpload, createAudioUpload, createBaseline, getAnalysis, runAnalysisJob, startAnalysis } from '@/server/voice/service';
import { createSession, getDebrief, loadOwnedSession, processTurn } from '@/server/session/service';
import { presignUrl } from '@/server/voice/sigv4';
import { IP, OTHER, OWNER, makeDeps, quizRequest } from './helpers';

const samples = (to: number) => Array.from({ length: Math.floor(to / 50) }, (_, i) => ({ tMs: i * 50, rms: 0.08, f0Hz: 120 }));

describe('uploads', () => {
  it('validates format, size and ownership', async () => {
    const deps = makeDeps();
    await expect(createAudioUpload(deps, OWNER, IP, { purpose: 'baseline', mimeType: 'video/mp4', bytes: 10, sessionId: null, intakeId: null })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(createAudioUpload(deps, OWNER, IP, { purpose: 'baseline', mimeType: 'audio/webm', bytes: 30 * 1024 * 1024, sessionId: null, intakeId: null })).rejects.toMatchObject({ code: 'UPLOAD_TOO_LARGE' });
    const view = await createSession(deps, quizRequest(), { ownerId: OWNER, ipHash: IP, idempotencyKey: null });
    await expect(createAudioUpload(deps, OTHER, IP, { purpose: 'session', mimeType: 'audio/webm', bytes: 10, sessionId: view.id, intakeId: null })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('baseline: upload, complete, transcribe, then the raw audio is deleted', async () => {
    const words = Array.from({ length: 40 }, (_, i) => ({ text: `w${i}`, startMs: i * 400, endMs: i * 400 + 300, type: 'word' as const }));
    const deps = makeDeps({ scribeTranscript: { text: 'x', languageCode: 'en', words } });
    const upload = await createAudioUpload(deps, OWNER, IP, { purpose: 'baseline', mimeType: 'audio/webm;codecs=opus', bytes: 1_000, sessionId: null, intakeId: null });
    const key = upload.uploadUrl.replace('/upload/', '');
    const manifest = { recordingId: 'rec_12345678', purpose: 'baseline', sessionId: null, intakeId: null, durationMs: 20_000, mimeType: 'audio/webm', timebase: 'recording_ms', turns: [], samples: samples(16_000) };
    await expect(completeAudioUpload(deps, OWNER, upload.audioId, manifest)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    deps.memoryAudio.put(key, new Uint8Array(1_000));
    await expect(completeAudioUpload(deps, OWNER, upload.audioId, { ...manifest, mimeType: 'audio/mp4' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(await completeAudioUpload(deps, OWNER, upload.audioId, manifest)).toEqual({ audioId: upload.audioId, status: 'uploaded' });
    const baseline = await createBaseline(deps, OWNER, IP, upload.audioId);
    expect(baseline.quality).toBe('valid');
    expect(await deps.memoryAudio.head(key)).toBeNull();
    expect(await createBaseline(deps, OWNER, IP, upload.audioId).catch((e) => e.code)).toBe('NOT_FOUND');
  });

  it('session analysis joins metrics by turnId and survives a failed first attempt', async () => {
    let calls = 0;
    const deps = makeDeps();
    deps.scribe = {
      transcribe: async () => {
        calls += 1;
        if (calls === 1) throw new Error('provider down');
        return { text: '', languageCode: 'en', words: [{ text: 'deal', startMs: 100, endMs: 400, type: 'word' }] };
      },
    };
    const view = await createSession(deps, quizRequest(), { ownerId: OWNER, ipHash: IP, idempotencyKey: null });
    const turn = await processTurn(deps, { sessionId: view.id, turnId: 'turn-0000-0001', expectedVersion: view.version, text: 'Deal, I accept.', mode: 'text', sourceTurnKey: null }, OWNER);
    const upload = await createAudioUpload(deps, OWNER, IP, { purpose: 'session', mimeType: 'audio/webm', bytes: 100, sessionId: view.id, intakeId: null });
    deps.memoryAudio.put(upload.uploadUrl.replace('/upload/', ''), new Uint8Array(100));
    await expect(
      completeAudioUpload(deps, OWNER, upload.audioId, { recordingId: 'rec_12345678', purpose: 'session', sessionId: view.id, intakeId: null, durationMs: 2_000, mimeType: 'audio/webm', timebase: 'recording_ms', turns: [{ turnId: 'turn-unknown', t0Ms: 0, t1Ms: 1_000 }], samples: [] }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await completeAudioUpload(deps, OWNER, upload.audioId, { recordingId: 'rec_12345678', purpose: 'session', sessionId: view.id, intakeId: null, durationMs: 2_000, mimeType: 'audio/webm', timebase: 'recording_ms', turns: [{ turnId: turn.committedTurnId, t0Ms: 0, t1Ms: 1_000 }], samples: samples(1_000) });
    const started = await startAnalysis(deps, OWNER, IP, { sessionId: view.id, audioId: upload.audioId, baselineId: null });
    const again = await startAnalysis(deps, OWNER, IP, { sessionId: view.id, audioId: upload.audioId, baselineId: null });
    expect(again.analysisId).toBe(started.analysisId);
    await deps.runTasks();
    expect((await getAnalysis(deps, OWNER, started.analysisId)).metrics.status).toBe('pending');
    await runAnalysisJob(deps, started.analysisId);
    const ready = await getAnalysis(deps, OWNER, started.analysisId);
    expect(ready.metrics.status).toBe('ready');
    expect(ready.metrics.turns[0]?.turnId).toBe(turn.committedTurnId);
    expect((await loadOwnedSession(deps, view.id, OWNER)).voiceAnalysisStatus).toBe('ready');
    const debrief = await getDebrief(deps, view.id, OWNER);
    expect(debrief.rows[0]?.voice?.wpm).toBe(60);
  });
});

describe('SigV4 presigning', () => {
  it('matches the AWS documentation example', () => {
    const url = presignUrl({
      method: 'GET',
      host: 'examplebucket.s3.amazonaws.com',
      path: '/test.txt',
      region: 'us-east-1',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      expiresSeconds: 86_400,
      now: new Date('2013-05-24T00:00:00Z'),
    });
    expect(url).toContain('X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404');
  });
});
