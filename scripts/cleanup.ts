import { getDependencies } from '../src/onboarding/server/dependencies';
import { setTimeout as delay } from 'node:timers/promises';

const controller=new AbortController();
process.on('SIGINT',()=>controller.abort());process.on('SIGTERM',()=>controller.abort());
const deps=getDependencies();let failed=false;
console.log('Intake cleanup is running; interval 5 seconds.');
try {
  while(!controller.signal.aborted) {
    try {
      const result=await deps.service.maintenance(!await deps.callsAvailable(),true);
      if(failed)console.log('Intake cleanup recovered.');failed=false;
      if(result.closed||result.pending)console.log(JSON.stringify({event:'intake_cleanup',...result}));
    }catch{if(!failed)console.error('Intake cleanup could not reach a dependency; it will retry.');failed=true;}
    try{await delay(5000,undefined,{signal:controller.signal});}catch{break;}
  }
}finally{await deps.pool.end();}
