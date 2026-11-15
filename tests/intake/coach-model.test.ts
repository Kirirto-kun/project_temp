import { expect, it } from 'vitest';
import { DirectCoachModel, type CoachInput } from '@/onboarding/server/coach-model';

const result={reply:'What would you like your audience to take away?',patch:{kind:'presentation',goal:'Explain the project clearly'},action:'continue'};
const wire={reply:result.reply,changes:[{field:'kind',value:'presentation'},{field:'goal',value:'Explain the project clearly'}],action:'continue'};
const config={anthropicKey:'test-anthropic-key',anthropicModel:'test-claude-model',openaiKey:'test-openai-key',openaiModel:'test-gpt-model',primary:'anthropic' as const};
const input:CoachInput={profile:{},messages:[{role:'user',content:'I am preparing a presentation'}],signal:new AbortController().signal};
it('uses structured Claude JSON without forced tools and validates the candidate changes',async()=>{
 const requests:{url:string;body:Record<string,unknown>}[]=[];
 const model=new DirectCoachModel(config,async(url,options)=>{requests.push({url:String(url),body:JSON.parse(String(options?.body))});return Response.json({content:[{type:'text',text:JSON.stringify(wire)}]});});
 expect(await model.complete(input)).toEqual(result);expect(requests[0].url).toBe('https://api.anthropic.com/v1/messages');
 expect(requests[0].body.messages).toEqual(input.messages);expect(requests[0].body.system).toContain('ANY conversation');
 expect(requests[0].body).not.toHaveProperty('tool_choice');expect(requests[0].body).toHaveProperty('output_config.format.type','json_schema');
});
it('uses the configured OpenAI fallback once when the primary is unavailable',async()=>{
 const urls:string[]=[];
 const model=new DirectCoachModel(config,async(url)=>{urls.push(String(url));return urls.length===1?Response.json({error:{type:'overloaded_error'}},{status:503}):Response.json({choices:[{message:{content:JSON.stringify(wire)}}]});});
 expect(await model.complete(input)).toEqual(result);expect(urls).toEqual(['https://api.anthropic.com/v1/messages','https://api.openai.com/v1/chat/completions']);
});
it('rejects model attempts to confirm or inject privileged profile fields',async()=>{
 const bad={...wire,changes:[{field:'confirmed',value:'true'},{field:'ownerId',value:'someone-else'}]};
 const model=new DirectCoachModel(config,async(url)=>String(url).includes('anthropic')?Response.json({content:[{type:'text',text:JSON.stringify(bad)}]}):Response.json({choices:[{message:{content:JSON.stringify(bad)}}]}));
 await expect(model.complete(input)).rejects.toMatchObject({code:'MODEL_UNAVAILABLE'});
});
it('does not start a fallback request after cancellation',async()=>{
 const controller=new AbortController();const urls:string[]=[];
 const model=new DirectCoachModel(config,async(url)=>{urls.push(String(url));controller.abort();throw new Error('cancelled');});
 await expect(model.complete({...input,signal:controller.signal})).rejects.toMatchObject({code:'CALL_CANCELLED'});expect(urls).toHaveLength(1);
});
