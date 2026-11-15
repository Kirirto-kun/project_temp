import { test,expect } from '@playwright/test';

test('entry has no device or paid connection before an explicit action',async({page})=>{
  const external:string[]=[];page.on('request',request=>{if(/api\.liveavatar\.com|api\.elevenlabs\.io/.test(request.url()))external.push(request.url());});
  await page.addInitScript(()=>{
    Object.assign(window,{mediaRequests:0});
    if(navigator.mediaDevices)Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{(window as unknown as {mediaRequests:number}).mediaRequests++;throw new DOMException('Denied','NotAllowedError');}});
  });
  await page.goto('/');await expect(page.getByRole('heading',{name:'Prepare for your next conversation.'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Use the quick form',exact:true})).toBeEnabled();
  expect(await page.evaluate(()=>(window as unknown as {mediaRequests:number}).mediaRequests)).toBe(0);expect(external).toHaveLength(0);
  await page.screenshot({path:'test-results/intake-entry-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Preview call setup'}).click();
  await expect(page.getByRole('button',{name:'Check microphone',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Check microphone',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'Permission was not granted'})).toBeVisible();
  await page.getByRole('button',{name:'Use the quick form',exact:true}).click();
  await expect(page.getByRole('button',{name:'Save brief',exact:true})).toBeVisible();expect(external).toHaveLength(0);
});

test('quick form persists through reload, requires confirmation and invalidates a correction',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Use the quick form',exact:true}).click();
  await page.getByLabel('Conversation type',{exact:true}).selectOption('raise');
  await page.getByLabel('Your role',{exact:true}).fill('Backend engineer');
  await page.getByLabel('Who will you speak with?').fill('My manager');
  await page.getByLabel('Current base pay · USD').fill('95,000');
  await page.getByLabel('Amount you want to ask for · USD').fill('110,000');
  await page.getByLabel('Currency',{exact:true}).selectOption('USD');
  await page.getByLabel('Pay period',{exact:true}).selectOption('year');
  await page.getByLabel('Before or after tax?').selectOption('gross');
  await page.getByLabel("What's the situation?").fill('I led the migration and mentor two engineers.');
  await page.getByLabel('What do you want to achieve?').fill('Agree on a raise to $110,000.');
  await page.getByRole('button',{name:'Save brief',exact:true}).click();
  await expect(page.getByText('$95,000',{exact:true})).toBeVisible();await expect(page.getByText('$110,000',{exact:true})).toBeVisible();
  await page.reload();await expect(page.getByLabel('Current base pay · USD')).toHaveValue('95000');
  await page.getByRole('button',{name:'Save brief',exact:true}).click();await page.getByRole('button',{name:'Confirm practice brief'}).click();
  await expect(page.getByRole('status').filter({hasText:'Brief confirmed'})).toBeVisible();
  await page.screenshot({path:'test-results/intake-brief-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Edit',exact:true}).click();await page.getByLabel('Current base pay · USD').fill('50,000');await page.getByRole('button',{name:'Save brief',exact:true}).click();
  await expect(page.getByText('$50,000',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Confirm practice brief'})).toBeVisible();
});

test('mobile call setup fits the viewport and keeps camera local and optional',async({page})=>{
  await page.setViewportSize({width:375,height:812});await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');await page.getByRole('button',{name:'Preview call setup'}).click();
  await expect(page.getByRole('button',{name:'Camera off',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Connect to Alex',exact:true})).toBeDisabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/intake-call-mobile.png',fullPage:true});
  await page.emulateMedia({colorScheme:'dark'});await page.screenshot({path:'test-results/intake-call-mobile-dark.png',fullPage:true});
});

test('switching to the form cancels Connect before a delayed token response arrives',async({page})=>{
  await page.route('**/api/intake/config',route=>route.fulfill({json:{available:true}}));
  await page.addInitScript(()=>{Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>new AudioContext().createMediaStreamDestination().stream});});
  await page.goto('/');await page.getByRole('button',{name:'Start the conversation',exact:true}).click();
  await page.getByRole('button',{name:'Check microphone',exact:true}).click();
  await expect(page.getByRole('button',{name:'Microphone checked',exact:true})).toBeVisible();
  let release!:()=>void;let entered!:()=>void;const gate=new Promise<void>(r=>{release=r;});const waiting=new Promise<void>(r=>{entered=r;});let stops=0;
  page.on('request',r=>{if(r.url().endsWith('/stop'))stops++;});
  await page.route('**/api/intake/*/connect',async route=>{entered();await gate;await route.abort();});
  try {
    await page.getByRole('button',{name:'Connect to Alex',exact:true}).click();await waiting;
    await page.getByRole('button',{name:'Use the quick form',exact:true}).click();
    await expect.poll(()=>stops,{timeout:3000}).toBe(1);
  }finally{release();}
});

test('review displays and edits every accepted monetary range and one-time period',async({page,context})=>{
  await page.goto('/');await page.getByRole('button',{name:'Use the quick form',exact:true}).click();
  await expect(page.getByRole('button',{name:'Save brief',exact:true})).toBeVisible();
  const id=new URL(page.url()).pathname.split('/').at(-1)!;
  const current=await(await context.request.get('/api/intake/'+id)).json();
  const changed=await context.request.patch('/api/intake/'+id+'/profile',{headers:{Origin:'http://127.0.0.1:3100','Idempotency-Key':crypto.randomUUID()},data:{expectedRevision:current.revision,patch:{kind:'raise',marketLowMinor:9000000,marketHighMinor:12000000,rangeSource:'user_provided',currency:'USD',period:'one_time',moneyBasis:'gross'}}});
  expect(changed.ok()).toBe(true);await page.reload();
  await page.getByRole('button',{name:'Save brief',exact:true}).click();
  await expect(page.getByText('$90,000 – $120,000',{exact:true})).toBeVisible();
  await expect(page.getByText('USD · one-time · gross, before tax',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Edit',exact:true}).click();await page.getByLabel('Range low · USD').fill('85,000');
  await page.getByRole('button',{name:'Save brief',exact:true}).click();
  await expect(page.getByText('$85,000 – $120,000',{exact:true})).toBeVisible();
});

test('an arbitrary custom conversation saves, reloads and confirms without money',async({page,context})=>{
  await page.goto('/');await page.getByRole('button',{name:'Use the quick form',exact:true}).click();
  await page.getByLabel('Conversation type',{exact:true}).selectOption('custom');
  await page.getByLabel('Who will you speak with?').fill('The volunteer gardening group');
  await page.getByLabel("What's the situation?").fill('Our shared garden needs a new watering schedule.');
  await page.getByLabel('What do you want to achieve?').fill('Agree on a fair rota that everyone can maintain.');
  await page.getByLabel('How do you want to come across?').fill('Considerate and practical');
  await page.getByRole('button',{name:'Save brief',exact:true}).click();
  await expect(page.getByText('Our shared garden needs a new watering schedule.',{exact:true})).toBeVisible();
  await expect(page.locator('.money-pair')).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel('Conversation type',{exact:true})).toHaveValue('custom');
  await expect(page.getByLabel('What do you want to achieve?')).toHaveValue('Agree on a fair rota that everyone can maintain.');
  await page.getByRole('button',{name:'Save brief',exact:true}).click();
  await page.getByRole('button',{name:'Confirm practice brief'}).click();
  await expect(page.getByRole('status').filter({hasText:'Brief confirmed'})).toBeVisible();
  const id=new URL(page.url()).pathname.split('/').at(-1)!;
  const current=await(await context.request.get('/api/intake/'+id)).json();
  expect(current.publicProfile).toMatchObject({kind:'custom',goal:'Agree on a fair rota that everyone can maintain.'});
  for(const field of ['currentMinor','targetMinor','marketLowMinor','marketHighMinor','currency','period','moneyBasis'])expect(current.publicProfile).not.toHaveProperty(field);
});

test('mobile scenario switching clears salary amounts and retains common context',async({page,context})=>{
  await page.setViewportSize({width:375,height:812});
  await page.goto('/');await page.getByRole('button',{name:'Use the quick form',exact:true}).click();
  await page.getByLabel('Conversation type',{exact:true}).selectOption('raise');
  await page.getByLabel('Who will you speak with?').fill('My partner');
  await page.getByLabel("What's the situation?").fill('We need to discuss a change to our plans.');
  await page.getByLabel('What do you want to achieve?').fill('Agree on a decision together.');
  await page.getByLabel('Current base pay · USD').fill('95,000');
  await page.getByLabel('Amount you want to ask for · USD').fill('110,000');
  await page.getByLabel('Currency',{exact:true}).selectOption('USD');
  await page.getByLabel('Pay period',{exact:true}).selectOption('year');
  await page.getByLabel('Before or after tax?').selectOption('gross');
  await page.getByRole('button',{name:'Save brief',exact:true}).click();
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  await page.getByLabel('Conversation type',{exact:true}).selectOption('relationship');
  await expect(page.getByLabel('What do you want to achieve?')).toHaveValue('Agree on a decision together.');
  await page.getByText('Money details · optional',{exact:true}).click();
  await expect(page.getByLabel('Current amount · USD')).toHaveValue('');
  await expect(page.getByLabel('Currency',{exact:true})).toHaveValue('');
  await expect(page.getByLabel('Amount period',{exact:true})).toHaveValue('');
  await page.getByRole('button',{name:'Save brief',exact:true}).click();
  await expect(page.locator('.money-pair')).toHaveCount(0);
  await expect(page.getByText('Agree on a decision together.',{exact:true})).toBeVisible();
  const id=new URL(page.url()).pathname.split('/').at(-1)!;
  const current=await(await context.request.get('/api/intake/'+id)).json();
  expect(current.publicProfile.kind).toBe('relationship');
  expect(current.publicProfile.currentMinor).toBeUndefined();expect(current.publicProfile.targetMinor).toBeUndefined();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/intake-universal-brief-mobile.png',fullPage:true});
});

test('editing a legacy kindless money brief preserves its amounts and units',async({page,context})=>{
  await page.goto('/');await page.getByRole('button',{name:'Use the quick form',exact:true}).click();
  await expect(page.getByRole('button',{name:'Save brief',exact:true})).toBeVisible();
  const id=new URL(page.url()).pathname.split('/').at(-1)!;
  const current=await(await context.request.get('/api/intake/'+id)).json();
  const changed=await context.request.patch('/api/intake/'+id+'/profile',{headers:{Origin:'http://127.0.0.1:3100','Idempotency-Key':crypto.randomUUID()},data:{expectedRevision:current.revision,patch:{currentMinor:9500000,targetMinor:11000000,currency:'USD',period:'year',moneyBasis:'gross'}}});
  expect(changed.ok()).toBe(true);await page.reload();
  await expect(page.getByLabel('Current amount · USD')).toHaveValue('95000');
  await page.getByLabel('Conversation type',{exact:true}).selectOption('raise');
  await page.getByLabel('What do you want to achieve?').fill('Discuss my next review.');
  await page.getByRole('button',{name:'Save brief',exact:true}).click();
  await expect(page.getByText('$95,000',{exact:true})).toBeVisible();
  await expect(page.getByText('USD · per year · gross, before tax',{exact:true})).toBeVisible();
});
