// ============================================================
// @ton-x402/core — Types for x402 protocol on TON blockchain
// ============================================================

// --------------- Network ---------------

export type TonNetwork = "mainnet" | "testnet";

/**
 * Asset type for payment.
 * "TON" = native TON coin (nanoTON)
 * Future: jetton master contract address string for TEP-74 tokens
 */
export type PaymentAsset = "TON" | (string & {});

// --------------- Protocol Headers ---------------

/**
 * PAYMENT-REQUIRED header payload (server → client).
 * Returned with HTTP 402 to tell the client what to pay.
 */
export interface PaymentRequired {
    version: "x402-ton-v1";
    description?: string;
    mimeType?: string;
    maxResponseBytes?: number;
    accepts: PaymentDetails[];
}

export interface PaymentDetails {
    scheme: "ton-v1";
    network: TonNetwork;
    amount: string;
    asset: PaymentAsset;
    payTo: string;
    facilitatorUrl: string;
    decimals?: number;
    extra?: Record<string, unknown>;
}

// --------------- Payment Payload ---------------

/**
 * PAYMENT-SIGNATURE header payload (client → server).
 * Contains the signed BOC that the facilitator will broadcast.
 */
export interface PaymentPayload {
    scheme: "ton-v1";
    network: TonNetwork;
    boc: string;
    fromAddress: string;
    queryId: string;
}

// --------------- Settlement / Response ---------------

export interface SettlementResponse {
    success: boolean;
    txHash?: string;
    error?: string;
    network: TonNetwork;
}

// --------------- Facilitator API ---------------

export interface VerifyRequest {
    paymentPayload: PaymentPayload;
    paymentDetails: PaymentDetails;
}

export interface VerifyResponse {
    valid: boolean;
    reason?: string;
}

export interface SettleRequest {
    paymentPayload: PaymentPayload;
    paymentDetails: PaymentDetails;
}

export interface SettleResponse {
    success: boolean;
    txHash?: string;
    error?: string;
}

// --------------- Configuration ---------------

export interface PaymentConfig {
    amount: string;
    asset: PaymentAsset;
    payTo: string;
    network: TonNetwork;
    facilitatorUrl: string;
    decimals?: number;
    description?: string;
}