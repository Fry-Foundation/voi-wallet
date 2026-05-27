/**
 * Lute Wallet Mock — Playwright addInitScript
 *
 * Emulates the Lute browser extension's CustomEvent-based protocol.
 * When window.lute is truthy, lute-connect uses extension mode (CustomEvents)
 * instead of popup mode (window.open + postMessage).
 *
 * Protocol:
 * - dApp dispatches: CustomEvent("lute-connect", { detail: { action, ... } })
 * - Extension responds: CustomEvent("{action}-response", { detail: { action, ... } })
 *
 * Usage: page.addInitScript({ path: require.resolve('./lute-mock.js') })
 * Requires: window.__voiTestWallet = { address: "VOI_ADDR...", provider: "lute" }
 */
(function () {
  'use strict';

  // Signal extension mode to lute-connect SDK
  window.lute = true;

  function getConfig() {
    return window.__voiTestWallet;
  }

  // Listen for all lute-connect requests
  window.addEventListener('lute-connect', function (event) {
    var config = getConfig();
    if (!config || config.provider !== 'lute') return;

    var detail = event.detail;
    if (!detail || !detail.action) return;

    switch (detail.action) {
      case 'connect':
        // Respond with wallet addresses
        Promise.resolve().then(function () {
          window.dispatchEvent(new CustomEvent('connect-response', {
            detail: {
              action: 'connect',
              addrs: [config.address],
            },
          }));
        });
        break;

      case 'sign':
        // Sign transactions — return mock signed txn bytes
        var txns = detail.txns || [];
        var signedTxns = txns.map(function () {
          // Return Uint8Array(64) — mock signature bytes
          return new Uint8Array(64);
        });

        Promise.resolve().then(function () {
          window.dispatchEvent(new CustomEvent('sign-txns-response', {
            detail: {
              action: 'signed',
              txns: signedTxns,
            },
          }));
        });
        break;

      case 'data':
        // Sign data — return mock signature response
        Promise.resolve().then(function () {
          window.dispatchEvent(new CustomEvent('sign-data-response', {
            detail: {
              action: 'signed',
              signerResponse: {
                signature: btoa(String.fromCharCode.apply(null, new Uint8Array(64))),
                address: config.address,
              },
            },
          }));
        });
        break;

      case 'network':
        // Add network — acknowledge
        Promise.resolve().then(function () {
          window.dispatchEvent(new CustomEvent('add-network-response', {
            detail: { action: 'added' },
          }));
        });
        break;

      default:
        // Unknown action — ignore
        break;
    }
  });

  // Mark mock as active for test assertions
  window.__luteMockActive = true;
})();
