import { createMatch } from "../../../../lib/match-store";
import type { GameMode } from "../../../../lib/match-store";

const ALLOWED_BET_AMOUNTS = [0.01, 0.05, 0.1, 0.5];

export async function POST(request: Request) {
  try {
    const { playerAddress, paymentBoc, gameMode, betAmount, isPublic } = await request.json();

    if (!playerAddress || !paymentBoc) {
      return Response.json(
        { error: "playerAddress and paymentBoc are required" },
        { status: 400 }
      );
    }

    const bet = ALLOWED_BET_AMOUNTS.includes(betAmount) ? betAmount : 0.01;
    const entryFeeNano = Math.round(bet * 1_000_000_000).toString();

    const validModes: GameMode[] = ["stack", "memory", "reaction"];
    const mode: GameMode = validModes.includes(gameMode) ? gameMode : "stack";
    const pub = isPublic !== false; // default public unless explicitly false
    const match = await createMatch(playerAddress, paymentBoc, entryFeeNano, mode, bet, pub);

    return Response.json({
      matchId: match.id,
      seed: match.seed,
      entryFee: match.entryFee,
      betAmount: match.betAmount,
      gameMode: match.gameMode,
      status: match.status,
      expiresAt: match.expiresAt,
      isPublic: match.isPublic,
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
