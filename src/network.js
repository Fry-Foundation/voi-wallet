const algosdk = require("algosdk");

// Voi public endpoints (Nodely) — default for mainnet
const ENDPOINTS = {
  "voi-mainnet": {
    url: "https://mainnet-api.voi.nodely.dev",
    port: "",
    token: "",
  },
  "voi-custom": {
    url: process.env.VOI_ALGOD_URL || "https://mainnet-api.voi.nodely.dev",
    port: process.env.VOI_ALGOD_PORT || "",
    token: "", // resolved at runtime via VOI_ALGOD_TOKEN env var
  },
  "voi-localnet": {
    url: process.env.VOI_LOCALNET_URL || "http://localhost",
    port: process.env.VOI_LOCALNET_PORT || 4001,
    token: process.env.VOI_LOCALNET_TOKEN || "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    // AlgoKit sandbox default. Override VOI_LOCALNET_URL for remote localnet.
  },
};

// Indexer endpoints (read-only queries, not needed for signing)
const INDEXER_ENDPOINTS = {
  "voi-mainnet": {
    url: "https://mainnet-idx.voi.nodely.dev",
    port: "",
    token: "",
  },
};

// Explorer URL pattern for post-transaction links
const EXPLORER_TX_URL = "https://voi.observer/explorer/transaction/";

function resolveToken(network) {
  var ep = ENDPOINTS[network];
  if (!ep) return "";
  // Custom endpoint: try env var for token (set at runtime, never persisted)
  if (network === "voi-custom") {
    return process.env.VOI_ALGOD_TOKEN || ep.token || "";
  }
  return ep.token || "";
}

function getAlgodClient(network) {
  var ep = ENDPOINTS[network];
  if (!ep) throw new Error("Unknown network: " + network + ". Available: " + Object.keys(ENDPOINTS).join(", "));
  var token = resolveToken(network);
  return new algosdk.Algodv2(token, ep.url, ep.port);
}

async function getHealthyClient(network) {
  var primary = getAlgodClient(network);
  try {
    await primary.status().do();
    return primary;
  } catch (_) {
    // Custom endpoint fallback: try public Nodely
    if (network === "voi-custom") {
      var fb = getAlgodClient("voi-mainnet");
      await fb.status().do();
      return fb;
    }
    throw new Error("Voi " + network + " algod unreachable");
  }
}

function getExplorerTxUrl(txId) {
  return EXPLORER_TX_URL + txId;
}

module.exports = {
  getAlgodClient,
  getHealthyClient,
  getExplorerTxUrl,
  ENDPOINTS,
  INDEXER_ENDPOINTS,
};
