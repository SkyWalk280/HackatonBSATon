export type MatchStatus = "waiting" | "playing" | "finished";
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
}

const g = global as any;
if (!g.__matches) g.__matches = new Map<string, Match>();
const matches: Map<string, Match> = g.__matches;

export function createMatch(
  player1Address: string,
  paymentBoc: string,
  entryFee: string,
  gameMode: GameMode = "stack",
  betAmount: number = 0.01,
): Match {
  const id = Math.random().toString(36).substring(2, 8).toUpperCase();
  const seed = Math.floor(Math.random() * 1_000_000);

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
    createdAt: Date.now(),
  };

  matches.set(id, match);
  return match;
}

export function getMatch(id: string): Match | undefined {
  return matches.get(id);
}

export function joinMatch(
  id: string,
  player2Address: string,
  paymentBoc: string,
): Match | null {
  const match = matches.get(id);
  if (!match) return null;
  if (match.status !== "waiting") return null;
  if (match.player2) return null;
  // No address uniqueness check — same wallet can join its own match (useful for testing)

  match.player2 = { address: player2Address, score: null, finished: false, paymentBoc };
  match.status = "playing";
  matches.set(id, match);
  return match;
}

export function submitScore(
  id: string,
  playerAddress: string,
  score: number,
  role: string,
): Match | null {
  const match = matches.get(id);
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

  matches.set(id, match);
  return match;
}

export function setPayoutTx(id: string, txHash: string): void {
  const match = matches.get(id);
  if (match) {
    match.payoutTxHash = txHash;
    matches.set(id, match);
  }
}