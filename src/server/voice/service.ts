import 'server-only';
import { AudioManifestSchema, isSupportedAudioMime, VOICE_CONSTANTS, type AudioManifest, type VoiceBaseline, type VoiceMetrics } from '@/contracts/voice';
import type { SessionState } from '@/contracts/domain';
import { ApiError } from '../http';
import { newId } from '../ids';
import { COST_ESTIMATES } from '../limits/budget';
import type { PlatformDeps } from '../platform';
import { readJson, updateJson } from '../storage/kv';
import { loadOwnedSession, sessionRepo } from '../session/service';
import { computeBaseline, computeSessionMetrics, type TurnWindow } from './metrics';

const DAY = 86_400;

export interface AudioRecord {
  id: string;
  ownerId: string;
  purpose: AudioManifest['purpose'];
  sessionId: string | null;
  intakeId: string | null;
  mimeType: string;
  declaredBytes: number;
  status: 'awaiting_upload' | 'uploaded' | 'deleted';
  createdAt: string;
  manifest: AudioManifest | null;
}

const audioKey = (id: string) => `aud:${id}`;
export const objectKey = (record: Pick<AudioRecord, 'id' | 'purpose'>) => `audio/${record.purpose}/${record.id}`;

function requireStore(deps: PlatformDeps) {
  if (!deps.audio) throw new ApiError('FEATURE_DISABLED', 'Audio upload is not available. You can practise without it.');
  return deps.audio;
}

export async function createAudioUpload(
  deps: PlatformDeps,
  ownerId: string,
  ipHash: string,
  input: { purpose: AudioManifest['purpose']; mimeType: string; bytes: number; sessionId: string | null; intakeId: string | null },
) {
  const store = requireStore(deps);
  if (!isSupportedAudioMime(input.mimeType)) throw new ApiError('INVALID_INPUT', 'This recording format is not supported.');
  if (input.bytes > VOICE_CONSTANTS.maxUploadBytes) throw new ApiError('UPLOAD_TOO_LARGE', 'Recordings are limited to 20 MiB.');
  if (input.purpose === 'baseline' && (input.sessionId || input.intakeId)) throw new ApiError('INVALID_INPUT', 'A calibration is not linked to a session.');
  if (input.purpose === 'session') {
    if (!input.sessionId || input.intakeId) throw new ApiError('INVALID_INPUT', 'A session recording needs only its session id.');
    await loadOwnedSession(deps, input.sessionId, ownerId);
  }
  if (input.purpose === 'intake') {
    if (!input.intakeId || input.sessionId) throw new ApiError('INVALID_INPUT', 'An intake recording needs only its intake id.');
    if (!deps.intake) throw new ApiError('FEATURE_DISABLED', 'The coach intake is not available.');
    await deps.intake.ensureAudioAllowed(input.intakeId, ownerId);
  }
  await deps.quota.consume('upload', ipHash, ownerId);
  const record: AudioRecord = {
    id: newId('aud'),
    ownerId,
    purpose: input.purpose,
    sessionId: input.sessionId,
    intakeId: input.intakeId,
    mimeType: input.mimeType,
    declaredBytes: input.bytes,
    status: 'awaiting_upload',
    createdAt: deps.now().toISOString(),
    manifest: null,
  };
  await deps.kv.set(audioKey(record.id), JSON.stringify(record), { ttlSeconds: DAY });
  const target = await store.createUpload(objectKey(record), input.mimeType, 15 * 60);
  return { audioId: record.id, uploadUrl: target.url, uploadMethod: 'PUT' as const, uploadHeaders: target.headers, expiresAt: new Date(deps.now().getTime() + 15 * 60_000).toISOString() };
}

export async function loadAudio(deps: PlatformDeps, audioId: string, ownerId: string): Promise<AudioRecord> {
  const record = await readJson<AudioRecord>(deps.kv, audioKey(audioId));
  if (!record || record.ownerId !== ownerId || record.status === 'deleted') throw new ApiError('NOT_FOUND', 'Recording not found.');
  return record;
}

function sameBaseMime(a: string, b: string) {
  return a.split(';')[0]!.trim().toLowerCase() === b.split(';')[0]!.trim().toLowerCase();
}

export async function completeAudioUpload(deps: PlatformDeps, ownerId: string, audioId: string, rawManifest: unknown) {
  const store = requireStore(deps);
  const record = await loadAudio(deps, audioId, ownerId);
  const manifest = AudioManifestSchema.parse(rawManifest);
  if (record.status === 'uploaded') return { audioId, status: 'uploaded' as const };
  if (manifest.purpose !== record.purpose || manifest.sessionId !== record.sessionId || manifest.intakeId !== record.intakeId) {
    throw new ApiError('INVALID_INPUT', 'The manifest does not match this recording.');
  }
  if (!sameBaseMime(manifest.mimeType, record.mimeType)) throw new ApiError('INVALID_INPUT', 'The recording format changed after upload started.');
  if (manifest.purpose === 'baseline' && manifest.durationMs > VOICE_CONSTANTS.maxBaselineMs) throw new ApiError('INVALID_INPUT', 'A calibration is about 20 seconds long.');
  if (manifest.purpose === 'session') {
    const session = await loadOwnedSession(deps, manifest.sessionId, ownerId);
    const known = new Set(session.turns.map((t) => t.turnId));
    if (manifest.turns.some((t) => !known.has(t.turnId))) throw new ApiError('INVALID_INPUT', 'The manifest names a turn that is not in this session.');
  }
  if (manifest.purpose === 'intake' && deps.intake) {
    await deps.intake.ensureAudioAllowed(manifest.intakeId, ownerId, manifest.turns.map((t) => t.turnId));
  }
  const object = await store.head(objectKey(record));
  if (!object || object.bytes === 0) throw new ApiError('INVALID_INPUT', 'The upload did not arrive. Try again.');
  if (object.bytes > VOICE_CONSTANTS.maxUploadBytes) {
    await store.delete(objectKey(record));
    throw new ApiError('UPLOAD_TOO_LARGE', 'Recordings are limited to 20 MiB.');
  }
  await updateJson<AudioRecord>(deps.kv, audioKey(audioId), (current) => (current ? { ...current, status: 'uploaded', manifest } : null), { ttlSeconds: DAY });
  return { audioId, status: 'uploaded' as const };
}

async function deleteAudio(deps: PlatformDeps, record: AudioRecord) {
  await deps.audio?.delete(objectKey(record)).catch(() => undefined);
  await updateJson<AudioRecord>(deps.kv, audioKey(record.id), (current) => (current ? { ...current, status: 'deleted' } : null), { ttlSeconds: DAY });
}

async function transcribeWithBudget(deps: PlatformDeps, record: AudioRecord) {
  if (!deps.scribe || !deps.audio) throw new ApiError('FEATURE_DISABLED', 'Speech analysis is not available right now.');
  const minutes = Math.max(1, Math.ceil((record.manifest?.durationMs ?? 60_000) / 60_000));
  const reservation = await deps.budget.reserve('scribe', minutes * COST_ESTIMATES.scribePerMinute);
  const bytes = await deps.audio.get(objectKey(record));
  if (!bytes) {
    await deps.budget.reconcile(reservation, 0);
    throw new ApiError('EXPIRED', 'The recording is no longer stored.');
  }
  try {
    const transcript = await deps.scribe.transcribe(bytes, record.mimeType);
    await deps.budget.reconcile(reservation, Math.ceil((record.manifest?.durationMs ?? 0) / 60_000) * COST_ESTIMATES.scribePerMinute);
    return transcript;
  } catch {
    throw new ApiError('UPSTREAM_UNAVAILABLE', 'Speech analysis failed. You can try again.', {}, 10);
  }
}

export async function createBaseline(deps: PlatformDeps, ownerId: string, ipHash: string, audioId: string): Promise<VoiceBaseline> {
  const record = await loadAudio(deps, audioId, ownerId);
  if (record.purpose !== 'baseline' || record.status !== 'uploaded' || !record.manifest) throw new ApiError('INVALID_INPUT', 'Finish the calibration upload first.');
  const existing = await readJson<{ ownerId: string; baseline: VoiceBaseline }>(deps.kv, `bl-by-audio:${audioId}`);
  if (existing) return existing.baseline;
  await deps.quota.consume('baseline', ipHash, ownerId);
  const transcript = await transcribeWithBudget(deps, record);
  const baseline = computeBaseline(newId('bl'), record.manifest.durationMs, transcript.words, record.manifest.samples);
  await deps.kv.set(`bl:${baseline.id}`, JSON.stringify({ ownerId, baseline }), { ttlSeconds: DAY });
  await deps.kv.set(`bl-by-audio:${audioId}`, JSON.stringify({ ownerId, baseline }), { ttlSeconds: DAY });
  await deleteAudio(deps, record);
  return baseline;
}

export interface AnalysisJob {
  id: string;
  ownerId: string;
  sessionId: string;
  audioId: string;
  baselineId: string | null;
  status: 'pending' | 'running' | 'ready' | 'failed';
  attempts: number;
  leaseUntil: number | null;
  metrics: VoiceMetrics;
  createdAt: string;
}

const PENDING: VoiceMetrics = { status: 'pending', baselineId: null, turns: [], formulaVersion: 1, reason: null };
const MAX_ATTEMPTS = 3;
const LEASE_MS = 90_000;

export async function startAnalysis(deps: PlatformDeps, ownerId: string, ipHash: string, input: { sessionId: string; audioId: string; baselineId: string | null }) {
  if (!deps.capabilities.voiceAnalysis) throw new ApiError('FEATURE_DISABLED', 'Voice analysis is not available right now.');
  const session = await loadOwnedSession(deps, input.sessionId, ownerId);
  const record = await loadAudio(deps, input.audioId, ownerId);
  if (record.purpose !== 'session' || record.sessionId !== session.id || record.status !== 'uploaded') throw new ApiError('INVALID_INPUT', 'Finish uploading this session recording first.');
  const byKey = `ana-by:${session.id}:${record.id}`;
  const existing = await deps.kv.get(byKey);
  if (existing) return { analysisId: existing, status: 'pending' as const };
  await deps.quota.consume('analysis', ipHash, ownerId);
  const job: AnalysisJob = {
    id: newId('ana'),
    ownerId,
    sessionId: session.id,
    audioId: record.id,
    baselineId: input.baselineId ?? session.baselineId,
    status: 'pending',
    attempts: 0,
    leaseUntil: null,
    metrics: { ...PENDING, baselineId: input.baselineId ?? session.baselineId },
    createdAt: deps.now().toISOString(),
  };
  if (!(await deps.kv.set(byKey, job.id, { ttlSeconds: DAY, nx: true }))) return { analysisId: (await deps.kv.get(byKey))!, status: 'pending' as const };
  await deps.kv.set(`ana:${job.id}`, JSON.stringify(job), { ttlSeconds: DAY });
  await sessionRepo(deps).update(session.id, (current) => ({ ...current, analysisId: job.id, voiceAnalysisStatus: 'pending' }));
  deps.schedule(() => runAnalysisJob(deps, job.id));
  return { analysisId: job.id, status: 'pending' as const };
}

async function setSessionVoiceStatus(deps: PlatformDeps, sessionId: string, status: SessionState['voiceAnalysisStatus']) {
  await sessionRepo(deps)
    .update(sessionId, (current) => (current.voiceAnalysisStatus === status ? null : { ...current, voiceAnalysisStatus: status }))
    .catch(() => undefined);
}

/** Lease-based job runner: safe to call from after(), from polling, or twice concurrently. */
export async function runAnalysisJob(deps: PlatformDeps, jobId: string): Promise<void> {
  const nowMs = deps.now().getTime();
  const claimed = await updateJson<AnalysisJob>(
    deps.kv,
    `ana:${jobId}`,
    (job) => {
      if (!job || (job.status !== 'pending' && !(job.status === 'running' && (job.leaseUntil ?? 0) < nowMs))) return null;
      if (job.attempts >= MAX_ATTEMPTS) return null;
      return { ...job, status: 'running', attempts: job.attempts + 1, leaseUntil: nowMs + LEASE_MS };
    },
    { ttlSeconds: DAY },
  );
  if (!claimed.written || !claimed.value) return;
  const job = claimed.value;
  try {
    const session = await sessionRepo(deps).read(job.sessionId);
    const record = await readJson<AudioRecord>(deps.kv, audioKey(job.audioId));
    if (!session || !record || !record.manifest) throw new ApiError('EXPIRED', 'Session or recording expired.');
    const baselineRecord = job.baselineId ? await readJson<{ ownerId: string; baseline: VoiceBaseline }>(deps.kv, `bl:${job.baselineId}`) : null;
    const baseline = baselineRecord && baselineRecord.ownerId === job.ownerId ? baselineRecord.baseline : null;
    const transcript = await transcribeWithBudget(deps, record);
    const turnNumbers = new Map(session.turns.map((t) => [t.turnId, t.turn]));
    const windows: TurnWindow[] = record.manifest.turns
      .filter((t) => turnNumbers.has(t.turnId))
      .map((t) => ({ turnId: t.turnId, turn: turnNumbers.get(t.turnId)!, t0Ms: t.t0Ms, t1Ms: t.t1Ms }));
    const metrics: VoiceMetrics =
      windows.length === 0
        ? { status: 'unavailable', baselineId: baseline?.id ?? null, turns: [], formulaVersion: 1, reason: 'No turn could be aligned with the recording.' }
        : computeSessionMetrics(windows, transcript.words, record.manifest.samples, baseline);
    await updateJson<AnalysisJob>(deps.kv, `ana:${jobId}`, (current) => (current ? { ...current, status: 'ready', leaseUntil: null, metrics } : null), { ttlSeconds: DAY });
    await setSessionVoiceStatus(deps, job.sessionId, metrics.status === 'ready' ? 'ready' : 'unavailable');
    await deleteAudio(deps, record);
  } catch (error) {
    const final = job.attempts >= MAX_ATTEMPTS || (error instanceof ApiError && (error.code === 'EXPIRED' || error.code === 'FEATURE_DISABLED'));
    const reason = error instanceof ApiError ? error.message : 'Analysis failed.';
    await updateJson<AnalysisJob>(
      deps.kv,
      `ana:${jobId}`,
      (current) =>
        current
          ? final
            ? { ...current, status: 'failed', leaseUntil: null, metrics: { ...current.metrics, status: 'failed', reason } }
            : { ...current, status: 'pending', leaseUntil: null }
          : null,
      { ttlSeconds: DAY },
    );
    if (final) await setSessionVoiceStatus(deps, job.sessionId, 'failed');
  }
}

export async function getAnalysis(deps: PlatformDeps, ownerId: string, analysisId: string) {
  const job = await readJson<AnalysisJob>(deps.kv, `ana:${analysisId}`);
  if (!job || job.ownerId !== ownerId) throw new ApiError('NOT_FOUND', 'Analysis not found.');
  const stalled = job.status === 'pending' || (job.status === 'running' && (job.leaseUntil ?? 0) < deps.now().getTime());
  if (stalled && job.attempts < MAX_ATTEMPTS) deps.schedule(() => runAnalysisJob(deps, analysisId));
  return { analysisId, metrics: job.metrics };
}
