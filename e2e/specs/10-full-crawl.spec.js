/** @ts-check */
const { test, expect } = require('@playwright/test');
const { injectVoiWallet, mockAlgodEndpoints } = require('../../src/playwright/wallet-inject');
const { switchToVoiChain, switchToAlgorandChain, waitForAppReady, captureConsoleErrors, captureNetworkErrors } = require('../../src/playwright/voi-e2e-helpers');

const TEST_ADDRESS = 'NQA76E235VCMZB4KZQSV6IU64IWF2GGCXK4Y3QA7N7ZMI7MVHUQVV5BUD4';

function isExpectedError(msg) {
  return msg.includes('429') || msg.includes('404') || msg.includes('AxiosError');
}

test.describe('Full Voi Crawl', () => {
  test('Crawl all Voi pages with wallet connected', async ({ page }) => {
    var consoleCapture = captureConsoleErrors(page);
    var networkCapture = captureNetworkErrors(page);

    await injectVoiWallet(page, { address: TEST_ADDRESS, provider: 'kibisis' });
    await mockAlgodEndpoints(page);
    await page.goto('/');
    await waitForAppReady(page);

    await switchToVoiChain(page);
    await page.waitForTimeout(800);

    var pagesToVisit = [
      { path: '/', name: 'Home' },
      { path: '/swap', name: 'Swap' },
      { path: '/stake', name: 'Stake' },
      { path: '/farm', name: 'Farm' },
      { path: '/p2p', name: 'P2P Swap' },
      { path: '/nft-stake', name: 'NFT Stake' },
      { path: '/profile', name: 'Profile' },
      { path: '/stake-pool-stats', name: 'Stake Pool Stats' },
      { path: '/farm-pool-stats', name: 'Farm Pool Stats' },
      { path: '/nft-pool-stats', name: 'NFT Pool Stats' },
    ];

    for (var i = 0; i < pagesToVisit.length; i++) {
      var item = pagesToVisit[i];
      console.log('Visiting:', item.path);
      await page.goto(item.path);
      await waitForAppReady(page);
      await page.waitForTimeout(1000);
    }

    console.log('Console errors:', consoleCapture.errors.length);
    console.log('Network failures:', networkCapture.failures.length);
    consoleCapture.errors.forEach(function (e) { console.log('  CONSOLE ERROR:', e); });
    networkCapture.failures.forEach(function (f) { console.log('  NETWORK FAIL:', f.status, f.method, f.url); });

    var criticalConsoleErrors = consoleCapture.errors.filter(function (e) { return !isExpectedError(e); });
    var criticalNetworkFailures = networkCapture.failures.filter(function (f) { return f.status >= 500; });
    expect(criticalConsoleErrors.length).toBe(0);
    expect(criticalNetworkFailures.length).toBe(0);
  });

  test('Cross-chain: Algo to Voi to Algo rapid switching', async ({ page }) => {
    var consoleCapture = captureConsoleErrors(page);
    await page.goto('/');
    await waitForAppReady(page);

    await switchToVoiChain(page);
    await page.waitForTimeout(300);
    await switchToAlgorandChain(page);
    await page.waitForTimeout(300);
    await switchToVoiChain(page);
    await page.waitForTimeout(300);
    await switchToAlgorandChain(page);
    await page.waitForTimeout(300);

    consoleCapture.errors.forEach(function (e) { console.log('  RAPID SWITCH ERROR:', e); });
    var criticalErrors = consoleCapture.errors.filter(function (e) { return !isExpectedError(e); });
    expect(criticalErrors.length).toBe(0);
  });

  test('Feature gating: Voi pages that should be hidden', async ({ page }) => {
    await page.addInitScript(function () {
      localStorage.setItem('voi-chain-id', 'voi-mainnet');
    });
    await page.goto('/');
    await waitForAppReady(page);

    var navText = await page.locator('nav, header').first().textContent();
    expect(navText).not.toContain('Device Stake');
    expect(navText).not.toContain('Alpha Arcade');
  });
});
