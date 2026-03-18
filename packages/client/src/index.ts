import {
    type PaymentRequired,
    type PaymentPayload,
    type SettlementResponse,
    decodePaymentRequired,
    encodePaymentPayload,
    decodeSettlementResponse,
    generateQueryId,
    atomicToJetton,
    nanoToTon,
    HEADER_PAYMENT_REQUIRED,
    HEADER_PAYMENT_SIGNATURE,
    HEADER_PAYMENT_RESPONSE,
} from "@ton-x402/core";
import {
    internal,
    external,
    beginCell,
    storeMessage,
    Address,
    SendMode,
} from "@ton/core";
import {
    WalletContractV4,
    WalletContractV5R1,
    TonClient,
} from "@ton/ton";
import type { KeyPair } from "@ton/crypto";

// ============================================================
// Types
// ============================================================

type WalletContract = WalletContractV4 | WalletContractV5R1 | {
    createTransfer(args: {
        seqno: number;
        secretKey: Buffer;
        messages: ReturnType<typeof internal>[];
        sendMode: number;
    }): unknown;
    address: Address;
};

export interface X402ClientConfig {
    wallet: WalletContract;
    keypair: KeyPair;
    seqno?: number;
    client?: TonClient;
    amount?: string;
    payTo?: string;
    verbose?: boolean;
}

export interface X402FetchResult {
    response: Response;
    settlement?: SettlementResponse;
    paid: boolean;
}

// ============================================================
// Verbose logger
// ============================================================

const c = {
    reset:   "\x1b[0m",
    bold:    "\x1b[1m",
    dim:     "\x1b[2m",
    cyan:    "\x1b[36m",
    yellow:  "\x1b[33m",
    green:   "\x1b[32m",
    red:     "\x1b[31m",
    gray:    "\x1b[90m",
    magenta: "\x1b[35m",
    blue:    "\x1b[34m",
    white:   "\x1b[97m",
};

function banner(step: string, title: string) {
    const line = "─".repeat(62);
    console.log(`\n${c.bold}${c.cyan}┌${line}┐${c.reset}`);
    console.log(`${c.bold}${c.cyan}│${c.reset}  ${c.bold}${c.white}${step}${c.reset}${c.bold}  ${title}${c.reset}`);
    console.log(`${c.bold}${c.cyan}└${line}┘${c.reset}`);
}

function headerBox(name: string, raw: string, decoded: object) {
    const short = raw.length > 80 ? raw.slice(0, 77) + "..." : raw;
    console.log(`\n  ${c.bold}${c.magenta}◆ ${name}${c.reset}`);
    console.log(`  ${c.gray}  raw  : ${short}${c.reset}`);
    console.log(`  ${c.cyan}  value:${c.reset} ${JSON.stringify(decoded, null, 2).replace(/\n/g, "\n         ")}`);
}

function arrow(direction: "→" | "←", color: string, label: string) {
    console.log(`\n  ${c.bold}${color}${direction}${c.reset} ${label}`);
}

// ============================================================
// Core: create signed BOC for a TON transfer
// ============================================================

async function createSignedBoc(
    wallet: WalletContract,
    keypair: KeyPair,
    seqno: number,
    to: string,
    amount: string,
    queryId: string,
    asset: string = "TON",
    client?: TonClient,
): Promise<string> {
    let transferMessage: ReturnType<typeof internal>;

    if (asset === "TON") {
        transferMessage = internal({
            to: Address.parse(to),
            value: BigInt(amount),
            bounce: false,
            body: beginCell()
                .storeUint(0, 32)
                .storeStringTail(`x402:${queryId}`)
                .endCell(),
        });
    } else {
        // Jetton transfer (TEP-74)
        if (!client) {
            throw new Error("TonClient is required in config for Jetton transfers");
        }

        const masterAddress = Address.parse(asset);
        const recipientAddress = Address.parse(to);

        // 1. Resolve sender's jetton wallet address
        const res = await client.runMethod(masterAddress, "get_wallet_address", [
            { type: "slice", cell: beginCell().storeAddress(wallet.address).endCell() },
        ]);
        const senderJettonWallet = res.stack.readAddress();

        // 2. Construct TEP-74 transfer body
        const jettonTransferBody = beginCell()
            .storeUint(0xf8a7ea5, 32) // op::transfer
            .storeUint(BigInt(queryId), 64) // query_id
            .storeCoins(BigInt(amount)) // amount
            .storeAddress(recipientAddress) // destination
            .storeAddress(wallet.address) // response_destination (excess gas to sender)
            .storeMaybeRef(null) // custom_payload
            .storeCoins(1_000_000n) // forward_ton_amount (0.001 TON for notification)
            .storeBit(0) // forward_payload: in-place
            .storeUint(0, 32) // comment prefix
            .storeStringTail(`x402:${queryId}`)
            .endCell();

        transferMessage = internal({
            to: senderJettonWallet,
            value: BigInt(70_000_000), // 0.07 TON for gas (conservative)
            bounce: true,
            body: jettonTransferBody,
        });
    }

    const transfer = (wallet as any).createTransfer({
        seqno,
        secretKey: keypair.secretKey,
        messages: [transferMessage],
        sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
    });

    const ext = external({
        to: wallet.address,
        init: seqno === 0 ? (wallet as any).init : undefined,
        body: transfer,
    });

    const cell = beginCell().store(storeMessage(ext)).endCell();
    const boc = cell.toBoc();
    return boc.toString("base64");
}

// ============================================================
// x402 fetch wrapper
// ============================================================

/**
 * Wraps native fetch to handle x402 payment flow transparently.
 *
 * 1. Makes the initial request
 * 2. If 402 → reads PAYMENT-REQUIRED, signs BOC, retries with PAYMENT-SIGNATURE
 * 3. Returns the final response with settlement info
 *
 * Pass `verbose: true` in config to log the full HTTP + payment flow.
 * The client NEVER broadcasts — the signed BOC goes to the facilitator.
 */
export async function x402Fetch(
    url: string | URL,
    config: X402ClientConfig,
    init?: RequestInit,
): Promise<X402FetchResult> {
    const { wallet, keypair, verbose = false } = config;
    const urlStr = url.toString();

    // ── Step 1: Initial request ──────────────────────────────────────
    if (verbose) {
        banner("STEP 1/3", "Initial Request  (no payment attached)");
        arrow("→", c.yellow, `GET ${c.bold}${urlStr}${c.reset}`);
        console.log(`  ${c.gray}  headers: (none — first probe)${c.reset}`);
    }

    const firstResponse = await fetch(url, init);

    if (firstResponse.status !== 402) {
        if (verbose) {
            arrow("←", c.green, `${c.bold}${c.green}${firstResponse.status} ${firstResponse.statusText}${c.reset}  (no payment needed)`);
        }
        return { response: firstResponse, paid: false };
    }

    // Step 2: Parse payment requirements
    const paymentRequiredHeader = firstResponse.headers.get(HEADER_PAYMENT_REQUIRED);
    if (!paymentRequiredHeader) {
        throw new Error("Server returned 402 but no PAYMENT-REQUIRED header");
    }

    const paymentRequired: PaymentRequired = decodePaymentRequired(paymentRequiredHeader);

    if (verbose) {
        arrow("←", c.yellow, `${c.bold}${c.yellow}402 Payment Required${c.reset}`);
        headerBox(HEADER_PAYMENT_REQUIRED, paymentRequiredHeader, paymentRequired);
    }

    const tonOption = paymentRequired.accepts.find(
        (a) => a.scheme === "ton-v1"
    );
    if (!tonOption) {
        throw new Error(
            `No TON payment option available. Accepted schemes: ${paymentRequired.accepts.map((a) => a.scheme).join(", ")}`
        );
    }

    // ── Step 2: Determine seqno ──────────────────────────────────────
    let seqno = config.seqno;
    if (seqno === undefined) {
        if ("getSeqno" in wallet && typeof (wallet as any).getSeqno === "function") {
            seqno = await (wallet as any).getSeqno();
        } else {
            throw new Error(
                "seqno not provided and wallet has no getSeqno() method. " +
                "Pass seqno in config or open the wallet contract with a provider."
            );
        }
    }

    // ── Step 3: Sign BOC ─────────────────────────────────────────────
    const queryId = generateQueryId();

    if (verbose) {
        banner("STEP 2/3", "Build & Sign Payment  (local — nothing broadcast yet)");

        const isTon = tonOption.asset === "TON";
        const humanAmount = isTon
            ? `${nanoToTon(config.amount ?? tonOption.amount)} TON`
            : `${atomicToJetton(config.amount ?? tonOption.amount, tonOption.decimals ?? 9)} BSA USD`;
        const assetLabel = isTon ? "TON (native)" : `Jetton  ${tonOption.asset}`;

        console.log(`\n  ${c.bold}asset:${c.reset}       ${assetLabel}`);
        console.log(`  ${c.bold}amount:${c.reset}      ${c.green}${humanAmount}${c.reset}  ${c.gray}(${config.amount ?? tonOption.amount} atomic)${c.reset}`);
        console.log(`  ${c.bold}payTo:${c.reset}       ${config.payTo ?? tonOption.payTo}`);
        console.log(`  ${c.bold}from:${c.reset}        ${wallet.address.toString({ bounceable: false })}`);
        console.log(`  ${c.bold}network:${c.reset}     ${tonOption.network}`);
        console.log(`  ${c.bold}queryId:${c.reset}     ${queryId}  ${c.gray}(unique tx identifier)${c.reset}`);
        console.log(`  ${c.bold}seqno:${c.reset}       ${seqno}  ${c.gray}(wallet sequence number — replay protection)${c.reset}`);
    }

    const boc = await createSignedBoc(
        wallet,
        keypair,
        seqno!,
        config.payTo ?? tonOption.payTo,
        config.amount ?? tonOption.amount,
        queryId,
        tonOption.asset,
        config.client,
    );

    // Step 5: Build payment payload
    const paymentPayload: PaymentPayload = {
        scheme: "ton-v1",
        network: tonOption.network,
        boc,
        fromAddress: wallet.address.toString({ bounceable: false }),
        queryId,
    };

    const encodedPayload = encodePaymentPayload(paymentPayload);

    if (verbose) {
        console.log(`  ${c.bold}BOC:${c.reset}         ${c.gray}${boc.slice(0, 48)}...${c.reset}  ${c.dim}(${Math.ceil(boc.length * 3 / 4)} bytes, base64-encoded signed cell)${c.reset}`);
        headerBox(HEADER_PAYMENT_SIGNATURE, encodedPayload, {
            scheme: paymentPayload.scheme,
            network: paymentPayload.network,
            fromAddress: paymentPayload.fromAddress,
            queryId: paymentPayload.queryId,
            boc: boc.slice(0, 24) + "... (truncated)",
        });
    }

    // ── Step 4: Retry with PAYMENT-SIGNATURE ─────────────────────────
    const retryInit: RequestInit = { ...init };
    const headers = new Headers(init?.headers);
    headers.set(HEADER_PAYMENT_SIGNATURE, encodedPayload);
    retryInit.headers = headers;

    if (verbose) {
        banner("STEP 3/3", "Retry Request  (with payment signature)");
        arrow("→", c.yellow, `GET ${c.bold}${urlStr}${c.reset}`);
        const shortSig = encodedPayload.length > 60 ? encodedPayload.slice(0, 57) + "..." : encodedPayload;
        console.log(`  ${c.gray}  ${HEADER_PAYMENT_SIGNATURE}: ${shortSig}${c.reset}`);
        console.log(`\n  ${c.dim}  [server] → POST ${tonOption.facilitatorUrl}/verify${c.reset}`);
        console.log(`  ${c.dim}  [server] → POST ${tonOption.facilitatorUrl}/settle  (broadcast + poll)${c.reset}`);
    }

    const secondResponse = await fetch(url, retryInit);

    // Step 7: Extract settlement response
    const paymentResponseHeader = secondResponse.headers.get(HEADER_PAYMENT_RESPONSE);
    let settlement: SettlementResponse | undefined;
    if (paymentResponseHeader) {
        settlement = decodeSettlementResponse(paymentResponseHeader);
    }

    if (verbose) {
        const statusColor = secondResponse.ok ? c.green : c.red;
        arrow("←", statusColor, `${c.bold}${statusColor}${secondResponse.status} ${secondResponse.statusText}${c.reset}`);
        if (paymentResponseHeader && settlement) {
            headerBox(HEADER_PAYMENT_RESPONSE, paymentResponseHeader, settlement);
        }
        console.log();
    }

    return {
        response: secondResponse,
        settlement,
        paid: true,
    };
}

export default x402Fetch;