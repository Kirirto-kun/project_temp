import pg from 'pg';
import { z } from 'zod';
import { PostgresStore } from './postgres-store';
import { DailyBudget } from './budget';
import { CallService, type CallProvider } from './service';
import { ProfileControl } from './profile-control';
import { createIntakeApi } from './http';
import { IntakeError } from './errors';
import { LiveAvatarProvider } from '../providers/liveavatar';
import { DirectCoachModel } from './coach-model';
import { createCoachCallback } from './coach-callback';
import { createCoachResponse } from './coach-response';
import { createHmac } from 'node:crypto';

const envSchema=z.object({
  APP_ORIGIN:z.url().transform(s=>new URL(s).origin),DATABASE_URL:z.string().min(1),
  OWNER_SECRET:z.string().min(32),TOKEN_ENCRYPTION_KEY:z.string().regex(/^[a-fA-F0-9]{64}$/),MAINTENANCE_SECRET:z.string().min(32),
  AVATAR_INTAKE_ENABLED:z.enum(['true','false']).default('false'),
  LIVEAVATAR_API_KEY:z.string().default(''),LIVEAVATAR_AVATAR_ID:z.string().default(''),
  LIVEAVATAR_VOICE_ID:z.string().default(''),
  LIVEAVATAR_VOICE_SOURCE:z.enum(['','elevenlabs','liveavatar-test']).default(''),
  CUSTOM_LLM_API_KEY:z.string().default(''),
  OPENAI_API_KEY:z.string().default(''),ANTHROPIC_API_KEY:z.string().default(''),
  INTAKE_MODEL_PROVIDER:z.enum(['anthropic','openai']).default('anthropic'),ANTHROPIC_COACH_MODEL:z.string().default('claude-sonnet-5-5'),OPENAI_COACH_MODEL:z.string().default('gpt-5.4-mini'),
  INTAKE_SESSION_LIMIT_SECONDS:z.coerce.number().int().min(1).max(300).default(300),
  INTAKE_ATTEMPTS_PER_IP:z.coerce.number().int().min(1).max(10).default(3),
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
  const configured=!!(env.LIVEAVATAR_API_KEY&&env.LIVEAVATAR_AVATAR_ID&&env.LIVEAVATAR_VOICE_ID&&(env.OPENAI_API_KEY||env.ANTHROPIC_API_KEY)&&(env.LIVEAVATAR_VOICE_SOURCE!=='liveavatar-test'||env.LIVEAVATAR_SANDBOX==='true'));
  const unavailable=()=>new IntakeError(503,'CALLS_UNAVAILABLE','Video conversations are not configured yet.',true);
  const provider:CallProvider=configured?new LiveAvatarProvider({apiKey:env.LIVEAVATAR_API_KEY,avatarId:env.LIVEAVATAR_AVATAR_ID,voiceId:env.LIVEAVATAR_VOICE_ID,encryptionKey:env.TOKEN_ENCRYPTION_KEY,sandbox:env.LIVEAVATAR_SANDBOX==='true'}):{
    async open(){throw unavailable();},async close(attempt){if(attempt.providerSessionId)throw unavailable();},async credentials(){throw unavailable();},
  };
  const budget=new DailyBudget(store,{dailyCents:env.INTAKE_DAILY_BUDGET_CENTS,attemptCents:env.INTAKE_ATTEMPT_RESERVE_CENTS,concurrency:env.INTAKE_MAX_CONCURRENCY,attemptsPerIp:env.INTAKE_ATTEMPTS_PER_IP});
  const service=new CallService({store,provider,budget,maxSessionSeconds:env.LIVEAVATAR_SANDBOX==='true'?Math.min(60,env.INTAKE_SESSION_LIMIT_SECONDS):env.INTAKE_SESSION_LIMIT_SECONDS});const profile=new ProfileControl(service);
  const model=new DirectCoachModel({anthropicKey:env.ANTHROPIC_API_KEY,anthropicModel:env.ANTHROPIC_COACH_MODEL,openaiKey:env.OPENAI_API_KEY,openaiModel:env.OPENAI_COACH_MODEL,primary:env.INTAKE_MODEL_PROVIDER});
  const internalBearer=env.CUSTOM_LLM_API_KEY.length>=32?env.CUSTOM_LLM_API_KEY:createHmac('sha256',env.OWNER_SECRET).update('internal-coach-callback').digest('hex');
  const coachCallback=createCoachCallback({service,profile,model,bearerSecret:internalBearer,bindingSecret:env.OWNER_SECRET});
  const respond=createCoachResponse({service,callback:coachCallback,bearerSecret:internalBearer,bindingSecret:env.OWNER_SECRET});
  const callsAvailable=async()=>{
    if(!configured||env.AVATAR_INTAKE_ENABLED!=='true')return false;
    const result=await pool.query("SELECT enabled FROM holdline_intake.feature_flags WHERE key='avatar_intake'");
    const cleanup=await store.read<{revision:number;lastRunAt:number}>('maintenance-health');
    return result.rows[0]?.enabled===true&&!!cleanup&&Date.now()-cleanup.lastRunAt<15000;
  };
  return {pool,service,profile,callsAvailable,coachCallback,api:createIntakeApi({service,profile,respond,origin:env.APP_ORIGIN,ownerSecret:env.OWNER_SECRET,maintenanceSecret:env.MAINTENANCE_SECRET,callsAvailable,trustedIpHeader:env.TRUSTED_IP_HEADER})};
}
type Dependencies=ReturnType<typeof createDependencies>;
const scope=globalThis as typeof globalThis&{holdlineIntakeDependencies?:Dependencies};
export function getDependencies(){return scope.holdlineIntakeDependencies??=createDependencies();}
