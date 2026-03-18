import { paymentGate } from "@ton-x402/middleware";
import { getPaymentConfig } from "../../../lib/payment-config";

const jokes = [
    "Why do programmers prefer dark mode? Because light attracts bugs.",
    "There are 10 types of people: those who understand binary and those who don't.",
    "A SQL query walks into a bar, sees two tables, and asks... Can I JOIN you?",
    "Why did the blockchain developer quit? He lost his private key to happiness.",
    "What's a TON validator's favorite exercise? Proof of stake-outs.",
];

const handler = (_request: Request) => {
    const joke = jokes[Math.floor(Math.random() * jokes.length)];
    return Response.json({ joke, timestamp: new Date().toISOString() });
};

export const GET = paymentGate(handler, {
    config: getPaymentConfig({
        amount: "10000000", // 0.01 BSA USD (9 decimals)
        asset: process.env.JETTON_MASTER_ADDRESS || "kQCd6G7c_HUBkgwtmGzpdqvHIQoNkYOEE0kSWoc5v57hPPnW",
        description: "Random developer joke (0.01 BSA USD)",
        decimals: 9,
    }),
});