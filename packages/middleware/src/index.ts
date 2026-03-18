import {
    type PaymentConfig,
    type PaymentRequired,
    type PaymentPayload,
    type PaymentDetails,
    type SettlementResponse,
    type VerifyRequest,
    type VerifyResponse,
    type SettleRequest,
    type SettleResponse,
    encodePaymentRequired,
    decodePaymentPayload,
    encodeSettlementResponse,
    HEADER_PAYMENT_REQUIRED,
    HEADER_PAYMENT_SIGNATURE,
    HEADER_PAYMENT_RESPONSE,
} from "@ton-x402/core";

// ============================================================
// Types
// ============================================================

export type RouteHandler = (request: Request) => Response | Promise<Response>;

export interface PaymentGateOptions {
    config: PaymentConfig;
    description?: string;
}

// ============================================================
// Facilitator client helpers
// ============================================================

async function callFacilitator<TReq, TRes>(
    facilitatorUrl: string,
    endpoint: string,
    body: TReq,
): Promise<TRes> {
    const res = await fetch(`${facilitatorUrl}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Facilitator ${endpoint} failed (${res.status}): ${text.slice(0, 200)}`);
    }

    return res.json() as Promise<TRes>;
}

// ============================================================
// Payment Gate — wraps a route handler with x402 payment logic
// ============================================================

export function paymentGate(
    handler: RouteHandler,
    options: PaymentGateOptions,
): RouteHandler {
    const { config, description } = options;

    const paymentDetails: PaymentDetails = {
        scheme: "ton-v1",
        network: config.network,
        amount: config.amount,
        asset: config.asset,
        payTo: config.payTo,
        facilitatorUrl: config.facilitatorUrl,
    };

    const paymentRequired: PaymentRequired = {
        version: "x402-ton-v1",
        description: description ?? config.description,
        accepts: [paymentDetails],
    };

    const encodedPaymentRequired = encodePaymentRequired(paymentRequired);

    return async (request: Request): Promise<Response> => {
        const paymentSignatureHeader = request.headers.get(HEADER_PAYMENT_SIGNATURE);

        // ---- No payment: return 402 ----
        if (!paymentSignatureHeader) {
            return new Response(
                JSON.stringify({
                    error: "Payment required",
                    ...paymentRequired,
                }),
                {
                    status: 402,
                    headers: {
                        "Content-Type": "application/json",
                        [HEADER_PAYMENT_REQUIRED]: encodedPaymentRequired,
                    },
                },
            );
        }

        // ---- Has payment: verify & settle ----
        let paymentPayload: PaymentPayload;
        try {
            paymentPayload = decodePaymentPayload(paymentSignatureHeader);
        } catch {
            return new Response(
                JSON.stringify({ error: "Invalid PAYMENT-SIGNATURE header" }),
                { status: 400, headers: { "Content-Type": "application/json" } },
            );
        }

        // Step 1: Verify via facilitator
        const verifyBody: VerifyRequest = { paymentPayload, paymentDetails };
        let verifyResult: VerifyResponse;

        try {
            verifyResult = await callFacilitator<VerifyRequest, VerifyResponse>(
                config.facilitatorUrl,
                "/verify",
                verifyBody,
            );
        } catch (err) {
            const settlement: SettlementResponse = {
                success: false,
                error: `Verification failed: ${(err as Error).message}`,
                network: config.network,
            };
            return new Response(JSON.stringify(settlement), {
                status: 402,
                headers: {
                    "Content-Type": "application/json",
                    [HEADER_PAYMENT_REQUIRED]: encodedPaymentRequired,
                    [HEADER_PAYMENT_RESPONSE]: encodeSettlementResponse(settlement),
                },
            });
        }

        if (!verifyResult.valid) {
            const settlement: SettlementResponse = {
                success: false,
                error: verifyResult.reason ?? "Payment verification failed",
                network: config.network,
            };
            return new Response(JSON.stringify(settlement), {
                status: 402,
                headers: {
                    "Content-Type": "application/json",
                    [HEADER_PAYMENT_REQUIRED]: encodedPaymentRequired,
                    [HEADER_PAYMENT_RESPONSE]: encodeSettlementResponse(settlement),
                },
            });
        }

        // Step 2: Settle via facilitator
        const settleBody: SettleRequest = { paymentPayload, paymentDetails };
        let settleResult: SettleResponse;

        try {
            settleResult = await callFacilitator<SettleRequest, SettleResponse>(
                config.facilitatorUrl,
                "/settle",
                settleBody,
            );
        } catch (err) {
            const settlement: SettlementResponse = {
                success: false,
                error: `Settlement failed: ${(err as Error).message}`,
                network: config.network,
            };
            return new Response(JSON.stringify(settlement), {
                status: 402,
                headers: {
                    "Content-Type": "application/json",
                    [HEADER_PAYMENT_REQUIRED]: encodedPaymentRequired,
                    [HEADER_PAYMENT_RESPONSE]: encodeSettlementResponse(settlement),
                },
            });
        }

        if (!settleResult.success) {
            const settlement: SettlementResponse = {
                success: false,
                error: settleResult.error ?? "Settlement failed on-chain",
                network: config.network,
            };
            return new Response(JSON.stringify(settlement), {
                status: 402,
                headers: {
                    "Content-Type": "application/json",
                    [HEADER_PAYMENT_REQUIRED]: encodedPaymentRequired,
                    [HEADER_PAYMENT_RESPONSE]: encodeSettlementResponse(settlement),
                },
            });
        }

        // Step 3: Payment confirmed — call the actual handler
        const handlerResponse = await handler(request);

        // Step 4: Add PAYMENT-RESPONSE header
        const settlement: SettlementResponse = {
            success: true,
            txHash: settleResult.txHash,
            network: config.network,
        };

        const finalHeaders = new Headers(handlerResponse.headers);
        finalHeaders.set(
            HEADER_PAYMENT_RESPONSE,
            encodeSettlementResponse(settlement),
        );

        return new Response(handlerResponse.body, {
            status: handlerResponse.status,
            statusText: handlerResponse.statusText,
            headers: finalHeaders,
        });
    };
}

export { type PaymentConfig } from "@ton-x402/core";