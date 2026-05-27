const algosdk = require("algosdk");
const { loadConfig } = require("./config");
const { signTransactions, signRawTxn, getAddress } = require("./signing");
const { getAlgodClient, getHealthyClient, getExplorerTxUrl } = require("./network");
const walletStore = require("./walletStore");
const { buildArc200Transfer } = require("./arc200");
const { buildArc72TransferFrom } = require("./arc72");
const { buildAtomicGroup, signAtomicGroup, submitAtomicGroup, buildPayment } = require("./atomic");

function parseArgs(argv) {
  var raw = argv.slice(2);
  var walletAlias = null;
  var filtered = [];
  for (var i = 0; i < raw.length; i++) {
    if (raw[i] === "--wallet" && i + 1 < raw.length) {
      walletAlias = raw[i + 1];
      i++;
    } else {
      filtered.push(raw[i]);
    }
  }
  return { walletAlias: walletAlias, cmd: filtered[0], args: filtered.slice(1) };
}

function parseFlags(args, flagNames) {
  var flags = {};
  var positional = [];
  for (var i = 0; i < args.length; i++) {
    var flag = args[i].replace(/^--/, "");
    if (args[i].startsWith("--") && flagNames.indexOf(flag) !== -1 && i + 1 < args.length) {
      flags[flag] = args[i + 1];
      i++;
    } else {
      positional.push(args[i]);
    }
  }
  return { flags: flags, positional: positional };
}

async function runCommand(cmd, args, walletAlias) {
  switch (cmd) {

    // --- Wallet lifecycle ---

    case "wallet-generate": {
      var gf = parseFlags(args, ["alias", "network"]);
      var alias = gf.flags.alias || "disposable-" + Date.now();
      var network = gf.flags.network || "voi-mainnet";
      var account = algosdk.generateAccount();
      var mnemonic = algosdk.secretKeyToMnemonic(account.sk);
      var address = account.addr;
      walletStore.addWallet({ alias: alias, address: address, type: "disposable", network: network });
      console.log(JSON.stringify({ address: address, mnemonic: mnemonic }));
      return;
    }

    case "wallet-import": {
      var wf = parseFlags(args, ["secret-ref", "network"]);
      var addr = wf.positional[0];
      var wAlias = wf.positional[1];
      if (!addr || !wAlias) throw new Error("Usage: wallet-import <address> <alias> [--secret-ref <op-path>] [--network <net>]");
      if (addr.length !== 58) throw new Error("Invalid address: must be 58 characters");
      var wNet = wf.flags.network || "voi-mainnet";
      var secretRef = wf.flags["secret-ref"] || undefined;
      walletStore.addWallet({ alias: wAlias, address: addr, type: "operator", network: wNet, secretRef: secretRef });
      console.log(JSON.stringify({ registered: true, alias: wAlias, address: addr }));
      return;
    }

    case "wallet-list": {
      console.log(JSON.stringify(walletStore.getFullRegistry()));
      return;
    }

    case "wallet-remove": {
      var rAlias = args[0];
      if (!rAlias) throw new Error("Usage: wallet-remove <alias>");
      walletStore.removeWallet(rAlias);
      console.log(JSON.stringify({ removed: true, alias: rAlias }));
      return;
    }

    // --- Signing ---

    case "sign-txn": {
      var b64Txn = args[0];
      if (!b64Txn) throw new Error("Usage: sign-txn <base64-unsigned-txn>");
      var signed = signRawTxn(b64Txn, walletAlias);
      if (!signed[0]) throw new Error("Wallet is not the sender of this transaction");
      console.log(JSON.stringify({ signed: Buffer.from(signed[0]).toString("base64") }));
      return;
    }

    case "sign-group": {
      if (args.length === 0) throw new Error("Usage: sign-group <b64-txn1> [b64-txn2] ...");
      var groupTxns = args.map(function(b64) { return { txn: b64 }; });
      var groupSigned = signTransactions(groupTxns, walletAlias);
      var result = groupSigned.map(function(s) {
        return s ? Buffer.from(s).toString("base64") : null;
      });
      console.log(JSON.stringify({ signed: result, count: result.filter(Boolean).length }));
      return;
    }

    // --- Network ---

    case "submit-txn": {
      var sf = parseFlags(args, ["network"]);
      var rawB64 = sf.positional[0];
      if (!rawB64) throw new Error("Usage: submit-txn <base64-signed-txn> [--network <net>]");
      var submitNet = sf.flags.network || "voi-mainnet";
      var client = await getHealthyClient(submitNet);
      var rawBytes = new Uint8Array(Buffer.from(rawB64, "base64"));
      var txResponse = await client.sendRawTransaction(rawBytes).do();
      var txId = txResponse.txId || txResponse.txid;
      console.log(JSON.stringify({ txId: txId, explorer: getExplorerTxUrl(txId) }));
      return;
    }

    case "node-status": {
      var nf = parseFlags(args, ["network"]);
      var statusNet = nf.flags.network || "voi-mainnet";
      var statusClient = await getHealthyClient(statusNet);
      var status = await statusClient.status().do();
      console.log(JSON.stringify({
        network: statusNet,
        lastRound: status["last-round"],
        lastVersion: status["last-version"],
        catchpoint: status["last-catchpoint"] || null,
        timeSinceLastRound: status["time-since-last-round"],
      }));
      return;
    }

    // --- Localnet funding ---

    case "fund-from-genesis": {
      var ff = parseFlags(args, ["network"]);
      var targetAddr = ff.positional[0];
      var fundAmount = parseInt(ff.positional[1], 10);
      if (!targetAddr || isNaN(fundAmount)) throw new Error("Usage: fund-from-genesis <target-address> <amount-microAlgo> [--network voi-localnet]");
      var fundNet = ff.flags.network || "voi-localnet";
      if (fundNet !== "voi-localnet") throw new Error("fund-from-genesis only works on voi-localnet (safety guard). Got: " + fundNet);

      var fundClient = await getHealthyClient(fundNet);
      var fundParams = await fundClient.getTransactionParams().do();

      // AlgoKit sandbox default dispenser: use KMD to get funded account
      var kmdToken = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
      var kmdHost = process.env.VOI_LOCALNET_URL || "http://localhost";
      var kmdClient = new algosdk.Kmd(kmdToken, kmdHost, 4002);
      var wallets = await kmdClient.listWallets();
      var defaultWallet = wallets.wallets.find(function(w) { return w.name === "unencrypted-default-wallet"; });
      if (!defaultWallet) throw new Error("AlgoKit default wallet not found");

      var walletHandle = (await kmdClient.initWalletHandle(defaultWallet.id, "")).wallet_handle_token;
      var keys = await kmdClient.listKeys(walletHandle);
      var dispenserAddr = keys.addresses[0];
      if (!dispenserAddr) throw new Error("No funded accounts in default wallet");

      // Export dispenser key for signing
      var dispenserKeyResp = await kmdClient.exportKey(walletHandle, "", dispenserAddr);
      var dispenserSk = dispenserKeyResp.private_key;

      // Build + sign + submit payment
      var fundTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        from: dispenserAddr,
        to: targetAddr,
        amount: fundAmount,
        note: new Uint8Array(Buffer.from("voi-wallet-fund-" + Date.now())),
        suggestedParams: fundParams,
      });
      var signedFundTxn = algosdk.signTransaction(fundTxn, dispenserSk);
      var fundSubmit = await fundClient.sendRawTransaction(signedFundTxn.blob).do();
      var fundTxId = fundSubmit.txId || fundSubmit.txid;

      // Poll for confirmation (10 × 2s)
      var fundConfirmed = false;
      for (var fi = 0; fi < 10; fi++) {
        await new Promise(function(r) { setTimeout(r, 2000); });
        try {
          var pending = await fundClient.pendingTransactionInformation(fundTxId).do();
          if (pending["confirmed-round"] && pending["confirmed-round"] > 0) {
            fundConfirmed = true;
            console.log(JSON.stringify({
              funded: true,
              txId: fundTxId,
              from: dispenserAddr,
              to: targetAddr,
              amount: fundAmount,
              confirmedRound: pending["confirmed-round"],
            }));
            break;
          }
        } catch (_) { /* pending may 404 briefly */ }
      }
      if (!fundConfirmed) throw new Error("Fund transaction not confirmed after 20s: " + fundTxId);

      await kmdClient.releaseWalletHandle(walletHandle);
      return;
    }

    // --- Transaction builders ---

    case "payment": {
      var pf = parseFlags(args, ["to", "amount", "network", "submit"]);
      var pTo = pf.flags.to;
      var pAmount = parseInt(pf.flags.amount, 10);
      var pNet = pf.flags.network || "voi-mainnet";
      var pSubmit = pf.flags.submit !== undefined || args.indexOf("--submit") !== -1;
      if (!pTo || isNaN(pAmount)) throw new Error("Usage: payment --to <addr> --amount <microAlgos> --wallet <alias> --network <net> [--submit]");
      if (pSubmit && pNet !== "voi-localnet") throw new Error("MAINNET SUBMIT BLOCKED. --submit only allowed with --network voi-localnet");
      var pClient = await getHealthyClient(pNet);
      var pTxn = await buildPayment(pClient, { sender: getAddress(walletAlias), receiver: pTo, amount: pAmount, note: "voi-wallet-payment-" + Date.now() });
      var pSigned = signAtomicGroup([pTxn], walletAlias);
      if (!pSigned[0]) throw new Error("Signing failed — wallet is not the sender");
      var pResult = { type: "payment", sender: getAddress(walletAlias), receiver: pTo, amount: pAmount, network: pNet, txnSize: pSigned[0].length };
      if (pSubmit) {
        var pSub = await submitAtomicGroup(pClient, pSigned);
        pResult.submitted = true;
        pResult.txId = pSub.txId;
        pResult.confirmedRound = pSub.confirmedRound;
      } else {
        pResult.submitted = false;
        pResult.signedB64 = Buffer.from(pSigned[0]).toString("base64");
      }
      console.log(JSON.stringify(pResult));
      return;
    }

    case "arc200-transfer": {
      var af = parseFlags(args, ["app-id", "to", "amount", "network", "submit"]);
      var aAppId = parseInt(af.flags["app-id"], 10);
      var aTo = af.flags.to;
      var aAmount = parseInt(af.flags.amount, 10);
      var aNet = af.flags.network || "voi-mainnet";
      var aSubmit = af.flags.submit !== undefined || args.indexOf("--submit") !== -1;
      if (isNaN(aAppId) || !aTo || isNaN(aAmount)) throw new Error("Usage: arc200-transfer --app-id <id> --to <addr> --amount <uint64> --wallet <alias> --network <net> [--submit]");
      if (aSubmit && aNet !== "voi-localnet") throw new Error("MAINNET SUBMIT BLOCKED. --submit only allowed with --network voi-localnet");
      var aClient = await getHealthyClient(aNet);
      var aTxn = await buildArc200Transfer(aClient, { sender: getAddress(walletAlias), appId: aAppId, receiver: aTo, amount: aAmount });
      var aSigned = signAtomicGroup([aTxn], walletAlias);
      if (!aSigned[0]) throw new Error("Signing failed — wallet is not the sender");
      var aResult = { type: "arc200-transfer", appId: aAppId, methodSelector: "0xda7025b9", sender: getAddress(walletAlias), receiver: aTo, amount: aAmount, network: aNet, txnSize: aSigned[0].length };
      if (aSubmit) {
        var aSub = await submitAtomicGroup(aClient, aSigned);
        aResult.submitted = true;
        aResult.txId = aSub.txId;
        aResult.confirmedRound = aSub.confirmedRound;
      } else {
        aResult.submitted = false;
      }
      console.log(JSON.stringify(aResult));
      return;
    }

    case "arc72-transfer": {
      var nf2 = parseFlags(args, ["app-id", "token-id", "to", "network", "submit"]);
      var nAppId = parseInt(nf2.flags["app-id"], 10);
      var nTokenId = parseInt(nf2.flags["token-id"], 10);
      var nTo = nf2.flags.to;
      var nNet = nf2.flags.network || "voi-mainnet";
      var nSubmit = nf2.flags.submit !== undefined || args.indexOf("--submit") !== -1;
      if (isNaN(nAppId) || isNaN(nTokenId) || !nTo) throw new Error("Usage: arc72-transfer --app-id <id> --token-id <uint64> --to <addr> --wallet <alias> --network <net> [--submit]");
      if (nSubmit && nNet !== "voi-localnet") throw new Error("MAINNET SUBMIT BLOCKED. --submit only allowed with --network voi-localnet");
      var nClient = await getHealthyClient(nNet);
      var nTxn = await buildArc72TransferFrom(nClient, { sender: getAddress(walletAlias), appId: nAppId, from: getAddress(walletAlias), to: nTo, tokenId: nTokenId });
      var nSigned = signAtomicGroup([nTxn], walletAlias);
      if (!nSigned[0]) throw new Error("Signing failed — wallet is not the sender");
      var nResult = { type: "arc72-transfer", appId: nAppId, tokenId: nTokenId, methodSelector: "0x3fd6251d", extraPages: 1, sender: getAddress(walletAlias), receiver: nTo, network: nNet, txnSize: nSigned[0].length };
      if (nSubmit) {
        var nSub = await submitAtomicGroup(nClient, nSigned);
        nResult.submitted = true;
        nResult.txId = nSub.txId;
        nResult.confirmedRound = nSub.confirmedRound;
      } else {
        nResult.submitted = false;
      }
      console.log(JSON.stringify(nResult));
      return;
    }

    default:
      throw new Error("Unknown command: " + cmd);
  }
}

var parsed = parseArgs(process.argv);
if (!parsed.cmd) {
  console.error("Usage: node src/index.js [--wallet <alias>] <command> [args...]");
  console.error("");
  console.error("Wallet lifecycle:");
  console.error("  wallet-generate [--alias <name>] [--network <net>]");
  console.error("  wallet-import <address> <alias> [--secret-ref <op-path>] [--network <net>]");
  console.error("  wallet-list");
  console.error("  wallet-remove <alias>");
  console.error("");
  console.error("Signing:");
  console.error("  sign-txn <base64-unsigned-txn>");
  console.error("  sign-group <b64-txn1> [b64-txn2] ...");
  console.error("");
  console.error("Network:");
  console.error("  submit-txn <base64-signed-txn> [--network <net>]");
  console.error("  node-status [--network <net>]");
  console.error("");
  console.error("Localnet:");
  console.error("  fund-from-genesis <target-address> <amount-microAlgo> [--network voi-localnet]");
  console.error("");
  console.error("Networks: voi-mainnet (default), voi-custom, voi-localnet");
  process.exit(1);
}

async function main() {
  try {
    await runCommand(parsed.cmd, parsed.args, parsed.walletAlias);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
  process.exit(process.exitCode || 0);
}
main();
