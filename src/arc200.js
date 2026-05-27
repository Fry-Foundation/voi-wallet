const algosdk = require("algosdk");

// ARC-200 method selectors (must be Uint8Array for algosdk v2)
var ARC200_TRANSFER = new Uint8Array(Buffer.from("da7025b9", "hex")); // arc200_transfer(address,uint256)
var ARC200_BALANCE_OF = new Uint8Array(Buffer.from("2553c5e8", "hex")); // arc200_balanceOf(address)

/**
 * Encode a uint64 value as a 32-byte uint256 (big-endian).
 * 24 zero bytes + 8-byte big-endian UInt64.
 */
function encodeUint256(value) {
  var buf = Buffer.alloc(32);
  // Write as big-endian UInt64 at byte offset 24
  var bigVal = BigInt(value);
  buf.writeBigUInt64BE(bigVal, 24);
  return new Uint8Array(buf);
}

/**
 * Build an ARC-200 token transfer transaction.
 *
 * @param {algosdk.Algodv2} algodClient
 * @param {Object} opts
 * @param {string} opts.sender - Sender address
 * @param {number} opts.appId - ARC-200 application ID
 * @param {string} opts.receiver - Receiver address
 * @param {number|bigint} opts.amount - Transfer amount (raw, no decimal scaling)
 * @returns {Promise<algosdk.Transaction>} Unsigned transaction
 */
async function buildArc200Transfer(algodClient, opts) {
  var params = await algodClient.getTransactionParams().do();
  var receiverPubKey = algosdk.decodeAddress(opts.receiver).publicKey;

  var txn = algosdk.makeApplicationCallTxnFromObject({
    from: opts.sender,
    appIndex: opts.appId,
    appArgs: [
      ARC200_TRANSFER,
      receiverPubKey,
      encodeUint256(opts.amount),
    ],
    suggestedParams: params,
    onComplete: algosdk.OnApplicationComplete.NoOpOC,
  });

  return txn;
}

module.exports = {
  buildArc200Transfer,
  encodeUint256,
  ARC200_TRANSFER,
  ARC200_BALANCE_OF,
};
