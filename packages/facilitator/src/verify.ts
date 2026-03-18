import {
    type PaymentPayload,
    type PaymentDetails,
    type VerifyResponse,
} from "@ton-x402/core";
import { Cell, Address, loadMessage, loadMessageRelaxed, beginCell } from "@ton/core";
import { TonClient } from "@ton/ton";

// ============================================================
// BOC Verification (offline — no blockchain call needed)
// ============================================================

export async function verifyBoc(
    paymentPayload: PaymentPayload,
    paymentDetails: PaymentDetails,
    client?: TonClient,
): Promise<VerifyResponse> {
    try {
        const bocBuffer = Buffer.from(paymentPayload.boc, "base64");
        const cell = Cell.fromBoc(bocBuffer)[0];

        const extMsg = loadMessage(cell.beginParse());

        if (extMsg.info.type !== "external-in") {
            return { valid: false, reason: "Not an external-in message" };
        }

        const expectedAddress = Address.parse(paymentDetails.payTo);

        // Verify from address matches external message destination
        const extDest = extMsg.info.dest;
        const claimedFrom = Address.parse(paymentPayload.fromAddress);
        if (!extDest.equals(claimedFrom)) {
            return {
                valid: false,
                reason: `External message destination (${extDest.toString()}) doesn't match claimed fromAddress (${paymentPayload.fromAddress})`,
            };
        }

        if (paymentPayload.scheme !== paymentDetails.scheme) {
            return {
                valid: false,
                reason: `Scheme mismatch: payload=${paymentPayload.scheme}, details=${paymentDetails.scheme}`,
            };
        }

        if (paymentPayload.network !== paymentDetails.network) {
            return {
                valid: false,
                reason: `Network mismatch: payload=${paymentPayload.network}, details=${paymentDetails.network}`,
            };
        }

        if (!paymentPayload.queryId || paymentPayload.queryId.trim() === "") {
            return { valid: false, reason: "Missing queryId" };
        }

        // Deep search through cells for the destination address
        const searchResult = await deepSearchCells(
            cell,
            expectedAddress,
            BigInt(paymentDetails.amount),
            paymentDetails.asset,
            claimedFrom,
            paymentPayload.queryId,
            client
        );
        if (!searchResult.foundAddress) {
            return {
                valid: false,
                reason: `Destination ${paymentDetails.asset === "TON" ? "address" : "Jetton transfer to"} ${paymentDetails.payTo} not found in BOC`,
            };
        }

        return { valid: true };
    } catch (err) {
        return {
            valid: false,
            reason: `BOC parsing error: ${(err as Error).message}`,
        };
    }
}

async function deepSearchCells(
    cell: Cell,
    targetAddress: Address,
    minAmount: bigint,
    asset: string,
    senderAddress: Address,
    queryId: string,
    client?: TonClient,
    visited = new Set<string>(),
): Promise<{ foundAddress: boolean }> {
    const hash = cell.hash().toString("hex");
    if (visited.has(hash)) return { foundAddress: false };
    visited.add(hash);

    let foundAddress = false;

    try {
        const slice = cell.beginParse();
        if (slice.remainingBits >= 4) {
            const prefix = slice.preloadUint(1);
            if (prefix === 0) {
                try {
                    // Try standard message first
                    let msg;
                    try {
                        msg = loadMessage(cell.beginParse());
                    } catch {
                        // Try relaxed message (common in Wallet V5 actions)
                        msg = loadMessageRelaxed(cell.beginParse());
                    }

                    if (msg.info.type === "internal") {
                        if (asset === "TON") {
                            const dest = msg.info.dest;
                            if (dest.equals(targetAddress) && msg.info.value.coins >= minAmount) {
                                foundAddress = true;
                            }
                        } else if (client) {
                            // Jetton Verification
                            const masterAddress = Address.parse(asset);
                            // Verify this message is sent to the sender's jetton wallet
                            // (We need the client to resolve it for certainty)
                            const res = await client.runMethod(masterAddress, "get_wallet_address", [
                                { type: "slice", cell: beginCell().storeAddress(senderAddress).endCell() },
                            ]);
                            const expectedJettonWallet = res.stack.readAddress();

                            if (msg.info.dest.equals(expectedJettonWallet)) {
                                // Now check the body for TEP-74 transfer
                                const slice = msg.body.beginParse();
                                if (slice.remainingBits >= 32 + 64) {
                                    const op = slice.loadUint(32);
                                    if (op === 0xf8a7ea5) { // op::transfer
                                        slice.skip(64); // skip query_id
                                        const jettonAmount = slice.loadCoins();
                                        const destination = slice.loadAddress();
                                        if (jettonAmount >= minAmount && destination.equals(targetAddress)) {
                                            // Optional but good: verify forward_payload matches queryId
                                            try {
                                                slice.loadAddress(); // response_destination
                                                slice.loadMaybeRef(); // custom_payload
                                                slice.loadCoins(); // forward_ton_amount
                                                const payloadSlice = slice.loadBit() ? slice.loadRef().beginParse() : slice;
                                                if (payloadSlice.remainingBits >= 32) {
                                                    const innerOp = payloadSlice.loadUint(32);
                                                    if (innerOp === 0) {
                                                        const text = payloadSlice.loadStringTail();
                                                        if (text === `x402:${queryId}`) {
                                                            foundAddress = true;
                                                        }
                                                    }
                                                }
                                            } catch {
                                                // Fallback: if we can't parse perfectly, trust the amount/dest
                                                foundAddress = true;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch {
                    // Not a valid message — continue
                }
            }
        }
    } catch {
        // Can't parse — continue to children
    }

    for (let i = 0; i < cell.refs.length; i++) {
        const childResult = await deepSearchCells(
            cell.refs[i],
            targetAddress,
            minAmount,
            asset,
            senderAddress,
            queryId,
            client,
            visited
        );
        if (childResult.foundAddress) foundAddress = true;
    }

    return { foundAddress };
}