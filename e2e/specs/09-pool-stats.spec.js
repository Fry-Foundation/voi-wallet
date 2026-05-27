// @ts-check
const { test, expect } = require('@playwright/test');
const { waitForAppReady, captureNetworkErrors } = require('../../src/playwright/voi-e2e-helpers');

test.describe('Voi Pool Statistics (read-only)', () => {
  test.beforeEach(async ({ page }) => {
    // Read-only pages — no wallet injection needed, just set chain to Voi
    await page.addInitScript(function () {
      try {
        localStorage.setItem('fry-farm-chain-id', 'voi-mainnet');
      } catch (e) {}
    });
  });

  test('Stake pool stats page loads on Voi', async ({ page }) => {
    var networkCapture = captureNetworkErrors(page);
    await page.goto('/stake-pool-stats');
    await waitForAppReady(page);
    await page.waitForTimeout(2000);

    var bodyHeight = await page.evaluate(function () { return document.body.scrollHeight; });
    expect(bodyHeight).toBeGreaterThan(200);

    // No 5xx server errors
    var serverErrors = networkCapture.failures.filter(function (f) { return f.status >= 500; });
    expect(serverErrors).toHaveLength(0);
  });

  test('Farm pool stats page loads on Voi', async ({ page }) => {
    var networkCapture = captureNetworkErrors(page);
    await page.goto('/farm-pool-stats');
    await waitForAppReady(page);
    await page.waitForTimeout(2000);

    var bodyHeight = await page.evaluate(function () { return document.body.scrollHeight; });
    expect(bodyHeight).toBeGreaterThan(200);

    var serverErrors = networkCapture.failures.filter(function (f) { return f.status >= 500; });
    expect(serverErrors).toHaveLength(0);
  });

  test('NFT pool stats page loads on Voi', async ({ page }) => {
    var networkCapture = captureNetworkErrors(page);
    await page.goto('/nft-pool-stats');
    await waitForAppReady(page);
    await page.waitForTimeout(2000);

    var bodyHeight = await page.evaluate(function () { return document.body.scrollHeight; });
    expect(bodyHeight).toBeGreaterThan(200);

    var serverErrors = networkCapture.failures.filter(function (f) { return f.status >= 500; });
    expect(serverErrors).toHaveLength(0);
  });
});
