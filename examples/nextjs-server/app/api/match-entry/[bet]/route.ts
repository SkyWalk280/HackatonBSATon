import { paymentGate } from "@ton-x402/middleware";
import { getPaymentConfig } from "../../../../lib/payment-config";

const ALLOWED_BETS: Record<string, number> = {
  "10000000":  0.01,
  "50000000":  0.05,
  "100000000": 0.10,
  "500000000": 0.50,
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ bet: string }> }
) {
  const { bet } = await params;
  const betBSAUSD = ALLOWED_BETS[bet];

  if (betBSAUSD === undefined) {
    return Response.json({ error: "Invalid bet amount" }, { status: 400 });
  }

  const handler = paymentGate(
    (_req: Request) =>
      Response.json({ success: true, timestamp: new Date().toISOString() }),
    {
      config: getPaymentConfig({
        amount: bet,
        asset:
          process.env.JETTON_MASTER_ADDRESS ||
          "kQCd6G7c_HUBkgwtmGzpdqvHIQoNkYOEE0kSWoc5v57hPPnW",
        description: `Stack Duel entry (${betBSAUSD} BSA USD)`,
        decimals: 9,
      }),
    }
  );

  return handler(request);
}
