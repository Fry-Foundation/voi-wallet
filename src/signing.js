const algosdk = require("algosdk");
const { loadConfig } = require("./config");

function getSecretKey(walletAlias) {
  var config = loadConfig(walletAlias);
  if (config.secretKey) {
    var buf = Buffer.from(config.secretKey, "hex");
    return new Uint8Array(buf);
  }
  if (config.mnemonic) {
    return algosdk.mnemonicToSecretKey(config.mnemonic).sk;
  }
  throw new Error("No secret key available");
}

function getAddress(walletAlias) {
  return loadConfig(walletAlias).address;
}

function computeTotalValue(transactions) {
  var total = 0;
  for (var i = 0; i < transactions.length; i++) {
    var t = transactions[i];
    if (t.txn && typeof t.txn.amt === "number") {
      total += t.txn.amt;
    }
  }
  return total;
}

function signTransactions(signerTransactions, walletAlias) {
  var config = loadConfig(walletAlias);
  var sk = getSecretKey(walletAlias);
  var addr = getAddress(walletAlias);
  var total = computeTotalValue(signerTransactions);

  if (total > config.guardMicroVoi) {
    throw new Error(
      "Value guard blocked: total " + total + " microVOI > guard " + config.guardMicroVoi + ". Set VOI_ALLOW_MAINNET_VALUE=1 to override."
    );
  }

  var signed = [];
  for (var i = 0; i < signerTransactions.length; i++) {
    var st = signerTransactions[i];
    // Accept base64 string or raw bytes
    var txnBytes = typeof st.txn === "string"
      ? new Uint8Array(Buffer.from(st.txn, "base64"))
      : st.txn;
    var txn = algosdk.decodeUnsignedTransaction(txnBytes);
    // algosdk 2.x: txn.from, 3.x: txn.sender
    var senderField = txn.sender || txn.from;
    var senderAddr = senderField
      ? (typeof senderField === "string" ? senderField : algosdk.encodeAddress(senderField.publicKey || senderField))
      : null;
    if (senderAddr === addr) {
      signed.push(algosdk.signTransaction(txn, sk).blob);
    } else {
      signed.push(null);
    }
  }
  return signed;
}

function signRawTxn(base64UnsignedTxn, walletAlias) {
  return signTransactions([{ txn: base64UnsignedTxn }], walletAlias);
}

module.exports = { signTransactions, signRawTxn, getAddress, computeTotalValue };
