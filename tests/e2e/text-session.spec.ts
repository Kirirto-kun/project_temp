import { expect, test } from '@playwright/test';
import { chooseCounterpartAndStart, fillQuickForm, say } from './helpers';

test('quick form → text round → debrief with money computed by the engine', async ({ page }) => {
  await fillQuickForm(page);
  await expect(page.getByText('Gap to your own target')).toBeVisible();
  await expect(page.getByText('$15,000/year')).toBeVisible();
  await chooseCounterpartAndStart(page, /Maya Chen/);

  await say(page, "I'm asking for $112,000 because I took over the payments team this spring.");
  await say(page, 'I shipped the migration a month early and cut incidents in half.');
  await say(page, 'Deal, I accept.');

  await expect(page.getByText('Round over')).toBeVisible();
  await page.getByRole('button', { name: 'See the debrief' }).click();
  await page.waitForURL('**/debrief/**');
  await expect(page.getByText('Left on the table')).toBeVisible();
  await expect(page.getByText('Where the conversation turned')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Moves ledger' }).getByRole('listitem')).toHaveCount(3);
  await expect(page.getByText('No recording for this session.')).toBeVisible();
});

test('a reload keeps the round, and ending without a deal shows no agreement', async ({ page }) => {
  await fillQuickForm(page);
  await chooseCounterpartAndStart(page, /Daniel Okafor/);
  await say(page, 'Why is the budget fixed this cycle?');
  await page.reload();
  await expect(page.getByText('Why is the budget fixed this cycle?')).toBeVisible();
  await page.getByRole('button', { name: 'End the round' }).click();
  await expect(page.getByText('No agreement. You stopped the round.')).toBeVisible();
  await page.getByRole('button', { name: 'See the debrief' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('No agreement');
  await expect(page.getByText('nothing is counted as earned or lost')).toBeVisible();
});

test('the example debrief opens without any service and is labelled', async ({ page }) => {
  await page.goto('/example');
  await expect(page.getByText(/^Example\. A synthetic round/)).toBeVisible();
  await expect(page.getByText('Example · synthetic round')).toBeVisible();
  await expect(page.getByText('Left on the table')).toBeVisible();
});
