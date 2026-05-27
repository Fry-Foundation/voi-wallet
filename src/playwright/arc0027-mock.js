/**
 * ARC-0027 Kibisis Wallet Mock — Playwright addInitScript
 *
 * Emulates the Kibisis wallet extension's response to ARC-0027 protocol
 * messages from @agoralabs-sh/avm-web-provider's AVMWebClient.
 *
 * Protocol: CustomEvent-based (NOT BroadcastChannel).
 * - Request events: "arc0027:{method}:request" with detail = RequestMessage object
 * - Response events: "arc0027:{method}:response" with detail = JSON.stringify(ResponseMessage)
 *
 * Usage: page.addInitScript({ path: require.resolve('./arc0027-mock.js') })
 * Requires: window.__voiTestWallet = { address: "VOI_ADDR..." } set before page load.
 */
(function () {
  'use strict';

  // Wait for __voiTestWallet config (set by wallet-inject.js via addInitScript)
  function getConfig() {
    return window.__voiTestWallet;
  }

  function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback for environments without crypto.randomUUID
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // --- Enable handler (connect wallet) ---
  window.addEventListener('arc0027:enable:request', function (event) {
    var config = getConfig();
    if (!config || config.provider !== 'kibisis') return;

    var request = event.detail;
    if (!request || !request.id) return;

    var responseId = generateUUID();
    var responseReference = 'arc0027:enable:response';

    var response = {
      id: responseId,
      reference: responseReference,
      requestId: request.id,
      result: {
        accounts: [{ address: config.address, name: 'Test Wallet' }],
        genesisHash: request.params && request.params.genesisHash
          ? request.params.genesisHash
          : 'IXnoWtviVVJW5LGivNFc0Dq14V3kqaXuK2u5OQrdVZo=',
        genesisId: 'voimain-v1.0',
        providerId: 'kibisis-mock',
        sessionId: generateUUID(),
      },
    };

    // Respond async (microtask) to match real extension timing
    Promise.resolve().then(function () {
      window.dispatchEvent(new CustomEvent(responseReference, {
        detail: JSON.stringify(response),
      }));
    });
  });

  // --- Sign Transactions handler ---
  window.addEventListener('arc0027:sign_transactions:request', function (event) {
    var config = getConfig();
    if (!config || config.provider !== 'kibisis') return;

    var request = event.detail;
    if (!request || !request.id) return;

    var responseId = generateUUID();
    var responseReference = 'arc0027:sign_transactions:response';

    // Generate mock signed transactions (same count as input)
    var txns = (request.params && request.params.txns) || [];
    var stxns = txns.map(function (txnObj) {
      // Return a mock signed txn — base64 of 64 zero bytes (dummy signature + original txn indicator)
      // Real signatures are 64 bytes; we prefix the original txn bytes for recognizability
      var originalB64 = typeof txnObj === 'string' ? txnObj : (txnObj.txn || '');
      // Create a plausible signed txn blob (msgpack-ish header + signature + txn)
      // For mocking purposes, just return 128 bytes of identifiable mock data
      var mockBytes = new Uint8Array(128);
      mockBytes[0] = 0x82; // mock msgpack map header
      mockBytes[1] = 0x73; // 's' for sig
      mockBytes[2] = 0x69; // 'i'
      mockBytes[3] = 0x67; // 'g'
      // Convert to base64
      var binary = '';
      for (var i = 0; i < mockBytes.length; i++) {
        binary += String.fromCharCode(mockBytes[i]);
      }
      return btoa(binary);
    });

    var response = {
      id: responseId,
      reference: responseReference,
      requestId: request.id,
      result: { stxns: stxns },
    };

    Promise.resolve().then(function () {
      window.dispatchEvent(new CustomEvent(responseReference, {
        detail: JSON.stringify(response),
      }));
    });
  });

  // --- Discover handler (optional — some dApps call this) ---
  window.addEventListener('arc0027:discover:request', function (event) {
    var config = getConfig();
    if (!config || config.provider !== 'kibisis') return;

    var request = event.detail;
    if (!request || !request.id) return;

    var responseId = generateUUID();
    var responseReference = 'arc0027:discover:response';

    var response = {
      id: responseId,
      reference: responseReference,
      requestId: request.id,
      result: {
        host: 'kibisis-mock',
        icon: '',
        name: 'Kibisis (Mock)',
        networks: [
          {
            genesisHash: 'IXnoWtviVVJW5LGivNFc0Dq14V3kqaXuK2u5OQrdVZo=',
            genesisId: 'voimain-v1.0',
            methods: ['enable', 'sign_transactions', 'post_transactions'],
          },
        ],
        providerId: 'kibisis-mock',
      },
    };

    Promise.resolve().then(function () {
      window.dispatchEvent(new CustomEvent(responseReference, {
        detail: JSON.stringify(response),
      }));
    });
  });

  // Mark mock as active for test assertions
  window.__arc0027MockActive = true;
})();
