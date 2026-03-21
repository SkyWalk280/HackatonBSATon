import { submitScore, getMatch, setPayoutTx } from "../../../../lib/match-store";
import { sendPayout } from "../../../../lib/payout";
import { redis } from "../../../../lib/redis";
import type { Match } from "../../../../lib/match-store";

// Max valid scores per game mode [min, max]
const SCORE_BOUNDS: Record<string, [number, number]> = {
  stack:    [0, 1000],
  memory:   [0, 10],
  reaction: [70000, 100001],
};

// ─── Player stats helpers ────────────────────────────────────────────────────

export interface PlayerStats {
  matchesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  totalEarningsNano: number;
  gameModeCounts: { stack: number; memory: number; reaction: number };
  bestScores: { stack: number; memory: number; reaction: number };
}

function statsKey(address: string) { return `stats:${address.toLowerCase()}`; }

async function getStats(address: string): Promise<PlayerStats> {
  const raw = await redis.get<PlayerStats>(statsKey(address));
  return raw ?? {
    matchesPlayed: 0, wins: 0, losses: 0, ties: 0, totalEarningsNano: 0,
    gameModeCounts: { stack: 0, memory: 0, reaction: 0 },
    bestScores: { stack: 0, memory: 0, reaction: 0 },
  };
}

async function recordMatchResult(
  match: Match,
  winnerAddress: string | null, // null = tie
  prizeAmountNano: number,
) {
  const mode = match.gameMode;
  const p1addr = match.player1.address;
  const p2addr = match.player2!.address;
  const p1score = match.player1.score ?? 0;
  const p2score = match.player2!.score ?? 0;

  const [s1, s2] = await Promise.all([getStats(p1addr), getStats(p2addr)]);

  // Helper: update one player's stats object
  function update(
    s: PlayerStats,
    addr: string,
    myScore: number,
  ): PlayerStats {
    const isWin = winnerAddress !== null && addr.toLowerCase() === winnerAddress.toLowerCase();
    const isTie = winnerAddress === null;
    return {
      matchesPlayed: s.matchesPlayed + 1,
      wins:    s.wins    + (isWin ? 1 : 0),
      losses:  s.losses  + (!isWin && !isTie ? 1 : 0),
      ties:    s.ties    + (isTie ? 1 : 0),
      totalEarningsNano: s.totalEarningsNano + (isWin ? prizeAmountNano : isTie ? Number(match.entryFee) : 0),
      gameModeCounts: {
        ...s.gameModeCounts,
        [mode]: (s.gameModeCounts[mode] ?? 0) + 1,
      },
      bestScores: {
        ...s.bestScores,
        [mode]: Math.max(s.bestScores[mode] ?? 0, myScore),
      },
    };
  }

  await Promise.all([
    redis.set(statsKey(p1addr), update(s1, p1addr, p1score)),
    redis.set(statsKey(p2addr), update(s2, p2addr, p2score)),
  ]);
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const { matchId, playerAddress, score, role, gameHash } = await request.json();

    if (!matchId || !playerAddress || score === undefined) {
      return Response.json(
        { error: "matchId, playerAddress and score are required" },
        { status: 400 }
      );
    }

    if (typeof score !== "number" || isNaN(score)) {
      return Response.json({ error: "score must be a number" }, { status: 400 });
    }

    // Validate score range
    const matchForValidation = await getMatch(matchId);
    if (matchForValidation) {
      const bounds = SCORE_BOUNDS[matchForValidation.gameMode];
      if (bounds && (score < bounds[0] || score > bounds[1])) {
        return Response.json({ error: "Score out of valid range" }, { status: 400 });
      }
    }

    // Store the client-side game hash for anti-cheat audit
    if (gameHash && typeof gameHash === "string" && /^[0-9a-f]{64}$/i.test(gameHash)) {
      redis.set(`gamehash:${matchId}:${role}`, gameHash, { ex: 3600 }).catch(() => {});
    }

    const match = await submitScore(matchId, playerAddress, score, role);

    if (!match) {
      return Response.json(
        { error: "Match not found or you are not a player" },
        { status: 400 }
      );
    }

    // Only trigger payout + stats once when match just finished
    if (match.status === "finished" && match.winnerId && !match.payoutTxHash) {

      // Tie — refund both players
      if (match.winnerId === "tie") {
        try {
          await sendPayout(match.player1.address, match.entryFee);
          await sendPayout(match.player2!.address, match.entryFee);
          await setPayoutTx(matchId, "tie_refund");
          // Reset streaks on tie
          Promise.all([
            redis.set(`streak:${match.player1.address.toLowerCase()}`, 0),
            redis.set(`streak:${match.player2!.address.toLowerCase()}`, 0),
          ]).catch(() => {});
          recordMatchResult(match, null, Number(match.entryFee)).catch(() => {});
        } catch (err: any) {
          console.error("[score] Tie refund failed:", err.message);
        }
        return Response.json({ status: match.status, winnerId: "tie", yourScore: score, waiting: false });
      }

      // Normal win
      try {
        const winnerAddress = match.winnerId === "player1"
          ? match.player1.address
          : match.player2!.address;

        const prizeAmount = Math.floor(Number(match.entryFee) * 2 * 0.9).toString();
        const txHash = await sendPayout(winnerAddress, prizeAmount);
        await setPayoutTx(matchId, txHash);

        // Leaderboard + stats + streak (fire-and-forget)
        redis.zincrby("leaderboard", 1, winnerAddress).catch(() => {});
        recordMatchResult(match, winnerAddress, Number(prizeAmount)).catch(() => {});
        const loserAddress = match.winnerId === "player1"
          ? match.player2!.address
          : match.player1.address;
        const [newStreak] = await Promise.all([
          redis.incr(`streak:${winnerAddress.toLowerCase()}`),
          redis.set(`streak:${loserAddress.toLowerCase()}`, 0),
        ]).catch(() => [1]);

        return Response.json({
          status: match.status,
          winnerId: match.winnerId,
          yourScore: score,
          prizeAmount,
          payoutTxHash: txHash,
          waiting: false,
          winStreak: Number(newStreak ?? 1),
        });
      } catch (payoutErr: any) {
        console.error("[score] Payout failed:", payoutErr.message);
        return Response.json({
          status: match.status,
          winnerId: match.winnerId,
          yourScore: score,
          payoutError: payoutErr.message,
          waiting: false,
        });
      }
    }

    return Response.json({
      status: match.status,
      winnerId: match.winnerId,
      yourScore: score,
      waiting: match.status === "playing",
    });

  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
