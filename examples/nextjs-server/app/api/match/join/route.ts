import { joinMatch } from "../../../../lib/match-store";

export async function POST(request: Request) {
  try {
    const { matchId, playerAddress, paymentBoc } = await request.json();

    if (!matchId || !playerAddress || !paymentBoc) {
      return Response.json(
        { error: "matchId, playerAddress and paymentBoc are required" },
        { status: 400 }
      );
    }

    const match = joinMatch(matchId, playerAddress, paymentBoc);

    if (!match) {
      return Response.json(
        { error: "Match not found, already full, or you are the creator" },
        { status: 400 }
      );
    }

    return Response.json({
      matchId: match.id,
      seed: match.seed,
      entryFee: match.entryFee,
      betAmount: match.betAmount ?? 0.01,
      gameMode: match.gameMode,
      status: match.status,
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}