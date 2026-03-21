import { createMatch } from "../../../../lib/match-store";
import type { GameMode } from "../../../../lib/match-store";

const ENTRY_FEE = "10000000";

export async function POST(request: Request) {
  try {
    const { playerAddress, paymentBoc, gameMode } = await request.json();

    if (!playerAddress || !paymentBoc) {
      return Response.json(
        { error: "playerAddress and paymentBoc are required" },
        { status: 400 }
      );
    }

    const validModes: GameMode[] = ["stack", "memory", "reaction"];
    const mode: GameMode = validModes.includes(gameMode) ? gameMode : "stack";
    const match = await createMatch(playerAddress, paymentBoc, ENTRY_FEE, mode);

    return Response.json({
      matchId: match.id,
      seed: match.seed,
      entryFee: match.entryFee,
      gameMode: match.gameMode,
      status: match.status,
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}