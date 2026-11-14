import pg from 'pg';
import { z } from 'zod';
import { PostgresStore } from './postgres-store';
import { DailyBudget } from './budget';
import { CallService, type CallProvider } from './service';
import { ProfileControl } from './profile-control';
import { createIntakeApi } from './http';
import { IntakeError } from './errors';
import { LiveAvatarProvider } from '../providers/liveavatar';

const envSchema=z.object({
  APP_ORIGIN:z.url().transform(s=>new URL(s).origin),DATABASE_URL:z.string().min(1),
  OWNER_SECRET:z.string().min(32),TOKEN_ENCRYPTION_KEY:z.string().regex(/^[a-fA-F0-9]{64}$/),MAINTENANCE_SECRET:z.string().min(32),
  AVATAR_INTAKE_ENABLED:z.enum(['true','false']).default('false'),
  LIVEAVATAR_API_KEY:z.string().default(''),LIVEAVATAR_AVATAR_ID:z.string().default(''),
  LIVEAVATAR_ELEVENLABS_SECRET_ID:z.string().default(''),ELEVENLABS_COACH_AGENT_ID:z.string().default(''),
  LIVEAVATAR_SANDBOX:z.enum(['true','false']).default('false'),
  INTAKE_DAILY_BUDGET_CENTS:z.coerce.number().int().positive(),INTAKE_ATTEMPT_RESERVE_CENTS:z.coerce.number().int().positive(),
  INTAKE_MAX_CONCURRENCY:z.coerce.number().int().min(1).max(20).default(2),TRUSTED_IP_HEADER:z.enum(['x-real-ip','cf-connecting-ip']).optional(),
});
function createDependencies() {
  const parsed=envSchema.safeParse(process.env);
  if(!parsed.success)throw new IntakeError(503,'SERVICE_UNCONFIGURED','This service is not configured yet.');
  const env=parsed.data;
  const pool=new pg.Pool({connectionString:env.DATABASE_URL,max:5,connectionTimeoutMillis:5000,idleTimeoutMillis:30000});
  const store=new PostgresStore(pool);
  const configured=!!(env.LIVEAVATAR_API_KEY&&env.LIVEAVATAR_AVATAR_ID&&env.LIVEAVATAR_ELEVENLABS_SECRET_ID&&env.ELEVENLABS_COACH_AGENT_ID);
  const unavailable=()=>new IntakeError(503,'CALLS_UNAVAILABLE','Video conversations are not configured yet.',true);
  const provider:CallProvider=configured?new LiveAvatarProvider({apiKey:env.LIVEAVATAR_API_KEY,avatarId:env.LIVEAVATAR_AVATAR_ID,secretId:env.LIVEAVATAR_ELEVENLABS_SECRET_ID,agentId:env.ELEVENLABS_COACH_AGENT_ID,encryptionKey:env.TOKEN_ENCRYPTION_KEY,sandbox:env.LIVEAVATAR_SANDBOX==='true'}):{
    async open(){throw unavailable();},async close(attempt){if(attempt.providerSessionId)throw unavailable();},async credentials(){throw unavailable();},
  };
  const budget=new DailyBudget(store,{dailyCents:env.INTAKE_DAILY_BUDGET_CENTS,attemptCents:env.INTAKE_ATTEMPT_RESERVE_CENTS,concurrency:env.INTAKE_MAX_CONCURRENCY,attemptsPerIp:3});
  const service=new CallService({store,provider,budget});const profile=new ProfileControl(service);
  const callsAvailable=async()=>{
    if(!configured||env.AVATAR_INTAKE_ENABLED!=='true')return false;
    const result=await pool.query("SELECT enabled FROM holdline_intake.feature_flags WHERE key='avatar_intake'");
    const cleanup=await store.read<{revision:number;lastRunAt:number}>('maintenance-health');
    return result.rows[0]?.enabled===true&&!!cleanup&&Date.now()-cleanup.lastRunAt<15000;
  };
  return {pool,service,profile,callsAvailable,api:createIntakeApi({service,profile,origin:env.APP_ORIGIN,ownerSecret:env.OWNER_SECRET,maintenanceSecret:env.MAINTENANCE_SECRET,callsAvailable,trustedIpHeader:env.TRUSTED_IP_HEADER})};
}
type Dependencies=ReturnType<typeof createDependencies>;
const scope=globalThis as typeof globalThis&{holdlineIntakeDependencies?:Dependencies};
export function getDependencies(){return scope.holdlineIntakeDependencies??=createDependencies();}
