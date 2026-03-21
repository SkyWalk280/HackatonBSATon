import { TonClient, WalletContractV5R1 } from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";
import { internal, beginCell, Address, SendMode, toNano } from "@ton/core";

const JETTON_MASTER = process.env.JETTON_MASTER_ADDRESS!;
const RPC_URL = process.env.TON_RPC_URL!;
const RPC_KEY = process.env.RPC_API_KEY;
const MNEMONIC = process.env.WALLET_MNEMONIC!;

export async function sendPayout(
  winnerAddress: string,
  amount: string,
): Promise<string> {
  const keypair = await mnemonicToPrivateKey(MNEMONIC.split(" "));

  const wallet = WalletContractV5R1.create({
    publicKey: keypair.publicKey,
    workchain: 0,
  });

  const client = new TonClient({
    endpoint: RPC_URL,
    apiKey: RPC_KEY,
  });

  const walletContract = client.open(wallet);
  const seqno = await walletContract.getSeqno();

  const res = await client.runMethod(
    Address.parse(JETTON_MASTER),
    "get_wallet_address",
    [{ type: "slice", cell: beginCell().storeAddress(wallet.address).endCell() }]
  );
  const serverJettonWallet = res.stack.readAddress();

  const queryId = BigInt(Date.now()) % (2n ** 64n);

  const jettonPayload = beginCell()
    .storeUint(0xf8a7ea5, 32)
    .storeUint(queryId, 64)
    .storeCoins(BigInt(amount))
    .storeAddress(Address.parse(winnerAddress))
    .storeAddress(wallet.address)
    .storeMaybeRef(null)
    .storeCoins(1_000_000n)
    .storeBit(0)
    .storeUint(0, 32)
    .storeStringTail(`payout:${queryId.toString()}`)
    .endCell();

  const transfer = walletContract.createTransfer({
    seqno,
    secretKey: keypair.secretKey,
    messages: [
      internal({
        to: serverJettonWallet,
        value: toNano("0.1"),
        bounce: true,
        body: jettonPayload,
      }),
    ],
    sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
  });

  await walletContract.send(transfer);

  return `payout_${queryId.toString()}`;
}