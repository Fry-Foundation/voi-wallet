# voi-wallet

Claude Code skill for Voi blockchain wallet automation — ARC-200/ARC-72 transactions, Playwright E2E testing with ARC-0027 and Lute wallet protocol emulation.

## Features

- **Wallet management** — generate disposable wallets, import operator wallets with 1Password secretRef
- **3-network support** — mainnet (Nodely public), custom node, AlgoKit localnet
- **Transaction building** — ALGO payments, ARC-200 fungible token transfers, ARC-72 NFT transfers
- **Atomic groups** — build, sign, and submit grouped transactions
- **Mainnet safety guards** — value limit (0.1 VOI default), localnet-only `--submit`
- **Playwright E2E** — ARC-0027 Kibisis mock, Lute extension-mode mock, algod endpoint mocking
- **46 E2E test specs** — 21 implemented, 25 stubs across 9 test flows

## Quick Start

```bash
# Install
cd ~/.claude/skills/voi-wallet  # or clone this repo
npm install

# Check connectivity
node src/index.js node-status --network voi-mainnet

# Generate a disposable wallet
node src/index.js wallet-generate --alias my-wallet --network voi-mainnet

# List wallets
node src/index.js wallet-list

# Remove wallet
node src/index.js wallet-remove my-wallet
```

## Configuration

All configuration via environment variables — no config files needed.

| Env Var | Description | Default |
|---------|-------------|---------|
| `VOI_ALGOD_URL` | Custom algod URL (`voi-custom` network) | Nodely public |
| `VOI_ALGOD_PORT` | Custom algod port | — |
| `VOI_ALGOD_TOKEN` | Custom algod API token | — |
| `VOI_LOCALNET_URL` | Localnet algod host | `http://localhost` |
| `VOI_LOCALNET_PORT` | Localnet algod port | `4001` |
| `VOI_LOCALNET_TOKEN` | Localnet algod token | AlgoKit default |
| `VOI_ALLOW_MAINNET_VALUE` | Allow >0.1 VOI on mainnet | unset (blocked) |
| `VOI_E2E_BASE_URL` | Playwright test target | `https://fry.farm` |

## CLI Commands

```
node src/index.js [--wallet <alias>] <command> [args...]

Wallet lifecycle:
  wallet-generate [--alias <name>] [--network <net>]
  wallet-import <address> <alias> [--secret-ref <op-path>] [--network <net>]
  wallet-list
  wallet-remove <alias>

Signing:
  sign-txn <base64-unsigned-txn>
  sign-group <b64-txn1> [b64-txn2] ...

Network:
  submit-txn <base64-signed-txn> [--network <net>]
  node-status [--network <net>]

Localnet:
  fund-from-genesis <target-address> <amount-microAlgo> [--network voi-localnet]

Transaction builders:
  payment --to <addr> --amount <microAlgos> --network <net> [--submit]
  arc200-transfer --app-id <id> --to <addr> --amount <uint64> --network <net> [--submit]
  arc72-transfer --app-id <id> --token-id <uint64> --to <addr> --network <net> [--submit]

Networks: voi-mainnet (default), voi-custom, voi-localnet
```

## Playwright E2E

```bash
npm run test:e2e          # Full suite
npm run test:e2e:wallet   # Wallet connect/disconnect
npm run test:e2e:chain    # Chain switching
npm run test:e2e:swap     # DEX swap
npm run test:e2e:headed   # With visible browser
```

The test harness provides:
- **ARC-0027 mock** — emulates Kibisis wallet extension via CustomEvent protocol
- **Lute mock** — emulates lute-connect extension via CustomEvent + `window.lute`
- **Algod mocking** — intercepts `/v2/transactions` to prevent real submission

## Claude Code Integration

Place in `~/.claude/skills/voi-wallet/` for automatic discovery. The skill's `SKILL.md` provides the AI agent with command documentation and usage patterns.

## Contributing

1. Fork and clone
2. `npm install`
3. Make changes
4. Run `npm run test:e2e` to verify
5. Submit a PR

## License

MIT — see [LICENSE](LICENSE)
