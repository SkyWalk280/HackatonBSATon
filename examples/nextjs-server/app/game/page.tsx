"use client";

import { useEffect, useRef, useCallback, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useTonWallet } from "@tonconnect/ui-react";
import { sounds } from "../../lib/sounds";
import { computeGameHash } from "../../lib/gameHash";
import ResultScreen from "../components/ResultScreen";
import PracticeResult from "../components/PracticeResult";

const CANVAS_WIDTH = 320;
const CANVAS_HEIGHT = 500;
const BLOCK_HEIGHT = 24;
const INITIAL_BLOCK_WIDTH = 200;
const FLOOR_Y = CANVAS_HEIGHT - 40;
const STACK_START_Y = FLOOR_Y;
const MIN_BLOCK_WIDTH = 20;
const INITIAL_SPEED = 2.5;
const SPEED_INCREMENT = 0.4;

const haptic = {
  impact: (style: "light"|"medium"|"heavy" = "medium") =>
    (window as any).Telegram?.WebApp?.HapticFeedback?.impactOccurred(style),
  success: () =>
    (window as any).Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success"),
  error: () =>
    (window as any).Telegram?.WebApp?.HapticFeedback?.notificationOccurred("error"),
};

function makeSeededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

interface Block { x: number; y: number; width: number; }
interface GameState {
  stack: Block[];
  current: Block;
  direction: 1 | -1;
  speed: number;
  score: number;
  status: "playing" | "finished";
  cameraY: number;
}

function GameContent() {
  const searchParams = useSearchParams();
  const wallet = useTonWallet();

  const matchId = searchParams.get("matchId");
  const playerAddress = searchParams.get("playerAddress") || wallet?.account?.address;
  const seedParam = searchParams.get("seed");
  const seed = seedParam ? parseInt(seedParam) : Math.floor(Math.random() * 1_000_000);
  const role = searchParams.get("role") || "player1";
  const isPractice = searchParams.get("practice") === "true";

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState | null>(null);
  const rafRef = useRef<number>(0);
  const rngRef = useRef(makeSeededRandom(seed));
  const movesRef = useRef<number[]>([]);  // track block widths for hash

  const [score, setScore] = useState(0);
  const [status, setStatus] = useState<"waiting" | "playing" | "finished">("waiting");
  const [finalScore, setFinalScore] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [matchResult, setMatchResult] = useState<{
    winnerId: string;
    player1Score: number;
    player2Score: number;
    prizeAmount: string;
    payoutTxHash?: string;
    betAmount?: number;
    winStreak?: number;
  } | null>(null);

  const initGame = useCallback(() => {
    const rng = makeSeededRandom(seed);
    rngRef.current = rng;
    movesRef.current = [];
    const baseBlock: Block = { x: (CANVAS_WIDTH - INITIAL_BLOCK_WIDTH) / 2, y: STACK_START_Y - BLOCK_HEIGHT, width: INITIAL_BLOCK_WIDTH };
    const firstBlock: Block = { x: 0, y: STACK_START_Y - BLOCK_HEIGHT * 2, width: INITIAL_BLOCK_WIDTH };
    gameRef.current = { stack: [baseBlock], current: firstBlock, direction: rng() > 0.5 ? 1 : -1, speed: INITIAL_SPEED, score: 0, status: "playing", cameraY: 0 };
  }, [seed]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const g = gameRef.current;
    if (!canvas || !ctx || !g) return;

    ctx.fillStyle = "#0A0F1A";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const topBlockY = g.stack[g.stack.length - 1].y;
    const targetCameraY = Math.max(0, FLOOR_Y - topBlockY - CANVAS_HEIGHT * 0.4);
    g.cameraY += (targetCameraY - g.cameraY) * 0.1;
    const cam = g.cameraY;

    g.stack.forEach((block, i) => {
      const progress = i / g.stack.length;
      const gb = Math.floor(152 + progress * 80);
      ctx.fillStyle = `rgb(20, ${gb}, 234)`;
      ctx.fillRect(block.x, block.y + cam, block.width, BLOCK_HEIGHT - 2);
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(block.x, block.y + cam, block.width, 3);
    });

    if (g.status === "playing") {
      ctx.fillStyle = "#39C688";
      ctx.fillRect(g.current.x, g.current.y + cam, g.current.width, BLOCK_HEIGHT - 2);
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fillRect(g.current.x, g.current.y + cam, g.current.width, 3);
    }

    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "bold 28px 'Manrope', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(g.score.toString(), CANVAS_WIDTH / 2, 44);
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "12px 'Manrope', sans-serif";
    ctx.fillText("TAP TO DROP", CANVAS_WIDTH / 2, CANVAS_HEIGHT - 16);

    if (g.status === "finished") {
      ctx.fillStyle = "rgba(10,15,26,0.75)";
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.fillStyle = "#39C688";
      ctx.font = "bold 32px 'Manrope', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("GAME OVER", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.font = "20px 'Manrope', sans-serif";
      ctx.fillText(`Score: ${g.score}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 16);
    }
  }, []);

  const tick = useCallback(() => {
    const g = gameRef.current;
    if (!g || g.status !== "playing") return;
    g.current.x += g.speed * g.direction;
    if (g.current.x <= 0) { g.current.x = 0; g.direction = 1; }
    else if (g.current.x + g.current.width >= CANVAS_WIDTH) { g.current.x = CANVAS_WIDTH - g.current.width; g.direction = -1; }
    draw();
    rafRef.current = requestAnimationFrame(tick);
  }, [draw]);

  const handleTap = useCallback(() => {
    const g = gameRef.current;
    if (!g || g.status !== "playing") return;
    const topBlock = g.stack[g.stack.length - 1];
    const curr = g.current;
    const leftEdge = Math.max(curr.x, topBlock.x);
    const rightEdge = Math.min(curr.x + curr.width, topBlock.x + topBlock.width);
    const overlap = rightEdge - leftEdge;

    if (overlap <= 0) {
      g.status = "finished";
      cancelAnimationFrame(rafRef.current);
      draw();
      setFinalScore(g.score);
      setStatus("finished");
      haptic.error();
      sounds.buzzer();
      return;
    }

    const placedBlock: Block = { x: leftEdge, y: topBlock.y - BLOCK_HEIGHT, width: overlap };
    g.stack.push(placedBlock);
    movesRef.current.push(Math.round(overlap));
    g.score += 1;
    setScore(g.score);
    haptic.impact(overlap > 100 ? "medium" : "light");
    sounds.thud();
    if (g.score % 5 === 0) g.speed += SPEED_INCREMENT;

    if (overlap < MIN_BLOCK_WIDTH) {
      g.status = "finished";
      cancelAnimationFrame(rafRef.current);
      draw();
      setFinalScore(g.score);
      setStatus("finished");
      haptic.error();
      sounds.buzzer();
      return;
    }

    g.current = { x: g.direction === 1 ? 0 : CANVAS_WIDTH - overlap, y: placedBlock.y - BLOCK_HEIGHT, width: overlap };
    if (rngRef.current() < 0.15) g.direction = g.direction === 1 ? -1 : 1;
  }, [draw]);

  const submitScore = useCallback(async (scoreToSubmit: number) => {
    if (!matchId || !playerAddress || submitting || submitted) return;
    setSubmitting(true);
    const timestamp = Date.now();
    const gameHash = await computeGameHash(seed, movesRef.current, scoreToSubmit, timestamp).catch(() => "");
    try {
      const res = await fetch("/api/match/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, playerAddress, score: scoreToSubmit, role, gameHash }),
      });
      const data = await res.json();
      setSubmitted(true);

      if (data.status === "finished") {
        const matchRes = await fetch(`/api/match/${matchId}`);
        const matchData = await matchRes.json();
        const prizeAmount = Math.floor(Number(matchData.entryFee) * 2 * 0.9).toString();
        const isWin = matchData.winnerId === role;
        if (isWin) { haptic.success(); sounds.victory(); }
        let winStreak = data.winStreak ?? 0;
        if (isWin && playerAddress) {
          try {
            const sr = await fetch(`/api/profile/streak?address=${encodeURIComponent(playerAddress)}`);
            const sd = await sr.json();
            winStreak = sd.streak ?? winStreak;
          } catch {}
        }
        setMatchResult({
          winnerId: matchData.winnerId,
          player1Score: matchData.player1?.score ?? 0,
          player2Score: matchData.player2?.score ?? 0,
          prizeAmount,
          payoutTxHash: data.payoutTxHash,
          betAmount: matchData.betAmount,
          winStreak,
        });
      }
    } catch (err) {
      console.error("Failed to submit score:", err);
    } finally {
      setSubmitting(false);
    }
  }, [matchId, playerAddress, submitting, submitted, role, seed]);

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
          if (isWin) { haptic.success(); sounds.victory(); }
          setMatchResult({
            winnerId: data.winnerId,
            player1Score: data.player1?.score ?? 0,
            player2Score: data.player2?.score ?? 0,
            prizeAmount,
            payoutTxHash: data.payoutTxHash ?? undefined,
            betAmount: data.betAmount,
            winStreak: 0,
          });
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [submitted, matchResult, matchId, role]);

  useEffect(() => {
    if (status === "finished" && !submitted) submitScore(finalScore);
  }, [status, finalScore, submitted, submitScore]);

  useEffect(() => { return () => cancelAnimationFrame(rafRef.current); }, []);

  const startGame = useCallback(() => {
    initGame();
    setScore(0);
    setStatus("playing");
    setSubmitted(false);
    setMatchResult(null);
    rafRef.current = requestAnimationFrame(tick);
  }, [initGame, tick]);

  if (matchResult) {
    const isTie = matchResult.winnerId === "tie";
    const isWinner = !isTie && matchResult.winnerId === role;
    const myScore = role === "player1" ? matchResult.player1Score : matchResult.player2Score;
    const opponentScore = role === "player1" ? matchResult.player2Score : matchResult.player1Score;
    const prizeDisplay = (Number(matchResult.prizeAmount) / 1_000_000_000).toFixed(3);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

    return (
      <ResultScreen
        isTie={isTie}
        isWinner={isWinner}
        myScore={myScore}
        opponentScore={opponentScore}
        prizeDisplay={prizeDisplay}
        payoutTxHash={matchResult.payoutTxHash}
        betAmount={matchResult.betAmount ?? 0.01}
        mode="stack"
        shareText={`I just won ${prizeDisplay} BSA USD in Stack Duel! 🏆 Challenge me!`}
        appUrl={appUrl}
        winStreak={matchResult.winStreak ?? 0}
      />
    );
  }

  if (isPractice && status === "finished") {
    return <PracticeResult mode="stack" score={finalScore} />;
  }

  if (status === "finished" && submitted && !matchResult) {
    return (
      <div style={s.page}>
        <div style={s.resultCard}>
          <div style={{ fontSize:40, marginBottom:8 }}>⏳</div>
          <div style={s.resultTitle}>Score: {finalScore}</div>
          <div style={{ color:"var(--text-secondary)", fontSize:14, marginBottom:20 }}>
            Waiting for opponent to finish...
          </div>
          <div style={s.spinner} />
        </div>
      </div>
    );
  }

  if (status === "waiting") {
    return (
      <div style={s.page}>
        <div style={s.resultCard}>
          <div style={{ fontSize:40, marginBottom:8 }}>🎮</div>
          <div style={s.resultTitle}>Stack Duel</div>
          <div style={{ color:"var(--text-secondary)", fontSize:13, marginBottom:8, lineHeight:1.6 }}>
            Tap to drop each block.<br />Stack as high as you can!
          </div>
          {matchId && (
            <div style={{ fontSize:11, color:"var(--text-muted)", fontFamily:"var(--font-mono)", marginBottom:16 }}>
              Match: {matchId} · You are {role}
            </div>
          )}
          <button style={s.btn} onClick={startGame}>Start Game</button>
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={{ position:"relative" }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          style={{ display:"block", borderRadius:14, touchAction:"none" }}
          onClick={handleTap}
          onTouchStart={(e) => { e.preventDefault(); handleTap(); }}
        />
        <div style={s.scoreOverlay}>{score}</div>
      </div>
    </div>
  );
}

export default function GamePage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ color:"var(--text-secondary)", fontSize:14 }}>Loading...</div>
      </div>
    }>
      <GameContent />
    </Suspense>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 },
  resultCard: { background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:16, padding:28, width:"100%", maxWidth:320, display:"flex", flexDirection:"column", alignItems:"center", textAlign:"center", gap:10 },
  resultTitle: { fontSize:26, fontWeight:700, color:"var(--text-primary)", fontFamily:"var(--font-sans)" },
  btn: { width:"100%", padding:"13px 16px", background:"var(--ton-blue)", border:"none", borderRadius:10, color:"#fff", fontSize:15, fontWeight:600, fontFamily:"var(--font-sans)", cursor:"pointer" },
  scoreOverlay: { position:"absolute" as const, top:12, left:"50%", transform:"translateX(-50%)", fontSize:32, fontWeight:700, color:"rgba(255,255,255,0.9)", fontFamily:"var(--font-mono)", pointerEvents:"none" as const, textShadow:"0 2px 8px rgba(0,0,0,0.5)" },
  spinner: { width:28, height:28, border:"3px solid var(--border)", borderTopColor:"var(--ton-blue)", borderRadius:"50%", animation:"spin 0.8s linear infinite" },
};
