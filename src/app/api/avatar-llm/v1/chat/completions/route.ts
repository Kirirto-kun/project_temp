import { getDependencies } from '@/onboarding/server/dependencies';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){return getDependencies().coachCallback(request);}
