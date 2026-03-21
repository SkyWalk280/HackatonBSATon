import { redis } from "../../../../lib/redis";

function usernameKey(address: string) {
  return `username:${address.toLowerCase()}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");
  if (!address) return Response.json({ error: "address required" }, { status: 400 });

  try {
    const username = await redis.get<string>(usernameKey(address));
    return Response.json({ username: username ?? null });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { address, username } = await request.json();
    if (!address || !username) {
      return Response.json({ error: "address and username required" }, { status: 400 });
    }

    const trimmed = String(username).trim();
    if (trimmed.length < 2 || trimmed.length > 20) {
      return Response.json({ error: "Username must be 2–20 characters" }, { status: 400 });
    }
    if (!/^[a-zA-Z0-9_\-. ]+$/.test(trimmed)) {
      return Response.json({ error: "Only letters, numbers, spaces, _ - . allowed" }, { status: 400 });
    }

    await redis.set(usernameKey(address), trimmed);
    return Response.json({ username: trimmed });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
