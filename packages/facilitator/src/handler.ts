import {
    type VerifyRequest,
    type VerifyResponse,
    type SettleRequest,
    type SettleResponse,
} from "@ton-x402/core";
import { TonClient } from "@ton/ton";
import { verifyBoc } from "./verify.js";
import { settleBoc, type SettleOptions } from "./settle.js";

export interface FacilitatorConfig {
    tonRpcUrl: string;
    tonApiKey?: string;
    timeoutMs?: number;
}

function createClient(config: FacilitatorConfig): TonClient {
    return new TonClient({
        endpoint: config.tonRpcUrl,
        apiKey: config.tonApiKey,
    });
}

export function createVerifyHandler(config: FacilitatorConfig) {
    return async (request: Request): Promise<Response> => {
        try {
            const body = (await request.json()) as VerifyRequest;

            if (!body.paymentPayload || !body.paymentDetails) {
                return Response.json(
                    { valid: false, reason: "Missing paymentPayload or paymentDetails" } satisfies VerifyResponse,
                    { status: 400 },
                );
            }

            const client = createClient(config);
            const result = await verifyBoc(body.paymentPayload, body.paymentDetails, client);
            return Response.json(result);
        } catch (err) {
            return Response.json(
                { valid: false, reason: `Server error: ${(err as Error).message}` } satisfies VerifyResponse,
                { status: 500 },
            );
        }
    };
}

export function createSettleHandler(config: FacilitatorConfig) {
    const client = createClient(config);

    return async (request: Request): Promise<Response> => {
        try {
            const body = (await request.json()) as SettleRequest;

            if (!body.paymentPayload || !body.paymentDetails) {
                return Response.json(
                    { success: false, error: "Missing paymentPayload or paymentDetails" } satisfies SettleResponse,
                    { status: 400 },
                );
            }

            // Verify locally before broadcasting
            const verifyResult = await verifyBoc(body.paymentPayload, body.paymentDetails, client);
            if (!verifyResult.valid) {
                return Response.json(
                    { success: false, error: `Pre-settle verification failed: ${verifyResult.reason}` } satisfies SettleResponse,
                    { status: 400 },
                );
            }

            const settleOptions: SettleOptions = {
                client,
                timeoutMs: config.timeoutMs ?? 60_000,
            };

            const result = await settleBoc(body.paymentPayload, body.paymentDetails, settleOptions);

            const status = result.success ? 200 : 500;
            return Response.json(result, { status });
        } catch (err) {
            return Response.json(
                { success: false, error: `Server error: ${(err as Error).message}` } satisfies SettleResponse,
                { status: 500 },
            );
        }
    };
}