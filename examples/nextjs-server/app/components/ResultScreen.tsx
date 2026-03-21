"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Next bet tier for "Double or Nothing"
const NEXT_BET_TIER: Record<number, number> = {
  0.01: 0.05,
  0.05: 0.10,
  0.10: 0.50,
};

// 30 confetti pieces with varied shapes
const CONFETTI = Array.from({ length: 30 }, (_, i) => ({
  left: (i * 3.33) % 100,
  delay: (i * 0.05) % 1.5,
  color: ["#0098EA", "#39C688", "#FFA940", "#FF5C5C", "#A855F7", "#F59E0B", "#22d3ee"][i % 7],
  size: 5 + (i % 5) * 2,
  dur: 1.4 + (i % 6) * 0.12,
  radius: i % 3 === 0 ? "50%" : i % 3 === 1 ? "2px" : "0%",
}));

interface ResultScreenProps {
  isTie: boolean;
  isWinner: boolean;
  /** Already-display-ready score (e.g. avg_ms for reaction, raw stack/memory score) */
  myScore: number;
  opponentScore: number;
  /** Optional unit suffix shown after the number, e.g. "ms" */
  scoreUnit?: string;
  prizeDisplay: string;   // e.g. "0.018"
  payoutTxHash?: string;
  betAmount: number;
  mode: "stack" | "memory" | "reaction";
  shareText: string;      // pre-filled Telegram share message
  appUrl: string;
  winStreak: number;
}

export default function ResultScreen({
  isTie,
  isWinner,
  myScore,
  opponentScore,
  scoreUnit,
  prizeDisplay,
  payoutTxHash,
  betAmount,
  mode,
  shareText,
  appUrl,
  winStreak,
}: ResultScreenProps) {
  const router = useRouter();

  // Count-up animation state
  const [displayMy, setDisplayMy] = useState(0);
  const [displayOpp, setDisplayOpp] = useState(0);
  const [showPrize, setShowPrize] = useState(false);
  const [showButtons, setShowButtons] = useState(false);

  useEffect(() => {
    const duration = 900;
    const start = Date.now();
    const tick = () => {
      const t = Math.min((Date.now() - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplayMy(Math.round(myScore * eased));
      setDisplayOpp(Math.round(opponentScore * eased));
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        setDisplayMy(myScore);
        setDisplayOpp(opponentScore);
        setTimeout(() => setShowPrize(true), 180);
        setTimeout(() => setShowButtons(true), 420);
      }
    };
    requestAnimationFrame(tick);
  }, [myScore, opponentScore]);

  const doubleOrNothingBet = NEXT_BET_TIER[betAmount];
  const resultColor = isTie ? "var(--warning)" : isWinner ? "var(--success)" : "var(--error)";
  const resultEmoji = isTie ? "🤝" : isWinner ? "🏆" : "😔";
  const resultText  = isTie ? "It's a Tie!" : isWinner ? "You Won!" : "You Lost";

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
    }}>
      {/* Confetti burst on win */}
      {isWinner && (
        <div style={{
          position: "fixed", top: 0, left: 0,
          width: "100%", height: "100%",
          pointerEvents: "none", overflow: "hidden", zIndex: 10,
        }}>
          {CONFETTI.map((p, i) => (
            <div key={i} style={{
              position: "absolute",
              left: `${p.left}%`,
              top: -24,
              width: p.size,
              height: p.size,
              background: p.color,
              borderRadius: p.radius,
              animation: `confetti-fall ${p.dur}s ${p.delay}s ease-in both`,
            }} />
          ))}
        </div>
      )}

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
        gap: 14,
        animation: "fade-up 0.4s cubic-bezier(0.16,1,0.3,1) both",
      }}>

        {/* Result emoji */}
        <div style={{
          fontSize: 56,
          lineHeight: 1,
          animation: "fade-up 0.35s 0.06s both",
          filter: isWinner ? "drop-shadow(0 0 20px rgba(57,198,136,0.5))" : undefined,
        }}>
          {resultEmoji}
        </div>

        {/* Result title */}
        <div style={{
          fontSize: 28,
          fontWeight: 800,
          color: resultColor,
          fontFamily: "var(--font-sans)",
          animation: "fade-up 0.35s 0.1s both",
          textShadow: isWinner ? "0 0 30px rgba(57,198,136,0.4)" : undefined,
        }}>
          {resultText}
        </div>

        {/* Win streak badge */}
        {winStreak >= 2 && (
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(249,115,22,0.15)",
            border: "1px solid rgba(249,115,22,0.4)",
            borderRadius: 20,
            padding: "5px 14px",
            fontSize: 13,
            fontWeight: 700,
            color: "#f97316",
            animation: "fade-up 0.35s 0.14s both",
          }}>
            {"🔥".repeat(Math.min(winStreak, 5))} {winStreak} Win Streak!
          </div>
        )}

        {/* Score count-up boxes */}
        <div style={{
          display: "flex",
          gap: 14,
          alignItems: "center",
          width: "100%",
          animation: "fade-up 0.35s 0.16s both",
        }}>
          <div style={{
            flex: 1,
            background: "var(--bg)",
            border: `1px solid ${isWinner ? "rgba(57,198,136,0.4)" : "var(--border)"}`,
            borderRadius: 14,
            padding: "14px 8px",
          }}>
            <div style={{
              fontSize: 10, color: "var(--text-muted)",
              textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6,
            }}>You</div>
            <div style={{
              fontSize: 30, fontWeight: 800,
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
              lineHeight: 1,
            }}>
              {displayMy}
              {scoreUnit && <span style={{ fontSize: 14, marginLeft: 2 }}>{scoreUnit}</span>}
            </div>
          </div>

          <div style={{ fontSize: 16, color: "var(--text-muted)", fontWeight: 700, flexShrink: 0 }}>vs</div>

          <div style={{
            flex: 1,
            background: "var(--bg)",
            border: `1px solid ${!isWinner && !isTie ? "rgba(57,198,136,0.4)" : "var(--border)"}`,
            borderRadius: 14,
            padding: "14px 8px",
          }}>
            <div style={{
              fontSize: 10, color: "var(--text-muted)",
              textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6,
            }}>Opponent</div>
            <div style={{
              fontSize: 30, fontWeight: 800,
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
              lineHeight: 1,
            }}>
              {displayOpp}
              {scoreUnit && <span style={{ fontSize: 14, marginLeft: 2 }}>{scoreUnit}</span>}
            </div>
          </div>
        </div>

        {/* Prize / tie info — revealed after count-up */}
        {showPrize && (
          <>
            {isTie && (
              <div style={{
                background: "rgba(255,169,64,0.08)",
                border: "1px solid rgba(255,169,64,0.25)",
                borderRadius: 12,
                padding: "12px 18px",
                width: "100%",
                fontSize: 13,
                color: "var(--warning)",
                animation: "fade-up 0.3s both",
              }}>
                🤝 Tie — your entry fee will be refunded.
              </div>
            )}
            {isWinner && (
              <div style={{
                background: "rgba(57,198,136,0.08)",
                border: "1px solid rgba(57,198,136,0.3)",
                borderRadius: 12,
                padding: "14px 18px",
                width: "100%",
                animation: "fade-up 0.3s both",
              }}>
                <div style={{
                  fontSize: 11, color: "var(--text-muted)",
                  textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4,
                }}>Prize</div>
                <div style={{
                  fontSize: 26, fontWeight: 800,
                  color: "var(--success)",
                  fontFamily: "var(--font-mono)",
                }}>
                  {prizeDisplay} BSA USD
                </div>
                {payoutTxHash && (
                  <div style={{
                    fontSize: 10, color: "var(--text-muted)",
                    marginTop: 4, fontFamily: "var(--font-mono)",
                  }}>
                    tx: {payoutTxHash.slice(0, 20)}…
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Action buttons — staggered reveal */}
        {showButtons && (
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            width: "100%",
            animation: "fade-up 0.3s both",
          }}>
            {/* Share win */}
            {isWinner && (
              <button
                style={{ ...btn, background: "var(--bg-card)", border: "1px solid var(--border-active)", color: "var(--ton-blue)" }}
                onClick={() => {
                  (window as any).Telegram?.WebApp?.openTelegramLink(
                    `https://t.me/share/url?url=${encodeURIComponent(appUrl)}&text=${encodeURIComponent(shareText)}`
                  );
                }}
              >
                📤 Share Win
              </button>
            )}

            {/* Double or nothing */}
            {isWinner && doubleOrNothingBet !== undefined && (
              <button
                style={{ ...btn, background: "linear-gradient(135deg, #f97316, #ef4444)" }}
                onClick={() => router.push(`/?presetMode=${mode}&presetBet=${doubleOrNothingBet}`)}
              >
                🎲 Double or Nothing — {doubleOrNothingBet.toFixed(2)} BSA
              </button>
            )}

            {/* Rematch */}
            <button style={btn} onClick={() => router.push(`/?presetMode=${mode}&presetBet=${betAmount}`)}>
              ⚔️ Rematch
            </button>

            {/* Back to lobby */}
            <button
              style={{ ...btn, background: "transparent", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
              onClick={() => router.push("/")}
            >
              Back to Lobby
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
