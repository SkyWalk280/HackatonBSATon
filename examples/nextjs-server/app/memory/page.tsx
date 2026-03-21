"use client";

import { useEffect, useCallback, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTonWallet } from "@tonconnect/ui-react";

function makeSeededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function generateSequences(seed: number, rounds: number): number[][] {
  const rng = makeSeededRandom(seed);
  const sequences: number[][] = [];
  for (let r = 0; r < rounds; r++) {
    const len = r + 2;
    const seq: number[] = [];
    for (let i = 0; i < len; i++) seq.push(Math.floor(rng() * 9));
    sequences.push(seq);
  }
  return sequences;
}

const MAX_ROUNDS = 10;
const FLASH_DURATION = 500;
const FLASH_GAP = 200;
const SHOW_DELAY = 1000;

const CONFETTI = Array.from({ length: 24 }, (_, i) => ({
  left: (i * 4.167) % 100,
  delay: (i * 0.063) % 1.2,
  color: ["#0098EA","#39C688","#FFA940","#FF5C5C","#A855F7","#F59E0B"][i % 6],
  size: 6 + (i % 4) * 2,
  dur: 1.5 + (i % 5) * 0.15,
}));

const haptic = {
  impact: (style: "light"|"medium"|"heavy" = "medium") =>
    (window as any).Telegram?.WebApp?.HapticFeedback?.impactOccurred(style),
  success: () =>
    (window as any).Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success"),
  error: () =>
    (window as any).Telegram?.WebApp?.HapticFeedback?.notificationOccurred("error"),
};

type Phase = "waiting" | "countdown" | "showing" | "input" | "correct" | "wrong" | "finished";

// Each tile has a unique emoji, label, and accent colour
const TILES = [
  { emoji: "🔥", label: "Fire",    color: "#f97316", glow: "rgba(249,115,22,0.45)" },
  { emoji: "💎", label: "Gem",     color: "#22d3ee", glow: "rgba(34,211,238,0.45)" },
  { emoji: "⚡", label: "Bolt",    color: "#facc15", glow: "rgba(250,204,21,0.45)" },
  { emoji: "🌊", label: "Wave",    color: "#3b82f6", glow: "rgba(59,130,246,0.45)" },
  { emoji: "🍀", label: "Clover",  color: "#22c55e", glow: "rgba(34,197,94,0.45)"  },
  { emoji: "🎯", label: "Target",  color: "#ef4444", glow: "rgba(239,68,68,0.45)"  },
  { emoji: "🚀", label: "Rocket",  color: "#a855f7", glow: "rgba(168,85,247,0.45)" },
  { emoji: "⭐", label: "Star",    color: "#fb923c", glow: "rgba(251,146,60,0.45)" },
  { emoji: "🎮", label: "Game",    color: "#0098EA", glow: "rgba(0,152,234,0.45)"  },
];

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
    betAmount?: number;
  } | null>(null);

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
      if (i < seq.length - 1) await new Promise(r => setTimeout(r, FLASH_GAP));
    }
    setPhase("input");
  }, [sequences]);

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
      if (c === 0) { clearInterval(interval); showSequence(0); }
    }, 1000);
  }, [showSequence]);

  const handleTileTap = useCallback((tileIdx: number) => {
    if (phase !== "input") return;
    const seq = sequences[round];
    const nextPos = userInput.length;
    const expected = seq[nextPos];

    if (tileIdx !== expected) {
      haptic.error();
      setWrongTile(tileIdx);
      setPhase("wrong");
      setTimeout(() => setPhase("finished"), 800);
      return;
    }

    haptic.impact("light");
    const newInput = [...userInput, tileIdx];
    setCorrectTiles(prev => [...prev, tileIdx]);
    setUserInput(newInput);

    if (newInput.length === seq.length) {
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
        const isWin = matchData.winnerId === role;
        if (isWin) haptic.success();
        setMatchResult({
          winnerId: matchData.winnerId,
          player1Score: matchData.player1?.score ?? 0,
          player2Score: matchData.player2?.score ?? 0,
          prizeAmount,
          payoutTxHash: data.payoutTxHash,
          betAmount: matchData.betAmount,
        });
      }
    } catch (err) { console.error("Failed to submit score:", err); }
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
          const isWin = data.winnerId === role;
          if (isWin) haptic.success();
          setMatchResult({
            winnerId: data.winnerId,
            player1Score: data.player1?.score ?? 0,
            player2Score: data.player2?.score ?? 0,
            prizeAmount,
            payoutTxHash: data.payoutTxHash ?? undefined,
            betAmount: data.betAmount,
          });
        }
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [submitted, matchResult, matchId, role]);

  useEffect(() => {
    if (phase === "finished" && !submitted) submitScore(score);
  }, [phase, score, submitted, submitScore]);

  const currentSeq = sequences[round] || [];
  const progressPct = (userInput.length / currentSeq.length) * 100;

  const getTileState = (idx: number): "flashing" | "wrong" | "correct" | "input" | "idle" => {
    if (idx === flashingTile) return "flashing";
    if (idx === wrongTile) return "wrong";
    if (correctTiles.includes(idx) && phase === "correct") return "correct";
    if (phase === "input") return "input";
    return "idle";
  };

  if (matchResult) {
    const isTie = matchResult.winnerId === "tie";
    const isWinner = !isTie && matchResult.winnerId === role;
    const myScore = role === "player1" ? matchResult.player1Score : matchResult.player2Score;
    const opponentScore = role === "player1" ? matchResult.player2Score : matchResult.player1Score;
    const prizeDisplay = (Number(matchResult.prizeAmount) / 1_000_000_000).toFixed(3);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

    return (
      <div style={s.page}>
        {isWinner && (
          <div style={{ position:"fixed", top:0, left:0, width:"100%", height:"100%", pointerEvents:"none", overflow:"hidden", zIndex:10 }}>
            {CONFETTI.map((p, i) => (
              <div key={i} style={{ position:"absolute", left:`${p.left}%`, top:-20, width:p.size, height:p.size, background:p.color, borderRadius:2, animation:`confetti-fall ${p.dur}s ${p.delay}s ease-in both` }} />
            ))}
          </div>
        )}
        <div style={s.card}>
          <div style={{ fontSize:48, textAlign:"center" as const }}>{isTie ? "🤝" : isWinner ? "🏆" : "😔"}</div>
          <div style={{ ...s.title, color: isTie ? "var(--warning)" : isWinner ? "var(--success)" : "var(--error)" }}>
            {isTie ? "It's a Tie!" : isWinner ? "You Won!" : "You Lost"}
          </div>
          <div style={s.scoreRow}>
            <div style={s.scoreBox}><div style={s.scoreLabel}>Your score</div><div style={s.scoreNum}>{myScore}</div></div>
            <div style={{ fontSize:20, color:"var(--text-muted)", alignSelf:"center" }}>vs</div>
            <div style={s.scoreBox}><div style={s.scoreLabel}>Opponent</div><div style={s.scoreNum}>{opponentScore}</div></div>
          </div>
          {isTie && <div style={s.prizeBox}><div style={{ fontSize:13, color:"var(--warning)" }}>🤝 Tie! Your entry fee will be refunded.</div></div>}
          {isWinner && !isTie && (
            <div style={s.prizeBox}>
              <div style={{ fontSize:12, color:"var(--text-muted)", marginBottom:4 }}>Prize</div>
              <div style={{ fontSize:22, fontWeight:700, color:"var(--success)", fontFamily:"var(--font-mono)" }}>{prizeDisplay} BSA USD</div>
              {matchResult.payoutTxHash && <div style={{ fontSize:10, color:"var(--text-muted)", marginTop:4, fontFamily:"var(--font-mono)" }}>tx: {matchResult.payoutTxHash.slice(0,20)}...</div>}
            </div>
          )}
          {isWinner && (
            <button style={{ ...s.btn, background:"var(--bg-card)", border:"1px solid var(--border-active)", color:"var(--ton-blue)" }} onClick={() => {
              const msg = `I just won ${prizeDisplay} BSA USD in Memory Grid! 🧠 Challenge me!`;
              (window as any).Telegram?.WebApp?.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(appUrl)}&text=${encodeURIComponent(msg)}`);
            }}>📤 Share Win</button>
          )}
          <button style={s.btn} onClick={() => router.push(`/?presetMode=memory&presetBet=${matchResult.betAmount ?? 0.01}`)}>⚔️ Rematch</button>
          <button style={{ ...s.btn, background:"transparent", border:"1px solid var(--border)", color:"var(--text-secondary)" }} onClick={() => router.push("/")}>Back to Lobby</button>
        </div>
      </div>
    );
  }

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

  if (phase === "waiting") {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={{ fontSize:40, textAlign:"center" as const }}>🧠</div>
          <div style={s.title}>Memory Grid</div>
          <div style={{ color:"var(--text-secondary)", fontSize:13, lineHeight:1.6 }}>
            Watch the tiles flash in sequence.<br />Tap them back in the same order.<br />Each round adds one more tile!
          </div>
          {matchId && <div style={{ fontSize:11, color:"var(--text-muted)", fontFamily:"var(--font-mono)" }}>Match: {matchId} · You are {role}</div>}
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
          <div style={{ fontSize:14, color:"var(--text-secondary)", textAlign:"center" as const }}>Get ready...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={{ width:"100%", maxWidth:340 }}>
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
        <div style={{ textAlign:"center" as const, marginBottom:12, fontSize:13, fontWeight:600,
          color: phase === "showing" ? "var(--ton-blue)" : phase === "input" ? "var(--success)" :
                 phase === "correct" ? "var(--success)" : phase === "wrong" ? "var(--error)" : "var(--text-secondary)"
        }}>
          {phase === "showing" && `👀 Watch the sequence (${currentSeq.length} tiles)`}
          {phase === "input" && `👆 Tap ${currentSeq.length - userInput.length} more`}
          {phase === "correct" && "✅ Correct! Next round..."}
          {phase === "wrong" && "❌ Wrong tile!"}
        </div>
        {phase === "input" && (
          <div style={{ height:4, background:"var(--border)", borderRadius:2, marginBottom:12, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${progressPct}%`, background:"var(--success)", borderRadius:2, transition:"width 0.15s" }} />
          </div>
        )}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:10, padding:"0 4px" }}>
          {TILES.map((tile, i) => {
            const state = getTileState(i);
            const isFlashing = state === "flashing";
            const isWrong    = state === "wrong";
            const isCorrect  = state === "correct";
            const isActive   = state === "input";
            return (
              <button
                key={i}
                onClick={() => handleTileTap(i)}
                style={{
                  width: "100%", aspectRatio: "1", borderRadius: 14,
                  border: isFlashing ? `2px solid ${tile.color}`
                        : isWrong   ? "2px solid #ef4444"
                        : isCorrect ? "2px solid #22c55e"
                        : isActive  ? "2px solid rgba(255,255,255,0.15)"
                        : "2px solid rgba(255,255,255,0.06)",
                  background: isFlashing ? `radial-gradient(circle at 50% 50%, ${tile.glow}, rgba(0,0,0,0.5))`
                            : isWrong   ? "rgba(239,68,68,0.25)"
                            : isCorrect ? "rgba(34,197,94,0.2)"
                            : isActive  ? "rgba(255,255,255,0.05)"
                            : "rgba(255,255,255,0.03)",
                  cursor: phase === "input" ? "pointer" : "default",
                  transition: "all 0.12s",
                  transform: isFlashing ? "scale(1.1)" : "scale(1)",
                  boxShadow: isFlashing ? `0 0 18px ${tile.glow}` : "none",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
                }}
              >
                <span style={{ fontSize: 26, lineHeight: 1, filter: isFlashing ? "drop-shadow(0 0 6px white)" : "none" }}>
                  {tile.emoji}
                </span>
                <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.05em", opacity: isFlashing ? 0.9 : 0.3, color: isFlashing ? tile.color : "#fff", textTransform: "uppercase" }}>
                  {tile.label}
                </span>
              </button>
            );
          })}
        </div>
        <div style={{ display:"flex", gap:6, justifyContent:"center", marginTop:16 }}>
          {currentSeq.map((_, i) => (
            <div key={i} style={{
              width:8, height:8, borderRadius:"50%",
              background: i < userInput.length ? "var(--success)" :
                          i === userInput.length && phase === "input" ? "var(--ton-blue)" : "var(--border)",
              transition:"background 0.15s",
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
  card: { background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:16, padding:24, width:"100%", maxWidth:340, display:"flex", flexDirection:"column", alignItems:"center", textAlign:"center", gap:10 },
  title: { fontSize:22, fontWeight:700, color:"var(--text-primary)", fontFamily:"var(--font-sans)" },
  scoreRow: { display:"flex", gap:20, alignItems:"center", margin:"8px 0" },
  scoreBox: { background:"var(--bg)", border:"1px solid var(--border)", borderRadius:10, padding:"10px 20px", minWidth:80 },
  scoreLabel: { fontSize:10, color:"var(--text-muted)", textTransform:"uppercase" as const, letterSpacing:"0.07em", marginBottom:4 },
  scoreNum: { fontSize:28, fontWeight:700, color:"var(--text-primary)", fontFamily:"var(--font-mono)" },
  prizeBox: { background:"rgba(57,198,136,0.08)", border:"1px solid rgba(57,198,136,0.25)", borderRadius:10, padding:"12px 20px", width:"100%" },
  btn: { width:"100%", padding:"13px 16px", background:"var(--ton-blue)", border:"none", borderRadius:10, color:"#fff", fontSize:15, fontWeight:600, fontFamily:"var(--font-sans)", cursor:"pointer" },
  spinner: { width:28, height:28, border:"3px solid var(--border)", borderTopColor:"var(--ton-blue)", borderRadius:"50%", animation:"spin 0.8s linear infinite" },
};
