import { redis } from "../../../../lib/redis";
import type { PlayerStats } from "../../match/score/route";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");
  if (!address) return Response.json({ error: "address required" }, { status: 400 });

  try {
    const stats = await redis.get<PlayerStats>(`stats:${address.toLowerCase()}`);
    const username = await redis.get<string>(`username:${address.toLowerCase()}`);
    return Response.json({
      address,
      username: username ?? null,
      stats: stats ?? {
        matchesPlayed: 0, wins: 0, losses: 0, ties: 0, totalEarningsNano: 0,
        gameModeCounts: { stack: 0, memory: 0, reaction: 0 },
        bestScores: { stack: 0, memory: 0, reaction: 0 },
      },
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
