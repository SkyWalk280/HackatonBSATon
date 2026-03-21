/** Compute a SHA-256 fingerprint of game events for anti-cheat verification.
 *  Uses the Web Crypto API — only call from client-side code.
 */
export async function computeGameHash(
  seed: number,
  moves: unknown[],
  score: number,
  timestamp: number,
): Promise<string> {
  const payload = `${seed}|${JSON.stringify(moves)}|${score}|${timestamp}`;
  const data = new TextEncoder().encode(payload);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
