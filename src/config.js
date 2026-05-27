const { execFileSync } = require("child_process");
const { findWallet } = require("./walletStore");

const VOI_DECIMALS = 6;
const DEFAULT_GUARD_VOI = 0.1;

function normalizeAlias(alias) {
  return alias.replace(/-/g, "_");
}

function resolveSecretRef(secretRef) {
  if (!secretRef || !secretRef.startsWith("op://")) return null;
  try {
    var result = execFileSync("op", ["read", secretRef], {
      encoding: "utf8",
      timeout: 10000,
    }).trim();
    return result || null;
  } catch (_) {
    return null;
  }
}

function loadConfig(walletAlias) {
  var allowMainnetValue = process.env.VOI_ALLOW_MAINNET_VALUE === "1";
  var guardMicroVoi = allowMainnetValue
    ? Infinity
    : Math.round(DEFAULT_GUARD_VOI * Math.pow(10, VOI_DECIMALS));

  // Tier 1: alias-based resolution
  if (walletAlias) {
    var wallet = findWallet(walletAlias);
    if (!wallet) throw new Error("Wallet alias not found: " + walletAlias);
    var address = wallet.address;
    var norm = normalizeAlias(walletAlias);

    // Tier 1a: secretRef (op:// resolution)
    if (wallet.secretRef) {
      var mnemonic = resolveSecretRef(wallet.secretRef);
      if (mnemonic) {
        return { address: address, secretKey: "", mnemonic: mnemonic, allowMainnetValue: allowMainnetValue, guardMicroVoi: guardMicroVoi };
      }
    }

    // Tier 1b: alias-specific env vars
    var envMnemonic = process.env["VOI_WALLET_" + norm + "_MNEMONIC"] || "";
    var envSecretKey = process.env["VOI_WALLET_" + norm + "_SECRET_KEY"] || "";
    if (envMnemonic || envSecretKey) {
      return { address: address, secretKey: envSecretKey, mnemonic: envMnemonic, allowMainnetValue: allowMainnetValue, guardMicroVoi: guardMicroVoi };
    }
  }

  // Tier 2: legacy env vars
  var address2 = process.env.VOI_TEST_WALLET_ADDRESS || "";
  var secretKey = process.env.VOI_TEST_WALLET_SECRET_KEY || "";
  var mnemonic2 = process.env.VOI_TEST_WALLET_MNEMONIC || "";

  if (!address2 && walletAlias) {
    throw new Error("No secret available for alias '" + walletAlias + "' — set VOI_WALLET_" + normalizeAlias(walletAlias) + "_MNEMONIC or add a secretRef");
  }
  if (!address2) {
    throw new Error("Missing VOI_TEST_WALLET_ADDRESS");
  }
  if (!secretKey && !mnemonic2) {
    throw new Error("Missing VOI_TEST_WALLET_SECRET_KEY or VOI_TEST_WALLET_MNEMONIC");
  }

  return { address: address2, secretKey: secretKey, mnemonic: mnemonic2, allowMainnetValue: allowMainnetValue, guardMicroVoi: guardMicroVoi };
}

module.exports = { loadConfig, VOI_DECIMALS };
