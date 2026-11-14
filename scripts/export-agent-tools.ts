import { writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { ProfilePatchSchema } from '../src/onboarding/contracts';
const parameters=z.toJSONSchema(z.object({patch:ProfilePatchSchema}).strict(),{target:'draft-07'});
const tools=[
  {type:'client',name:'save_profile',description:'Save only answers the user provided to their unconfirmed practice brief. Never invent salary, currency, period or market ranges. The user must confirm the brief.',expects_response:true,parameters},
  ...['get_missing_fields','prepare_confirmation','request_mini_practice','request_end'].map(name=>({type:'client',name,description:name==='prepare_confirmation'?'End the conversation and open the brief for the user to check. Does not confirm their answers.':name==='request_end'?'End the call without confirming the brief.':name==='request_mini_practice'?'Move to a short opening sentence rehearsal.':'Get which practice fields are still missing.',expects_response:true,parameters:{type:'object',properties:{},additionalProperties:false}})),
];
await writeFile('docs/product/intake/agent-tools.json',JSON.stringify(tools,null,2)+'\n');
console.log('Exported agent tool reference schemas. No provider API was called.');
