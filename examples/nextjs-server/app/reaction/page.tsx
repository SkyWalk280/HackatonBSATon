"use client";

import { useEffect, useCallback, useState, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTonWallet } from "@tonconnect/ui-react";

const ROUNDS = 8;
const TARGET_SIZE = 80;
const MIN_DELAY = 1000;
const MAX_DELAY = 3000;
const MISS_TIMEOUT = 3000;
const MISS_PENALTY = 3000;
const SCORE_BASE = 100_000;

function makeSeededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function generateRounds(seed: number) {
  const rng = makeSeededRandom(seed);
  return Array.from({ length: ROUNDS }, () => ({
    x: 0.1 + rng() * 0.8,
    y: 0.15 + rng() * 0.65,
    delay: MIN_DELAY + rng() * (MAX_DELAY - MIN_DELAY),
  }));
}

type Phase = "waiting" | "countdown" | "get_ready" | "active" | "too_early" | "missed" | "correct" | "finished";

function ReactionContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const wallet = useTonWallet();

  const matchId = searchParams.get("matchId");
  const playerAddress = searchParams.get("playerAddress") || wallet?.account?.address;
  const seedParam = searchParams.get("seed");
  const seed = seedParam ? parseInt(seedParam) : Math.floor(Math.random() * 1_000_000);
  const role = searchParams.get("role") || "player1";

  const [phase, setPhase] = useState<Phase>("waiting");
  const [countdown, setCountdown] = useState(3);
  const [round, setRound] = useState(0);
  const [reactionTimes, setReactionTimes] = useState<number[]>([]);
  const [lastReaction, setLastReaction] = useState<number | null>(null);
  const [targetVisible, setTargetVisible] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [matchResult, setMatchResult] = useState<{
    winnerId: string;
    player1Score: number;
    player2Score: number;
    prizeAmount: string;
    payoutTxHash?: string;
  } | null>(null);

  const roundsData = useRef(generateRounds(seed));
  const targetShownAt = useRef<number>(0);
  const delayTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const missTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRoundRef = useRef<(idx: number) => void>(() => {});

  const startRound = useCallback((roundIdx: number) => {
    setPhase("get_ready");
    setTargetVisible(false);
    setLastReaction(null);

    if (delayTimeout.current) clearTimeout(delayTimeout.current);
    if (missTimeout.current) clearTimeout(missTimeout.current);

    const delay = roundsData.current[roundIdx].delay;

    delayTimeout.current = setTimeout(() => {
      targetShownAt.current = Date.now();
      setTargetVisible(true);
      setPhase("active");

      // Auto-miss if player doesn't tap in time
      missTimeout.current = setTimeout(() => {
        setTargetVisible(false);
        setLastReaction(MISS_PENALTY);
        setPhase("missed");
        setReactionTimes(prev => {
          const newTimes = [...prev, MISS_PENALTY];
          const next = roundIdx + 1;
          if (next >= ROUNDS) {
            setTimeout(() => setPhase("finished"), 900);
          } else {
            setRound(next);
            setTimeout(() => startRoundRef.current(next), 900);
          }
          return newTimes;
        });
      }, MISS_TIMEOUT);

    }, delay);
  }, []);

  useEffect(() => { startRoundRef.current = startRound; }, [startRound]);

  const startGame = useCallback(() => {
    setPhase("countdown");
    setCountdown(3);
    setRound(0);
    setReactionTimes([]);
    setLastReaction(null);
    setSubmitted(false);
    setMatchResult(null);

    let c = 3;
    const interval = setInterval(() => {
      c -= 1;
      setCountdown(c);
      if (c === 0) {
        clearInterval(interval);
        startRoundRef.current(0);
      }
    }, 1000);
  }, []);

  // Called when player taps ON the glowing circle
  const handleHit = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation(); // don't bubble to arena (would trigger handleMiss)
    if (phase !== "active" || !targetVisible) return;

    if (missTimeout.current) clearTimeout(missTimeout.current);

    const reactionMs = Date.now() - targetShownAt.current;
    setLastReaction(reactionMs);
    setTargetVisible(false);
    setPhase("correct");

    setReactionTimes(prev => {
      const newTimes = [...prev, reactionMs];
      const next = round + 1;
      if (next >= ROUNDS) {
        setTimeout(() => setPhase("finished"), 600);
      } else {
        setRound(next);
        setTimeout(() => startRoundRef.current(next), 600);
      }
      return newTimes;
    });
  }, [phase, targetVisible, round]);

  // Called when player taps OUTSIDE the circle (on the arena background)
  const handleMiss = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();

    if (phase === "get_ready") {
      // Tapped before target appeared = too early
      if (delayTimeout.current) clearTimeout(delayTimeout.current);
      if (missTimeout.current) clearTimeout(missTimeout.current);
      setTargetVisible(false);
      setPhase("too_early");
      setTimeout(() => startRoundRef.current(round), 1200);
      return;
    }

    if (phase !== "active") return;

    // Target is visible but player tapped outside = miss
    if (missTimeout.current) clearTimeout(missTimeout.current);
    setTargetVisible(false);
    setLastReaction(MISS_PENALTY);
    setPhase("missed");

    setReactionTimes(prev => {
      const newTimes = [...prev, MISS_PENALTY];
      const next = round + 1;
      if (next >= ROUNDS) {
        setTimeout(() => setPhase("finished"), 900);
      } else {
        setRound(next);
        setTimeout(() => startRoundRef.current(next), 900);
      }
      return newTimes;
    });
  }, [phase, round]);

  const submitScore = useCallback(async (times: number[]) => {
    if (!matchId || !playerAddress || submitted || times.length === 0) return;
    setSubmitted(true);

    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const invertedScore = SCORE_BASE - avg;

    try {
      const res = await fetch("/api/match/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, playerAddress, score: invertedScore, role }),
      });
      const data = await res.json();

      if (data.status === "finished") {
        const matchRes = await fetch(`/api/match/${matchId}`);
        const matchData = await matchRes.json();
        const prizeAmount = Math.floor(Number(matchData.entryFee) * 2 * 0.9).toString();
        setMatchResult({
          winnerId: matchData.winnerId,
          player1Score: matchData.player1?.score ?? 0,
          player2Score: matchData.player2?.score ?? 0,
          prizeAmount,
          payoutTxHash: data.payoutTxHash,
        });
      }
    } catch (err) {
      console.error("Failed to submit score:", err);
    }
  }, [matchId, playerAddress, submitted, role]);

  useEffect(() => {
    if (!submitted || matchResult || !matchId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/match/${matchId}`);
        const data = await res.json();
        if (data.status === "finished") {
          clearInterval(interval);
          const prizeAmount = data.entryFee
            ? Math.floor(Number(data.entryFee) * 2 * 0.9).toString()
            : "18000000";
          setMatchResult({
            winnerId: data.winnerId,
            player1Score: data.player1?.score ?? 0,
            player2Score: data.player2?.score ?? 0,
            prizeAmount,
            payoutTxHash: data.payoutTxHash ?? undefined,
          });
        }
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [submitted, matchResult, matchId]);

  useEffect(() => {
    if (phase === "finished" && !submitted && reactionTimes.length > 0) {
      submitScore(reactionTimes);
    }
  }, [phase, reactionTimes, submitted, submitScore]);

  useEffect(() => () => {
    if (delayTimeout.current) clearTimeout(delayTimeout.current);
    if (missTimeout.current) clearTimeout(missTimeout.current);
  }, []);

  const toMs = (inv: number) => SCORE_BASE - inv;
  const avgMs = reactionTimes.length > 0
    ? Math.round(reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length)
    : 0;
  const currentRound = roundsData.current[round];

  if (matchResult) {
    const isTie = matchResult.winnerId === "tie";
    const isWinner = !isTie && matchResult.winnerId === role;
    const myInv = role === "player1" ? matchResult.player1Score : matchResult.player2Score;
    const oppInv = role === "player1" ? matchResult.player2Score : matchResult.player1Score;
    const prizeDisplay = (Number(matchResult.prizeAmount) / 1_000_000_000).toFixed(3);

    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={{ fontSize:48, textAlign:"center" as const }}>{isTie ? "🤝" : isWinner ? "🏆" : "😔"}</div>
          <div style={{ ...s.bigText, color: isTie ? "var(--warning)" : isWinner ? "var(--success)" : "var(--error)" }}>
            {isTie ? "It's a Tie!" : isWinner ? "You Won!" : "You Lost"}
          </div>
          <div style={s.scoreRow}>
            <div style={s.scoreBox}>
              <div style={s.scoreLabel}>Your avg</div>
              <div style={s.scoreNum}>{toMs(myInv)}<span style={{ fontSize:12 }}>ms</span></div>
            </div>
            <div style={{ fontSize:20, color:"var(--text-muted)", alignSelf:"center" }}>vs</div>
            <div style={s.scoreBox}>
              <div style={s.scoreLabel}>Opponent</div>
              <div style={s.scoreNum}>{toMs(oppInv)}<span style={{ fontSize:12 }}>ms</span></div>
            </div>
          </div>
          {isTie && <div style={s.prizeBox}><div style={{ fontSize:13, color:"var(--warning)" }}>🤝 Tie! Your entry fee will be refunded.</div></div>}
          {isWinner && !isTie && (
            <div style={s.prizeBox}>
              <div style={{ fontSize:12, color:"var(--text-muted)", marginBottom:4 }}>Prize</div>
              <div style={{ fontSize:22, fontWeight:700, color:"var(--success)", fontFamily:"var(--font-mono)" }}>{prizeDisplay} BSA USD</div>
            </div>
          )}
          <button style={s.btn} onClick={() => router.push("/")}>Back to Lobby</button>
        </div>
      </div>
    );
  }

  if (phase === "finished" && submitted && !matchResult) {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={{ fontSize:40, textAlign:"center" as const }}>⏳</div>
          <div style={s.bigText}>Avg: {avgMs}ms</div>
          <div style={{ color:"var(--text-secondary)", fontSize:14 }}>Waiting for opponent...</div>
          <div style={s.spinner} />
        </div>
      </div>
    );
  }

  if (phase === "waiting") {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={{ fontSize:48, textAlign:"center" as const }}>⚡</div>
          <div style={s.bigText}>Reaction Time</div>
          <div style={{ color:"var(--text-secondary)", fontSize:13, lineHeight:1.7 }}>
            A glowing target appears on screen.<br/>
            <strong style={{ color:"var(--success)" }}>Tap the circle to score!</strong><br/>
            <strong style={{ color:"var(--error)" }}>Tap outside = miss (+{MISS_PENALTY}ms).</strong><br/>
            <strong style={{ color:"var(--warning)" }}>Tap too early = round restarts.</strong><br/>
            {ROUNDS} rounds · lower average wins
          </div>
          {matchId && (
            <div style={{ fontSize:11, color:"var(--text-muted)", fontFamily:"var(--font-mono)" }}>
              Match: {matchId} · You are {role}
            </div>
          )}
          <button style={s.btn} onClick={startGame}>Start Game</button>
        </div>
      </div>
    );
  }

  if (phase === "countdown") {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={{ fontSize:96, fontWeight:900, fontFamily:"var(--font-mono)", color:"var(--ton-blue)", textAlign:"center" as const, lineHeight:1 }}>
            {countdown === 0 ? "GO!" : countdown}
          </div>
        </div>
      </div>
    );
  }

  const containerW = Math.min(typeof window !== "undefined" ? window.innerWidth : 360, 400) - 32;
  const containerH = 420;
  const targetX = currentRound ? currentRound.x * (containerW - TARGET_SIZE) : 0;
  const targetY = currentRound ? currentRound.y * (containerH - TARGET_SIZE) : 0;

  return (
    <div style={s.page}>
      <div style={{ width:"100%", maxWidth:400 }}>

        <div style={{ display:"flex", justifyContent:"space-between", padding:"0 4px 12px" }}>
          <div>
            <div style={{ fontSize:10, color:"var(--text-muted)", textTransform:"uppercase" as const }}>Round</div>
            <div style={{ fontSize:20, fontWeight:700, fontFamily:"var(--font-mono)", color:"var(--text-primary)" }}>
              {round + 1} / {ROUNDS}
            </div>
          </div>
          <div style={{ textAlign:"right" as const }}>
            <div style={{ fontSize:10, color:"var(--text-muted)", textTransform:"uppercase" as const }}>Avg</div>
            <div style={{ fontSize:20, fontWeight:700, fontFamily:"var(--font-mono)", color:"var(--ton-blue)" }}>
              {avgMs > 0 ? `${avgMs}ms` : "—"}
            </div>
          </div>
        </div>

        {/* Arena — tapping here = miss */}
        <div
          onClick={handleMiss}
          onTouchStart={handleMiss}
          style={{
            position:"relative" as const,
            width:"100%",
            height: containerH,
            background: phase === "too_early" ? "rgba(255,50,50,0.08)"
                      : phase === "missed" ? "rgba(255,100,0,0.08)"
                      : phase === "correct" ? "rgba(57,198,136,0.05)"
                      : "var(--bg-card)",
            border: `1px solid ${
              phase === "too_early" ? "rgba(255,50,50,0.4)"
              : phase === "missed" ? "rgba(255,100,0,0.4)"
              : phase === "correct" ? "rgba(57,198,136,0.3)"
              : "var(--border)"}`,
            borderRadius: 14,
            overflow:"hidden",
            cursor:"crosshair",
            userSelect:"none" as const,
            transition:"background 0.15s, border 0.15s",
          }}
        >
          {/* Center label */}
          <div style={{ position:"absolute" as const, top:"50%", left:"50%", transform:"translate(-50%,-50%)", textAlign:"center" as const, pointerEvents:"none" as const }}>
            {phase === "get_ready" && (
              <div>
                <div style={{ fontSize:36 }}>👀</div>
                <div style={{ fontSize:14, color:"var(--text-secondary)", fontWeight:600, marginTop:4 }}>Wait for the target...</div>
              </div>
            )}
            {phase === "too_early" && (
              <div>
                <div style={{ fontSize:36 }}>⚠️</div>
                <div style={{ fontSize:14, color:"var(--error)", fontWeight:600, marginTop:4 }}>Too early! Restarting...</div>
              </div>
            )}
            {phase === "missed" && (
              <div>
                <div style={{ fontSize:36 }}>💨</div>
                <div style={{ fontSize:14, color:"var(--warning)", fontWeight:600, marginTop:4 }}>Missed! +{MISS_PENALTY}ms</div>
              </div>
            )}
            {phase === "correct" && lastReaction !== null && (
              <div>
                <div style={{ fontSize:36 }}>⚡</div>
                <div style={{ fontSize:28, fontWeight:700, fontFamily:"var(--font-mono)", color:"var(--success)", marginTop:4 }}>
                  {lastReaction}ms
                </div>
              </div>
            )}
          </div>

          {/* Target — tapping HERE = hit */}
          {targetVisible && (
            <div
              onClick={handleHit}
              onTouchStart={handleHit}
              style={{
                position:"absolute" as const,
                left: targetX,
                top: targetY,
                width: TARGET_SIZE,
                height: TARGET_SIZE,
                borderRadius: "50%",
                background: "radial-gradient(circle at 35% 35%, #5bf, var(--ton-blue))",
                boxShadow: "0 0 24px rgba(0,136,255,0.7), 0 0 48px rgba(0,136,255,0.3)",
                display:"flex",
                alignItems:"center",
                justifyContent:"center",
                animation:"pulse-target 0.25s ease-out",
                cursor:"pointer",
                // pointerEvents is auto (default) so clicks register on the circle
              }}
            >
              <div style={{ fontSize:28, pointerEvents:"none" as const }}>⚡</div>
            </div>
          )}
        </div>

        {/* History chips */}
        {reactionTimes.length > 0 && (
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" as const, padding:"10px 4px 0" }}>
            {reactionTimes.map((t, i) => (
              <div key={i} style={{
                padding:"3px 8px", borderRadius:6,
                background: t >= MISS_PENALTY ? "rgba(255,100,0,0.15)"
                          : t < 250 ? "rgba(57,198,136,0.15)"
                          : t < 450 ? "rgba(255,169,64,0.15)"
                          : "rgba(255,92,50,0.15)",
                border: `1px solid ${
                  t >= MISS_PENALTY ? "rgba(255,100,0,0.5)"
                  : t < 250 ? "rgba(57,198,136,0.4)"
                  : t < 450 ? "rgba(255,169,64,0.4)"
                  : "rgba(255,92,50,0.4)"}`,
                fontSize:11, fontFamily:"var(--font-mono)", color:"var(--text-primary)",
              }}>
                {t >= MISS_PENALTY ? "MISS" : `${t}ms`}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReactionPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ color:"var(--text-secondary)", fontSize:14 }}>Loading...</div>
      </div>
    }>
      <ReactionContent />
    </Suspense>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 },
  card: { background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:16, padding:24, width:"100%", maxWidth:360, display:"flex", flexDirection:"column", alignItems:"center", textAlign:"center", gap:12 },
  bigText: { fontSize:22, fontWeight:700, color:"var(--text-primary)", fontFamily:"var(--font-sans)" },
  scoreRow: { display:"flex", gap:20, alignItems:"center", margin:"8px 0" },
  scoreBox: { background:"var(--bg)", border:"1px solid var(--border)", borderRadius:10, padding:"10px 16px", minWidth:90 },
  scoreLabel: { fontSize:10, color:"var(--text-muted)", textTransform:"uppercase" as const, letterSpacing:"0.07em", marginBottom:4 },
  scoreNum: { fontSize:26, fontWeight:700, color:"var(--text-primary)", fontFamily:"var(--font-mono)" },
  prizeBox: { background:"rgba(57,198,136,0.08)", border:"1px solid rgba(57,198,136,0.25)", borderRadius:10, padding:"12px 20px", width:"100%" },
  btn: { width:"100%", padding:"13px 16px", background:"var(--ton-blue)", border:"none", borderRadius:10, color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer", marginTop:4 },
  spinner: { width:28, height:28, border:"3px solid var(--border)", borderTopColor:"var(--ton-blue)", borderRadius:"50%", animation:"spin 0.8s linear infinite" },
};