import { getMatch } from "../../../../lib/match-store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const match = await getMatch(id);

  if (!match) {
    return Response.json({ error: "Match not found" }, { status: 404 });
  }

  return Response.json({
    id: match.id,
    status: match.status,
    gameMode: match.gameMode,
    seed: match.seed,
    entryFee: match.entryFee,
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
  });
}