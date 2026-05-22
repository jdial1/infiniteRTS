import { test, expect } from '@playwright/test';

test('verify persistent user id in local storage', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Wait for some time for the app to initialize
  await page.waitForTimeout(2000);

  const userId = await page.evaluate(() => localStorage.getItem('render_game_user_id'));
  expect(userId).toBeTruthy();
  console.log('UserId found in localStorage:', userId);

  await page.reload();
  await page.waitForTimeout(2000);

  const userIdAfterReload = await page.evaluate(() => localStorage.getItem('render_game_user_id'));
  expect(userIdAfterReload).toBe(userId);
  console.log('UserId persisted after reload');

  await page.screenshot({ path: 'persistence-verify.png' });
});
