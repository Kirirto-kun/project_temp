import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { IntakeError } from './errors';

const payloadSchema=z.object({id:z.uuid(),epoch:z.number().int().positive(),deadlineAt:z.iso.datetime()}).strict();
const sign=(payload:string,secret:string)=>createHmac('sha256',secret).update('holdline-session:'+payload).digest();

export function createSessionBinding(id:string,epoch:number,deadlineAt:string,secret:string) {
  const payload=Buffer.from(JSON.stringify(payloadSchema.parse({id,epoch,deadlineAt}))).toString('base64url');
  return payload+'.'+sign(payload,secret).toString('base64url');
}
export function parseSessionBinding(token:string,secret:string,now:number) {
  try {
    if(token.length>1000||!/^[-\w]+\.[-\w]+$/.test(token))throw new Error('Invalid binding');
    const [payload,signature]=token.split('.');const actual=Buffer.from(signature,'base64url');const expected=sign(payload,secret);
    if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new Error('Invalid signature');
    const value=payloadSchema.parse(JSON.parse(Buffer.from(payload,'base64url').toString('utf8')));
    if(Date.parse(value.deadlineAt)<=now)throw new IntakeError(410,'CALL_EXPIRED','This call has ended.');
    return value;
  }catch(error){if(error instanceof IntakeError)throw error;throw new IntakeError(401,'INVALID_SESSION_BINDING','Provider callback is not authorized.');}
}
