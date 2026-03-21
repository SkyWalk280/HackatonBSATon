import { submitScore, getMatch, setPayoutTx } from "../../../../lib/match-store";
import { sendPayout } from "../../../../lib/payout";

export async function POST(request: Request) {
  try {
    const { matchId, playerAddress, score, role } = await request.json();

    if (!matchId || !playerAddress || score === undefined) {
      return Response.json(
        { error: "matchId, playerAddress and score are required" },
        { status: 400 }
      );
    }

    const match = await submitScore(matchId, playerAddress, score, role);

    if (!match) {
      return Response.json(
        { error: "Match not found or you are not a player" },
        { status: 400 }
      );
    }

    // Only trigger payout once when match just finished
    if (match.status === "finished" && match.winnerId && !match.payoutTxHash) {

      // Handle tie — refund both players their entry fee
      if (match.winnerId === "tie") {
        try {
          await sendPayout(match.player1.address, match.entryFee);
          await sendPayout(match.player2!.address, match.entryFee);
          await setPayoutTx(matchId, "tie_refund");
        } catch (err: any) {
          console.error("[score] Tie refund failed:", err.message);
        }
        return Response.json({
          status: match.status,
          winnerId: "tie",
          yourScore: score,
          waiting: false,
        });
      }

      // Normal win — resolve role to actual wallet address, pay 90% of pot
      try {
        const winnerAddress = match.winnerId === "player1"
          ? match.player1.address
          : match.player2!.address;

        const prizeAmount = Math.floor(
          Number(match.entryFee) * 2 * 0.9
        ).toString();

        const txHash = await sendPayout(winnerAddress, prizeAmount);
        await setPayoutTx(matchId, txHash);

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