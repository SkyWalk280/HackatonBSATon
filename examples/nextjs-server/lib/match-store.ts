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

const matches = new Map<string, Match>();

export function createMatch(
  player1Address: string,
  paymentBoc: string,
  entryFee: string,
): Match {
  const id = Math.random().toString(36).substring(2, 8).toUpperCase();
  const seed = Math.floor(Math.random() * 1_000_000);

  const match: Match = {
    id,
    status: "waiting",
    player1: {
      address: player1Address,
      score: null,
      finished: false,
      paymentBoc,
    },
    player2: null,
    entryFee,
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
  if (match.player1.address === player2Address) return null;

  match.player2 = {
    address: player2Address,
    score: null,
    finished: false,
    paymentBoc,
  };
  match.status = "playing";
  matches.set(id, match);
  return match;
}

export function submitScore(
  id: string,
  playerAddress: string,
  score: number,
): Match | null {
  const match = matches.get(id);
  if (!match) return null;
  if (match.status !== "playing") return null;

  if (match.player1.address === playerAddress) {
    match.player1.score = score;
    match.player1.finished = true;
  } else if (match.player2?.address === playerAddress) {
    match.player2.score = score;
    match.player2.finished = true;
  } else {
    return null; 
  }

  if (match.player1.finished && match.player2?.finished) {
    match.status = "finished";
    const p1 = match.player1.score ?? 0;
    const p2 = match.player2.score ?? 0;
    match.winnerId = p1 >= p2
      ? match.player1.address
      : match.player2.address;
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