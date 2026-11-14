import { createHash, randomUUID } from 'node:crypto';
import type { ConnectInput, Connection, CreateInput, IntakeView, Mode, Profile, StopReason, TranscriptItem } from '../contracts';
import type { IntakeStore } from './store';
import type { BudgetPort } from './budget';
import { conflict, IntakeError } from './errors';

export interface Attempt {
  epoch: number; mode: Mode; clientId: string; deadlineAt: string;
  provisioned: boolean; providerSessionId: string | null; credentialCiphertext: string | null;
  createdAt: number; lastHeartbeatAt: number;
}
export interface ProviderBinding { providerSessionId: string; credentialCiphertext: string }
export interface CallProvider {
  open(attempt: Attempt, intakeId: string): Promise<ProviderBinding>;
  close(attempt: Attempt): Promise<void>;
  credentials(attempt: Attempt): Promise<{ sessionToken: string }>;
}
interface Receipt { fingerprint: string; epoch?: number }
export interface IntakeRecord {
  id: string; ownerId: string; revision: number; profileRevision: number;
  phase: IntakeView['phase']; mediaStatus: IntakeView['mediaStatus']; mode: Mode;
  profile: Profile; confirmedAt: string | null; transcript: TranscriptItem[];
  createdAt: string; expiresAt: string; attempt: Attempt | null;
  receipts: Record<string, Receipt>; clientEvents: string[]; deleted: boolean;
}
export const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const emptyProfile = (): Profile => ({});
export function publicView(record: IntakeRecord): IntakeView {
  return {
    id: record.id, revision: record.revision, profileRevision: record.profileRevision,
    phase: record.phase, mediaStatus: record.mediaStatus, mode: record.mode,
    publicProfile: record.profile, confirmed: record.confirmedAt !== null,
    committedTranscript: record.transcript, expiresAt: record.expiresAt,
    deadlineAt: record.attempt?.deadlineAt ?? null, providerEpoch: record.attempt?.epoch ?? 0,
    availability: { audioAnalysis: false, visualAnalysis: false },
  };
}

export class CallService {
  readonly now: () => number;
  constructor(readonly deps: { store: IntakeStore; provider: CallProvider; budget: BudgetPort; now?: () => number }) { this.now = deps.now ?? Date.now; }
  private key(id: string) { return 'session:' + id; }
  async load(id: string, ownerId?: string): Promise<IntakeRecord> {
    const record = await this.deps.store.read<IntakeRecord>(this.key(id));
    if (!record || (ownerId !== undefined && record.ownerId !== ownerId)) throw new IntakeError(404, 'NOT_FOUND', 'Brief not found.');
    if (record.deleted || Date.parse(record.expiresAt) <= this.now()) throw new IntakeError(410, 'EXPIRED', 'This brief has expired. Start a new conversation.');
    return record;
  }
  async save(previous: IntakeRecord, next: IntakeRecord) {
    next.revision = previous.revision + 1;
    return this.deps.store.compareAndSet(this.key(previous.id), previous.revision, next, Math.max(1, (Date.parse(previous.expiresAt) - this.now()) / 1000));
  }
  private receipt(record: IntakeRecord, key: string, input: unknown): Receipt | undefined {
    const receipt = record.receipts[key];
    if (receipt && receipt.fingerprint !== fingerprint(input)) throw new IntakeError(409, 'IDEMPOTENCY_CONFLICT', 'This request key was already used for different input.');
    return receipt;
  }
  addReceipt(record: IntakeRecord, key: string, input: unknown, epoch?: number) {
    if (Object.keys(record.receipts).length >= 100) throw new IntakeError(429, 'REQUEST_LIMIT', 'Too many changes to this brief.');
    record.receipts[key] = { fingerprint: fingerprint(input), epoch };
  }
  async create(ownerId: string, key: string, input: CreateInput): Promise<IntakeView> {
    const mappingKey = 'create:' + fingerprint({ ownerId, key });
    const mapping = { revision: 0, id: randomUUID(), fingerprint: fingerprint(input), createdAt: new Date(this.now()).toISOString() };
    await this.deps.store.create(mappingKey, mapping, 86400);
    const actual = await this.deps.store.read<typeof mapping>(mappingKey);
    if (!actual || actual.fingerprint !== mapping.fingerprint) throw new IntakeError(409, 'IDEMPOTENCY_CONFLICT', 'This request key was already used for different input.');
    const created = Date.parse(actual.createdAt);
    const record: IntakeRecord = {
      id: actual.id, ownerId, revision: 0, profileRevision: 0, phase: 'lobby', mediaStatus: 'not_started',
      mode: input.mode, profile: emptyProfile(), confirmedAt: null, transcript: [], createdAt: actual.createdAt,
      expiresAt: new Date(created + 86400000).toISOString(), attempt: null, receipts: {}, clientEvents: [], deleted: false,
    };
    await this.deps.store.create(this.key(record.id), record, Math.max(1, (created + 86400000 - this.now()) / 1000));
    return this.read(ownerId, record.id);
  }
  async read(ownerId: string, id: string): Promise<IntakeView> {
    const record = await this.load(id, ownerId);
    if (record.attempt && ['active','connecting'].includes(record.mediaStatus) && Date.parse(record.attempt.deadlineAt) <= this.now()) {
      return this.stop(ownerId, id, 'deadline-' + record.attempt.epoch, 'timeout');
    }
    return publicView(record);
  }
  async connect(ownerId: string, id: string, key: string, ip: string, input: ConnectInput): Promise<Connection> {
    let record = await this.load(id, ownerId);
    const receipt = this.receipt(record, key, input);
    if (receipt) {
      if (!record.attempt || receipt.epoch !== record.attempt.epoch || !['connecting','active'].includes(record.mediaStatus)) throw new IntakeError(409, 'ATTEMPT_CLOSED', 'This call has ended. Start another call explicitly.');
      return this.connection(record);
    }
    if (record.revision !== input.expectedRevision) throw conflict(record.revision);
    if (record.mediaStatus === 'stopping') throw new IntakeError(409, 'CLEANUP_PENDING', 'The previous call is still closing.', true);
    if (['connecting','active'].includes(record.mediaStatus)) {
      if (record.attempt!.clientId !== input.clientId) throw new IntakeError(409, 'CALL_IN_USE', 'This call is open in another tab. End it before starting here.');
      if (input.mode !== record.mode || input.restart) throw new IntakeError(409, 'CALL_ACTIVE', 'End the current call first.');
      return this.connection(record);
    }
    if (record.attempt && !input.restart) throw new IntakeError(409, 'RESTART_REQUIRED', 'Starting another call requires an explicit restart.');
    const epoch = (record.attempt?.epoch ?? 0) + 1;
    const attempt: Attempt = {
      epoch, mode: input.mode, clientId: input.clientId,
      deadlineAt: new Date(this.now() + 300000).toISOString(), provisioned: false,
      providerSessionId: null, credentialCiphertext: null, createdAt: this.now(), lastHeartbeatAt: this.now(),
    };
    const next = structuredClone(record);
    next.attempt = attempt; next.mode = input.mode; next.phase = 'connecting'; next.mediaStatus = 'connecting';
    this.addReceipt(next, key, input, epoch);
    if (!await this.save(record, next)) throw conflict();
    record = next;
    try {
      await this.deps.budget.reserve(`${id}:${epoch}`, ip, Date.parse(attempt.deadlineAt));
      // Only mint a managed session here. The official browser SDK starts media.
      const binding = await this.deps.provider.open(attempt, id);
      Object.assign(attempt, binding);
      for (let retry = 0; retry < 16; retry++) {
        const current = await this.deps.store.read<IntakeRecord>(this.key(id));
        if (!current || current.attempt?.epoch !== epoch) throw new IntakeError(409, 'ATTEMPT_CLOSED', 'This call has ended.');
        const provisioned = structuredClone(current);
        Object.assign(provisioned.attempt!, binding, { provisioned: true });
        if (await this.save(current, provisioned)) {
          if (current.deleted || !['connecting','active'].includes(current.mediaStatus)) throw new IntakeError(409, 'ATTEMPT_CLOSED', 'This call has ended.');
          return this.connection(provisioned);
        }
      }
      throw conflict();
    } catch (error) {
      try { if (attempt.providerSessionId) await this.deps.provider.close(attempt); }
      catch { throw new IntakeError(503, 'CLEANUP_PENDING', 'The call could not close yet. Please retry End.', true); }
      await this.markClosed(id, epoch);
      await this.deps.budget.release(`${id}:${epoch}`);
      if (error instanceof IntakeError) throw error;
      throw new IntakeError(503, 'PROVIDER_UNAVAILABLE', 'The coach could not connect. Your brief is saved.', true);
    }
  }
  private async connection(record: IntakeRecord): Promise<Connection> {
    const attempt = record.attempt!;
    if (Date.parse(attempt.deadlineAt) <= this.now()) {
      await this.stop(record.ownerId, record.id, 'deadline-' + attempt.epoch, 'timeout');
      throw new IntakeError(410, 'CALL_EXPIRED', 'The call time limit has been reached.');
    }
    if (!attempt.provisioned) throw new IntakeError(409, 'CONNECT_IN_PROGRESS', 'This call is connecting. Retry shortly.', true);
    return { ...await this.deps.provider.credentials(attempt), providerEpoch: attempt.epoch, deadlineAt: attempt.deadlineAt, view: publicView(record) };
  }
  async markClosed(id: string, epoch: number) {
    for (let retry = 0; retry < 32; retry++) {
      // Raw read is intentional: deletion must still allow resource cleanup.
      const record = await this.deps.store.read<IntakeRecord>(this.key(id));
      if (!record || record.attempt?.epoch !== epoch || record.mediaStatus === 'closed') return;
      const next = structuredClone(record); next.mediaStatus = 'closed'; next.attempt!.credentialCiphertext = null;
      if (next.phase !== 'completed') next.phase = 'review';
      if (await this.save(record, next)) return;
    }
    throw conflict();
  }
  async stop(ownerId: string, id: string, key: string, reason: StopReason, providerEpoch?:number): Promise<IntakeView> {
    let record = await this.load(id, ownerId);
    if(providerEpoch!==undefined&&record.attempt&&providerEpoch!==record.attempt.epoch)return publicView(record);
    this.receipt(record, key, { reason });
    for (let retry = 0; retry < 32; retry++) {
      if (record.mediaStatus === 'closed') return publicView(record);
      if (record.mediaStatus === 'stopping') break;
      const next = structuredClone(record); next.mediaStatus = record.attempt ? 'stopping' : 'closed';
      if (record.phase !== 'completed') next.phase = 'review';
      // Safety actions never depend on available receipt space.
      if (Object.keys(next.receipts).length < 100) this.addReceipt(next, key, { reason });
      if (await this.save(record, next)) { record = next; break; }
      record = await this.load(id, ownerId);
      if(providerEpoch!==undefined&&record.attempt&&providerEpoch!==record.attempt.epoch)return publicView(record);
    }
    if (record.attempt) {
      // End during provisioning records cancellation immediately. The minting
      // request closes its late result; maintenance reconciles crashed requests.
      if (!record.attempt.providerSessionId && this.now() - record.attempt.createdAt < 30000) return publicView(record);
      try { await this.deps.provider.close(record.attempt); }
      catch { throw new IntakeError(503, 'CLEANUP_PENDING', 'The call is closing. Please retry End.', true); }
      await this.markClosed(id, record.attempt.epoch);
      await this.deps.budget.release(`${id}:${record.attempt.epoch}`);
    }
    return publicView(await this.load(id, ownerId));
  }
  async remove(ownerId: string, id: string, key: string) {
    const existing = await this.deps.store.read<IntakeRecord>(this.key(id));
    if (existing?.ownerId === ownerId && existing.deleted) return;
    // Persist cancellation before external cleanup, so late events cannot write.
    await this.stop(ownerId, id, key, 'deleted').catch(error => {
      if (!(error instanceof IntakeError) || error.code !== 'CLEANUP_PENDING') throw error;
    });
    for (let retry = 0; retry < 32; retry++) {
      const record = await this.load(id, ownerId); const next = structuredClone(record);
      next.deleted = true; next.profile = emptyProfile(); next.transcript = []; next.receipts = {}; next.clientEvents = []; next.confirmedAt = null;
      if (await this.save(record, next)) return;
    }
    throw conflict();
  }
  async maintenance(terminateAll=false,attestWorker=false) {
    const result={closed:0,pending:0};
    for(const id of await this.deps.store.activeIds()) {
      const record=await this.deps.store.read<IntakeRecord>(this.key(id));
      if(!record?.attempt || record.mediaStatus==='closed')continue;
      const a=record.attempt;
      const stale=this.now()-a.lastHeartbeatAt > (record.mediaStatus==='connecting'?30000:15000);
      if(!terminateAll&&record.mediaStatus!=='stopping'&&!record.deleted&&Date.parse(a.deadlineAt)>this.now()&&!stale)continue;
      try {
        // Cleanup also works after delete/TTL, where the browser can no longer read.
        let current=record;
        for(let retry=0;retry<16;retry++) {
          if(current.mediaStatus==='stopping')break;
          const next=structuredClone(current);next.mediaStatus='stopping';if(next.phase!=='completed')next.phase='review';
          if(await this.save(current,next)){current=next;break;}
          current=(await this.deps.store.read<IntakeRecord>(this.key(id)))!;
          if(!current||current.attempt?.epoch!==a.epoch)break;
        }
        if(current?.attempt?.epoch!==a.epoch)continue;
        if(!current.attempt.providerSessionId&&this.now()-a.createdAt<30000)continue;
        await this.deps.provider.close(current.attempt);
        await this.markClosed(id,a.epoch);await this.deps.budget.release(`${id}:${a.epoch}`);result.closed++;
      }catch{result.pending++;}
    }
    await this.deps.store.purgeExpired();
    if(!attestWorker)return result;
    for(let retry=0;retry<16;retry++){
      const health=await this.deps.store.read<{revision:number;lastRunAt:number}>('maintenance-health');
      const next={revision:(health?.revision??0)+1,lastRunAt:this.now()};
      const saved=health?await this.deps.store.compareAndSet('maintenance-health',health.revision,next,60):await this.deps.store.create('maintenance-health',next,60);
      if(saved)return result;
    }
    throw new IntakeError(503,'CLEANUP_BUSY','Cleanup status could not be recorded.',true);
  }
}
