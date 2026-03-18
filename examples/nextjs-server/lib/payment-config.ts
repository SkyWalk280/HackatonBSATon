import type { PaymentConfig } from "@ton-x402/core";

export function getPaymentConfig(
    overrides?: Partial<PaymentConfig>,
): PaymentConfig {
    const payTo = overrides?.payTo ?? process.env.PAYMENT_ADDRESS;
    if (!payTo) {
        throw new Error("Missing PAYMENT_ADDRESS env variable — set it to your TON wallet address");
    }

    return {
        amount: overrides?.amount ?? "100000000", // 0.1 TON default
        asset: overrides?.asset ?? "TON",
        payTo,
        network: (process.env.TON_NETWORK as "testnet" | "mainnet") ?? "testnet",
        facilitatorUrl:
            overrides?.facilitatorUrl ??
            process.env.FACILITATOR_URL ??
            "http://localhost:3000/api/facilitator",
        description: overrides?.description,
        decimals: overrides?.decimals,
    };
}