import { getDependencies } from '@/onboarding/server/dependencies';
import { IntakeError } from '@/onboarding/server/errors';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=30;
type Context={params:Promise<{path?:string[]}>};
async function handle(request:Request,context:Context) {
  try{return await getDependencies().api(request,(await context.params).path??[]);}
  catch(error){const message=error instanceof IntakeError?error.message:'This service is temporarily unavailable.';return Response.json({error:{code:'SERVICE_UNCONFIGURED',message,retryable:true,requestId:crypto.randomUUID()}},{status:503,headers:{'Cache-Control':'no-store'}});}
}
export {handle as GET,handle as POST,handle as PATCH,handle as DELETE};
