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
      // Step 1: call the API with no payment
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

      // Step 2: read the 402 payment instructions
      const paymentRequired: PaymentRequiredBody = await firstRes.json();
      setPaymentInfo(paymentRequired);
      setStatus("payment_required");

      if (!wallet) throw new Error("Please connect your TON wallet first");

      const accept = paymentRequired.accepts[0];
      if (!accept) throw new Error("No payment options in 402 response");

      // Step 3: build the Jetton transfer transaction
      const jettonPayload = beginCell()
        .storeUint(0xf8a7ea5, 32)
        .storeUint(0, 64)
        .storeCoins(BigInt(accept.amount))
        .storeAddress(Address.parse(accept.payTo))
        .storeAddress(Address.parse(wallet.account.address))
        .storeBit(0)
        .storeCoins(toNano("0.01"))
        .storeBit(0)
        .endCell();

      // Find user's Jetton wallet address for this token
      const jwRes = await fetch(
        `/api/jetton-wallet?master=${accept.asset}&owner=${wallet.account.address}`
      );
      const { jettonWalletAddress } = await jwRes.json();

      // Step 4: ask user to sign in Tonkeeper
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

      // Step 5: wait for the tx to appear on-chain, then retry
      setStatus("verifying");

      const paymentPayload = JSON.stringify({
        boc: txResult.boc,
        asset: accept.asset,
        amount: accept.amount,
        payTo: accept.payTo,
        network: process.env.NEXT_PUBLIC_TON_NETWORK || "testnet",
      });
      const paymentHeader = btoa(paymentPayload);

      // Wait 5 seconds first — testnet needs time to propagate
      await wait(5000);

      // Then retry up to 5 times every 3 seconds
      let secondRes: Response | null = null;
      for (let i = 0; i < 5; i++) {
        secondRes = await fetch(endpoint, {
          headers: { "X-PAYMENT": paymentHeader },
        });
        if (secondRes.ok) break;
        if (i < 4) await wait(3000);
      }

      if (!secondRes || !secondRes.ok) {
        throw new Error(`Payment verification failed after retries: ${secondRes?.status}`);
      }

      const data = await secondRes.json();
      onSuccess(data);
      setStatus("success");

    } catch (err: any) {
      if (err?.message?.includes("User rejects")) {
        setError("You cancelled the payment in your wallet.");
      } else {
        setError(err.message ?? "Something went wrong");
      }
      setStatus("error");
    }
  }, [endpoint, onSuccess, tonConnectUI, wallet]);

  return { execute, status, error, paymentInfo };
}