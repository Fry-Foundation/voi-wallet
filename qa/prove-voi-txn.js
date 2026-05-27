'use strict';
// Voi mainnet signing path proof: positive payment build + negative wrong-wallet test.
// NOTE: This script builds and signs a transaction but does NOT submit it by default.
// Voi has no testnet — all txns are mainnet. Set VOI_PROVE_SUBMIT=1 to actually submit.
// No secrets in this file. Uses production src/signing.js::signTransactions.
var path = require('path');
var algosdk = require(path.resolve(__dirname, '..', 'node_modules', 'algosdk'));
var signing = require(path.resolve(__dirname, '..', 'src', 'signing'));
var config = require(path.resolve(__dirname, '..', 'src', 'config'));
var network = require(path.resolve(__dirname, '..', 'src', 'network'));

// Parse --network flag from argv (default: voi-mainnet)
var NETWORK = 'voi-mainnet';
var positionalArgs = [];
for (var _ai = 2; _ai < process.argv.length; _ai++) {
  if (process.argv[_ai] === '--network' && _ai + 1 < process.argv.length) {
    NETWORK = process.argv[_ai + 1];
    _ai++;
  } else {
    positionalArgs.push(process.argv[_ai]);
  }
}
var SIGNER_ALIAS = positionalArgs[0] || 'voi-signer';
var RECIPIENT_ALIAS = positionalArgs[1] || 'voi-recipient';

function log(step, data) {
  console.log(JSON.stringify(Object.assign({ step: step, ts: new Date().toISOString() }, data)));
}

function wait(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

async function main() {
  // === Resolve configs through production secretRef pipeline ===
  log('config', { message: 'Loading signer config via production loadConfig + secretRef' });
  var signerCfg = config.loadConfig(SIGNER_ALIAS);
  var signerAddr = signerCfg.address;
  log('config-signer', { address: signerAddr, mnemonicWordCount: signerCfg.mnemonic ? signerCfg.mnemonic.split(' ').length : 0 });

  var recipientCfg = config.loadConfig(RECIPIENT_ALIAS);
  var recipientAddr = recipientCfg.address;
  log('config-recipient', { address: recipientAddr, mnemonicWordCount: recipientCfg.mnemonic ? recipientCfg.mnemonic.split(' ').length : 0 });

  // === Get algod client for target network ===
  log('network', { target: NETWORK });
  var client = await network.getHealthyClient(NETWORK);
  var status = await client.status().do();
  log('node-status', { lastRound: status['last-round'] });

  // === Get suggested params (dynamic genesis) ===
  var params = await client.getTransactionParams().do();
  log('tx-params', {
    genesisID: params.genesisID,
    genesisHash: Buffer.from(params.genesisHash).toString('base64'),
    fee: params.fee,
    firstRound: params.firstRound,
    lastRound: params.lastRound,
  });

  // === POSITIVE TEST: build + sign ===
  log('positive-start', {});
  var ts = Date.now();
  var noteStr = 'voi-wallet-proof-' + ts;
  var txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    from: signerAddr,
    to: recipientAddr,
    amount: 1000, // 0.001 VOI — minimal
    note: new Uint8Array(Buffer.from(noteStr)),
    suggestedParams: params,
  });

  // Encode to WC-style format (same as production expects)
  var txnBytes = algosdk.encodeUnsignedTransaction(txn);
  var wcFormatTxns = [{ txn: Buffer.from(txnBytes).toString('base64') }];

  // Sign through EXACT production path
  log('signing', { call: "signTransactions(wcFormatTxns, '" + SIGNER_ALIAS + "')" });

  // Temporarily allow mainnet value for this test
  var origEnv = process.env.VOI_ALLOW_MAINNET_VALUE;
  process.env.VOI_ALLOW_MAINNET_VALUE = '1';

  var signedBlobs;
  try {
    signedBlobs = signing.signTransactions(wcFormatTxns, SIGNER_ALIAS);
  } finally {
    // Restore original env
    if (origEnv === undefined) {
      delete process.env.VOI_ALLOW_MAINNET_VALUE;
    } else {
      process.env.VOI_ALLOW_MAINNET_VALUE = origEnv;
    }
  }

  if (!signedBlobs || !signedBlobs[0]) {
    log('positive-FAIL', { error: 'signTransactions returned null/empty', classification: 'NEEDS_INVESTIGATION' });
    process.exitCode = 1;
    return;
  }

  log('signed', { blobLength: signedBlobs[0].length, count: signedBlobs.length });

  // Submit ONLY if VOI_PROVE_SUBMIT=1
  if (process.env.VOI_PROVE_SUBMIT === '1') {
    log('submitting', { warning: 'MAINNET SUBMISSION — VOI_PROVE_SUBMIT=1' });
    var submitResult = await client.sendRawTransaction(signedBlobs[0]).do();
    var txId = submitResult.txId || submitResult.txid;
    log('submitted', { txId: txId, explorer: network.getExplorerTxUrl(txId) });

    // Wait for confirmation
    var confirmed = false;
    for (var i = 0; i < 20; i++) {
      await wait(2000);
      try {
        var pending = await client.pendingTransactionInformation(txId).do();
        if (pending['confirmed-round'] && pending['confirmed-round'] > 0) {
          log('confirmed', {
            txId: txId,
            confirmedRound: pending['confirmed-round'],
            sender: signerAddr,
            receiver: recipientAddr,
            amount: 1000,
          });
          confirmed = true;
          break;
        }
      } catch (e) { /* pending may 404 briefly */ }
    }

    if (!confirmed) {
      log('positive-FAIL', { error: 'Transaction not confirmed after 40s', txId: txId });
      process.exitCode = 1;
      return;
    }
    log('positive-PASS', { submitted: true, txId: txId });
  } else {
    log('positive-PASS', {
      submitted: false,
      reason: 'VOI_PROVE_SUBMIT not set — dry-run only (mainnet safety)',
      signedBlobB64Length: Buffer.from(signedBlobs[0]).toString('base64').length,
    });
  }

  // === NEGATIVE TEST: wrong wallet ===
  log('negative-start', { call: "signTransactions(wcFormatTxns, '" + RECIPIENT_ALIAS + "')" });

  // Temporarily allow mainnet value
  process.env.VOI_ALLOW_MAINNET_VALUE = '1';
  var wrongSigned;
  try {
    wrongSigned = signing.signTransactions(wcFormatTxns, RECIPIENT_ALIAS);
  } finally {
    if (origEnv === undefined) {
      delete process.env.VOI_ALLOW_MAINNET_VALUE;
    } else {
      process.env.VOI_ALLOW_MAINNET_VALUE = origEnv;
    }
  }

  if (wrongSigned[0] === null) {
    log('negative-PASS', {
      result: 'CORRECTLY_REFUSED',
      wrongSignedValue: 'null',
      reason: 'sender (signer) !== recipient wallet address, production code returned null',
    });
  } else {
    log('negative-FAIL', {
      result: 'UNEXPECTED_PASS',
      wrongSignedLength: wrongSigned[0] ? wrongSigned[0].length : 'undefined',
      classification: 'NEEDS_INVESTIGATION',
    });
    process.exitCode = 1;
  }
}

main().catch(function(err) {
  log('fatal', { error: err.message, stack: err.stack });
  process.exitCode = 1;
});
