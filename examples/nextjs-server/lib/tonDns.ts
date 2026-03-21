/** Resolve a TON wallet address to its .ton DNS name (if any) via TON API.
 *  Returns null if no name is registered or the request fails.
 *  Results are cached in-memory for the page lifetime.
 */
const cache = new Map<string, string | null>();

export async function resolveTonName(address: string): Promise<string | null> {
  const key = address.toLowerCase();
  if (cache.has(key)) return cache.get(key) ?? null;
  try {
    const res = await fetch(
      `https://tonapi.io/v2/accounts/${encodeURIComponent(address)}`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(3000),
      },
    );
    if (!res.ok) { cache.set(key, null); return null; }
    const data = await res.json();
    const name: string | null = data.name ?? null;
    cache.set(key, name);
    return name;
  } catch {
    cache.set(key, null);
    return null;
  }
}
