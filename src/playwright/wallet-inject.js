/**
 * Wallet Injection Helper — Playwright page setup
 *
 * Configures a Playwright page to emulate a connected Voi wallet.
 * Injects the appropriate mock (ARC-0027 or Lute) and pre-sets localStorage
 * so the page sees an already-connected wallet on load.
 */
const path = require('path');

const ARC0027_MOCK_PATH = path.join(__dirname, 'arc0027-mock.js');
const LUTE_MOCK_PATH = path.join(__dirname, 'lute-mock.js');

const VOI_WALLET_STORAGE_KEY = 'voi-wallet-connection';
const CHAIN_STORAGE_KEY = process.env.VOI_CHAIN_STORAGE_KEY || 'voi-chain-id';

/**
 * Inject a Voi test wallet into a Playwright page.
 * Call BEFORE page.goto() for the mocks to intercept app initialization.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} opts
 * @param {string} opts.address - Voi wallet address
 * @param {'kibisis'|'lute'} opts.provider - Which wallet provider to emulate
 */
async function injectVoiWallet(page, { address, provider }) {
  // Set wallet config for mocks to read
  await page.addInitScript(function (config) {
    window.__voiTestWallet = config;
  }, { address, provider });

  // Inject the appropriate protocol mock
  if (provider === 'kibisis') {
    await page.addInitScript({ path: ARC0027_MOCK_PATH });
  } else if (provider === 'lute') {
    await page.addInitScript({ path: LUTE_MOCK_PATH });
  }

  // Pre-set localStorage so VoiWalletContext shows wallet as connected on mount
  await page.addInitScript(function (opts) {
    try {
      localStorage.setItem('voi-wallet-connection', JSON.stringify({
        address: opts.address,
        provider: opts.provider,
      }));
      localStorage.setItem(opts.chainKey, 'voi-mainnet');
    } catch (e) {
      // localStorage may not be available in some contexts
    }
  }, { address, provider, chainKey: CHAIN_STORAGE_KEY });
}

/**
 * Mock Voi algod endpoints to prevent real transaction submission.
 * Intercepts algod transaction endpoints to prevent real submission during tests.
 *
 * @param {import('@playwright/test').Page} page
 */
async function mockAlgodEndpoints(page) {
  var txCounter = 0;

  // Intercept transaction submission
  await page.route('**/v2/transactions', async (route) => {
    var method = route.request().method();
    if (method === 'POST') {
      txCounter++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ txId: 'mock-txid-' + txCounter }),
      });
    } else {
      await route.continue();
    }
  });

  // Intercept pending transaction lookup (waitForConfirmation)
  await page.route('**/v2/transactions/pending/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        'confirmed-round': 99999,
        'pool-error': '',
        txn: {},
      }),
    });
  });
}

/**
 * Clear injected wallet state. Call to simulate disconnect.
 *
 * @param {import('@playwright/test').Page} page
 */
async function disconnectVoiWallet(page) {
  await page.evaluate(function () {
    localStorage.removeItem('voi-wallet-connection');
    window.__voiTestWallet = null;
  });
}

/**
 * Inject wallet without pre-setting localStorage (for testing fresh connect flow).
 * The mock is active but the app doesn't see a saved connection.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} opts
 * @param {string} opts.address
 * @param {'kibisis'|'lute'} opts.provider
 */
async function injectWalletMockOnly(page, { address, provider }) {
  await page.addInitScript(function (config) {
    window.__voiTestWallet = config;
  }, { address, provider });

  if (provider === 'kibisis') {
    await page.addInitScript({ path: ARC0027_MOCK_PATH });
  } else if (provider === 'lute') {
    await page.addInitScript({ path: LUTE_MOCK_PATH });
  }

  // Set chain to Voi but do NOT set wallet connection
  await page.addInitScript(function (chainKey) {
    try {
      localStorage.setItem(chainKey, 'voi-mainnet');
    } catch (e) {}
  }, CHAIN_STORAGE_KEY);
}

module.exports = {
  injectVoiWallet,
  injectWalletMockOnly,
  mockAlgodEndpoints,
  disconnectVoiWallet,
  ARC0027_MOCK_PATH,
  LUTE_MOCK_PATH,
  VOI_WALLET_STORAGE_KEY,
  CHAIN_STORAGE_KEY,
};
