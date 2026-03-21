import { getMatch, setPayoutTx } from "../../../../lib/match-store";
import { sendPayout } from "../../../../lib/payout";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const match = await getMatch(id);

  if (!match) {
    return Response.json({ error: "Match not found" }, { status: 404 });
  }

  // If the match just expired and no refund has been sent yet, fire P1 refund
  if (match.status === "expired" && !match.payoutTxHash) {
    try {
      await sendPayout(match.player1.address, match.entryFee);
      await setPayoutTx(id, "expired_refund");
    } catch (err: any) {
      console.error("[id] Expiry refund failed:", err.message);
    }
  }

  return Response.json({
    id: match.id,
    status: match.status,
    gameMode: match.gameMode,
    seed: match.seed,
    entryFee: match.entryFee,
    betAmount: match.betAmount ?? 0.01,
    expiresAt: match.expiresAt,
    player1: {
      address: match.player1.address,
      score: match.player1.score,
      finished: match.player1.finished,
    },
    player2: match.player2 ? {
      address: match.player2.address,
      score: match.player2.score,
      finished: match.player2.finished,
    } : null,
    winnerId: match.winnerId,
    payoutTxHash: match.payoutTxHash,
    createdAt: match.createdAt,
    isPublic: match.isPublic ?? true,
  });
}
