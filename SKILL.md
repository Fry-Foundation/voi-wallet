# voi-wallet

Raw signing wallet for [Voi Network](https://voi.network) (AVM-compatible L1) with Playwright E2E testing support.

## Scope (v1.1)

- Generate/import Voi wallets with optional 1Password secretRef support.
- Sign AVM transactions programmatically via `algosdk@2.11.0`.
- Submit to Voi algod (Nodely public endpoint, custom node, or AlgoKit localnet).
- 3-tier secret resolution (secretRef, env vars, legacy).
- Value guard for mainnet (0.1 VOI default).
- ARC-0027 Kibisis wallet mock (CustomEvent-based protocol emulation).
- Lute wallet mock (lute-connect extension-mode CustomEvent emulation).
- Playwright injection helpers for Voi dApp E2E testing.
- 9 E2E test specs (3 implemented, 6 stubs).

## Prerequisites

- Node.js >= 18
- `npm install` inside the skill directory (dependency: `algosdk@2.11.0`)
- For operator wallets: active 1Password session (`OP_SESSION_*` env var)

## Networks

| Value | Algod Endpoint | Notes |
|-------|---------------|-------|
| `voi-mainnet` | `https://mainnet-api.voi.nodely.dev` | Default. Public Nodely endpoint, no token needed. |
| `voi-custom` | `VOI_ALGOD_URL` env var | Your own Voi node. Set `VOI_ALGOD_TOKEN` if needed. Falls back to Nodely if unreachable. |
| `voi-localnet` | `http://localhost:4001` | AlgoKit sandbox default. Override via `VOI_LOCALNET_URL`. No real funds. |

**No public Voi testnet exists.** Use `voi-localnet` for autonomous testing (no real funds, funded genesis accounts). AVM signing is chain-agnostic — localnet uses Algorand genesis but signing behavior is identical to Voi mainnet.

## Configuration

| Env Var | Description | Default |
|---------|-------------|---------|
| `VOI_ALGOD_URL` | Custom algod URL for `voi-custom` network | Nodely public endpoint |
| `VOI_ALGOD_PORT` | Custom algod port | (none) |
| `VOI_ALGOD_TOKEN` | Custom algod API token | (none) |
| `VOI_LOCALNET_URL` | Localnet algod URL | `http://localhost` |
| `VOI_LOCALNET_PORT` | Localnet algod port | `4001` |
| `VOI_LOCALNET_TOKEN` | Localnet algod token | AlgoKit default (64 a's) |
| `VOI_ALLOW_MAINNET_VALUE` | Set to `1` to allow >0.1 VOI on mainnet | (unset = blocked) |
| `VOI_E2E_BASE_URL` | Playwright test target URL | `https://fry.farm` |
| `VOI_CHAIN_STORAGE_KEY` | localStorage key for chain selection | `fry-farm-chain-id` |

## Genesis

| Network | Genesis ID | Genesis Hash |
|---------|-----------|--------------|
| Voi Mainnet | `voimain-v1.0` | `r20fSQI8gWe/kFZziNonSPCXLwcQmH/nxROvnnueWOk=` |
| Voi Testnet | `voitest-v1` | `IXnoWtviVVJW5LGivNFc0Dq14V3kqaXuK2u5OQrdVZo=` |

Genesis is fetched dynamically via `client.getTransactionParams().do()` — never hardcoded in transaction building.

## Commands

All commands run via `node src/index.js [--wallet <alias>] <command> [args...]`.

### Wallet Lifecycle

| Command | Args | Description |
|---|---|---|
| `wallet-generate` | `[--alias <name>] [--network <net>]` | Generate disposable wallet. Outputs `{address, mnemonic}` to stdout. |
| `wallet-import` | `<address> <alias> [--secret-ref <op-path>] [--network <net>]` | Register operator wallet by address. |
| `wallet-list` | — | List all registered wallets. |
| `wallet-remove` | `<alias>` | Remove wallet from registry. |

### Signing

| Command | Args | Description |
|---|---|---|
| `sign-txn` | `<base64-unsigned-txn>` | Sign single transaction, return base64 signed blob. |
| `sign-group` | `<b64-txn1> [b64-txn2] ...` | Sign atomic group. Returns array (null for non-sender txns). |

### Network

| Command | Args | Description |
|---|---|---|
| `submit-txn` | `<base64-signed-txn> [--network <net>]` | Submit signed txn to Voi algod. Returns txId + explorer link. |
| `node-status` | `[--network <net>]` | Query algod `/v2/status`. Returns round, version, catchpoint. |

### Localnet

| Command | Args | Description |
|---|---|---|
| `fund-from-genesis` | `<target-address> <amount-microAlgo> [--network voi-localnet]` | Fund a localnet wallet from AlgoKit sandbox dispenser. **Only works on voi-localnet** (safety guard). |

### Transaction Builders

| Command | Args | Description |
|---|---|---|
| `payment` | `--to <addr> --amount <microAlgos> --wallet <alias> --network <net> [--submit]` | Build + optionally submit a payment. `--submit` only on localnet. |
| `arc200-transfer` | `--app-id <id> --to <addr> --amount <uint64> --wallet <alias> --network <net> [--submit]` | ARC-200 token transfer (method selector `0xda7025b9`). |
| `arc72-transfer` | `--app-id <id> --token-id <uint64> --to <addr> --wallet <alias> --network <net> [--submit]` | ARC-72 NFT transfer (method selector `0x3fd6251d`, `extraPages: 1`). |

## Global `--wallet <alias>` Flag

All signing commands accept `--wallet <alias>` to select which wallet to use. Without this flag, legacy `VOI_TEST_WALLET_*` environment variables are used.

## Secret Resolution (3-tier)

When `--wallet <alias>` is specified:

1. **secretRef (op://)** — If wallet entry has `secretRef` starting with `op://`, resolved at runtime via `op read`. Requires active `OP_SESSION_*`.
2. **Alias-specific env var** — `VOI_WALLET_<ALIAS_NORMALIZED>_MNEMONIC` or `_SECRET_KEY`. Hyphens normalized to underscores.
3. **Legacy env vars** — Falls back to `VOI_TEST_WALLET_*` for backward compatibility.

## Wallet Registry

Metadata stored in `.wallets/registry.json`. **No secrets ever written to this file.**

## Secret-Handling Rules

- `.wallets/registry.json` **NEVER** contains mnemonic, secret key, or raw secret material.
- `wallet-generate` mnemonic output is **session-use only** — must not be echoed in summaries, handoffs, or commit text.
- `op://` references stored as-is — resolved in-memory at runtime only.
- `op read` output never logged, printed, or persisted.
- Env vars holding secrets must be `unset` at session end.

## Guardrails

- **Value guard:** `sign-txn` / `sign-group` blocks if total transaction value exceeds 0.1 VOI (100,000 microVOI) unless `VOI_ALLOW_MAINNET_VALUE=1`.
- **Submit guard:** `payment`, `arc200-transfer`, `arc72-transfer` with `--submit` only work on `voi-localnet`.
- **No testnet safety net:** Voi has no public testnet. All mainnet operations use real funds.

## Explorer Links

After `submit-txn`, transactions viewable at:
- `https://voi.observer/explorer/transaction/{txId}`

## Usage Examples

### Disposable wallet (autonomous E2E)
```bash
OUTPUT=$(node src/index.js wallet-generate --alias e2e-001 --network voi-mainnet)
MNEMONIC=$(echo "$OUTPUT" | jq -r '.mnemonic')
export VOI_WALLET_E2E_001_MNEMONIC="$MNEMONIC"
node src/index.js --wallet e2e-001 sign-txn "$UNSIGNED_TXN_B64"
node src/index.js submit-txn "$SIGNED_TXN_B64" --network voi-mainnet
node src/index.js wallet-remove e2e-001
unset VOI_WALLET_E2E_001_MNEMONIC
```

### Operator wallet (1Password)
```bash
node src/index.js wallet-import ADDR... op-voi --secret-ref "op://your-vault/your-wallet/mnemonic" --network voi-mainnet
node src/index.js --wallet op-voi sign-txn "$UNSIGNED_TXN_B64"
node src/index.js wallet-remove op-voi
```

### Localnet payment (end-to-end)
```bash
SENDER=$(node src/index.js wallet-generate --alias sender --network voi-localnet)
RECEIVER=$(node src/index.js wallet-generate --alias receiver --network voi-localnet)
export VOI_WALLET_SENDER_MNEMONIC=$(echo "$SENDER" | jq -r '.mnemonic')
SENDER_ADDR=$(echo "$SENDER" | jq -r '.address')
RECEIVER_ADDR=$(echo "$RECEIVER" | jq -r '.address')
node src/index.js fund-from-genesis "$SENDER_ADDR" 10000000 --network voi-localnet
node src/index.js --wallet sender payment --to "$RECEIVER_ADDR" --amount 1000000 --network voi-localnet --submit
node src/index.js wallet-remove sender && node src/index.js wallet-remove receiver
unset VOI_WALLET_SENDER_MNEMONIC
```

## Playwright E2E Testing

### Running Tests

```bash
npm run test:e2e                    # Full suite
npm run test:e2e:wallet             # Wallet connect/disconnect only
npm run test:e2e:chain              # Chain switching only
npm run test:e2e:swap               # DEX swap only
npm run test:e2e:headed             # With visible browser
npm run test:e2e:debug              # Playwright inspector
```

### Mock Architecture

**ARC-0027 mock** (`src/playwright/arc0027-mock.js`): Emulates Kibisis wallet extension. Listens for `arc0027:enable:request` and `arc0027:sign_transactions:request` CustomEvents, responds with `arc0027:*:response` events.

**Lute mock** (`src/playwright/lute-mock.js`): Sets `window.lute = true` to force extension mode. Listens for `lute-connect` CustomEvents, responds with `connect-response` and `sign-txns-response` events.

**Signing strategy**: Mocks return dummy signed bytes. Playwright `page.route()` intercepts algod `POST /v2/transactions` and `GET /v2/transactions/pending/*` to simulate successful submission without real signatures.

### E2E Coverage Matrix

| # | Flow | Status | Spec File |
|---|------|--------|-----------|
| 1 | Wallet connect/disconnect | **IMPLEMENTED** (7 tests) | `01-wallet-connect.spec.js` |
| 2 | Chain switching | **IMPLEMENTED** (8 tests) | `02-chain-switching.spec.js` |
| 3 | DEX Swap | **IMPLEMENTED** (6 tests) | `03-dex-swap.spec.js` |
| 4 | Token Staking | STUB | `04-token-stake.spec.js` |
| 5 | P2P Swap | STUB | `05-p2p-swap.spec.js` |
| 6 | NFT Staking | STUB | `06-nft-stake.spec.js` |
| 7 | LP Farming | STUB | `07-farm.spec.js` |
| 8 | Profile/Portfolio | STUB | `08-profile.spec.js` |
| 9 | Pool Stats | STUB | `09-pool-stats.spec.js` |
| 10 | Full Site Crawl | **IMPLEMENTED** (10 flows) | `10-full-crawl.spec.js` |
| 11 | Race Conditions | **IMPLEMENTED** (23 tests) | `11-race-conditions.spec.js` |

## Claude Code Integration

This skill is designed for use with [Claude Code](https://claude.ai/claude-code). Place it in `~/.claude/skills/voi-wallet/` and it will be discovered automatically.

## License

MIT
