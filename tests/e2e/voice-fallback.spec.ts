import { expect, test } from '@playwright/test';
import { chooseCounterpartAndStart, fillQuickForm } from './helpers';

test('without voice providers the round is fully usable by typing and voice is not advertised', async ({ page, request }) => {
  const config = await (await request.get('/api/config')).json();
  expect(config.capabilities.voice).toBe(false);
  await fillQuickForm(page);
  await chooseCounterpartAndStart(page, /Maya Chen/);
  await expect(page.getByRole('button', { name: 'Talk instead' })).toHaveCount(0);
  await expect(page.getByLabel('Your reply')).toBeEnabled();
});

test('voice credentials are refused while voice is disabled', async ({ request, baseURL }) => {
  const response = await request.post('/api/elevenlabs/token', { data: { sessionId: 'ses_xxxxxxxxxxxxxxxxxxxxxx', connectionType: 'webrtc' }, headers: { origin: new URL(baseURL!).origin } });
  expect([404, 503]).toContain(response.status());
});
