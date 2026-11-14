import { getDependencies } from '@/onboarding/server/dependencies';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(){
  try{const deps=getDependencies();await deps.pool.query('SELECT 1');return Response.json({status:'ok'},{headers:{'Cache-Control':'no-store'}});}
  catch{return Response.json({status:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
