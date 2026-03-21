import { redis } from "./redis";

export type MatchStatus = "waiting" | "playing" | "finished" | "expired";
export type GameMode = "stack" | "memory" | "reaction";

export interface PlayerState {
  address: string;
  score: number | null;
  finished: boolean;
  paymentBoc: string;
}

export interface Match {
  id: string;
  status: MatchStatus;
  gameMode: GameMode;
  player1: PlayerState;
  player2: PlayerState | null;
  entryFee: string;
  betAmount: number; // human-readable BSA USD, e.g. 0.05
  seed: number;
  winnerId: string | null;
  payoutTxHash: string | null;
  createdAt: number;
  expiresAt: number; // ms timestamp — match auto-cancels if still waiting past this
  isPublic: boolean; // public matches appear in the open lobby; private ones do not
}

const MATCH_TTL = 3600;           // Redis TTL: 1 hour (seconds)
const WAITING_TIMEOUT = 5 * 60 * 1000; // 5 minutes in ms
const WAITING_KEY = "matches:waiting";

function matchKey(id: string) { return `match:${id}`; }

async function saveMatch(match: Match): Promise<void> {
  await redis.set(matchKey(match.id), match, { ex: MATCH_TTL });
}

export async function createMatch(
  player1Address: string,
  paymentBoc: string,
  entryFee: string,
  gameMode: GameMode = "stack",
  betAmount: number = 0.01,
  isPublic: boolean = true,
): Promise<Match> {
  const id = Math.random().toString(36).substring(2, 8).toUpperCase();
  const seed = Math.floor(Math.random() * 1_000_000);
  const now = Date.now();

  const match: Match = {
    id,
    status: "waiting",
    gameMode,
    player1: { address: player1Address, score: null, finished: false, paymentBoc },
    player2: null,
    entryFee,
    betAmount,
    seed,
    winnerId: null,
    payoutTxHash: null,
    createdAt: now,
    expiresAt: now + WAITING_TIMEOUT,
    isPublic,
  };

  await saveMatch(match);
  await redis.sadd(WAITING_KEY, match.id);
  return match;
}

export async function getMatch(id: string): Promise<Match | undefined> {
  const data = await redis.get<Match>(matchKey(id));
  if (!data) return undefined;

  // Auto-expire matches that have timed out while waiting
  if (data.status === "waiting" && Date.now() > data.expiresAt) {
    data.status = "expired";
    await saveMatch(data);
    await redis.srem(WAITING_KEY, data.id);
  }

  return data;
}

export async function joinMatch(
  id: string,
  player2Address: string,
  paymentBoc: string,
): Promise<Match | null> {
  const match = await getMatch(id);
  if (!match) return null;
  if (match.status !== "waiting") return null;
  if (match.player2) return null;
  // No address uniqueness check — same wallet can join its own match (useful for testing)

  match.player2 = { address: player2Address, score: null, finished: false, paymentBoc };
  match.status = "playing";
  await saveMatch(match);
  await redis.srem(WAITING_KEY, match.id);
  return match;
}

export async function submitScore(
  id: string,
  playerAddress: string,
  score: number,
  role: string,
): Promise<Match | null> {
  const match = await getMatch(id);
  if (!match) return null;
  if (match.status !== "playing") return null;

  if (role === "player1" && !match.player1.finished) {
    match.player1.score = score;
    match.player1.finished = true;
  } else if (role === "player2" && match.player2 && !match.player2.finished) {
    match.player2.score = score;
    match.player2.finished = true;
  } else {
    return null;
  }

  if (match.player1.finished && match.player2?.finished) {
    match.status = "finished";
    const p1 = match.player1.score ?? 0;
    const p2 = match.player2.score ?? 0;
    if (p1 === p2) {
      match.winnerId = "tie";
    } else {
      match.winnerId = p1 > p2 ? "player1" : "player2";
    }
  }

  await saveMatch(match);
  return match;
}

export async function setPayoutTx(id: string, txHash: string): Promise<void> {
  const match = await getMatch(id);
  if (match) {
    match.payoutTxHash = txHash;
    await saveMatch(match);
  }
}

export async function getWaitingMatches(): Promise<Match[]> {
  const ids = await redis.smembers(WAITING_KEY) as string[];
  if (!ids || ids.length === 0) return [];
  const matches = await Promise.all(ids.map(id => getMatch(id)));
  return matches.filter((m): m is Match => m !== undefined && m.status === "waiting" && m.isPublic !== false);
}
