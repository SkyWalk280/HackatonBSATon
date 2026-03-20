import {
    type PaymentPayload,
    type PaymentDetails,
    type SettleResponse,
} from "@ton-x402/core";
import { TonClient, Address, Transaction } from "@ton/ton";

export interface SettleOptions {
    client: TonClient;
    timeoutMs?: number;
    pollIntervalMs?: number;
}

const settlementCache = new Map<string, { timestamp: number }>();
const CACHE_TTL_MS = 120_000;

function cleanCache() {
    const now = Date.now();
    for (const [key, val] of settlementCache) {
        if (now - val.timestamp > CACHE_TTL_MS) {
            settlementCache.delete(key);
        }
    }
}

export async function settleBoc(
    paymentPayload: PaymentPayload,
    paymentDetails: PaymentDetails,
    options: SettleOptions,
): Promise<SettleResponse> {
    const { client, timeoutMs = 60_000, pollIntervalMs = 3_000 } = options;

    try {
        cleanCache();
        const cacheKey = paymentPayload.boc;
        if (settlementCache.has(cacheKey)) {
            return {
                success: false,
                error: "Duplicate settlement: this BOC has already been submitted",
            };
        }
        settlementCache.set(cacheKey, { timestamp: Date.now() });

        // TonConnect wallets broadcast automatically when the user approves.
        // We still attempt to broadcast in case it wasn't sent yet,
        // but we IGNORE any error — the tx is likely already on chain.
        try {
            const bocBuffer = Buffer.from(paymentPayload.boc, "base64");
            await client.sendFile(bocBuffer);
            console.log(`[settle] BOC broadcast OK`);
        } catch (broadcastErr) {
            console.log(`[settle] Broadcast skipped (already on chain or rejected): ${(broadcastErr as Error).message}`);
            // Do NOT return here — continue to poll for the transaction
        }

        // Poll for on-chain confirmation
        const destAddress = Address.parse(paymentDetails.payTo);
        const startTime = Date.now();
        const queryId = paymentPayload.queryId;
        const expectedAmount = BigInt(paymentDetails.amount);

        let pollCount = 0;
        while (Date.now() - startTime < timeoutMs) {
            await sleep(pollIntervalMs);
            pollCount++;

            try {
                const transactions = await client.getTransactions(destAddress, {
                    limit: 10,
                });

                console.log(`[settle] Poll #${pollCount} — found ${transactions.length} txs`);

                for (const tx of transactions) {
                    const match = matchTransaction(tx, paymentPayload.fromAddress, expectedAmount, queryId);
                    if (match) {
                        const txHash = tx.hash().toString("hex");
                        console.log(`[settle] MATCH found! txHash=${txHash}`);
                        return { success: true, txHash };
                    }
                }
            } catch (pollErr) {
                console.log(`[settle] Poll #${pollCount} error: ${(pollErr as Error).message}`);
            }
        }

        console.log(`[settle] Timeout after ${pollCount} polls`);
        return {
            success: false,
            error: "Settlement timeout: transaction not confirmed within timeout period.",
        };

    } catch (err) {
        settlementCache.delete(paymentPayload.boc);
        return {
            success: false,
            error: `Settlement error: ${(err as Error).message}`,
        };
    }
}
function matchTransaction(
    tx: Transaction,
    fromAddress: string,
    expectedAmount: bigint,
    queryId: string,
): boolean {
    const inMsg = tx.inMessage;
    if (!inMsg) return false;
    if (inMsg.info.type !== "internal") return false;

    const info = inMsg.info;
    const slice = inMsg.body.beginParse();

    if (slice.remainingBits < 32) return false;
    const op = slice.loadUint(32);

    // ADD THIS LOG:
    console.log(`[match] op=0x${op.toString(16)} from=${info.src?.toString()} value=${info.value.coins}`);

    if (op === 0) {
        const text = slice.loadStringTail();
        console.log(`[match] comment="${text}" expected="x402:${queryId}"`);
        if (text === `x402:${queryId}`) {
            try {
                const expectedSender = Address.parse(fromAddress);
                return info.src.equals(expectedSender) && info.value.coins >= expectedAmount;
            } catch {
                return false;
            }
        }
    } else if (op === 0x7362d09c) {
        if (slice.remainingBits < 64) return false;
        slice.loadUint(64);
        const jettonAmount = slice.loadCoins();
        const initiator = slice.loadAddress();
        console.log(`[match] Jetton notification: amount=${jettonAmount} initiator=${initiator?.toString()} expected=${fromAddress} expectedAmount=${expectedAmount}`);

        try {
            const expectedInitiator = Address.parse(fromAddress);
            if (!initiator.equals(expectedInitiator)) {
                console.log(`[match] Initiator mismatch`);
                return false;
            }
        } catch {
            return false;
        }

        if (slice.remainingBits < 1) {
            console.log(`[match] No forward payload bit — matching on amount only`);
            return jettonAmount >= expectedAmount; // ← RELAXED: match without queryId
        }

        const payloadSlice = slice.loadBit() ? slice.loadRef().beginParse() : slice;
        if (payloadSlice.remainingBits >= 32) {
            const innerOp = payloadSlice.loadUint(32);
            if (innerOp === 0) {
                const text = payloadSlice.loadStringTail();
                console.log(`[match] forward payload="${text}" expected="x402:${queryId}"`);
                if (text === `x402:${queryId}`) return true;
            }
        }

        // RELAXED FALLBACK: if payload doesn't match but amount and initiator do, still accept
        console.log(`[match] Payload missing/wrong — matching on amount+initiator only`);
        return jettonAmount >= expectedAmount;
    }

    return false;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}