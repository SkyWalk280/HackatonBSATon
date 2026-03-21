import { redis } from "../../../lib/redis";

export async function GET() {
  try {
    // Top 10 players by win count, descending
    // Upstash Redis returns a flat interleaved array: [member, score, member, score, ...]
    const raw = await redis.zrange("leaderboard", 0, 9, {
      rev: true,
      withScores: true,
    }) as Array<string | number>;

    const entries: Array<{ rank: number; address: string; username: string | null; wins: number }> = [];
    for (let i = 0; i < raw.length; i += 2) {
      entries.push({
        rank: entries.length + 1,
        address: String(raw[i]),
        username: null,
        wins: Number(raw[i + 1]),
      });
    }

    // Batch-resolve usernames from Redis
    if (entries.length > 0) {
      const usernames = await Promise.all(
        entries.map(e => redis.get<string>(`username:${e.address.toLowerCase()}`))
      );
      usernames.forEach((u, i) => { entries[i].username = u ?? null; });
    }

    return Response.json({ entries });
  } catch (err: any) {
    return Response.json({ entries: [], error: err.message });
  }
}
