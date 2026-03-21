import { redis } from "../../../../lib/redis";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");
  if (!address) return Response.json({ streak: 0 });
  const raw = await redis.get<number>(`streak:${address.toLowerCase()}`);
  return Response.json({ streak: Number(raw ?? 0) });
}
