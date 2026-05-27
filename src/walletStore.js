const fs = require("fs");
const path = require("path");

const WALLETS_DIR = path.join(__dirname, "..", ".wallets");
const REGISTRY_FILE = path.join(WALLETS_DIR, "registry.json");

function ensureDir() {
  if (!fs.existsSync(WALLETS_DIR)) fs.mkdirSync(WALLETS_DIR, { recursive: true });
}

function emptyRegistry() {
  return { wallets: [], defaultAlias: null };
}

function loadRegistry() {
  if (!fs.existsSync(REGISTRY_FILE)) return emptyRegistry();
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_FILE, "utf8"));
  } catch (_) {
    return emptyRegistry();
  }
}

function saveRegistry(data) {
  ensureDir();
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(data, null, 2));
}

function addWallet(entry) {
  var reg = loadRegistry();
  if (reg.wallets.find(function(w) { return w.alias === entry.alias; })) {
    throw new Error("Alias already exists: " + entry.alias);
  }
  var record = {
    alias: entry.alias,
    address: entry.address,
    type: entry.type,
    network: entry.network,
    created: Date.now(),
  };
  if (entry.secretRef) record.secretRef = entry.secretRef;
  reg.wallets.push(record);
  if (!reg.defaultAlias) reg.defaultAlias = entry.alias;
  saveRegistry(reg);
  return record;
}

function removeWallet(alias) {
  var reg = loadRegistry();
  var idx = reg.wallets.findIndex(function(w) { return w.alias === alias; });
  if (idx === -1) throw new Error("Alias not found: " + alias);
  reg.wallets.splice(idx, 1);
  if (reg.defaultAlias === alias) {
    reg.defaultAlias = reg.wallets.length > 0 ? reg.wallets[0].alias : null;
  }
  saveRegistry(reg);
}

function findWallet(alias) {
  var reg = loadRegistry();
  return reg.wallets.find(function(w) { return w.alias === alias; }) || null;
}

function listWallets() {
  return loadRegistry().wallets;
}

function getDefault() {
  return loadRegistry().defaultAlias;
}

function setDefault(alias) {
  var reg = loadRegistry();
  if (!reg.wallets.find(function(w) { return w.alias === alias; })) {
    throw new Error("Alias not found: " + alias);
  }
  reg.defaultAlias = alias;
  saveRegistry(reg);
}

function getFullRegistry() {
  return loadRegistry();
}

module.exports = {
  addWallet: addWallet,
  removeWallet: removeWallet,
  findWallet: findWallet,
  listWallets: listWallets,
  getDefault: getDefault,
  setDefault: setDefault,
  getFullRegistry: getFullRegistry,
  WALLETS_DIR: WALLETS_DIR,
  REGISTRY_FILE: REGISTRY_FILE,
};
