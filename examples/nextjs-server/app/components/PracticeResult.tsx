"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface PracticeResultProps {
  mode: "stack" | "memory" | "reaction";
  score: number;
  scoreUnit?: string;
  lowerIsBetter?: boolean;
}

const MODE_META = {
  stack:    { emoji: "🧱", label: "Stack Duel",    page: "/game" },
  memory:   { emoji: "🧠", label: "Memory Grid",   page: "/memory" },
  reaction: { emoji: "⚡", label: "Reaction Time", page: "/reaction" },
};

export default function PracticeResult({ mode, score, scoreUnit, lowerIsBetter }: PracticeResultProps) {
  const router = useRouter();
  const { emoji, label, page } = MODE_META[mode];

  const [displayScore, setDisplayScore] = useState(0);
  const [pb, setPb] = useState<number | null>(null);
  const [isNewPb, setIsNewPb] = useState(false);
  const [showButtons, setShowButtons] = useState(false);

  useEffect(() => {
    const key = `pb:practice:${mode}`;
    const stored = localStorage.getItem(key);
    const prevBest = stored !== null ? Number(stored) : null;
    const improved = prevBest === null || (lowerIsBetter ? score < prevBest : score > prevBest);

    if (improved) {
      localStorage.setItem(key, String(score));
      setIsNewPb(true);
    }
    setPb(improved ? score : prevBest);

    // Count-up animation
    const duration = 800;
    const start = Date.now();
    const tick = () => {
      const t = Math.min((Date.now() - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayScore(Math.round(score * eased));
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        setDisplayScore(score);
        setTimeout(() => setShowButtons(true), 300);
      }
    };
    requestAnimationFrame(tick);
  }, [mode, score, lowerIsBetter]);

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
    }}>
      <div style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 22,
        padding: "30px 24px",
        width: "100%",
        maxWidth: 340,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: 16,
        animation: "fade-up 0.4s cubic-bezier(0.16,1,0.3,1) both",
      }}>

        <div style={{ fontSize: 52, lineHeight: 1 }}>🎯</div>

        <div>
          <div style={{
            fontSize: 11, fontWeight: 700, color: "var(--text-muted)",
            textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2,
          }}>
            Practice · {emoji} {label}
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)" }}>
            Practice Complete!
          </div>
        </div>

        {isNewPb && (
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(0,152,234,0.12)",
            border: "1px solid rgba(0,152,234,0.4)",
            borderRadius: 20,
            padding: "5px 14px",
            fontSize: 13,
            fontWeight: 700,
            color: "var(--ton-blue)",
            animation: "fade-up 0.3s both",
          }}>
            🏅 New Personal Best!
          </div>
        )}

        <div style={{
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: "20px 32px",
          width: "100%",
        }}>
          <div style={{
            fontSize: 10, color: "var(--text-muted)",
            textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8,
          }}>
            Your Score
          </div>
          <div style={{
            fontSize: 48, fontWeight: 900,
            color: "var(--text-primary)",
            fontFamily: "var(--font-mono)",
            lineHeight: 1,
          }}>
            {displayScore}
            {scoreUnit && <span style={{ fontSize: 20, marginLeft: 3, fontWeight: 700 }}>{scoreUnit}</span>}
          </div>
          {pb !== null && !isNewPb && (
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
              Personal best: <strong style={{ color: "var(--ton-blue)" }}>{pb}{scoreUnit ?? ""}</strong>
            </div>
          )}
          {isNewPb && pb !== null && (
            <div style={{ fontSize: 11, color: "var(--ton-blue)", marginTop: 8, fontWeight: 600 }}>
              Personal best: {pb}{scoreUnit ?? ""}
            </div>
          )}
        </div>

        {showButtons && (
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            width: "100%",
            animation: "fade-up 0.3s both",
          }}>
            <button
              style={btn}
              onClick={() => router.push(`${page}?practice=true`)}
            >
              🔄 Play Again
            </button>
            <button
              style={{ ...btn, background: "linear-gradient(135deg, #0098EA, #0077cc)" }}
              onClick={() => router.push(`/?presetMode=${mode}`)}
            >
              ⚔️ Play for Real
            </button>
            <button
              style={{ ...btn, background: "transparent", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
              onClick={() => router.push("/practice")}
            >
              ← Back to Practice
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  width: "100%",
  padding: "13px 16px",
  background: "var(--ton-blue)",
  border: "none",
  borderRadius: 10,
  color: "#fff",
  fontSize: 15,
  fontWeight: 600,
  fontFamily: "var(--font-sans)",
  cursor: "pointer",
};
