// @ts-check
const { test, expect } = require('@playwright/test');
const { injectVoiWallet, injectWalletMockOnly, disconnectVoiWallet, VOI_WALLET_STORAGE_KEY } = require('../../src/playwright/wallet-inject');
const { switchToVoiChain, connectWallet, disconnectWallet, verifyWalletConnected, verifyWalletDisconnected, waitForAppReady, captureConsoleErrors } = require('../../src/playwright/voi-e2e-helpers');

const TEST_ADDRESS = 'NQA76E235VCMZB4KZQSV6IU64IWF2GGCXK4Y3QA7N7ZMI7MVHUQVV5BUD4';

test.describe('Voi Wallet Connect/Disconnect', () => {
  test('Kibisis: connect via ARC-0027 mock → verify address stored', async ({ page }) => {
    // Inject mock but don't pre-set connection (test fresh connect flow)
    await injectWalletMockOnly(page, { address: TEST_ADDRESS, provider: 'kibisis' });
    await page.goto('/');
    await waitForAppReady(page);

    // Switch to Voi chain
    await switchToVoiChain(page);

    // Connect wallet via UI
    await connectWallet(page, 'kibisis');

    // Verify connection persisted in localStorage
    var connected = await verifyWalletConnected(page, TEST_ADDRESS);
    expect(connected).toBe(true);
  });

  test('Lute: connect via extension mock → verify address stored', async ({ page }) => {
    await injectWalletMockOnly(page, { address: TEST_ADDRESS, provider: 'lute' });
    await page.goto('/');
    await waitForAppReady(page);

    await switchToVoiChain(page);
    await connectWallet(page, 'lute');

    var connected = await verifyWalletConnected(page, TEST_ADDRESS);
    expect(connected).toBe(true);
  });

  test('Disconnect clears localStorage', async ({ page }) => {
    // Start with pre-connected wallet
    await injectVoiWallet(page, { address: TEST_ADDRESS, provider: 'kibisis' });
    await page.goto('/');
    await waitForAppReady(page);

    // Verify connected
    var connected = await verifyWalletConnected(page, TEST_ADDRESS);
    expect(connected).toBe(true);

    // Disconnect
    await disconnectWallet(page);

    // Verify disconnected
    await verifyWalletDisconnected(page);
  });

  test('Session persistence: reload preserves address (optimistic display)', async ({ page }) => {
    await injectVoiWallet(page, { address: TEST_ADDRESS, provider: 'kibisis' });
    await page.goto('/');
    await waitForAppReady(page);

    // Verify connected
    var connected = await verifyWalletConnected(page, TEST_ADDRESS);
    expect(connected).toBe(true);

    // Reload page — mock still injected, localStorage still set
    await page.reload();
    await waitForAppReady(page);

    // Address should still be in localStorage (optimistic display)
    connected = await verifyWalletConnected(page, TEST_ADDRESS);
    expect(connected).toBe(true);
  });

  test('Mock injects before app bundle — __arc0027MockActive is set', async ({ page }) => {
    await injectWalletMockOnly(page, { address: TEST_ADDRESS, provider: 'kibisis' });
    await page.goto('/');
    await waitForAppReady(page);

    var mockActive = await page.evaluate(function () {
      return window.__arc0027MockActive === true;
    });
    expect(mockActive).toBe(true);
  });

  test('Lute mock sets window.lute — __luteMockActive is set', async ({ page }) => {
    await injectWalletMockOnly(page, { address: TEST_ADDRESS, provider: 'lute' });
    await page.goto('/');
    await waitForAppReady(page);

    var mockActive = await page.evaluate(function () {
      return window.__luteMockActive === true && window.lute === true;
    });
    expect(mockActive).toBe(true);
  });

  test('No console errors during wallet connect flow', async ({ page }) => {
    var console = captureConsoleErrors(page);
    await injectWalletMockOnly(page, { address: TEST_ADDRESS, provider: 'kibisis' });
    await page.goto('/');
    await waitForAppReady(page);
    await switchToVoiChain(page);
    await connectWallet(page, 'kibisis');

    // Filter out known non-critical errors (e.g., third-party script failures)
    var criticalErrors = console.errors.filter(function (e) {
      return !e.includes('favicon') && !e.includes('analytics') && !e.includes('fingerprint');
    });
    expect(criticalErrors).toHaveLength(0);
  });
});
