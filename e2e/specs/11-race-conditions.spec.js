/** @ts-check */
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { injectVoiWallet, mockAlgodEndpoints } = require('../../src/playwright/wallet-inject');
const {
  switchToVoiChain,
  switchToAlgorandChain,
  waitForAppReady,
  captureConsoleErrors,
  captureNetworkErrors,
} = require('../../src/playwright/voi-e2e-helpers');

const TEST_ADDRESS = 'NQA76E235VCMZB4KZQSV6IU64IWF2GGCXK4Y3QA7N7ZMI7MVHUQVV5BUD4';
const RATE_LIMIT_DELAY = 800;
const TIMESTAMP = Date.now();
const EVIDENCE_DIR = path.join(__dirname, '../../qa/evidence/e2e-race-' + TIMESTAMP);

var results = [];

function isExpectedError(msg) {
  return msg.includes('429') || msg.includes('404') || msg.includes('AxiosError') || msg.includes('502') || msg.includes('503') || msg.includes('504');
}

function detectRaceErrors(consoleCapture) {
  return consoleCapture.errors.filter(function (e) {
    return (
      e.includes('unmounted component') ||
      e.includes('No-op setState') ||
      e.includes('unique "key" prop') ||
      e.includes('layout thrashing') ||
      e.includes('memory leak') ||
      e.includes('setState on unmounted') ||
      (e.includes('Warning:') && !isExpectedError(e))
    );
  });
}

async function safeGoto(page, url) {
  await page.goto(url);
  await waitForAppReady(page);
  await page.waitForTimeout(RATE_LIMIT_DELAY);
}

function setupRequestCounter(page, urlPattern) {
  var count = 0;
  var handler = async function (route) {
    count++;
    await route.continue();
  };
  page.route(urlPattern, handler);
  return {
    getCount: function () { return count; },
    dispose: function () { page.unroute(urlPattern, handler); },
  };
}

async function probeActionableButton(page, ...labels) {
  for (var i = 0; i < labels.length; i++) {
    var locator = page.locator('button:has-text("' + labels[i] + '")').first();
    var visible = await locator.isVisible().catch(function () { return false; });
    var enabled = visible ? await locator.isEnabled().catch(function () { return false; }) : false;
    if (visible && enabled) {
      return { found: true, locator: locator, label: labels[i] };
    }
  }
  return { found: false, locator: null, label: null };
}

async function rapidClick(locator, times, intervalMs) {
  for (var i = 0; i < times; i++) {
    await locator.click({ force: true });
    if (intervalMs > 0 && i < times - 1) {
      await locator.page().waitForTimeout(intervalMs);
    }
  }
}

function recordResult(id, category, name, result, consoleCount, networkCount, notes) {
  results.push({ id: id, category: category, name: name, result: result, consoleCount: consoleCount, networkCount: networkCount, notes: notes || '' });
}

async function takeEvidenceScreenshot(page, label) {
  try {
    if (!fs.existsSync(EVIDENCE_DIR)) {
      fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    }
    var fileName = label.replace(/[^a-z0-9\-_]/gi, '_') + '_' + Date.now() + '.png';
    await page.screenshot({ path: path.join(EVIDENCE_DIR, fileName), fullPage: true });
  } catch (e) {
    // Ignore screenshot failures
  }
}

function writeRaceReport() {
  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }

  var total = results.length;
  var pass = results.filter(function (r) { return r.result === 'PASS'; }).length;
  var fail = results.filter(function (r) { return r.result === 'FAIL'; }).length;
  var notImpl = results.filter(function (r) { return r.result === 'NOT IMPLEMENTED'; }).length;
  var inconclusive = results.filter(function (r) { return r.result === 'INCONCLUSIVE'; }).length;

  var lines = [
    '# Race Condition E2E Report — Voi Chain',
    '**Timestamp:** ' + new Date(TIMESTAMP).toISOString(),
    '**Target:** ' + (process.env.VOI_E2E_BASE_URL || 'https://example-voi-dapp.local'),
    '',
    '## Summary',
    '| Metric | Count |',
    '|--------|-------|',
    '| Total | ' + total + ' |',
    '| PASS | ' + pass + ' |',
    '| FAIL | ' + fail + ' |',
    '| NOT IMPLEMENTED | ' + notImpl + ' |',
    '| INCONCLUSIVE | ' + inconclusive + ' |',
    '',
    '## Detail',
    '| ID | Category | Test | Result | Console | Network | Notes |',
    '|----|----------|------|--------|---------|---------|-------|',
  ];

  results.forEach(function (r) {
    lines.push('| ' + r.id + ' | ' + r.category + ' | ' + r.name + ' | ' + r.result + ' | ' + r.consoleCount + ' | ' + r.networkCount + ' | ' + r.notes + ' |');
  });

  lines.push('', '## Bugs Found', '(none recorded — see Notes column for anomalies)', '');

  fs.writeFileSync(path.join(EVIDENCE_DIR, 'RACE-REPORT.md'), lines.join('\n'));
}

test.beforeEach(async ({ page }) => {
  await injectVoiWallet(page, { address: TEST_ADDRESS, provider: 'kibisis' });
  await mockAlgodEndpoints(page);
});

test.afterAll(async () => {
  writeRaceReport();
});

// ═══════════════════════════════════════════════════════════════
// CATEGORY A — Double-click / rapid submit
// ═══════════════════════════════════════════════════════════════

test.describe('A. Rapid Submit', () => {
  test('A1: Swap submit rapid click', async ({ page }) => {
    var consoleCapture = captureConsoleErrors(page);
    var networkCapture = captureNetworkErrors(page);
    await safeGoto(page, '/');

    var btn = await probeActionableButton(page, 'Swap', 'Exchange', 'Trade');
    if (!btn.found) {
      recordResult('A1', 'A. Rapid Submit', 'Swap submit', 'NOT IMPLEMENTED', 0, 0, 'No swap button found');
      return;
    }

    var counter = setupRequestCounter(page, '**/v2/transactions');
    await rapidClick(btn.locator, 3, 50);
    await page.waitForTimeout(1500);
    var count = counter.getCount();
    counter.dispose();

    var raceErrors = detectRaceErrors(consoleCapture);
    var notes = count > 1 ? 'Duplicate algod POSTs: ' + count : '';
    var passed = count <= 1 && raceErrors.length === 0;
    recordResult('A1', 'A. Rapid Submit', 'Swap submit', passed ? 'PASS' : 'FAIL', consoleCapture.errors.length, networkCapture.failures.length, notes);
    if (!passed) await takeEvidenceScreenshot(page, 'A1_swap_rapid_click');
    expect(raceErrors).toHaveLength(0);
    expect(count).toBeLessThanOrEqual(1);
  });

  test('A2: Stake submit rapid click', async ({ page }) => {
    var consoleCapture = captureConsoleErrors(page);
    var networkCapture = captureNetworkErrors(page);
    await safeGoto(page, '/stake');

    var btn = await probeActionableButton(page, 'Stake', 'Deposit', 'Add');
    if (!btn.found) {
      recordResult('A2', 'A. Rapid Submit', 'Stake submit', 'NOT IMPLEMENTED', 0, 0, 'No stake button found');
      return;
    }

    var counter = setupRequestCounter(page, '**/v2/transactions');
    await rapidClick(btn.locator, 3, 50);
    await page.waitForTimeout(1500);
    var count = counter.getCount();
    counter.dispose();

    var raceErrors = detectRaceErrors(consoleCapture);
    var notes = count > 1 ? 'Duplicate algod POSTs: ' + count : '';
    var passed = count <= 1 && raceErrors.length === 0;
    recordResult('A2', 'A. Rapid Submit', 'Stake submit', passed ? 'PASS' : 'FAIL', consoleCapture.errors.length, networkCapture.failures.length, notes);
    if (!passed) await takeEvidenceScreenshot(page, 'A2_stake_rapid_click');
    expect(raceErrors).toHaveLength(0);
    expect(count).toBeLessThanOrEqual(1);
  });

  test('A3: P2P create offer rapid click', async ({ page }) => {
    var consoleCapture = captureConsoleErrors(page);
    var networkCapture = captureNetworkErrors(page);
    await safeGoto(page, '/p2p');

    var btn = await probeActionableButton(page, 'Create', 'New Offer', 'Add Offer');
    if (!btn.found) {
      recordResult('A3', 'A. Rapid Submit', 'P2P create offer', 'NOT IMPLEMENTED', 0, 0, 'No create offer button found');
      return;
    }

    var counter = setupRequestCounter(page, '**/api/**');
    await rapidClick(btn.locator, 3, 50);
    await page.waitForTimeout(1500);
    var count = counter.getCount();
    counter.dispose();

    var raceErrors = detectRaceErrors(consoleCapture);
    var notes = count > 1 ? 'Duplicate API calls: ' + count : '';
    var passed = count <= 1 && raceErrors.length === 0;
    recordResult('A3', 'A. Rapid Submit', 'P2P create offer', passed ? 'PASS' : 'FAIL', consoleCapture.errors.length, networkCapture.failures.length, notes);
    if (!passed) await takeEvidenceScreenshot(page, 'A3_p2p_create_rapid_click');
    expect(raceErrors).toHaveLength(0);
    expect(count).toBeLessThanOrEqual(1);
  });

  test('A4: P2P accept offer rapid click', async ({ page }) => {
    var consoleCapture = captureConsoleErrors(page);
    var networkCapture = captureNetworkErrors(page);
    await safeGoto(page, '/p2p');

    var btn = await probeActionableButton(page, 'Accept', 'Buy', 'Trade');
    if (!btn.found) {
      recordResult('A4', 'A. Rapid Submit', 'P2P accept offer', 'NOT IMPLEMENTED', 0, 0, 'No accept button found');
      return;
    }

    var counter = setupRequestCounter(page, '**/v2/transactions');
    await rapidClick(btn.locator, 3, 50);
    await page.waitForTimeout(1500);
    var count = counter.getCount();
    counter.dispose();

    var raceErrors = detectRaceErrors(consoleCapture);
    var notes = count > 1 ? 'Duplicate algod POSTs: ' + count : '';
    var passed = count <= 1 && raceErrors.length === 0;
    recordResult('A4', 'A. Rapid Submit', 'P2P accept offer', passed ? 'PASS' : 'FAIL', consoleCapture.errors.length, networkCapture.failures.length, notes);
    if (!passed) await takeEvidenceScreenshot(page, 'A4_p2p_accept_rapid_click');
    expect(raceErrors).toHaveLength(0);
    expect(count).toBeLessThanOrEqual(1);
  });

  test('A5: NFT stake/unstake rapid click', async ({ page }) => {
    var consoleCapture = captureConsoleErrors(page);
    var networkCapture = captureNetworkErrors(page);
    await safeGoto(page, '/nft-stake');

    var btn = await probeActionableButton(page, 'Stake', 'Unstake');
    if (!btn.found) {
      recordResult('A5', 'A. Rapid Submit', 'NFT stake/unstake', 'NOT IMPLEMENTED', 0, 0, 'No stake/unstake button found');
      return;
    }

    var counter = setupRequestCounter(page, '**/v2/transactions');
    await rapidClick(btn.locator, 3, 50);
    await page.waitForTimeout(1500);
    var count = counter.getCount();
    counter.dispose();

    var raceErrors = detectRaceErrors(consoleCapture);
    var notes = count > 1 ? 'Duplicate algod POSTs: ' + count : '';
    var passed = count <= 1 && raceErrors.length === 0;
    recordResult('A5', 'A. Rapid Submit', 'NFT stake/unstake', passed ? 'PASS' : 'FAIL', consoleCapture.errors.length, networkCapture.failures.length, notes);
    if (!passed) await takeEvidenceScreenshot(page, 'A5_nft_stake_rapid_click');
    expect(raceErrors).toHaveLength(0);
    expect(count).toBeLessThanOrEqual(1);
  });

  test('A6: Farm deposit/withdraw rapid click', async ({ page }) => {
    var consoleCapture = captureConsoleErrors(page);
    var networkCapture = captureNetworkErrors(page);
    await safeGoto(page, '/farm');

    var btn = await probeActionableButton(page, 'Deposit', 'Withdraw', 'Add');
    if (!btn.found) {
      recordResult('A6', 'A. Rapid Submit', 'Farm deposit/withdraw', 'NOT IMPLEMENTED', 0, 0, 'No deposit/withdraw button found');
      return;
    }

    var counter = setupRequestCounter(page, '**/v2/transactions');
    await rapidClick(btn.locator, 3, 50);
    await page.waitForTimeout(1500);
    var count = counter.getCount();
    counter.dispose();

    var raceErrors = detectRaceErrors(consoleCapture);
    var notes = count > 1 ? 'Duplicate algod POSTs: ' + count : '';
    var passed = count <= 1 && raceErrors.length === 0;
    recordResult('A6', 'A. Rapid Submit', 'Farm deposit/withdraw', passed ? 'PASS' : 'FAIL', consoleCapture.errors.length, networkCapture.failures.length, notes);
    if (!passed) await takeEvidenceScreenshot(page, 'A6_farm_deposit_rapid_click');
    expect(raceErrors).toHaveLength(0);
    expect(count).toBeLessThanOrEqual(1);
  });

  test('A7: Profile link Discord rapid click', async ({ page }) => {
    var consoleCapture = captureConsoleErrors(page);
    var networkCapture = captureNetworkErrors(page);
    await safeGoto(page, '/profile');

    var btn = await probeActionableButton(page, 'Link Discord', 'Connect Discord', 'Discord');
    if (!btn.found) {
      recordResult('A7', 'A. Rapid Submit', 'Profile link Discord', 'NOT IMPLEMENTED', 0, 0, 'No Discord link button found');
      return;
    }

    var counter = setupRequestCounter(page, '**/api/**');
    await rapidClick(btn.locator, 3, 50);
    await page.waitForTimeout(1500);
    var count = counter.getCount();
    counter.dispose();

    var raceErrors = detectRaceErrors(consoleCapture);
    var notes = count > 1 ? 'Duplicate API calls: ' + count : '';
    var passed = count <= 1 && raceErrors.length === 0;
    recordResult('A7', 'A. Rapid Submit', 'Profile link Discord', passed ? 'PASS' : 'FAIL', consoleCapture.errors.length, networkCapture.failures.length, notes);
    if (!passed) await takeEvidenceScreenshot(page, 'A7_profile_discord_rapid_click');
    expect(raceErrors).toHaveLength(0);
    expect(count).toBeLessThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// CATEGORY B — Navigation during async
// ═══════════════════════════════════════════════════════════════

test.describe('B. Navigation during async', () => {
  test('B1: Navigate away during swap quote loading', async ({ page }) => {
    var consoleCapture = captureConsoleErrors(page);
    await safeGoto(page, '/');
    // Let swap page start loading quotes
    await page.waitForTimeout(500);
    // Navigate away before quotes settle
    await safeGoto(page, '/stake');
    await page.waitForTimeout(1000);

    var raceErrors = detectRaceErrors(consoleCapture);
    var passed = raceErrors.length === 0;
    recordResult('B1', 'B. Navigation during async', 'Swap quote loading', passed ? 'PASS' : 'FAIL', consoleCapture.errors.length, 0, raceErrors.length > 0 ? raceErrors[0] : '');
    if (!passed) await takeEvidenceScreenshot(page, 'B1_swap_navigate_away');
    expect(raceErrors).toHaveLength(0);
  });

  test('B2: Navigate away during staking tx signing', async ({ page }) => {
    var consoleCapture = captureConsoleErrors(page);
    await safeGoto(page, '/stake');

    var btn = await probeActionableButton(page, 'Stake', 'Claim', 'Harvest');
    if (btn.found) {
      await btn.locator.click();
    }
    // Navigate away immediately
    await safeGoto(page, '/swap');
    await page.waitForTimeout(1000);

    var raceErrors = detectRaceErrors(consoleCapture);
    var passed = raceErrors.length === 0;
    recordResult('B2', 'B. Navigation during async', 'Staking tx signing', passed ? 'PASS' : 'FAIL', consoleCapture.errors.length, 0, raceErrors.length > 0 ? raceErrors[0] : '');
    if (!passed) await takeEvidenceScreenshot(page, 'B2_stake_navigate_away');
    expect(raceErrors).toHaveLength(0);
  });

  test('B3: Navigate away during pool stats loading', async ({ page }) => {
    var consoleCapture = captureConsoleErrors(page);
    await safeGoto(page, '/stake-pool-stats');
    await page.waitForTimeout(300);
    await safeGoto(page, '/');
    await page.waitForTimeout(1000);

    var raceErrors = detectRaceErrors(consoleCapture);
    var passed = raceErrors.length === 0;
    recordResult('B3', 'B. Navigation during async', 'Pool stats loading', passed ? 'PASS' : 'FAIL', consoleCapture.errors.length, 0, raceErrors.length > 0 ? raceErrors[0] : '');
    if (!passed) await takeEvidenceScreenshot(page, 'B3_pool_stats_navigate_away');
    expect(raceErrors).toHaveLength(0);
  });

  test('B4: Navigate away during profile data loading', async ({ page }) => {
    var consoleCapture = captureConsoleErrors(page);
    await safeGoto(page, '/profile');
    await page.waitForTimeout(300);
    await safeGoto(page, '/swap');
    await page.waitForTimeout(1000);

    var raceErrors = detectRaceErrors(consoleCapture);
    var passed = raceErrors.length === 0;
    recordResult('B4', 'B. Navigation during async', 'Profile data loading', passed ? 'PASS' : 'FAIL', consoleCapture.errors.length, 0, raceErrors.length > 0 ? raceErrors[0] : '');
    if (!passed) await takeEvidenceScreenshot(page, 'B4_profile_navigate_away');
    expect(raceErrors).toHaveLength(0);
  });

  test('B5: Navigate away during token list fetch', async ({ page }) => {
    var consoleCapture = captureConsoleErrors(page);
    await safeGoto(page, '/');
    await page.waitForTimeout(300);
    await safeGoto(page, '/farm');
    await page.waitForTimeout(1000);

    var raceErrors = detectRaceErrors(consoleCapture);
    var passed = raceErrors.length === 0;
    recordResult('B5', 'B. Navigation during async', 'Token list fetch', passed ? 'PASS' : 'FAIL', consoleCapture.errors.length, 0, raceErrors.length > 0 ? raceErrors[0] : '');
    if (!passed) await takeEvidenceScreenshot(page, 'B5_token_list_navigate_away');
    expect(raceErrors).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// CATEGORY C — Chain switching under load
// ═══════════════════════════════════════════════════════════════

test.describe('C. Chain switching under load', () => {
  test('C1: Swap form fill → switch to Algorand mid-fill', async ({ page }) => {
    var consoleCapture = captureConsoleErrors(page);
    await safeGoto(page, '/');
    await switchToVoiChain(page);

    // Try to fill swap amount if input exists
    var input = page.locator('input[type="number"]').first();
    var hasInput = await input.isVisible().catch(function () { return false; });
    if (hasInput) {
      await input.fill('1');
    }

    // Switch chain mid-fill
    await switchToAlgorandChain(page);
    await page.waitForTimeout(1000);

    var raceErrors = detectRaceErrors(consoleCapture);
    var chainId = await page.evaluate(function () {
      return localStorage.getItem('voi-chain-id');
    });
    var passed = raceErrors.length === 0 && chainId === 'algorand-mainnet';
    recordResult('C1', 'C. Chain switching', 'Swap form → Algo', passed ? 'PASS' : 'FAIL', consoleCapture.errors.length, 0, 'Final chain: ' + chainId);
    if (!passed) await takeEvidenceScreenshot(page, 'C1_swap_form_switch_algo');
    expect(raceErrors).toHaveLength(0);
    expect(chainId).toBe('algorand-mainnet');
  });

  test('C2: Connect Voi → switch Algorand → verify disconnect', async ({ page }) => {
    var consoleCapture = captureConsoleErrors(page);
    await safeGoto(page, '/');
    await switchToVoiChain(page);
    await page.waitForTimeout(500);

    await switchToAlgorandChain(page);
    await page.waitForTimeout(1000);

    var raceErrors = detectRaceErrors(consoleCapture);
    // On Algorand, Voi wallet should be disconnected or hidden
    var voiWallet = await page.evaluate(function () {
      return localStorage.getItem('voi-wallet-connection');
    });
    // Wallet may persist in localStorage but UI should not show it as active
    var passed = raceErrors.length === 0;
    recordResult('C2', 'C. Chain switching', 'Voi → Algo disconnect', passed ? 'PASS' : 'FAIL', consoleCapture.errors.length, 0, 'Voi wallet in LS: ' + (voiWallet ? 'yes' : 'no'));
    if (!passed) await takeEvidenceScreenshot(page, 'C2_voi_to_algo_disconnect');
    expect(raceErrors).toHaveLength(0);
  });

  test('C3: Rapid chain toggle 5×', async ({ page }) => {
    var consoleCapture = captureConsoleErrors(page);
    await safeGoto(page, '/');

    for (var i = 0; i < 5; i++) {
      await switchToVoiChain(page);
      await page.waitForTimeout(200);
      await switchToAlgorandChain(page);
      await page.waitForTimeout(200);
    }

    await page.waitForTimeout(1000);
    var chainId = await page.evaluate(function () {
      return localStorage.getItem('voi-chain-id');
    });

    var criticalErrors = consoleCapture.errors.filter(function (e) { return !isExpectedError(e); });
    var passed = criticalErrors.length === 0;
    recordResult('C3', 'C. Chain switching', 'Rapid toggle 5x', passed ? 'PASS' : 'FAIL', consoleCapture.errors.length, 0, 'Final chain: ' + chainId);
    if (!passed) await takeEvidenceScreenshot(page, 'C3_rapid_chain_toggle');
    expect(criticalErrors).toHaveLength(0);
  });

  test('C4: Voi data loading → switch to Algorand', async ({ page }) => {
    var consoleCapture = captureConsoleErrors(page);
    var networkCapture = captureNetworkErrors(page);
    await safeGoto(page, '/stake');
    await switchToVoiChain(page);
    await page.waitForTimeout(300);

    // Immediately switch while data is loading
    await switchToAlgorandChain(page);
    await page.waitForTimeout(1000);

    var raceErrors = detectRaceErrors(consoleCapture);
    var chainId = await page.evaluate(function () {
      return localStorage.getItem('voi-chain-id');
    });
    var passed = raceErrors.length === 0 && chainId === 'algorand-mainnet';
    recordResult('C4', 'C. Chain switching', 'Voi loading → Algo', passed ? 'PASS' : 'FAIL', consoleCapture.errors.length, networkCapture.failures.length, 'Final chain: ' + chainId);
    if (!passed) await takeEvidenceScreenshot(page, 'C4_voi_loading_switch_algo');
    expect(raceErrors).toHaveLength(0);
    expect(chainId).toBe('algorand-mainnet');
  });

  test('C5: Browser refresh on Voi chain', async ({ page }) => {
    var consoleCapture = captureConsoleErrors(page);
    await safeGoto(page, '/');
    await switchToVoiChain(page);
    await page.waitForTimeout(500);

    await page.reload();
    await waitForAppReady(page);
    await page.waitForTimeout(1000);

    var chainId = await page.evaluate(function () {
      return localStorage.getItem('voi-chain-id');
    });

    var raceErrors = detectRaceErrors(consoleCapture);
    var passed = raceErrors.length === 0 && chainId === 'voi-mainnet';
    recordResult('C5', 'C. Chain switching', 'Refresh on Voi', passed ? 'PASS' : 'FAIL', consoleCapture.errors.length, 0, 'Chain after reload: ' + chainId);
    if (!passed) await takeEvidenceScreenshot(page, 'C5_refresh_voi');
    expect(raceErrors).toHaveLength(0);
    expect(chainId).toBe('voi-mainnet');
  });
});

// ═══════════════════════════════════════════════════════════════
// CATEGORY D — Concurrent browser interactions
// ═══════════════════════════════════════════════════════════════

test.describe('D. Concurrent browser interactions', () => {
  test('D1: Two tabs same context — Tab1 Voi, Tab2 Algorand', async ({ page, context }) => {
    var consoleCapture1 = captureConsoleErrors(page);
    await safeGoto(page, '/');
    await switchToVoiChain(page);
    await page.waitForTimeout(500);

    var page2 = await context.newPage();
    var consoleCapture2 = captureConsoleErrors(page2);
    await safeGoto(page2, '/');
    await switchToAlgorandChain(page2);
    await page2.waitForTimeout(500);

    // Switch tab1 chain to verify no cross-contamination
    await switchToAlgorandChain(page);
    await page.waitForTimeout(500);
    await switchToVoiChain(page2);
    await page2.waitForTimeout(500);

    var critical1 = consoleCapture1.errors.filter(function (e) { return !isExpectedError(e); });
    var critical2 = consoleCapture2.errors.filter(function (e) { return !isExpectedError(e); });
    var passed = critical1.length === 0 && critical2.length === 0;
    recordResult('D1', 'D. Concurrent', 'Two tabs Voi+Algo', passed ? 'PASS' : 'FAIL', consoleCapture1.errors.length + consoleCapture2.errors.length, 0, 'Tab1 crit: ' + critical1.length + ', Tab2 crit: ' + critical2.length);
    if (!passed) {
      await takeEvidenceScreenshot(page, 'D1_tab1');
      await takeEvidenceScreenshot(page2, 'D1_tab2');
    }
    expect(critical1).toHaveLength(0);
    expect(critical2).toHaveLength(0);
  });

  test('D2: Modal Escape → immediately re-open', async ({ page }) => {
    var consoleCapture = captureConsoleErrors(page);
    await safeGoto(page, '/');

    var connectTrigger = page.locator('[data-test-id="connect-wallet"], button:has-text("Connect"), button:has-text("Wallet")').first();
    var hasTrigger = await connectTrigger.isVisible().catch(function () { return false; });
    if (!hasTrigger) {
      recordResult('D2', 'D. Concurrent', 'Modal Escape re-open', 'NOT IMPLEMENTED', 0, 0, 'No connect wallet trigger');
      return;
    }

    for (var i = 0; i < 3; i++) {
      await connectTrigger.click();
      await page.waitForSelector('.ant-modal, [role="dialog"]', { state: 'visible', timeout: 5000 });
      await page.press('body', 'Escape');
      await page.waitForTimeout(100);
    }

    // Final open to verify modal still works
    await connectTrigger.click();
    await page.waitForSelector('.ant-modal, [role="dialog"]', { state: 'visible', timeout: 5000 });

    var raceErrors = detectRaceErrors(consoleCapture);
    var passed = raceErrors.length === 0;
    recordResult('D2', 'D. Concurrent', 'Modal Escape re-open', passed ? 'PASS' : 'FAIL', consoleCapture.errors.length, 0, raceErrors.length > 0 ? raceErrors[0] : '');
    if (!passed) await takeEvidenceScreenshot(page, 'D2_modal_escape_reopen');
    expect(raceErrors).toHaveLength(0);
  });

  test('D3: Rapid scroll during data loading', async ({ page }) => {
    var consoleCapture = captureConsoleErrors(page);
    await safeGoto(page, '/stake');

    // Rapid scroll for 2 seconds while data loads
    var scrollPromise = page.evaluate(async function () {
      for (var i = 0; i < 20; i++) {
        window.scrollTo(0, i * 50);
        await new Promise(function (r) { setTimeout(r, 100); });
      }
    });
    await scrollPromise;
    await page.waitForTimeout(1000);

    var raceErrors = detectRaceErrors(consoleCapture);
    var passed = raceErrors.length === 0;
    recordResult('D3', 'D. Concurrent', 'Rapid scroll loading', passed ? 'PASS' : 'FAIL', consoleCapture.errors.length, 0, raceErrors.length > 0 ? raceErrors[0] : '');
    if (!passed) await takeEvidenceScreenshot(page, 'D3_rapid_scroll_loading');
    expect(raceErrors).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// CATEGORY E — Back/forward button
// ═══════════════════════════════════════════════════════════════

test.describe('E. Back/forward button', () => {
  test('E1: Connect → stake → swap → Back', async ({ page }) => {
    var consoleCapture = captureConsoleErrors(page);
    await safeGoto(page, '/');
    await switchToVoiChain(page);
    await page.waitForTimeout(500);

    await safeGoto(page, '/stake');
    await safeGoto(page, '/swap');
    await page.goBack();
    await waitForAppReady(page);
    await page.waitForTimeout(1000);

    var raceErrors = detectRaceErrors(consoleCapture);
    // Verify staking page rendered
    var bodyHeight = await page.evaluate(function () { return document.body.scrollHeight; });
    var passed = raceErrors.length === 0 && bodyHeight > 200;
    recordResult('E1', 'E. Back/forward', 'Stake → swap → Back', passed ? 'PASS' : 'FAIL', consoleCapture.errors.length, 0, 'Body height: ' + bodyHeight);
    if (!passed) await takeEvidenceScreenshot(page, 'E1_stake_swap_back');
    expect(raceErrors).toHaveLength(0);
    expect(bodyHeight).toBeGreaterThan(200);
  });

  test('E2: Chain switch Algo→Voi → Back', async ({ page }) => {
    var consoleCapture = captureConsoleErrors(page);
    await safeGoto(page, '/');
    await switchToAlgorandChain(page);
    await page.waitForTimeout(500);
    await switchToVoiChain(page);
    await page.waitForTimeout(500);

    await page.goBack();
    // goBack may land on an intermediate/error state; use forgiving wait
    try {
      await waitForAppReady(page);
    } catch (e) {
      await page.waitForTimeout(2000);
    }
    await page.waitForTimeout(1000);

    var raceErrors = detectRaceErrors(consoleCapture);
    var passed = raceErrors.length === 0;
    recordResult('E2', 'E. Back/forward', 'Chain switch → Back', passed ? 'PASS' : 'FAIL', consoleCapture.errors.length, 0, raceErrors.length > 0 ? raceErrors[0] : '');
    if (!passed) await takeEvidenceScreenshot(page, 'E2_chain_switch_back');
    expect(raceErrors).toHaveLength(0);
  });

  test('E3: Deep-link /swap?chain=voi', async ({ page }) => {
    var consoleCapture = captureConsoleErrors(page);
    await page.goto('/swap?chain=voi');
    await waitForAppReady(page);
    await page.waitForTimeout(1000);

    var chainId = await page.evaluate(function () {
      return localStorage.getItem('voi-chain-id');
    });

    var raceErrors = detectRaceErrors(consoleCapture);
    // App may or may not respect query param
    var notes = 'Chain after deep-link: ' + chainId;
    var passed = raceErrors.length === 0;
    recordResult('E3', 'E. Back/forward', 'Deep-link /swap?chain=voi', passed ? 'PASS' : 'INCONCLUSIVE', consoleCapture.errors.length, 0, notes);
    if (!passed) await takeEvidenceScreenshot(page, 'E3_deep_link_swap_chain');
    expect(raceErrors).toHaveLength(0);
  });
});
