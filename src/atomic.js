const algosdk = require("algosdk");
var { signTransactions } = require("./signing");

/**
 * Assign a group ID to an array of transactions.
 * Mutates the transactions in place.
 *
 * @param {algosdk.Transaction[]} txns - Array of unsigned transactions
 * @returns {algosdk.Transaction[]} Same array with group IDs assigned
 */
function buildAtomicGroup(txns) {
  algosdk.assignGroupID(txns);
  return txns;
}

/**
 * Sign all transactions in an atomic group.
 * Uses the skill's production signing pipeline.
 *
 * @param {algosdk.Transaction[]} groupedTxns - Transactions with group IDs
 * @param {string} walletAlias - Wallet alias for signing
 * @returns {Array<Uint8Array|null>} Signed blobs (null for non-sender txns)
 */
function signAtomicGroup(groupedTxns, walletAlias) {
  // Convert to WC-style format for signTransactions
  var wcFormat = groupedTxns.map(function (txn) {
    return { txn: Buffer.from(algosdk.encodeUnsignedTransaction(txn)).toString("base64") };
  });
  return signTransactions(wcFormat, walletAlias);
}

/**
 * Submit a signed atomic group and wait for confirmation.
 *
 * @param {algosdk.Algodv2} algodClient
 * @param {Uint8Array[]} signedTxns - Array of signed transaction bytes
 * @returns {Promise<{txId: string, confirmedRound: number}>}
 */
async function submitAtomicGroup(algodClient, signedTxns) {
  // Filter out nulls (txns not signed by this wallet)
  var toSubmit = signedTxns.filter(Boolean);
  var result = await algodClient.sendRawTransaction(toSubmit).do();
  var txId = result.txId || result.txid;

  // Wait for confirmation (up to 10 rounds)
  var confirmed = await algosdk.waitForConfirmation(algodClient, txId, 10);
  return {
    txId: txId,
    confirmedRound: confirmed["confirmed-round"],
  };
}

/**
 * Build a simple VOI payment transaction.
 *
 * @param {algosdk.Algodv2} algodClient
 * @param {Object} opts
 * @param {string} opts.sender - Sender address
 * @param {string} opts.receiver - Receiver address
 * @param {number} opts.amount - Amount in microAlgos
 * @param {string} [opts.note] - Optional note string
 * @returns {Promise<algosdk.Transaction>} Unsigned transaction
 */
async function buildPayment(algodClient, opts) {
  var params = await algodClient.getTransactionParams().do();
  var txnObj = {
    from: opts.sender,
    to: opts.receiver,
    amount: opts.amount,
    suggestedParams: params,
  };
  if (opts.note) {
    txnObj.note = new Uint8Array(Buffer.from(opts.note));
  }
  return algosdk.makePaymentTxnWithSuggestedParamsFromObject(txnObj);
}

module.exports = {
  buildAtomicGroup,
  signAtomicGroup,
  submitAtomicGroup,
  buildPayment,
};
