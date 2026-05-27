'use strict';
// Provisions a Voi wallet: generates keypair, stores mnemonic in 1Password, prints only public info.
// No secrets in this file. Mnemonic handled in runtime memory only, passed to op via args.
var path = require('path');
var execFileSync = require('child_process').execFileSync;

var algosdk = require(path.join(__dirname, '..', 'node_modules', 'algosdk'));

var alias = process.argv[2];
var vault = process.argv[3] || 'Wallets';
if (!alias) {
  console.error('Usage: node qa/provision-voi-wallet.js <alias> [vault]');
  process.exit(1);
}

var ts = Date.now();
var itemTitle = alias + '-' + ts;

// Generate keypair — mnemonic stays in runtime memory
var account = algosdk.generateAccount();
var address = account.addr;
var mnemonic = algosdk.secretKeyToMnemonic(account.sk);
var wordCount = mnemonic.split(' ').length;

// Store in 1Password (TestNet-only wallet, single-user box)
var opResult;
try {
  opResult = execFileSync('op', [
    'item', 'create',
    '--vault', vault,
    '--category', 'Crypto Wallet',
    '--title', itemTitle,
    '--format', 'json',
    '--',
    'mnemonic[password]=' + mnemonic,
    'address[text]=' + address,
    'network[text]=voi-mainnet',
    'alias[text]=' + alias
  ], {
    encoding: 'utf8',
    timeout: 15000,
    stdio: ['ignore', 'pipe', 'pipe']
  });
} catch (err) {
  console.error(JSON.stringify({ error: 'op item create failed', message: err.stderr || err.message }));
  mnemonic = null;
  account = null;
  process.exit(1);
}

// Clear mnemonic from memory immediately after 1P store
mnemonic = null;
account = null;

// Parse 1P response for item UUID
var opItem;
try {
  opItem = JSON.parse(opResult);
} catch (e) {
  console.error(JSON.stringify({ error: 'Failed to parse op response', raw: opResult.substring(0, 200) }));
  process.exit(1);
}

var itemUUID = opItem.id;
var secretRefPath = 'op://' + vault + '/' + itemTitle + '/mnemonic';

// Print ONLY public info — NEVER mnemonic
console.log(JSON.stringify({
  step: 'provisioned',
  alias: alias,
  address: address,
  wordCount: wordCount,
  vault: vault,
  itemTitle: itemTitle,
  itemUUID: itemUUID,
  secretRefPath: secretRefPath,
  network: 'voi-mainnet',
  reversal: 'op item delete ' + itemUUID + ' --vault ' + vault
}));
