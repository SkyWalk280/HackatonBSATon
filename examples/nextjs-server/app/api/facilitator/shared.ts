import { createVerifyHandler, createSettleHandler } from "@ton-x402/facilitator";

const config = {
    tonRpcUrl:
        process.env.TON_RPC_URL ??
        "https://testnet.toncenter.com/api/v2/jsonRPC",
    tonApiKey: process.env.RPC_API_KEY,
};

export const verifyHandler = createVerifyHandler(config);
export const settleHandler = createSettleHandler(config);