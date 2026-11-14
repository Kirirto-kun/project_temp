import { expect, type Page } from '@playwright/test';

export async function fillQuickForm(page: Page) {
  await page.goto('/quiz');
  await page.getByRole('button', { name: 'A raise' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Amount in US dollars').fill('95,000');
  await page.getByRole('button', { name: 'Before tax' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Your target in US dollars').fill('110000');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Low end').fill('100000');
  await page.getByLabel('High end').fill('112000');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('**/result');
}

export async function chooseCounterpartAndStart(page: Page, name: RegExp) {
  await page.getByRole('link', { name: 'Choose your counterpart' }).click();
  await page.waitForURL('**/opponents');
  await page.getByRole('radio', { name }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('**/calibration');
  await page.getByRole('button', { name: 'Start the round' }).click();
  await page.waitForURL('**/session/**');
  await expect(page.getByText('On the table')).toBeVisible();
}

export async function say(page: Page, text: string) {
  const before = await page.locator('ol[aria-label="Conversation"] > li').count();
  await page.getByLabel('Your reply').fill(text);
  await page.getByRole('button', { name: 'Send reply' }).click();
  await expect.poll(async () => page.locator('ol[aria-label="Conversation"] > li').count()).toBeGreaterThanOrEqual(before + 2);
}
