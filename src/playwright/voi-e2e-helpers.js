/**
 * Voi E2E Test Helpers — Reusable Playwright utilities for Voi dApps
 *
 * Provides chain switching, wallet connect/disconnect UI interactions,
 * and error capture utilities. Default selectors target example Voi dApps but
 * can be adapted to other Voi-enabled applications.
 */
const { expect } = require('@playwright/test');

const CHAIN_STORAGE_KEY = process.env.VOI_CHAIN_STORAGE_KEY || 'voi-chain-id';

/**
 * Switch to Voi chain via the ChainSelector dropdown.
 * @param {import('@playwright/test').Page} page
 */
async function switchToVoiChain(page) {
  // Click chain selector button (contains chain name text)
  var chainBtn = page.locator('button:has(span:text("Algorand")), button:has(span:text("Voi"))').first();
  await chainBtn.click();

  // Click Voi option in dropdown
  var voiOption = page.locator('button:has-text("Voi")').last();
  await voiOption.click();

  // Verify localStorage updated
  var chainId = await page.evaluate(function () {
    return localStorage.getItem(window.__voiChainKey || 'voi-chain-id');
  });
  expect(chainId).toBe('voi-mainnet');
}

/**
 * Switch to Algorand chain via the ChainSelector dropdown.
 * @param {import('@playwright/test').Page} page
 */
async function switchToAlgorandChain(page) {
  var chainBtn = page.locator('button:has(span:text("Algorand")), button:has(span:text("Voi"))').first();
  await chainBtn.click();

  var algoOption = page.locator('button:has-text("Algorand")').last();
  await algoOption.click();

  var chainId = await page.evaluate(function () {
    return localStorage.getItem(window.__voiChainKey || 'voi-chain-id');
  });
  expect(chainId).toBe('algorand-mainnet');
}

/**
 * Open the Connect Wallet modal and click the specified provider button.
 * Assumes chain is already set to Voi.
 *
 * @param {import('@playwright/test').Page} page
 * @param {'kibisis'|'lute'} provider
 */
async function connectWallet(page, provider) {
  // Find and click the Connect Wallet trigger in navbar
  // The navbar has a wallet-related button — look for common patterns
  var connectTrigger = page.locator('[data-test-id="connect-wallet"], button:has-text("Connect"), button:has-text("Wallet")').first();
  await connectTrigger.click();

  // Wait for modal to appear
  await page.waitForSelector('.ant-modal, [role="dialog"]', { state: 'visible', timeout: 5000 });

  // Click the provider button
  if (provider === 'kibisis') {
    await page.locator('button:has-text("Kibisis")').click();
  } else if (provider === 'lute') {
    await page.locator('button:has-text("Lute")').click();
  }

  // Wait for connection (mock responds in microtask)
  await page.waitForTimeout(500);
}

/**
 * Disconnect the current Voi wallet.
 * @param {import('@playwright/test').Page} page
 */
async function disconnectWallet(page) {
  // When connected, navbar shows truncated address (e.g., "NQA76E....V5BUD4") instead of "Connect"
  // Try connected state first (address with dots), then fall back to "Connect" text
  var walletArea = page.getByText(/[A-Z0-9]{3,}\.{2,}[A-Z0-9]{3,}/).first();

  var isVisible = await walletArea.isVisible().catch(function () { return false; });
  if (!isVisible) {
    walletArea = page.locator('[data-test-id="connect-wallet"], button:has-text("Connect"), button:has-text("Wallet")').first();
  }

  await walletArea.click({ timeout: 5000 });

  // Wait for modal
  await page.waitForSelector('.ant-modal, [role="dialog"]', { state: 'visible', timeout: 5000 });

  // Click Disconnect button (Voi uses "Disconnect", Algorand uses "Logout")
  var disconnectBtn = page.locator('button:has-text("Disconnect"), button:has-text("Logout")').first();
  await disconnectBtn.click();

  await page.waitForTimeout(300);
}

/**
 * Verify wallet address is displayed in the UI.
 * @param {import('@playwright/test').Page} page
 * @param {string} expectedAddress - full address or prefix to check
 * @returns {Promise<boolean>}
 */
async function verifyWalletConnected(page, expectedAddress) {
  // Check localStorage first (most reliable)
  var stored = await page.evaluate(function () {
    return localStorage.getItem('voi-wallet-connection');
  });
  if (!stored) return false;
  var parsed = JSON.parse(stored);
  return parsed.address === expectedAddress;
}

/**
 * Verify wallet is disconnected.
 * @param {import('@playwright/test').Page} page
 */
async function verifyWalletDisconnected(page) {
  var stored = await page.evaluate(function () {
    return localStorage.getItem('voi-wallet-connection');
  });
  expect(stored).toBeNull();
}

/**
 * Capture console errors during test execution.
 * Call at test start, check at test end.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {{ errors: string[], warnings: string[] }}
 */
function captureConsoleErrors(page) {
  var captured = { errors: [], warnings: [] };
  page.on('console', function (msg) {
    if (msg.type() === 'error') {
      captured.errors.push(msg.text());
    } else if (msg.type() === 'warning') {
      captured.warnings.push(msg.text());
    }
  });
  return captured;
}

/**
 * Capture network request failures.
 * @param {import('@playwright/test').Page} page
 * @returns {{ failures: Array<{url: string, status: number, method: string}> }}
 */
function captureNetworkErrors(page) {
  var captured = { failures: [] };
  page.on('response', function (response) {
    var status = response.status();
    if (status >= 400) {
      captured.failures.push({
        url: response.url(),
        status: status,
        method: response.request().method(),
      });
    }
  });
  return captured;
}

/**
 * Wait for the page to be fully loaded and chain-ready.
 * @param {import('@playwright/test').Page} page
 */
async function waitForAppReady(page) {
  // Wait for React to mount (navbar should exist)
  await page.waitForSelector('nav, header, [class*="navbar"]', { timeout: 15000 });
  // Wait for any loading spinners to disappear
  await page.waitForTimeout(1000);
}

/**
 * Verify API requests include the correct X-Chain-Id header.
 * Sets up request interception and returns a checker function.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {{ getChainHeaders: () => string[] }}
 */
function interceptApiHeaders(page) {
  var chainHeaders = [];
  page.on('request', function (request) {
    var url = request.url();
    // Only check relative API calls (same origin)
    if (url.includes('/api/')) {
      var headers = request.headers();
      if (headers['x-chain-id']) {
        chainHeaders.push(headers['x-chain-id']);
      }
    }
  });
  return { getChainHeaders: function () { return chainHeaders; } };
}

module.exports = {
  switchToVoiChain,
  switchToAlgorandChain,
  connectWallet,
  disconnectWallet,
  verifyWalletConnected,
  verifyWalletDisconnected,
  captureConsoleErrors,
  captureNetworkErrors,
  waitForAppReady,
  interceptApiHeaders,
};
