import { notFound } from 'next/navigation';
import { z } from 'zod';
import { IntakeCall } from '@/onboarding/ui/IntakeCall';
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{mode?:string}>}) {
  const {id}=await params;if(!z.uuid().safeParse(id).success)notFound();
  return <IntakeCall id={id} initialForm={(await searchParams).mode==='form'}/>;
}
