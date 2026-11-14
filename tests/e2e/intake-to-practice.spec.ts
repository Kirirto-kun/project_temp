import { expect, test } from '@playwright/test';

test('coach (text) → confirmed brief → counterpart → practice round', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Start' }).first().click();
  await page.waitForURL('**/intake');
  await page.getByRole('button', { name: 'Start the conversation' }).click();
  await page.waitForURL(/\/intake\/int_/);
  await expect(page.getByText(/your AI practice coach/).first()).toBeVisible();
  const say = async (text: string) => {
    const before = await page.locator('ol[aria-label="Conversation with Alex"] > li').count();
    await page.getByLabel('Your reply').fill(text);
    await page.getByRole('button', { name: 'Send reply' }).click();
    await expect.poll(async () => page.locator('ol[aria-label="Conversation with Alex"] > li').count()).toBeGreaterThan(before);
  };
  await say("I'm a backend engineer and I want to ask for a raise.");
  await say('My manager');
  await say('I make ninety-five');
  await expect(page.getByRole('list', { name: 'Conversation with Alex' }).getByText('Just to check: $95,000/year, in US dollars, before tax?')).toBeVisible();
  await say('yes');
  await say('I want a hundred and ten');
  await say('yes');
  await say("I don't know the market, but I took over the payments team.");
  await say('They will say the budget is frozen.');
  await page.getByLabel('Your reply').fill('Based on what I delivered, I am asking for $110,000.');
  await page.getByRole('button', { name: 'Send reply' }).click();

  await expect(page.getByRole('heading', { name: 'Your practice brief' })).toBeVisible();
  await expect(page.getByText('$95,000/year, before tax').first()).toBeVisible();
  await page.getByRole('checkbox').first().click();
  await expect(page.getByRole('checkbox').first()).toBeChecked();
  await expect(page.getByText('What worked')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm and start my practice' }).click();

  await page.waitForURL('**/opponents');
  await page.getByRole('radio', { name: /Tom Becker/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('**/calibration');
  await page.getByRole('button', { name: 'Start the round' }).click();
  await page.waitForURL('**/session/**');
  await expect(page.getByText('practice bounds, not a market estimate')).toBeVisible();
  await expect(page.getByText('$110,000/year').first()).toBeVisible();
});
