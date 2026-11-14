import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function key(value: string) {
  if (!/^[a-fA-F0-9]{64}$/.test(value)) throw new Error('A 32-byte TOKEN_ENCRYPTION_KEY is required');
  return Buffer.from(value,'hex');
}
export function sealToken(token: string, secret: string, binding: string): string {
  const iv=randomBytes(12); const cipher=createCipheriv('aes-256-gcm',key(secret),iv);
  cipher.setAAD(Buffer.from(binding));
  const encrypted=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');
}
export function openToken(sealed: string, secret: string, binding: string): string {
  const value=Buffer.from(sealed,'base64url');
  if(value.length<29) throw new Error('Invalid encrypted session credential');
  const decipher=createDecipheriv('aes-256-gcm',key(secret),value.subarray(0,12));
  decipher.setAAD(Buffer.from(binding)); decipher.setAuthTag(value.subarray(12,28));
  return Buffer.concat([decipher.update(value.subarray(28)),decipher.final()]).toString('utf8');
}
