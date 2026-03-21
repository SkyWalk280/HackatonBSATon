"use client";

import { useEffect, useCallback, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTonWallet } from "@tonconnect/ui-react";

// ── Seeded random ─────────────────────────────────────────────────
function makeSeededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// Generate the full sequence of rounds up-front using the seed
// Round N has N+2 tiles to remember (round 1 = 2 tiles, round 2 = 3, etc.)
function generateSequences(seed: number, rounds: number): number[][] {
  const rng = makeSeededRandom(seed);
  const sequences: number[][] = [];
  for (let r = 0; r < rounds; r++) {
    const len = r + 2;
    const seq: number[] = [];
    for (let i = 0; i < len; i++) {
      seq.push(Math.floor(rng() * 9)); // 3x3 grid = 9 tiles
    }
    sequences.push(seq);
  }
  return sequences;
}

const MAX_ROUNDS = 10;
const FLASH_DURATION = 500;  // ms each tile flashes
const FLASH_GAP = 200;       // ms between flashes
const SHOW_DELAY = 1000;     // ms before showing sequence

type Phase = "waiting" | "countdown" | "showing" | "input" | "correct" | "wrong" | "finished";

function MemoryContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const wallet = useTonWallet();

  const matchId = searchParams.get("matchId");
  const playerAddress = searchParams.get("playerAddress") || wallet?.account?.address;
  const seedParam = searchParams.get("seed");
  const seed = seedParam ? parseInt(seedParam) : Math.floor(Math.random() * 1_000_000);
  const role = searchParams.get("role") || "player1";

  const [phase, setPhase] = useState<Phase>("waiting");
  const [round, setRound] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [sequences] = useState(() => generateSequences(seed, MAX_ROUNDS));
  const [flashingTile, setFlashingTile] = useState<number | null>(null);
  const [userInput, setUserInput] = useState<number[]>([]);
  const [correctTiles, setCorrectTiles] = useState<number[]>([]);
  const [wrongTile, setWrongTile] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [matchResult, setMatchResult] = useState<{
    winnerId: string;
    player1Score: number;
    player2Score: number;
    prizeAmount: string;
    payoutTxHash?: string;
  } | null>(null);

  // Flash the sequence for the current round
  const showSequence = useCallback(async (roundIdx: number) => {
    setPhase("showing");
    setUserInput([]);
    setCorrectTiles([]);
    setWrongTile(null);
    const seq = sequences[roundIdx];

    await new Promise(r => setTimeout(r, SHOW_DELAY));

    for (let i = 0; i < seq.length; i++) {
      setFlashingTile(seq[i]);
      await new Promise(r => setTimeout(r, FLASH_DURATION));
      setFlashingTile(null);
      if (i < seq.length - 1) {
        await new Promise(r => setTimeout(r, FLASH_GAP));
      }
    }

    setPhase("input");
  }, [sequences]);

  // Start countdown then game
  const startGame = useCallback(() => {
    setPhase("countdown");
    setCountdown(3);
    setRound(0);
    setScore(0);
    setSubmitted(false);
    setMatchResult(null);

    let c = 3;
    const interval = setInterval(() => {
      c -= 1;
      setCountdown(c);
      if (c === 0) {
        clearInterval(interval);
        showSequence(0);
      }
    }, 1000);
  }, [showSequence]);

  // Handle tile tap
  const handleTileTap = useCallback((tileIdx: number) => {
    if (phase !== "input") return;

    const seq = sequences[round];
    const nextPos = userInput.length;
    const expected = seq[nextPos];

    if (tileIdx !== expected) {
      // Wrong tap
      setWrongTile(tileIdx);
      setPhase("wrong");
      setTimeout(() => {
        setPhase("finished");
      }, 800);
      return;
    }

    const newInput = [...userInput, tileIdx];
    setCorrectTiles(prev => [...prev, tileIdx]);
    setUserInput(newInput);

    if (newInput.length === seq.length) {
      // Completed this round!
      const newScore = round + 1;
      setScore(newScore);
      setPhase("correct");

      setTimeout(() => {
        const nextRound = round + 1;
        if (nextRound >= MAX_ROUNDS) {
          setPhase("finished");
        } else {
          setRound(nextRound);
          showSequence(nextRound);
        }
      }, 600);
    }
  }, [phase, sequences, round, userInput, showSequence]);

  // Submit score when finished
  const submitScore = useCallback(async (finalScore: number) => {
    if (!matchId || !playerAddress || submitted) return;
    setSubmitted(true);

    try {
      const res = await fetch("/api/match/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, playerAddress, score: finalScore, role }),
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

  // Poll for opponent
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

  // Auto-submit when game finishes
  useEffect(() => {
    if (phase === "finished" && !submitted) {
      submitScore(score);
    }
  }, [phase, score, submitted, submitScore]);

  const currentSeq = sequences[round] || [];

  // ── Tile color logic ──────────────────────────────────────────
  const getTileStyle = (idx: number): React.CSSProperties => {
    const base: React.CSSProperties = {
      width: "100%",
      aspectRatio: "1",
      borderRadius: 10,
      border: "2px solid var(--border)",
      background: "var(--bg)",
      cursor: phase === "input" ? "pointer" : "default",
      transition: "all 0.1s",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    };

    if (idx === flashingTile) {
      return { ...base, background: "var(--ton-blue)", border: "2px solid #5ba3f5", transform: "scale(1.08)" };
    }
    if (idx === wrongTile) {
      return { ...base, background: "rgba(255,50,50,0.6)", border: "2px solid #ff3232" };
    }
    if (correctTiles.includes(idx) && phase === "correct") {
      return { ...base, background: "rgba(57,198,136,0.5)", border: "2px solid #39C688" };
    }
    if (phase === "input") {
      return { ...base, background: "var(--bg-card)", border: "2px solid var(--border-active)" };
    }
    return base;
  };

  // ── Results screen ────────────────────────────────────────────
  if (matchResult) {
    const isTie = matchResult.winnerId === "tie";
    const isWinner = !isTie && matchResult.winnerId === role;
    const myScore = role === "player1" ? matchResult.player1Score : matchResult.player2Score;
    const opponentScore = role === "player1" ? matchResult.player2Score : matchResult.player1Score;
    const prizeDisplay = (Number(matchResult.prizeAmount) / 1_000_000_000).toFixed(3);

    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={{ fontSize:48, textAlign:"center" as const }}>{isTie ? "🤝" : isWinner ? "🏆" : "😔"}</div>
          <div style={{ ...s.title, color: isTie ? "var(--warning)" : isWinner ? "var(--success)" : "var(--error)" }}>
            {isTie ? "It's a Tie!" : isWinner ? "You Won!" : "You Lost"}
          </div>
          <div style={s.scoreRow}>
            <div style={s.scoreBox}>
              <div style={s.scoreLabel}>Your score</div>
              <div style={s.scoreNum}>{myScore}</div>
            </div>
            <div style={{ fontSize:20, color:"var(--text-muted)", alignSelf:"center" }}>vs</div>
            <div style={s.scoreBox}>
              <div style={s.scoreLabel}>Opponent</div>
              <div style={s.scoreNum}>{opponentScore}</div>
            </div>
          </div>
          {isTie && (
            <div style={s.prizeBox}>
              <div style={{ fontSize:13, color:"var(--warning)" }}>🤝 Tie! Your entry fee will be refunded.</div>
            </div>
          )}
          {isWinner && !isTie && (
            <div style={s.prizeBox}>
              <div style={{ fontSize:12, color:"var(--text-muted)", marginBottom:4 }}>Prize</div>
              <div style={{ fontSize:22, fontWeight:700, color:"var(--success)", fontFamily:"var(--font-mono)" }}>
                {prizeDisplay} BSA USD
              </div>
              {matchResult.payoutTxHash && (
                <div style={{ fontSize:10, color:"var(--text-muted)", marginTop:4, fontFamily:"var(--font-mono)" }}>
                  tx: {matchResult.payoutTxHash.slice(0, 20)}...
                </div>
              )}
            </div>
          )}
          <button style={s.btn} onClick={() => router.push("/")}>Back to Lobby</button>
        </div>
      </div>
    );
  }

  // ── Waiting for opponent ──────────────────────────────────────
  if (phase === "finished" && submitted && !matchResult) {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={{ fontSize:40, textAlign:"center" as const }}>⏳</div>
          <div style={s.title}>Score: {score}</div>
          <div style={{ color:"var(--text-secondary)", fontSize:14 }}>Waiting for opponent...</div>
          <div style={s.spinner} />
        </div>
      </div>
    );
  }

  // ── Ready screen ──────────────────────────────────────────────
  if (phase === "waiting") {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={{ fontSize:40, textAlign:"center" as const }}>🧠</div>
          <div style={s.title}>Memory Grid</div>
          <div style={{ color:"var(--text-secondary)", fontSize:13, lineHeight:1.6 }}>
            Watch the tiles flash in sequence.<br />
            Tap them back in the same order.<br />
            Each round adds one more tile!
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

  // ── Countdown ─────────────────────────────────────────────────
  if (phase === "countdown") {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={{ fontSize:96, fontWeight:900, fontFamily:"var(--font-mono)", color:"var(--ton-blue)", textAlign:"center" as const, lineHeight:1 }}>
            {countdown === 0 ? "GO!" : countdown}
          </div>
          <div style={{ fontSize:14, color:"var(--text-secondary)", textAlign:"center" as const }}>Get ready...</div>
        </div>
      </div>
    );
  }

  // ── Active game ───────────────────────────────────────────────
  const progressPct = (userInput.length / currentSeq.length) * 100;

  return (
    <div style={s.page}>
      <div style={{ width:"100%", maxWidth:340 }}>

        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, padding:"0 4px" }}>
          <div>
            <div style={{ fontSize:11, color:"var(--text-muted)", textTransform:"uppercase" as const, letterSpacing:"0.07em" }}>Round</div>
            <div style={{ fontSize:24, fontWeight:700, fontFamily:"var(--font-mono)", color:"var(--text-primary)" }}>{round + 1} / {MAX_ROUNDS}</div>
          </div>
          <div style={{ textAlign:"right" as const }}>
            <div style={{ fontSize:11, color:"var(--text-muted)", textTransform:"uppercase" as const, letterSpacing:"0.07em" }}>Score</div>
            <div style={{ fontSize:24, fontWeight:700, fontFamily:"var(--font-mono)", color:"var(--ton-blue)" }}>{score}</div>
          </div>
        </div>

        {/* Phase label */}
        <div style={{ textAlign:"center" as const, marginBottom:12, fontSize:13, fontWeight:600,
          color: phase === "showing" ? "var(--ton-blue)" :
                 phase === "input" ? "var(--success)" :
                 phase === "correct" ? "var(--success)" :
                 phase === "wrong" ? "var(--error)" : "var(--text-secondary)"
        }}>
          {phase === "showing" && `👀 Watch the sequence (${currentSeq.length} tiles)`}
          {phase === "input" && `👆 Tap ${currentSeq.length - userInput.length} more`}
          {phase === "correct" && "✅ Correct! Next round..."}
          {phase === "wrong" && "❌ Wrong tile!"}
        </div>

        {/* Progress bar */}
        {phase === "input" && (
          <div style={{ height:4, background:"var(--border)", borderRadius:2, marginBottom:12, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${progressPct}%`, background:"var(--success)", borderRadius:2, transition:"width 0.15s" }} />
          </div>
        )}

        {/* 3x3 Grid */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:10, padding:"0 4px" }}>
          {Array.from({ length: 9 }, (_, i) => (
            <button
              key={i}
              style={getTileStyle(i)}
              onClick={() => handleTileTap(i)}
            >
              <span style={{ fontSize:20, opacity: flashingTile === i ? 1 : 0.3 }}>
                {["🟦","🟩","🟥","🟨","🟪","🟧","⬜","🔵","🟤"][i]}
              </span>
            </button>
          ))}
        </div>

        {/* Sequence dots */}
        <div style={{ display:"flex", gap:6, justifyContent:"center", marginTop:16 }}>
          {currentSeq.map((_, i) => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: "50%",
              background: i < userInput.length ? "var(--success)" :
                          i === userInput.length && phase === "input" ? "var(--ton-blue)" : "var(--border)",
              transition: "background 0.15s",
            }} />
          ))}
        </div>

      </div>
    </div>
  );
}

export default function MemoryPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ color:"var(--text-secondary)", fontSize:14 }}>Loading...</div>
      </div>
    }>
      <MemoryContent />
    </Suspense>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 },
  card: { background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:16, padding:24, width:"100%", maxWidth:340, display:"flex", flexDirection:"column", alignItems:"center", textAlign:"center", gap:12 },
  title: { fontSize:22, fontWeight:700, color:"var(--text-primary)", fontFamily:"var(--font-sans)" },
  scoreRow: { display:"flex", gap:20, alignItems:"center", margin:"8px 0" },
  scoreBox: { background:"var(--bg)", border:"1px solid var(--border)", borderRadius:10, padding:"10px 20px", minWidth:80 },
  scoreLabel: { fontSize:10, color:"var(--text-muted)", textTransform:"uppercase" as const, letterSpacing:"0.07em", marginBottom:4 },
  scoreNum: { fontSize:28, fontWeight:700, color:"var(--text-primary)", fontFamily:"var(--font-mono)" },
  prizeBox: { background:"rgba(57,198,136,0.08)", border:"1px solid rgba(57,198,136,0.25)", borderRadius:10, padding:"12px 20px", width:"100%" },
  btn: { width:"100%", padding:"13px 16px", background:"var(--ton-blue)", border:"none", borderRadius:10, color:"#fff", fontSize:15, fontWeight:600, fontFamily:"var(--font-sans)", cursor:"pointer", marginTop:4 },
  spinner: { width:28, height:28, border:"3px solid var(--border)", borderTopColor:"var(--ton-blue)", borderRadius:"50%", animation:"spin 0.8s linear infinite" },
};