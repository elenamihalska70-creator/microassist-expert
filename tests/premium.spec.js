import { test, expect } from '@playwright/test';

test('dashboard page shows main fiscal blocks', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText(/Mon espace fiscal|Mes revenus|Repères fiscaux/i)).toBeVisible();
});