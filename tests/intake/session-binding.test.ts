import { expect, it } from 'vitest';
import { createSessionBinding, parseSessionBinding } from '@/onboarding/server/session-binding';

const id='00000000-0000-4000-8000-000000000001';
const secret='local-test-binding-secret-that-is-long-enough';
const now=Date.parse('2026-11-15T00:00:00Z');
const deadline=new Date(now+60000).toISOString();

it('binds an intake, epoch and exact deadline without exposing an owner or API key',()=>{
  const token=createSessionBinding(id,3,deadline,secret);
  expect(parseSessionBinding(token,secret,now)).toEqual({id,epoch:3,deadlineAt:deadline});
  expect(token).not.toContain(secret);
});
it('rejects tampering, wrong secrets and an expired binding',()=>{
  const token=createSessionBinding(id,3,deadline,secret);
  expect(()=>parseSessionBinding(token+'x',secret,now)).toThrow();
  expect(()=>parseSessionBinding(token,'another-secret',now)).toThrow();
  expect(()=>parseSessionBinding(token,secret,now+60000)).toThrow();
});
