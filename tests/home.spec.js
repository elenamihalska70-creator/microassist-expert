import { test, expect } from '@playwright/test';

test('landing page opens', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Entrepreneurs Assistant')).toBeVisible();
  await expect(page.getByText('Commencer gratuitement')).toBeVisible();
});