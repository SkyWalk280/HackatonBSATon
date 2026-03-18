import {
    type PaymentPayload,
    type PaymentDetails,
    type SettleResponse,
} from "@ton-x402/core";
import { TonClient, Address, Cell, Transaction } from "@ton/ton";

export interface SettleOptions {
    client: TonClient;
    timeoutMs?: number;
    pollIntervalMs?: number;
}

// In-memory dedup cache
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
        // Dedup check
        cleanCache();
        const cacheKey = paymentPayload.boc;
        if (settlementCache.has(cacheKey)) {
            return {
                success: false,
                error: "Duplicate settlement: this BOC has already been submitted",
            };
        }
        settlementCache.set(cacheKey, { timestamp: Date.now() });

        // Broadcast the BOC
        const bocBuffer = Buffer.from(paymentPayload.boc, "base64");
        console.log(`[settle] Broadcasting BOC for queryId=${paymentPayload.queryId} from=${paymentPayload.fromAddress}`);
        console.log(`[settle] Asset=${paymentDetails.asset} amount=${paymentDetails.amount} payTo=${paymentDetails.payTo}`);
        await client.sendFile(bocBuffer);
        console.log(`[settle] BOC broadcast OK`);

        // Wait for on-chain confirmation
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

                console.log(`[settle] Poll #${pollCount} — found ${transactions.length} txs on ${paymentDetails.payTo}`);

                for (const tx of transactions) {
                    const inMsg = tx.inMessage;
                    if (inMsg?.info.type === "internal") {
                        const slice = inMsg.body.beginParse();
                        const op = slice.remainingBits >= 32 ? slice.preloadUint(32) : -1;
                        console.log(`[settle]   tx op=0x${op.toString(16)} from=${inMsg.info.src?.toString()}`);
                    }
                    const match = matchTransaction(tx, paymentPayload.fromAddress, expectedAmount, queryId);
                    if (match) {
                        const txHash = tx.hash().toString("hex");
                        console.log(`[settle] MATCH found! txHash=${txHash}`);
                        return { success: true, txHash };
                    }
                }
            } catch (e) {
                console.log(`[settle] Poll #${pollCount} error: ${(e as Error).message}`);
            }
        }
        console.log(`[settle] Timeout after ${pollCount} polls`);

        return {
            success: false,
            error: "Settlement timeout: transaction not confirmed within timeout period. It may still confirm.",
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

    if (op === 0) {
        // Standard TON transfer with comment
        const text = slice.loadStringTail();
        if (text === `x402:${queryId}`) {
            try {
                const expectedSender = Address.parse(fromAddress);
                return info.src.equals(expectedSender) && info.value.coins >= expectedAmount;
            } catch {
                return false;
            }
        }
    } else if (op === 0x7362d09c) {
        // Jetton transfer_notification
        // transfer_notification#7362d09c query_id:uint64 amount:(VarUint 16) sender:MsgAddress forward_payload:(Either Cell ^Cell)
        if (slice.remainingBits < 64) return false;
        slice.loadUint(64); // skip query_id

        const jettonAmount = slice.loadCoins();
        if (jettonAmount < expectedAmount) return false;

        const initiator = slice.loadAddress();
        try {
            const expectedInitiator = Address.parse(fromAddress);
            if (!initiator.equals(expectedInitiator)) return false;
        } catch {
            return false;
        }

        // Check forward_payload
        if (slice.remainingBits < 1) return false;
        const payloadSlice = slice.loadBit() ? slice.loadRef().beginParse() : slice;
        if (payloadSlice.remainingBits >= 32) {
            const innerOp = payloadSlice.loadUint(32);
            if (innerOp === 0) {
                const text = payloadSlice.loadStringTail();
                if (text === `x402:${queryId}`) {
                    return true;
                }
            }
        }
    }

    return false;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}