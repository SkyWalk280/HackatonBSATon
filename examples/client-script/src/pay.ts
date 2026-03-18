import { x402Fetch } from "@ton-x402/client";
import { nanoToTon } from "@ton-x402/core";
import { TonClient } from "@ton/ton";
import { WalletContractV5R1 } from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";
import { parseArgs } from "node:util";
import { Agent, setGlobalDispatcher } from "undici";

setGlobalDispatcher(new Agent({ maxResponseSize: 65536 }));

async function main() {
    const { values } = parseArgs({
        options: {
            to: { type: "string" },
            amount: { type: "string" },
        },
    });

    const mnemonic = process.env.WALLET_MNEMONIC;
    if (!mnemonic) {
        console.error("❌ Set WALLET_MNEMONIC env var (24-word mnemonic)");
        console.error("   Get testnet TON from https://t.me/testgiver_ton_bot");
        process.exit(1);
    }

    const rpcUrl =
        process.env.TON_RPC_URL ??
        "https://testnet.toncenter.com/api/v2/jsonRPC";
    const resourceUrl =
        process.env.RESOURCE_URL ?? "http://localhost:3000/api/joke";

    const keypair = await mnemonicToPrivateKey(mnemonic.split(" "));

    const wallet = WalletContractV5R1.create({
        publicKey: keypair.publicKey,
        workchain: 0,
    });

    const client = new TonClient({
        endpoint: rpcUrl,
        apiKey: process.env.RPC_API_KEY,
    });
    const walletContract = client.open(wallet);

    // ── Wallet info ──────────────────────────────────────────────────
    const balance = await client.getBalance(wallet.address);
    const seqno = await walletContract.getSeqno();

    console.log("\x1b[1m\x1b[36m");
    console.log("  ╔══════════════════════════════════════════════════════════════╗");
    console.log("  ║              x402 on TON — Payment Demo                     ║");
    console.log("  ╚══════════════════════════════════════════════════════════════╝\x1b[0m");
    console.log(`\n  \x1b[1mWallet:\x1b[0m   ${wallet.address.toString({ bounceable: false })}`);
    console.log(`  \x1b[1mBalance:\x1b[0m  ${nanoToTon(balance.toString())} TON`);
    console.log(`  \x1b[1mSeqno:\x1b[0m    ${seqno}`);
    console.log(`  \x1b[1mEndpoint:\x1b[0m ${resourceUrl}`);

    if (values.amount || values.to) {
        console.log(`\n  \x1b[33m⚙  CLI overrides: amount=${values.amount ?? "default"}  to=${values.to ?? "default"}\x1b[0m`);
    }

    // ── x402 flow (verbose) ──────────────────────────────────────────
    const result = await x402Fetch(resourceUrl, {
        wallet,
        keypair,
        seqno,
        client,
        amount: values.amount,
        payTo: values.to,
        verbose: true,
    });

    // ── Final result ─────────────────────────────────────────────────
    if (result.response.ok) {
        const data = await result.response.json();
        console.log("\x1b[1m\x1b[32m  ✅ Payment confirmed!\x1b[0m");
        if (result.settlement?.txHash) {
            console.log(`  \x1b[1mTX Hash:\x1b[0m  ${result.settlement.txHash}`);
            console.log(`  \x1b[1mNetwork:\x1b[0m  ${result.settlement.network}`);
        }
        console.log("\n\x1b[1m  📦 Resource data:\x1b[0m");
        console.log(JSON.stringify(data, null, 2).replace(/^/gm, "  "));
    } else {
        if (result.paid) {
            console.error("\x1b[33m  ⚠️  Payment broadcasted but settlement failed (tx may still confirm on-chain)\x1b[0m");
        }
        console.error(`\x1b[31m  ❌ Request failed: ${result.response.status}\x1b[0m`);
        const text = await result.response.text();
        console.error(text);
    }
}

main().catch(console.error);