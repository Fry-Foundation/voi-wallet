const fs = require("fs");
const path = require("path");

const STATE_DIR = path.join(__dirname, "..", ".state");
const STATE_FILE = path.join(STATE_DIR, "session.json");

function ensureDir() {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
}

function saveState(data) {
  ensureDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return null;
  return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
}

function clearState() {
  if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
  try { fs.rmdirSync(STATE_DIR); } catch (_) {}
}

module.exports = { saveState, loadState, clearState, STATE_FILE, STATE_DIR };
