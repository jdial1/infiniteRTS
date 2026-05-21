import { test, expect } from '@playwright/test';

test('verify ui after refactor', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Click START MATCH
  await page.click('text=START MATCH');

  // Select traits
  await page.click('text=Velocity');
  await page.click('text=Fortitude');
  await page.click('text=Confirm Authorization');

  // Wait for game to load
  await page.waitForSelector('canvas');

  // Open Structures
  await page.click('text=Structures');
  await page.screenshot({ path: 'v_structures.png' });

  // Open Upgrades
  await page.click('text=Upgrades');
  await page.screenshot({ path: 'v_upgrades.png' });

  // Open Miners
  await page.click('text=Miners');
  await page.screenshot({ path: 'v_miners.png' });
});
