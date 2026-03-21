import { Redis } from "@upstash/redis";

export type MatchStatus = "waiting" | "playing" | "finished";

export interface PlayerState {
  address: string;
  score: number | null;
  finished: boolean;
  paymentBoc: string;
}

export interface Match {
  id: string;
  status: MatchStatus;
  player1: PlayerState;
  player2: PlayerState | null;
  entryFee: string;
  seed: number;
  winnerId: string | null;
  payoutTxHash: string | null;
  createdAt: number;
}

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const MATCH_TTL = 60 * 60 * 2; // 2 hours

function key(id: string) { return `match:${id}`; }

async function save(match: Match): Promise<void> {
  await redis.set(key(match.id), JSON.stringify(match), { ex: MATCH_TTL });
}

async function load(id: string): Promise<Match | null> {
  const data = await redis.get<string>(key(id));
  if (!data) return null;
  return typeof data === "string" ? JSON.parse(data) : data as Match;
}

export async function createMatch(
  player1Address: string,
  paymentBoc: string,
  entryFee: string,
): Promise<Match> {
  const id = Math.random().toString(36).substring(2, 8).toUpperCase();
  const seed = Math.floor(Math.random() * 1_000_000);
  const match: Match = {
    id, status: "waiting",
    player1: { address: player1Address, score: null, finished: false, paymentBoc },
    player2: null, entryFee, seed,
    winnerId: null, payoutTxHash: null, createdAt: Date.now(),
  };
  await save(match);
  return match;
}

export async function getMatch(id: string): Promise<Match | null> {
  return load(id);
}

export async function joinMatch(
  id: string,
  player2Address: string,
  paymentBoc: string,
): Promise<Match | null> {
  const match = await load(id);
  if (!match || match.status !== "waiting" || match.player2) return null;
  match.player2 = { address: player2Address, score: null, finished: false, paymentBoc };
  match.status = "playing";
  await save(match);
  return match;
}

export async function submitScore(
  id: string,
  playerAddress: string,
  score: number,
): Promise<Match | null> {
  const match = await load(id);
  if (!match || match.status !== "playing") return null;

  if (match.player1.address === playerAddress && !match.player1.finished) {
    match.player1.score = score;
    match.player1.finished = true;
  } else if (match.player2?.address === playerAddress && !match.player2.finished) {
    match.player2.score = score;
    match.player2.finished = true;
  } else if (match.player1.finished && match.player2 && !match.player2.finished) {
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

  await save(match);
  return match;
}

export async function setPayoutTx(id: string, txHash: string): Promise<void> {
  const match = await load(id);
  if (!match) return;
  match.payoutTxHash = txHash;
  await save(match);
}