import { getWaitingMatches } from "../../../../lib/match-store";

export async function GET() {
  try {
    const matches = await getWaitingMatches();
    return Response.json({
      matches: matches.map(m => ({
        id: m.id,
        gameMode: m.gameMode,
        betAmount: m.betAmount,
        createdAt: m.createdAt,
        expiresAt: m.expiresAt,
      })),
    });
  } catch (err: any) {
    return Response.json({ matches: [], error: err.message });
  }
}
