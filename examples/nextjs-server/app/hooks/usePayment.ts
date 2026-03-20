"use client";

import { useState, useCallback } from "react";
import { useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";
import { Address, beginCell, toNano } from "@ton/ton";

export type PaymentStatus =
  | "idle"
  | "loading"
  | "payment_required"
  | "waiting_wallet"
  | "verifying"
  | "success"
  | "error";

interface PaymentRequiredBody {
  version: number;
  accepts: Array<{
    amount: string;
    asset: string;
    description: string;
    decimals: number;
    payTo: string;
  }>;
}

interface UsePaymentOptions {
  endpoint: string;
  onSuccess: (data: any) => void;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function usePayment({ endpoint, onSuccess }: UsePaymentOptions) {
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const [status, setStatus] = useState<PaymentStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [paymentInfo, setPaymentInfo] = useState<PaymentRequiredBody | null>(null);

  const execute = useCallback(async () => {
    setStatus("loading");
    setError(null);

    try {
      // Step 1: call the API normally
      const firstRes = await fetch(endpoint);
      if (firstRes.ok) {
        const data = await firstRes.json();
        onSuccess(data);
        setStatus("success");
        return;
      }

      if (firstRes.status !== 402) {
        throw new Error(`Unexpected status: ${firstRes.status}`);
      }

      // Step 2: get payment instructions
      const paymentRequired: PaymentRequiredBody = await firstRes.json();
      setPaymentInfo(paymentRequired);
      setStatus("payment_required");

      if (!wallet) throw new Error("Please connect your TON wallet first");
      const accept = paymentRequired.accepts[0];
      if (!accept) throw new Error("No payment options in 402 response");

      // Step 3: generate queryId for the facilitator
      const queryId = BigInt(Date.now()) % (2n ** 64n);

      // Step 4: fetch Jetton wallet address for this user
      const jwRes = await fetch(
        `/api/jetton-wallet?master=${accept.asset}&owner=${wallet.account.address}`
      );
      const { jettonWalletAddress } = await jwRes.json();
      if (!jettonWalletAddress) throw new Error("Jetton wallet not found");

      // Step 5: build transfer payload (x402 format)
      const jettonPayload = beginCell()
        .storeUint(0xf8a7ea5, 32)                           // transfer op
        .storeUint(queryId, 64)                             // queryId
        .storeCoins(BigInt(accept.amount))                  // token amount
        .storeAddress(Address.parse(accept.payTo))          // recipient
        .storeAddress(Address.parse(wallet.account.address))// return excess gas
        .storeMaybeRef(null)                                // no custom payload
        .storeCoins(1_000_000n)                             // forward TON
        .storeBit(0)                                        // no forward payload
        .storeUint(0, 32)                                   // comment prefix
        .storeStringTail(`x402:${queryId.toString()}`)      // facilitator tag
        .endCell();

      // Step 6: ask user to sign via TonConnect
      setStatus("waiting_wallet");
      const txResult = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [
          {
            address: jettonWalletAddress,
            amount: toNano("0.05").toString(),
            payload: jettonPayload.toBoc().toString("base64"),
          },
        ],
      });

      // Step 7: send the payment signature to the endpoint
      setStatus("verifying");
      const paymentPayload = {
        scheme: "ton-v1",
        network: (process.env.NEXT_PUBLIC_TON_NETWORK || "testnet") as "testnet" | "mainnet",
        boc: txResult.boc,
        fromAddress: wallet.account.address,
        queryId: queryId.toString(),
      };
      const paymentHeader = btoa(JSON.stringify(paymentPayload));

      // Step 8: wait for network propagation
      await wait(5000);

      // Step 9: retry the endpoint
      let secondRes: Response | null = null;
      for (let i = 0; i < 5; i++) {
        secondRes = await fetch(endpoint, {
          headers: { "PAYMENT-SIGNATURE": paymentHeader },
        });
        console.log(`Retry ${i} | status:`, secondRes.status);
        console.log(`Retry ${i} | body:`, await secondRes.clone().text());
        if (secondRes.ok) break;
        if (i < 4) await wait(3000);
      }

      if (!secondRes || !secondRes.ok) {
        throw new Error(`Payment verification failed after retries`);
      }

      const data = await secondRes.json();
      onSuccess(data);
      setStatus("success");
    } catch (err: any) {
      setError(err.message?.includes("User rejects") 
        ? "You cancelled the payment in your wallet." 
        : err.message ?? "Something went wrong");
      setStatus("error");
    }
  }, [endpoint, onSuccess, tonConnectUI, wallet]);

  return { execute, status, error, paymentInfo };
}