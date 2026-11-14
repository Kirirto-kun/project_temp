import { expect, test } from '@playwright/test';
import { chooseCounterpartAndStart, fillQuickForm, say } from './helpers';

test('replay starts the same round fresh and compares honestly', async ({ page }) => {
  await fillQuickForm(page);
  await chooseCounterpartAndStart(page, /Priya Raman/);
  await say(page, 'Deal, I accept.');
  await page.getByRole('button', { name: 'See the debrief' }).click();
  await page.waitForURL('**/debrief/**');
  const firstUrl = page.url();
  await page.getByRole('button', { name: 'Replay this round' }).click();
  await page.waitForURL('**/session/**');
  await expect(page.getByText('Turn 0 of 20')).toBeVisible();
  await say(page, "I'm asking for $112,000 because my scope doubled this year.");
  await say(page, 'I led the platform migration and mentored two new engineers.');
  await say(page, 'Deal, I accept.');
  await page.getByRole('button', { name: 'See the debrief' }).click();
  await page.waitForURL('**/debrief/**');
  expect(page.url()).not.toBe(firstUrl);
  await expect(page.getByText('Compared with your previous round')).toBeVisible();
  await expect(page.getByText(/better than your previous round/)).toBeVisible();
});
