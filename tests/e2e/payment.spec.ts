import { expect, test } from '@playwright/test';

test('paid APIs are protected on the server and the free path never needs them', async ({ page, request }) => {
  await page.goto('/pricing');
  await expect(page.getByText('Practice is free.')).toBeVisible();
  await expect(page.getByText(/One-time payment\. No subscription/)).toBeVisible();
  // A browser flag cannot grant access: the server decides.
  await page.evaluate(() => localStorage.setItem('paid', 'true'));
  const custom = await request.post('/api/scenarios/custom', { data: {}, headers: { 'Idempotency-Key': 'e2e-custom-0001' } });
  expect([403, 503]).toContain(custom.status());
  const offer = await request.post('/api/offers/analyze', { data: { text: 'x'.repeat(30), currency: 'USD', period: 'year' }, headers: { 'Idempotency-Key': 'e2e-offer-0001' } });
  expect([403, 503]).toContain(offer.status());
  const entitlement = await (await request.get('/api/entitlement')).json();
  expect(entitlement.status).toBe('none');
});

test('cross-site mutations are rejected', async ({ request }) => {
  const response = await request.post('/api/session', { data: {}, headers: { origin: 'https://evil.example', 'Idempotency-Key': 'e2e-evil-0001' } });
  expect(response.status()).toBe(403);
});
