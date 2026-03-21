"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface OpenMatch {
  id: string;
  gameMode: "stack" | "memory" | "reaction";
  betAmount: number;
  createdAt: number;
  expiresAt: number;
}

const MODE_EMOJI: Record<string, string> = {
  stack: "🧱",
  memory: "🧠",
  reaction: "⚡",
};

const MODE_LABEL: Record<string, string> = {
  stack: "Stack",
  memory: "Memory",
  reaction: "Reaction",
};

function timeAgo(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function timeLeft(expiresAt: number): string {
  const diff = expiresAt - Date.now();
  if (diff <= 0) return "Expired";
  const s = Math.ceil(diff / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, "0")}`;
}

export default function LobbyPage() {
  const router = useRouter();
  const [matches, setMatches] = useState<OpenMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  async function fetchMatches() {
    try {
      const res = await fetch("/api/matches/open");
      const data = await res.json();
      setMatches(data.matches ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchMatches();
    const poll = setInterval(fetchMatches, 5000);
    return () => clearInterval(poll);
  }, []);

  // Tick every second for live countdowns
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  function joinMatch(matchId: string) {
    router.push(`/?joinMatchId=${matchId}`);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--tg-theme-bg-color, #0f0f1a)",
        color: "var(--tg-theme-text-color, #fff)",
        fontFamily: "'Inter', sans-serif",
        padding: "16px",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
        <button
          onClick={() => router.push("/")}
          style={{
            background: "none",
            border: "none",
            color: "var(--tg-theme-text-color, #fff)",
            fontSize: "20px",
            cursor: "pointer",
            padding: "4px",
            lineHeight: 1,
          }}
        >
          ←
        </button>
        <div>
          <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 700 }}>🏟️ Open Matches</h1>
          <p style={{ margin: 0, fontSize: "13px", opacity: 0.5 }}>Join a waiting opponent</p>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", opacity: 0.5 }}>
          Loading matches…
        </div>
      ) : matches.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "60px 20px",
            background: "rgba(255,255,255,0.04)",
            borderRadius: "16px",
          }}
        >
          <div style={{ fontSize: "48px", marginBottom: "12px" }}>😴</div>
          <div style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>
            No open matches right now
          </div>
          <div style={{ fontSize: "13px", opacity: 0.5, marginBottom: "24px" }}>
            Create one from the lobby and share your match ID
          </div>
          <button
            onClick={() => router.push("/")}
            style={{
              background: "linear-gradient(135deg, #6c63ff, #a855f7)",
              border: "none",
              borderRadius: "12px",
              color: "#fff",
              fontSize: "15px",
              fontWeight: 600,
              padding: "12px 28px",
              cursor: "pointer",
            }}
          >
            Create Match
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {matches.map((m) => {
            const waiting = Date.now() - m.createdAt;
            const left = timeLeft(m.expiresAt);
            const isExpiring = m.expiresAt - Date.now() < 60_000;
            return (
              <div
                key={m.id}
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "16px",
                  padding: "16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                }}
              >
                {/* Mode icon */}
                <div
                  style={{
                    width: "52px",
                    height: "52px",
                    borderRadius: "14px",
                    background: "rgba(108,99,255,0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "26px",
                    flexShrink: 0,
                  }}
                >
                  {MODE_EMOJI[m.gameMode]}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: "16px" }}>
                    {MODE_LABEL[m.gameMode]}
                  </div>
                  <div style={{ fontSize: "13px", opacity: 0.6, marginTop: "2px" }}>
                    Bet: <span style={{ color: "#a78bfa", fontWeight: 600 }}>{m.betAmount} BSA USD</span>
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      marginTop: "4px",
                      opacity: isExpiring ? 1 : 0.4,
                      color: isExpiring ? "#f87171" : "inherit",
                    }}
                  >
                    {timeAgo(waiting)} · expires {left}
                  </div>
                </div>

                {/* Spectate + Join buttons */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", flexShrink: 0 }}>
                <button
                  onClick={() => router.push(`/spectate/${m.id}`)}
                  style={{
                    background: "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: "10px",
                    color: "rgba(255,255,255,0.7)",
                    fontSize: "12px",
                    fontWeight: 600,
                    padding: "7px 12px",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  👁 Watch
                </button>
                <button
                  onClick={() => joinMatch(m.id)}
                  style={{
                    background: "linear-gradient(135deg, #6c63ff, #a855f7)",
                    border: "none",
                    borderRadius: "10px",
                    color: "#fff",
                    fontSize: "14px",
                    fontWeight: 700,
                    padding: "10px 18px",
                    cursor: "pointer",
                    flexShrink: 0,
                    whiteSpace: "nowrap",
                  }}
                >
                  Join ⚔️
                </button>
                </div>
              </div>
            );
          })}

          {/* Refresh hint */}
          <div style={{ textAlign: "center", fontSize: "12px", opacity: 0.3, paddingTop: "4px" }}>
            Refreshes every 5 seconds
          </div>
        </div>
      )}
    </main>
  );
}
