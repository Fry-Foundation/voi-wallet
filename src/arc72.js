const algosdk = require("algosdk");
var { encodeUint256 } = require("./arc200");

// ARC-72 method selectors (must be Uint8Array for algosdk v2)
var ARC72_TRANSFER_FROM = new Uint8Array(Buffer.from("3fd6251d", "hex")); // arc72_transferFrom(address,address,uint256)

/**
 * Build an ARC-72 NFT transferFrom transaction.
 *
 * @param {algosdk.Algodv2} algodClient
 * @param {Object} opts
 * @param {string} opts.sender - Transaction sender (must be owner or approved)
 * @param {number} opts.appId - ARC-72 application ID
 * @param {string} opts.from - Current NFT owner address
 * @param {string} opts.to - New NFT owner address
 * @param {number|bigint} opts.tokenId - NFT token ID
 * @returns {Promise<algosdk.Transaction>} Unsigned transaction
 */
async function buildArc72TransferFrom(algodClient, opts) {
  var params = await algodClient.getTransactionParams().do();
  var fromPubKey = algosdk.decodeAddress(opts.from).publicKey;
  var toPubKey = algosdk.decodeAddress(opts.to).publicKey;

  var txn = algosdk.makeApplicationCallTxnFromObject({
    from: opts.sender,
    appIndex: opts.appId,
    appArgs: [
      ARC72_TRANSFER_FROM,
      fromPubKey,
      toPubKey,
      encodeUint256(opts.tokenId),
    ],
    suggestedParams: params,
    onComplete: algosdk.OnApplicationComplete.NoOpOC,
    extraPages: 1, // Required for ARC-72 on Voi
  });

  return txn;
}

module.exports = {
  buildArc72TransferFrom,
  ARC72_TRANSFER_FROM,
};
