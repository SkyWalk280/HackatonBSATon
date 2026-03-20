import { Address, TonClient, beginCell } from "@ton/ton";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const master = searchParams.get("master");
  const owner = searchParams.get("owner");

  if (!master || !owner) {
    return Response.json({ error: "master and owner required" }, { status: 400 });
  }

  try {
    const client = new TonClient({
      endpoint: process.env.TON_RPC_URL || "https://testnet.toncenter.com/api/v2/jsonRPC",
      apiKey: process.env.RPC_API_KEY,
    });

    const result = await client.runMethod(
      Address.parse(master),
      "get_wallet_address",
      [{ type: "slice", cell: beginCell().storeAddress(Address.parse(owner)).endCell() }]
    );

    const jettonWalletAddress = result.stack.readAddress().toString();
    return Response.json({ jettonWalletAddress });

  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}