import type {
    PaymentRequired,
    PaymentPayload,
    SettlementResponse,
} from "./types.js";

// ============================================================
// Base64 JSON encoding/decoding for x402 HTTP headers
// ============================================================

export function encodeHeader<T>(data: T): string {
    const json = JSON.stringify(data);
    if (typeof Buffer !== "undefined") {
        return Buffer.from(json, "utf-8").toString("base64");
    }
    return btoa(json);
}

export function decodeHeader<T>(header: string): T {
    let json: string;
    if (typeof Buffer !== "undefined") {
        // Buffer handles both standard and URL-safe base64
        json = Buffer.from(header, "base64").toString("utf-8");
    } else {
        // Fallback for browser-like environments
        const normalized = header.replace(/-/g, "+").replace(/_/g, "/");
        json = atob(normalized);
    }
    return JSON.parse(json) as T;
}

// Typed convenience wrappers

export function encodePaymentRequired(data: PaymentRequired): string {
    return encodeHeader(data);
}

export function decodePaymentRequired(header: string): PaymentRequired {
    return decodeHeader<PaymentRequired>(header);
}

export function encodePaymentPayload(data: PaymentPayload): string {
    return encodeHeader(data);
}

export function decodePaymentPayload(header: string): PaymentPayload {
    return decodeHeader<PaymentPayload>(header);
}

export function encodeSettlementResponse(data: SettlementResponse): string {
    return encodeHeader(data);
}

export function decodeSettlementResponse(header: string): SettlementResponse {
    return decodeHeader<SettlementResponse>(header);
}

// ============================================================
// Header names (constants)
// ============================================================

export const HEADER_PAYMENT_REQUIRED = "PAYMENT-REQUIRED";
export const HEADER_PAYMENT_SIGNATURE = "PAYMENT-SIGNATURE";
export const HEADER_PAYMENT_RESPONSE = "PAYMENT-RESPONSE";

// ============================================================
// nanoTON helpers
// ============================================================

export const ONE_TON = 1_000_000_000n;

export function tonToNano(ton: number | string): string {
    const parts = ton.toString().split(".");
    const whole = BigInt(parts[0]) * ONE_TON;
    if (parts.length === 1) return whole.toString();

    const decimals = parts[1].padEnd(9, "0").slice(0, 9);
    return (whole + BigInt(decimals)).toString();
}

export function nanoToTon(nanoTon: string | bigint): string {
    const nano = BigInt(nanoTon);
    const whole = nano / ONE_TON;
    const frac = nano % ONE_TON;
    if (frac === 0n) return whole.toString();

    const fracStr = frac.toString().padStart(9, "0").replace(/0+$/, "");
    return `${whole}.${fracStr}`;
}

export function jettonToAtomic(amount: number | string, decimals: number): string {
    const ONE_JETTON = 10n ** BigInt(decimals);
    const parts = amount.toString().split(".");
    const whole = BigInt(parts[0]) * ONE_JETTON;
    if (parts.length === 1) return whole.toString();

    const decimalPart = parts[1].padEnd(decimals, "0").slice(0, decimals);
    return (whole + BigInt(decimalPart)).toString();
}

export function atomicToJetton(atomicAmount: string | bigint, decimals: number): string {
    const ONE_JETTON = 10n ** BigInt(decimals);
    const atomic = BigInt(atomicAmount);
    const whole = atomic / ONE_JETTON;
    const frac = atomic % ONE_JETTON;
    if (frac === 0n) return whole.toString();

    const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
    return `${whole}.${fracStr}`;
}

export function generateQueryId(): string {
    return Date.now().toString();
}