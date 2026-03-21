import { submitScore, getMatch, setPayoutTx } from "../../../../lib/match-store";
import { sendPayout } from "../../../../lib/payout";

export async function POST(request: Request) {
  try {
    const { matchId, playerAddress, score } = await request.json();

    if (!matchId || !playerAddress || score === undefined) {
      return Response.json(
        { error: "matchId, playerAddress and score are required" },
        { status: 400 }
      );
    }

    const match = await submitScore(matchId, playerAddress, score);

    if (!match) {
      return Response.json(
        { error: "Match not found or you are not a player" },
        { status: 400 }
      );
    }

    if (match.status === "finished" && match.winnerId && !match.payoutTxHash) {
      try {
        const prizeAmount = Math.floor(
          Number(match.entryFee) * 2 * 0.9
        ).toString();

        const txHash = await sendPayout(match.winnerId, prizeAmount);
        setPayoutTx(matchId, txHash);

        return Response.json({
          status: match.status,
          winnerId: match.winnerId,
          yourScore: score,
          prizeAmount,
          payoutTxHash: txHash,
          waiting: false,
        });
      } catch (payoutErr: any) {
        console.error("[score] Payout failed:", payoutErr.message);
        return Response.json({
          status: match.status,
          winnerId: match.winnerId,
          yourScore: score,
          payoutError: payoutErr.message,
          waiting: false,
        });
      }
    }

    return Response.json({
      status: match.status,
      winnerId: match.winnerId,
      yourScore: score,
      waiting: match.status === "playing",
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}